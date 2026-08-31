import type { ProjectConfig, RigorPolicy } from "../config/types.ts";

/**
 * Effective rigor is the nearest explicit override, otherwise the project
 * default (principles.md "Rigor and significance"). No current F-001 entity
 * type carries a per-entity rigor override, and no required acceptance
 * criterion exercises one, so this intentionally resolves to the project
 * default only — a narrower override-resolution mechanism is future policy
 * engine work outside F-001's scope, not a semantic F-001 needs today.
 */
export function effectiveRigor(config: ProjectConfig): RigorPolicy {
  return config.rigor[config.policy.rigor];
}
