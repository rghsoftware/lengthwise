import type { Diagnostic } from "../diagnostics.ts";
import type { Entity } from "../domain/entities.ts";
import type { ProjectGraph } from "../graph/project-graph.ts";
import { entityLabel } from "./query-service.ts";
import type { ModelChange } from "./types.ts";

function edgeKey(edge: { from: string; type: string; to: string }): string {
  return `${edge.from}\u0000${edge.type}\u0000${edge.to}`;
}

function findingFingerprint(diagnostic: Diagnostic): string {
  return JSON.stringify([
    diagnostic.code,
    diagnostic.severity,
    diagnostic.entityId ?? "",
    diagnostic.location?.artifactPath ?? "",
    diagnostic.location?.line ?? 0,
    diagnostic.message,
  ]);
}

function coverage(graph: ProjectGraph, entity: Entity): "implementation" | "verification" | undefined {
  if (entity.type === "requirement" || entity.type === "non-functional-requirement") {
    return graph.incomingRelationships(entity.id).some((edge) => edge.type === "implements")
      ? undefined
      : "implementation";
  }
  if (entity.type === "acceptance-criterion") {
    return graph.incomingRelationships(entity.id).some((edge) => edge.type === "verifies")
      ? undefined
      : "verification";
  }
  return undefined;
}

export function compareSuccessfulGraphs(
  before: { graph: ProjectGraph; diagnostics: Diagnostic[] },
  after: { graph: ProjectGraph; diagnostics: Diagnostic[] },
): ModelChange[] {
  const changes: ModelChange[] = [];
  const beforeEntities = new Map(before.graph.entities.map((entity) => [entity.id, entity]));
  const afterEntities = new Map(after.graph.entities.map((entity) => [entity.id, entity]));

  for (const [id, entity] of afterEntities) {
    const previous = beforeEntities.get(id);
    if (!previous) {
      changes.push({ kind: "entity-added", entityId: id, entityType: entity.type, label: entityLabel(entity) });
      continue;
    }
    if (previous.lifecycle !== entity.lifecycle) {
      changes.push({ kind: "lifecycle-changed", entityId: id, before: previous.lifecycle, after: entity.lifecycle });
    }
    const beforeGap = coverage(before.graph, previous);
    const afterGap = coverage(after.graph, entity);
    if (!beforeGap && afterGap) changes.push({ kind: "coverage-lost", entityId: id, coverage: afterGap });
  }
  for (const [id, entity] of beforeEntities) {
    if (!afterEntities.has(id)) {
      changes.push({ kind: "entity-removed", entityId: id, entityType: entity.type, label: entityLabel(entity) });
    }
  }

  const beforeEdges = new Map(before.graph.relationships.map((edge) => [edgeKey(edge), edge]));
  const afterEdges = new Map(after.graph.relationships.map((edge) => [edgeKey(edge), edge]));
  for (const [key, edge] of afterEdges) {
    if (!beforeEdges.has(key)) changes.push({ kind: "relationship-added", from: edge.from, type: edge.type, to: edge.to });
  }
  for (const [key, edge] of beforeEdges) {
    if (!afterEdges.has(key)) changes.push({ kind: "relationship-removed", from: edge.from, type: edge.type, to: edge.to });
  }

  const beforeFindings = new Map(before.diagnostics.map((finding) => [findingFingerprint(finding), finding]));
  const afterFindings = new Map(after.diagnostics.map((finding) => [findingFingerprint(finding), finding]));
  for (const [fingerprint, diagnostic] of afterFindings) {
    if (!beforeFindings.has(fingerprint)) changes.push({ kind: "finding-added", fingerprint, diagnostic });
  }
  for (const [fingerprint, diagnostic] of beforeFindings) {
    if (!afterFindings.has(fingerprint)) changes.push({ kind: "finding-resolved", fingerprint, diagnostic });
  }

  return changes.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
