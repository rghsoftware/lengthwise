import { realpath, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { discoverCandidateFiles } from "../artifacts/discover.ts";
import { parseMarkdownArtifact } from "../artifacts/markdown-parser.ts";
import { parseYamlArtifact } from "../artifacts/yaml-parser.ts";
import type { ProjectConfig } from "../config/types.ts";
import type { ArtifactDocument } from "./types.ts";

export class ArtifactAccessError extends Error {
  constructor(
    readonly code: "unauthorized" | "conflict" | "not-found" | "read-failed" | "write-failed",
    message: string,
  ) {
    super(message);
  }
}

async function contentVersion(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isWithin(root: string, target: string): boolean {
  const child = relative(root, target);
  return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

export class ArtifactService {
  private constructor(
    private readonly repoRoot: string,
    private readonly realRepoRoot: string,
    private readonly authorizedPaths: Set<string>,
  ) {}

  static async create(repoRoot: string, config: ProjectConfig): Promise<ArtifactService> {
    const absoluteRoot = resolve(repoRoot);
    const realRoot = await realpath(absoluteRoot);
    const candidates = await discoverCandidateFiles(absoluteRoot, config);
    const recognized = new Set<string>();
    for (const path of candidates) {
      const lexical = resolve(absoluteRoot, path);
      let canonical: string;
      try {
        canonical = await realpath(lexical);
      } catch {
        continue;
      }
      // Reject symlink escapes before reading candidate bytes. Discovery is
      // path selection, not authorization.
      if (!isWithin(realRoot, canonical)) continue;
      const content = await Bun.file(canonical).text();
      const outcome = path.endsWith(".md")
        ? parseMarkdownArtifact(path, content)
        : parseYamlArtifact(path, content);
      if (outcome.recognized) recognized.add(path);
    }
    return new ArtifactService(absoluteRoot, realRoot, recognized);
  }

  async read(path: string): Promise<ArtifactDocument> {
    const absolute = await this.authorize(path);
    try {
      const content = await Bun.file(absolute).text();
      return {
        path,
        content,
        version: await contentVersion(content),
        language: path.endsWith(".md") ? "markdown" : "yaml",
      };
    } catch (error) {
      throw new ArtifactAccessError("read-failed", `Could not read ${path}: ${(error as Error).message}`);
    }
  }

  async write(path: string, content: string, expectedVersion: string): Promise<ArtifactDocument> {
    const absolute = await this.authorize(path);
    const current = await this.read(path);
    if (current.version !== expectedVersion) {
      throw new ArtifactAccessError(
        "conflict",
        `${path} changed after it was loaded; reload before saving to avoid overwriting newer content.`,
      );
    }

    const temporary = `${dirname(absolute)}/.lengthwise-save-${crypto.randomUUID()}.tmp`;
    try {
      await Bun.write(temporary, content);
      await rename(temporary, absolute);
    } catch (error) {
      try { await unlink(temporary); } catch {}
      throw new ArtifactAccessError("write-failed", `Could not write ${path}: ${(error as Error).message}`);
    }
    return { path, content, version: await contentVersion(content), language: current.language };
  }

  private async authorize(path: string): Promise<string> {
    if (isAbsolute(path) || !this.authorizedPaths.has(path)) {
      throw new ArtifactAccessError("unauthorized", `Artifact path is not an authorized recognized artifact: ${path}`);
    }
    const lexical = resolve(this.repoRoot, path);
    if (!isWithin(this.repoRoot, lexical)) {
      throw new ArtifactAccessError("unauthorized", `Artifact path escapes the selected project: ${path}`);
    }
    let canonical: string;
    try {
      canonical = await realpath(lexical);
    } catch {
      throw new ArtifactAccessError("not-found", `Artifact no longer exists: ${path}`);
    }
    if (!isWithin(this.realRepoRoot, canonical)) {
      throw new ArtifactAccessError("unauthorized", `Artifact resolves outside the selected project: ${path}`);
    }
    return canonical;
  }
}
