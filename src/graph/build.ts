import { loadProjectConfig } from "../config/load.ts";
import { loadArtifacts } from "../artifacts/load.ts";
import { normalizeEntities } from "../normalize/normalize.ts";
import type { Diagnostic } from "../diagnostics.ts";
import type { ProjectConfig } from "../config/types.ts";
import { ProjectGraph } from "./project-graph.ts";

export type BuildProjectGraphResult =
  | { ok: true; graph: ProjectGraph; config: ProjectConfig; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

/**
 * The full repo → configuration → discovery → recognition/parsing →
 * normalization → Project Graph pipeline (spec.md "Architectural flow").
 *
 * A missing/invalid project configuration is unrecoverable (AC-001-02,
 * AC-001-03): no graph can be built without knowing discovery scope. Parse
 * or normalization failures in individual artifacts are recoverable — they
 * are collected as diagnostics alongside whatever graph could still be
 * built from the artifacts that were valid (AC-009-02).
 */
export async function buildProjectGraph(repoRoot: string): Promise<BuildProjectGraphResult> {
  const configResult = await loadProjectConfig(repoRoot);
  if (!configResult.ok) return { ok: false, diagnostics: configResult.diagnostics };

  const loaded = await loadArtifacts(repoRoot, configResult.config);
  const normalized = normalizeEntities(loaded.blocks);

  return {
    ok: true,
    graph: new ProjectGraph(normalized.entities, normalized.relationships),
    config: configResult.config,
    diagnostics: [...loaded.diagnostics, ...normalized.diagnostics],
  };
}
