import type { ProjectConfig, RigorPolicy, RigorLevelName } from "../config/types.ts";
import type { ProjectGraph } from "../graph/project-graph.ts";

/**
 * Effective rigor is the nearest explicit override, otherwise the project
 * default (principles.md "Rigor and significance"). No current F-001 entity
 * type carries a per-entity rigor override, and no required acceptance
 * criterion exercises one, so this intentionally resolves to the project
 * default only — a narrower override-resolution mechanism is future policy
 * engine work outside F-001's scope, not a semantic F-001 needs today.
 */
export function effectiveRigor(config: ProjectConfig, graph?: ProjectGraph, entityId?: string): RigorPolicy {
  let level: RigorLevelName = config.policy.rigor;
  if (!graph || !entityId) return config.rigor[level];
  const entity = graph.getEntity(entityId); if (entity?.rigor) return config.rigor[entity.rigor];
  let frontier = [entityId]; const seen = new Set(frontier);
  while (frontier.length) {
    const parents = [...new Set(frontier.flatMap(id => graph.incomingRelationships(id).filter(r => r.type === "contains").map(r => r.from)))].sort();
    const overrides = [...new Set(parents.map(id => graph.getEntity(id)?.rigor).filter((v): v is RigorLevelName => Boolean(v)))];
    if (overrides.length === 1) return config.rigor[overrides[0]!];
    if (overrides.length > 1) return config.rigor[level];
    frontier = parents.filter(id => !seen.has(id)); frontier.forEach(id => seen.add(id));
  }
  return config.rigor[level];
}
