import type { ProjectGraph } from "../graph/project-graph.ts";
import { isRelationshipAllowed } from "../domain/relationships.ts";
import { sourceOf } from "../domain/provenance.ts";
import { errorDiagnostic, type Diagnostic } from "../diagnostics.ts";

/** Every declared relationship's target entity actually exists (AC-007-05). */
export function checkDanglingRelationships(graph: ProjectGraph): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const relationship of graph.relationships) {
    if (graph.hasEntity(relationship.to)) continue;
    diagnostics.push(
      errorDiagnostic(
        "graph/dangling-relationship",
        `${relationship.from} --${relationship.type}--> ${relationship.to}: target "${relationship.to}" does not exist.`,
        { location: sourceOf(relationship.provenance), entityId: relationship.from },
      ),
    );
  }
  return diagnostics;
}

/** Every relationship's source/target entity types satisfy the relationship's registered constraint (AC-007-04). */
export function checkRelationshipTypeConstraints(graph: ProjectGraph): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const relationship of graph.relationships) {
    const source = graph.getEntity(relationship.from);
    const target = graph.getEntity(relationship.to);
    if (!source || !target) continue; // reported by checkDanglingRelationships
    if (isRelationshipAllowed(relationship.type, source.type, target.type)) continue;
    diagnostics.push(
      errorDiagnostic(
        "graph/invalid-relationship-type",
        `${relationship.from} (${source.type}) --${relationship.type}--> ${relationship.to} (${target.type}): not a valid source/target type pair for "${relationship.type}".`,
        { location: sourceOf(relationship.provenance), entityId: relationship.from },
      ),
    );
  }
  return diagnostics;
}

/** Every entity id is declared at most once (AC-004-02). */
export function checkDuplicateIds(graph: ProjectGraph): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const [id, declarations] of graph.duplicateIds()) {
    const locations = declarations.map((entity) => `${entity.source.artifactPath}:${entity.source.line ?? "?"}`);
    diagnostics.push(
      errorDiagnostic(
        "graph/duplicate-id",
        `"${id}" is declared ${declarations.length} times: ${locations.join(", ")}.`,
        { entityId: id },
      ),
    );
  }
  return diagnostics;
}

/**
 * Task dependency cycles are invalid (TASK-007 LOCKED, AC-009-05). Detects
 * cycles among `depends-on` edges between task entities via DFS over a
 * sorted task-id order, so results are deterministic (NFR-003) regardless
 * of input array ordering. Each distinct cycle is reported once, normalized
 * to start at its lexicographically smallest participant.
 */
export function checkTaskDependencyCycles(graph: ProjectGraph): Diagnostic[] {
  const tasks = [...graph.entitiesOfType("task")].sort((a, b) => a.id.localeCompare(b.id));

  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const seenCycles = new Set<string>();
  const diagnostics: Diagnostic[] = [];

  function normalize(cycle: string[]): string {
    const minIndex = cycle.reduce(
      (best, id, index) => (id < cycle[best]! ? index : best),
      0,
    );
    return [...cycle.slice(minIndex), ...cycle.slice(0, minIndex)].join(" -> ");
  }

  function visit(id: string): void {
    const status = state.get(id);
    if (status === "done") return;
    if (status === "visiting") {
      const start = stack.indexOf(id);
      const cycle = stack.slice(start);
      const signature = normalize(cycle);
      if (!seenCycles.has(signature)) {
        seenCycles.add(signature);
        diagnostics.push(
          errorDiagnostic(
            "graph/task-dependency-cycle",
            `Task dependency cycle: ${[...cycle, id].join(" -> ")}.`,
            { entityId: cycle[0] },
          ),
        );
      }
      return;
    }

    state.set(id, "visiting");
    stack.push(id);
    const dependsOn = graph
      .outgoingRelationships(id)
      .filter((relationship) => relationship.type === "depends-on")
      .map((relationship) => relationship.to)
      .sort();
    for (const next of dependsOn) visit(next);
    stack.pop();
    state.set(id, "done");
  }

  for (const task of tasks) visit(task.id);
  return diagnostics;
}

export function runStructuralChecks(graph: ProjectGraph): Diagnostic[] {
  return [
    ...checkDuplicateIds(graph),
    ...checkDanglingRelationships(graph),
    ...checkRelationshipTypeConstraints(graph),
    ...checkTaskDependencyCycles(graph),
  ];
}
