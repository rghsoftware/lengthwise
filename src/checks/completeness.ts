import type { ProjectGraph } from "../graph/project-graph.ts";
import type { ProjectConfig } from "../config/types.ts";
import { effectiveRigor } from "./rigor.ts";
import { errorDiagnostic, type Diagnostic } from "../diagnostics.ts";
import type { Entity } from "../domain/entities.ts";

function isAcceptedRequirementLike(entity: Entity): boolean {
  return (
    (entity.type === "requirement" || entity.type === "non-functional-requirement") &&
    entity.lifecycle === "accepted"
  );
}

/** AC-010-01: an accepted requirement needs acceptance criteria when effective rigor requires them. */
export function checkAcceptanceCriteriaCoverage(
  graph: ProjectGraph,
  config: ProjectConfig,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const entity of graph.entities) {
    if (!isAcceptedRequirementLike(entity)) continue;
    if (effectiveRigor(config, graph, entity.id).acceptanceCriteria !== "required") continue;
    const hasAcceptanceCriterion = graph
      .outgoingRelationships(entity.id)
      .some((relationship) => relationship.type === "has-acceptance-criterion");
    if (hasAcceptanceCriterion) continue;
    diagnostics.push(
      errorDiagnostic(
        "completeness/missing-acceptance-criteria",
        `${entity.id} is an accepted requirement with no acceptance criteria, but effective rigor requires them.`,
        { location: entity.source, entityId: entity.id },
      ),
    );
  }
  return diagnostics;
}

/** AC-010-02: an accepted requirement needs a qualifying IMPLEMENTS edge when traceability is required. */
export function checkImplementationTraceability(
  graph: ProjectGraph,
  config: ProjectConfig,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const entity of graph.entities) {
    if (!isAcceptedRequirementLike(entity)) continue;
    if (effectiveRigor(config, graph, entity.id).implementationTraceability !== "required") continue;
    const isImplemented = graph
      .incomingRelationships(entity.id)
      .some((relationship) => relationship.type === "implements");
    if (isImplemented) continue;
    diagnostics.push(
      errorDiagnostic(
        "completeness/missing-implementation",
        `${entity.id} is an accepted requirement with no implementing task, but effective rigor requires implementation traceability.`,
        { location: entity.source, entityId: entity.id },
      ),
    );
  }
  return diagnostics;
}

/**
 * AC-010-03..06: an accepted acceptance criterion needs at least one
 * `required: true` verification definition when verification coverage is
 * required. F-001 does not implement verification-execution evidence
 * tracking (that is runtime state, out of scope per spec.md Non-scope) —
 * so "satisfactory evidence" (AC-010-04) is proxied by the required
 * verification definition existing and targeting the criterion; an
 * `optional` verification's absence never blocks (AC-010-05), and no
 * method is privileged over another (AC-010-06), since neither is filtered.
 */
export function checkVerificationCoverage(
  graph: ProjectGraph,
  config: ProjectConfig,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const entity of graph.entities) {
    if (entity.type !== "acceptance-criterion" || entity.lifecycle !== "accepted") continue;
    if (effectiveRigor(config, graph, entity.id).verificationCoverage !== "required") continue;
    const requiredVerifiers = graph
      .incomingRelationships(entity.id)
      .filter((relationship) => relationship.type === "verifies")
      .map((relationship) => graph.getEntity(relationship.from))
      .filter((source): source is Extract<Entity, { type: "verification" }> => source?.type === "verification")
      .filter((verification) => verification.required);
    if (requiredVerifiers.length > 0) continue;
    diagnostics.push(
      errorDiagnostic(
        "completeness/missing-verification",
        `${entity.id} is an accepted acceptance criterion with no required verification definition, but effective rigor requires verification coverage.`,
        { location: entity.source, entityId: entity.id },
      ),
    );
  }
  return diagnostics;
}

export function runCompletenessChecks(graph: ProjectGraph, config: ProjectConfig): Diagnostic[] {
  return [
    ...checkAcceptanceCriteriaCoverage(graph, config),
    ...checkImplementationTraceability(graph, config),
    ...checkVerificationCoverage(graph, config),
  ];
}
