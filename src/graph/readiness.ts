import type { EntityId, TaskEntity } from "../domain/entities.ts";
import type { ProjectGraph } from "./project-graph.ts";

/**
 * Readiness is derived state, never a persisted task lifecycle value
 * (principles.md "State model"; TASK-009 LOCKED). Only `planned` tasks are
 * candidates — a task already `in-progress`, `done`, or `cancelled` isn't
 * "next up" in the sense `lw ready` answers.
 */
export interface TaskReadiness {
  task: TaskEntity;
  ready: boolean;
  /** Ids of `depends-on` targets that are missing, not a task, or not yet done. */
  blockedBy: EntityId[];
}

export function deriveTaskReadiness(graph: ProjectGraph): TaskReadiness[] {
  return graph
    .entitiesOfType("task")
    .filter((task) => task.lifecycle === "planned")
    .map((task) => {
      const dependsOn = graph
        .outgoingRelationships(task.id)
        .filter((relationship) => relationship.type === "depends-on")
        .map((relationship) => relationship.to);

      const blockedBy = dependsOn.filter((dependencyId) => {
        const dependency = graph.getEntity(dependencyId);
        return !dependency || dependency.type !== "task" || dependency.lifecycle !== "done";
      });

      return { task, ready: blockedBy.length === 0, blockedBy };
    })
    .sort((a, b) => a.task.id.localeCompare(b.task.id));
}
