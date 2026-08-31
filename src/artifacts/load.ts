import type { ProjectConfig } from "../config/types.ts";
import type { Diagnostic } from "../diagnostics.ts";
import { discoverCandidateFiles } from "./discover.ts";
import { parseMarkdownArtifact } from "./markdown-parser.ts";
import { parseYamlArtifact } from "./yaml-parser.ts";
import type { ParsedEntityBlock } from "./parse-result.ts";

export interface LoadedArtifacts {
  blocks: ParsedEntityBlock[];
  diagnostics: Diagnostic[];
}

/**
 * Discover candidate files and recognize/parse each one (REQ-002, REQ-003).
 * Unrecognized files (no Lengthwise marker) contribute nothing, silently
 * (AC-002-04, AC-003-03). Recognized-but-invalid files contribute their
 * diagnostics. Iterates discovery's already-sorted candidate order, so the
 * resulting block order is deterministic (NFR-003).
 */
export async function loadArtifacts(
  repoRoot: string,
  config: ProjectConfig,
): Promise<LoadedArtifacts> {
  const candidates = await discoverCandidateFiles(repoRoot, config);
  const blocks: ParsedEntityBlock[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const path of candidates) {
    const text = await Bun.file(`${repoRoot}/${path}`).text();
    const outcome = path.endsWith(".md")
      ? parseMarkdownArtifact(path, text)
      : parseYamlArtifact(path, text);

    if (!outcome.recognized) continue;
    if (!outcome.ok) {
      diagnostics.push(...outcome.diagnostics);
      continue;
    }
    blocks.push(...outcome.entities);
  }

  return { blocks, diagnostics };
}
