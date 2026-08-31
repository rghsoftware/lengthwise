import type { ProjectConfig } from "../config/types.ts";

/** Extensions eligible for Lengthwise artifact recognition (REQ-003). */
const SUPPORTED_EXTENSIONS = [".yaml", ".yml", ".md"];

function hasSupportedExtension(path: string): boolean {
  return SUPPORTED_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/**
 * Resolve configured include/exclude glob patterns to a set of repo-relative
 * candidate file paths (REQ-002). Discovery only selects candidates —
 * whether a candidate is actually a Lengthwise artifact is decided later by
 * recognition (TASK-003/TASK-004), never here.
 *
 * Excludes override includes (AC-002-02): a path matching both is dropped.
 */
export async function discoverCandidateFiles(
  repoRoot: string,
  config: ProjectConfig,
): Promise<string[]> {
  const excludeGlobs = (config.artifacts.exclude ?? []).map((pattern) => new Bun.Glob(pattern));

  const candidates = new Set<string>();
  for (const pattern of config.artifacts.include) {
    const glob = new Bun.Glob(pattern);
    for await (const path of glob.scan({ cwd: repoRoot, onlyFiles: true, dot: true })) {
      if (!hasSupportedExtension(path)) continue;
      if (excludeGlobs.some((excludeGlob) => excludeGlob.match(path))) continue;
      candidates.add(path);
    }
  }

  return [...candidates].sort();
}
