import { readdir, realpath } from "node:fs/promises";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";
import typia from "typia";
import {
  CANONICAL_SKILL_ENTRYPOINT,
  LENGTHWISE_SKILL_MANIFEST,
  SKILL_PROVENANCE_SIDECAR,
  STANDARD_SKILL_IDS,
} from "./constants.ts";
import { canonicalSkillDigest } from "./digest.ts";
import {
  SEMANTIC_ACTION_BINDINGS,
  SKILL_CONTEXT_SLOTS,
  SKILL_ESCALATION_REASONS,
  SKILL_OUTCOME_KINDS,
  SKILL_POST_CHECKS,
  SUPPORTED_SKILL_SCHEMA_VERSION,
  SUPPORTED_WORKFLOW_CONTRACT_VERSIONS,
} from "./types.ts";
import type {
  CanonicalSkillFile,
  CanonicalSkillFrontmatter,
  CanonicalSkillManifest,
  LoadCanonicalSkillRegistryResult,
  SkillDiagnostic,
  ValidatedCanonicalSkill,
} from "./types.ts";

const FRONTMATTER_FIELDS = new Set(["name", "description", "license", "compatibility"]);
const MANIFEST_FIELDS = new Set([
  "schemaVersion",
  "skillVersion",
  "workflowContractVersion",
  "bindings",
  "context",
  "outcomes",
  "postChecks",
  "escalations",
]);
const CONTEXT_FIELDS = new Set(["required", "optional"]);
const LOCAL_MARKDOWN_LINK = /!?(?:\[[^\]]*\])\(([^)]+)\)/g;
const validateCanonicalSkillFrontmatter = typia.createValidate<CanonicalSkillFrontmatter>();
const validateCanonicalSkillManifest = typia.createValidate<CanonicalSkillManifest>();

interface PackageLoadResult {
  declaredId?: string;
  bindings: string[];
  skill?: ValidatedCanonicalSkill;
  diagnostics: SkillDiagnostic[];
}

function diagnostic(packagePath: string, code: string, message: string, field?: string): SkillDiagnostic {
  return { code, message, packagePath, ...(field ? { field } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWithinOrSame(root: string, target: string): boolean {
  const child = relative(root, target);
  return child === "" || (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}

function extractFrontmatter(text: string): { yaml: string; body: string } | undefined {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return undefined;
  const closing = normalized.indexOf("\n---", 4);
  if (closing === -1) return undefined;
  const after = closing + 4;
  if (after < normalized.length && normalized[after] !== "\n") return undefined;
  return {
    yaml: normalized.slice(4, closing),
    body: normalized.slice(after).replace(/^\n/, ""),
  };
}

function parseFrontmatter(packagePath: string, text: string, diagnostics: SkillDiagnostic[]) {
  const extracted = extractFrontmatter(text);
  if (!extracted) {
    diagnostics.push(
      diagnostic(packagePath, "skill/invalid-frontmatter", `${CANONICAL_SKILL_ENTRYPOINT} needs leading YAML frontmatter.`),
    );
    return {};
  }

  let raw: unknown;
  try {
    raw = Bun.YAML.parse(extracted.yaml);
  } catch (error) {
    diagnostics.push(
      diagnostic(
        packagePath,
        "skill/invalid-frontmatter",
        `${CANONICAL_SKILL_ENTRYPOINT} frontmatter is invalid YAML: ${(error as Error).message}`,
      ),
    );
    return { body: extracted.body };
  }
  if (!isRecord(raw)) {
    diagnostics.push(
      diagnostic(packagePath, "skill/invalid-frontmatter", `${CANONICAL_SKILL_ENTRYPOINT} frontmatter must be a mapping.`),
    );
    return { body: extracted.body };
  }

  for (const field of Object.keys(raw).filter((field) => !FRONTMATTER_FIELDS.has(field)).sort()) {
    diagnostics.push(
      diagnostic(
        packagePath,
        "skill/unsupported-frontmatter",
        `Canonical frontmatter field "${field}" is not in the accepted portable subset.`,
        field,
      ),
    );
  }

  const name = raw.name;
  if (typeof name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    diagnostics.push(
      diagnostic(
        packagePath,
        "skill/invalid-frontmatter",
        "Frontmatter name must be 1-64 lowercase letters, numbers, or single hyphens.",
        "name",
      ),
    );
  }
  const description = raw.description;
  if (typeof description !== "string" || description.trim().length === 0 || description.length > 1024) {
    diagnostics.push(
      diagnostic(
        packagePath,
        "skill/invalid-frontmatter",
        "Frontmatter description must be a non-empty string of at most 1024 characters.",
        "description",
      ),
    );
  }
  for (const field of ["license", "compatibility"] as const) {
    const value = raw[field];
    if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
      diagnostics.push(
        diagnostic(packagePath, "skill/invalid-frontmatter", `Frontmatter ${field} must be a non-empty string.`, field),
      );
    }
  }
  if (extracted.body.trim().length === 0) {
    diagnostics.push(
      diagnostic(packagePath, "skill/missing-methodology", `${CANONICAL_SKILL_ENTRYPOINT} has no methodology body.`),
    );
  }

  const candidate = {
    name,
    description,
    ...(raw.license !== undefined ? { license: raw.license } : {}),
    ...(raw.compatibility !== undefined ? { compatibility: raw.compatibility } : {}),
  };
  const validation = validateCanonicalSkillFrontmatter(candidate);
  const frontmatter = validation.success ? validation.data : undefined;
  return { body: extracted.body, frontmatter, declaredId: typeof name === "string" ? name : undefined };
}

function validateStringArray(
  packagePath: string,
  raw: Record<string, unknown>,
  field: string,
  allowed: readonly string[],
  diagnostics: SkillDiagnostic[],
  requireNonEmpty = false,
): string[] {
  const value = raw[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    diagnostics.push(diagnostic(packagePath, "skill/invalid-manifest", `${field} must be an array of strings.`, field));
    return [];
  }
  if (requireNonEmpty && value.length === 0) {
    diagnostics.push(diagnostic(packagePath, "skill/invalid-manifest", `${field} must not be empty.`, field));
  }
  const strings = value as string[];
  for (const duplicate of [...new Set(strings.filter((item, index) => strings.indexOf(item) !== index))].sort()) {
    diagnostics.push(diagnostic(packagePath, "skill/duplicate-manifest-value", `${field} repeats "${duplicate}".`, field));
  }
  for (const unsupported of [...new Set(strings.filter((item) => !allowed.includes(item)))].sort()) {
    diagnostics.push(
      diagnostic(packagePath, "skill/unsupported-manifest-value", `${field} contains unsupported value "${unsupported}".`, field),
    );
  }
  return strings;
}

function parseManifest(packagePath: string, text: string, diagnostics: SkillDiagnostic[]) {
  let raw: unknown;
  try {
    raw = Bun.YAML.parse(text);
  } catch (error) {
    diagnostics.push(
      diagnostic(
        packagePath,
        "skill/invalid-manifest-yaml",
        `${LENGTHWISE_SKILL_MANIFEST} is invalid YAML: ${(error as Error).message}`,
      ),
    );
    return { bindings: [] as string[] };
  }
  if (!isRecord(raw)) {
    diagnostics.push(
      diagnostic(packagePath, "skill/invalid-manifest", `${LENGTHWISE_SKILL_MANIFEST} must be a mapping.`),
    );
    return { bindings: [] as string[] };
  }
  for (const field of Object.keys(raw).filter((field) => !MANIFEST_FIELDS.has(field)).sort()) {
    diagnostics.push(
      diagnostic(
        packagePath,
        "skill/unsupported-manifest-field",
        `Manifest field "${field}" duplicates canonical prose/discovery truth or is unsupported.`,
        field,
      ),
    );
  }

  if (raw.schemaVersion !== SUPPORTED_SKILL_SCHEMA_VERSION) {
    diagnostics.push(
      diagnostic(
        packagePath,
        "skill/unsupported-schema-version",
        `schemaVersion must be ${SUPPORTED_SKILL_SCHEMA_VERSION}.`,
        "schemaVersion",
      ),
    );
  }
  if (!Number.isInteger(raw.skillVersion) || (raw.skillVersion as number) <= 0) {
    diagnostics.push(
      diagnostic(packagePath, "skill/invalid-version", "skillVersion must be a positive integer.", "skillVersion"),
    );
  }
  if (
    !Number.isInteger(raw.workflowContractVersion) ||
    !(SUPPORTED_WORKFLOW_CONTRACT_VERSIONS as readonly number[]).includes(raw.workflowContractVersion as number)
  ) {
    diagnostics.push(
      diagnostic(
        packagePath,
        "skill/unsupported-workflow-contract",
        `workflowContractVersion must be one of ${SUPPORTED_WORKFLOW_CONTRACT_VERSIONS.join(", ")}.`,
        "workflowContractVersion",
      ),
    );
  }

  const bindings = validateStringArray(
    packagePath,
    raw,
    "bindings",
    SEMANTIC_ACTION_BINDINGS,
    diagnostics,
    true,
  );
  const outcomes = validateStringArray(packagePath, raw, "outcomes", SKILL_OUTCOME_KINDS, diagnostics, true);
  const postChecks = validateStringArray(packagePath, raw, "postChecks", SKILL_POST_CHECKS, diagnostics);
  const escalations = validateStringArray(
    packagePath,
    raw,
    "escalations",
    SKILL_ESCALATION_REASONS,
    diagnostics,
  );

  const context = raw.context;
  let required: string[] = [];
  let optional: string[] = [];
  if (!isRecord(context)) {
    diagnostics.push(diagnostic(packagePath, "skill/invalid-manifest", "context must be a mapping.", "context"));
  } else {
    for (const field of Object.keys(context).filter((field) => !CONTEXT_FIELDS.has(field)).sort()) {
      diagnostics.push(
        diagnostic(packagePath, "skill/unsupported-manifest-field", `context field "${field}" is unsupported.`, `context.${field}`),
      );
    }
    required = validateStringArray(packagePath, context, "required", SKILL_CONTEXT_SLOTS, diagnostics, true);
    optional = validateStringArray(packagePath, context, "optional", SKILL_CONTEXT_SLOTS, diagnostics);
    for (const overlap of required.filter((slot) => optional.includes(slot)).sort()) {
      diagnostics.push(
        diagnostic(
          packagePath,
          "skill/duplicate-context-slot",
          `Context slot "${overlap}" cannot be both required and optional.`,
          "context",
        ),
      );
    }
  }

  const candidate = {
    schemaVersion: raw.schemaVersion,
    skillVersion: raw.skillVersion,
    workflowContractVersion: raw.workflowContractVersion,
    bindings,
    context: { required, optional },
    outcomes,
    postChecks,
    escalations,
  };
  const validation = validateCanonicalSkillManifest(candidate);
  if (!validation.success) {
    for (const error of validation.errors) {
      const field = error.path.replace(/^\$\.?(.*)$/, "$1") || undefined;
      if (diagnostics.some((item) => item.field === field)) continue;
      diagnostics.push(
        diagnostic(
          packagePath,
          "skill/invalid-manifest-contract",
          `${LENGTHWISE_SKILL_MANIFEST} field "${error.path}" is invalid: expected ${error.expected}.`,
          field,
        ),
      );
    }
  }
  return { manifest: validation.success ? validation.data : undefined, bindings };
}

async function collectPackageFiles(packagePath: string, diagnostics: SkillDiagnostic[]): Promise<CanonicalSkillFile[]> {
  const canonicalRoot = await realpath(packagePath);
  const files: CanonicalSkillFile[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = resolve(directory, entry.name);
      const relativePath = relative(canonicalRoot, absolute).split(sep).join("/");
      if (!isWithinOrSame(canonicalRoot, absolute)) {
        diagnostics.push(diagnostic(packagePath, "skill/path-escape", `${relativePath} escapes its canonical package root.`));
        continue;
      }
      if (entry.isSymbolicLink()) {
        diagnostics.push(
          diagnostic(packagePath, "skill/symlink-unsupported", `${relativePath} is a symlink; canonical packages require direct files.`),
        );
        continue;
      }
      if (entry.isDirectory()) {
        await visit(absolute);
        continue;
      }
      if (!entry.isFile()) {
        diagnostics.push(diagnostic(packagePath, "skill/unsupported-file-type", `${relativePath} is not a regular file.`));
        continue;
      }
      if (relativePath === SKILL_PROVENANCE_SIDECAR) {
        diagnostics.push(
          diagnostic(
            packagePath,
            "skill/reserved-provenance-file",
            `${SKILL_PROVENANCE_SIDECAR} is rendered installation provenance and cannot be canonical source.`,
          ),
        );
      }
      files.push({ path: relativePath, content: new Uint8Array(await Bun.file(absolute).arrayBuffer()) });
    }
  }

  await visit(canonicalRoot);
  return files;
}

function validateMarkdownReferences(
  packagePath: string,
  files: readonly CanonicalSkillFile[],
  diagnostics: SkillDiagnostic[],
): void {
  const existing = new Set(files.map((file) => file.path));
  for (const file of files.filter((candidate) => candidate.path.toLowerCase().endsWith(".md"))) {
    const markdown = new TextDecoder().decode(file.content);
    for (const match of markdown.matchAll(LOCAL_MARKDOWN_LINK)) {
      const raw = match[1]?.trim();
      if (!raw || raw.startsWith("#") || /^(?:https?|mailto|data):/i.test(raw)) continue;
      const destination = raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw.split(/\s+/)[0]!;
      const withoutFragment = destination.split("#", 1)[0]!.split("?", 1)[0]!;
      if (!withoutFragment) continue;
      if (posix.isAbsolute(withoutFragment)) {
        diagnostics.push(
          diagnostic(packagePath, "skill/support-path-escape", `${file.path} references absolute path "${destination}".`),
        );
        continue;
      }
      const resolved = posix.normalize(posix.join(posix.dirname(file.path), withoutFragment));
      if (resolved === ".." || resolved.startsWith("../")) {
        diagnostics.push(
          diagnostic(packagePath, "skill/support-path-escape", `${file.path} references path outside its package: "${destination}".`),
        );
      } else if (!existing.has(resolved)) {
        diagnostics.push(
          diagnostic(packagePath, "skill/missing-support-file", `${file.path} references missing support file "${resolved}".`),
        );
      }
    }
  }
}

async function loadPackage(packagePath: string, directoryName: string): Promise<PackageLoadResult> {
  const diagnostics: SkillDiagnostic[] = [];
  let files: CanonicalSkillFile[] = [];
  try {
    files = await collectPackageFiles(packagePath, diagnostics);
  } catch (error) {
    return {
      bindings: [],
      diagnostics: [
        diagnostic(packagePath, "skill/package-read-failed", `Cannot read canonical package: ${(error as Error).message}`),
      ],
    };
  }
  const byPath = new Map(files.map((file) => [file.path, file]));
  const entrypoint = byPath.get(CANONICAL_SKILL_ENTRYPOINT);
  const manifestFile = byPath.get(LENGTHWISE_SKILL_MANIFEST);
  if (!entrypoint) {
    diagnostics.push(diagnostic(packagePath, "skill/missing-entrypoint", `Missing ${CANONICAL_SKILL_ENTRYPOINT}.`));
  }
  if (!manifestFile) {
    diagnostics.push(diagnostic(packagePath, "skill/missing-manifest", `Missing ${LENGTHWISE_SKILL_MANIFEST}.`));
  }

  const parsedFrontmatter = entrypoint
    ? parseFrontmatter(packagePath, new TextDecoder().decode(entrypoint.content), diagnostics)
    : {};
  if (parsedFrontmatter.declaredId && parsedFrontmatter.declaredId !== directoryName) {
    diagnostics.push(
      diagnostic(
        packagePath,
        "skill/name-directory-mismatch",
        `Frontmatter name "${parsedFrontmatter.declaredId}" does not match directory "${directoryName}".`,
        "name",
      ),
    );
  }
  const parsedManifest = manifestFile
    ? parseManifest(packagePath, new TextDecoder().decode(manifestFile.content), diagnostics)
    : { bindings: [] as string[] };
  validateMarkdownReferences(packagePath, files, diagnostics);

  const result: PackageLoadResult = {
    declaredId: parsedFrontmatter.declaredId,
    bindings: parsedManifest.bindings,
    diagnostics,
  };
  if (
    diagnostics.length === 0 &&
    parsedFrontmatter.frontmatter &&
    parsedFrontmatter.body !== undefined &&
    parsedManifest.manifest
  ) {
    result.skill = {
      id: directoryName,
      root: packagePath,
      frontmatter: parsedFrontmatter.frontmatter as CanonicalSkillFrontmatter,
      methodology: parsedFrontmatter.body,
      manifest: parsedManifest.manifest,
      files,
      canonicalDigest: canonicalSkillDigest(files),
    };
  }
  return result;
}

/**
 * Loads exactly one bundled canonical source root. F-004 intentionally has no
 * project-local source layering or override precedence.
 */
export async function loadCanonicalSkillRegistry(
  root: string,
): Promise<LoadCanonicalSkillRegistryResult> {
  const absoluteRoot = resolve(root);
  let entries;
  try {
    entries = await readdir(absoluteRoot, { withFileTypes: true });
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(absoluteRoot, "skill/root-unavailable", `Cannot read canonical skill root: ${(error as Error).message}`),
      ],
    };
  }

  const diagnostics: SkillDiagnostic[] = [];
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  for (const symlink of entries.filter((entry) => entry.isSymbolicLink()).sort((a, b) => a.name.localeCompare(b.name))) {
    diagnostics.push(
      diagnostic(resolve(absoluteRoot, symlink.name), "skill/symlink-unsupported", "Canonical skill roots cannot be symlinks."),
    );
  }

  const expected = new Set<string>(STANDARD_SKILL_IDS);
  for (const missing of [...expected].filter((id) => !directories.includes(id)).sort()) {
    diagnostics.push(diagnostic(absoluteRoot, "skill/missing-standard-skill", `Missing bundled standard skill "${missing}".`));
  }
  for (const unexpected of directories.filter((id) => !expected.has(id))) {
    diagnostics.push(
      diagnostic(
        resolve(absoluteRoot, unexpected),
        "skill/unexpected-skill",
        `Unexpected canonical skill "${unexpected}"; F-004 loads bundled standard skills only.`,
      ),
    );
  }

  const loaded = await Promise.all(
    directories.filter((id) => expected.has(id)).map((id) => loadPackage(resolve(absoluteRoot, id), id)),
  );
  diagnostics.push(...loaded.flatMap((result) => result.diagnostics));

  const ids = loaded.flatMap((result) => (result.declaredId ? [result.declaredId] : []));
  for (const duplicate of [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].sort()) {
    diagnostics.push(diagnostic(absoluteRoot, "skill/duplicate-id", `Canonical skill ID "${duplicate}" is duplicated.`));
  }
  const bindings = loaded.flatMap((result) => result.bindings);
  for (const duplicate of [...new Set(bindings.filter((binding, index) => bindings.indexOf(binding) !== index))].sort()) {
    diagnostics.push(
      diagnostic(absoluteRoot, "skill/duplicate-binding", `Semantic action binding "${duplicate}" has multiple owners.`),
    );
  }

  diagnostics.sort((left, right) =>
    `${left.packagePath}\0${left.code}\0${left.field ?? ""}`.localeCompare(
      `${right.packagePath}\0${right.code}\0${right.field ?? ""}`,
    ),
  );
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const skills = new Map(loaded.flatMap((result) => (result.skill ? [[result.skill.id, result.skill] as const] : [])));
  return { ok: true, registry: { root: await realpath(absoluteRoot), skills }, diagnostics: [] };
}
