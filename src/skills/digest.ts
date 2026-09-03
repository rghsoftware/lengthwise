import { SKILL_PROVENANCE_SIDECAR } from "./constants.ts";
import type { CanonicalSkillFile } from "./types.ts";

export const SKILL_DIGEST_RULE = {
  version: 1 as const,
  algorithm: "sha256" as const,
  pathOrder: "ascending-posix-relative-path" as const,
  contentEncoding: "raw-file-bytes" as const,
  excludedPaths: [SKILL_PROVENANCE_SIDECAR] as const,
};

const encoder = new TextEncoder();
const excludedPaths = new Set<string>(SKILL_DIGEST_RULE.excludedPaths);

function updateFramed(hasher: Bun.CryptoHasher, value: Uint8Array): void {
  hasher.update(encoder.encode(`${value.byteLength}:`));
  hasher.update(value);
  hasher.update(encoder.encode("\n"));
}

/**
 * Reproducible skill content identity, independent of directory location,
 * timestamps, destination scope, or provenance that records the digest.
 */
export function skillContentDigest(
  files: readonly CanonicalSkillFile[],
  domain: "canonical" | "rendered",
): string {
  const hasher = new Bun.CryptoHasher(SKILL_DIGEST_RULE.algorithm);
  hasher.update(`lengthwise-skill-${domain}-digest:v${SKILL_DIGEST_RULE.version}\n`);

  for (const file of [...files]
    .filter((candidate) => !excludedPaths.has(candidate.path))
    .sort((left, right) => left.path.localeCompare(right.path))) {
    updateFramed(hasher, encoder.encode(file.path));
    updateFramed(hasher, file.content);
  }

  return `${SKILL_DIGEST_RULE.algorithm}:${hasher.digest("hex")}`;
}

export function canonicalSkillDigest(files: readonly CanonicalSkillFile[]): string {
  return skillContentDigest(files, "canonical");
}

export function renderedSkillDigest(files: readonly CanonicalSkillFile[]): string {
  return skillContentDigest(files, "rendered");
}
