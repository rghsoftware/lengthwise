import type { ProjectGraph } from "../graph/project-graph.ts";
import type { ProjectConfig } from "../config/types.ts";
import type { Diagnostic } from "../diagnostics.ts";
import { runStructuralChecks } from "./structural.ts";
import { runCompletenessChecks } from "./completeness.ts";

export * from "./structural.ts";
export * from "./completeness.ts";
export * from "./rigor.ts";

/**
 * All deterministic Project Graph checks (REQ-009, REQ-010). Runs every
 * check to completion and concatenates findings rather than stopping at the
 * first failure (AC-009-02).
 */
export function runChecks(graph: ProjectGraph, config: ProjectConfig): Diagnostic[] {
  return [...runStructuralChecks(graph), ...runCompletenessChecks(graph, config)];
}
