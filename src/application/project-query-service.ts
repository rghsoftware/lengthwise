import type { Entity } from "../domain/entities.ts";
import { deriveTaskReadiness, taskDependencyBlockers } from "../graph/readiness.ts";
import type { ProjectGraph } from "../graph/project-graph.ts";
import { evidenceSatisfaction } from "../workflow/projections.ts";
import type {
  ApplicationBlocker,
  EntityDetail,
  EntitySummary,
  RelationshipView,
  TaskDependenciesView,
  TaskReadinessView,
  TraceabilityView,
  VerificationEvidenceView,
} from "./project-types.ts";

function detached<T>(value: T): T {
  return structuredClone(value);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function entityLabel(entity: Entity): string {
  if ("title" in entity && typeof entity.title === "string") return entity.title;
  if ("statement" in entity && typeof entity.statement === "string") return entity.statement;
  return entity.id;
}

export function summarizeEntity(entity: Entity): EntitySummary {
  return {
    id: entity.id,
    type: entity.type,
    lifecycle: entity.lifecycle,
    label: entityLabel(entity),
    source: detached(entity.source),
  };
}

function authoredProperties(entity: Entity): Record<string, unknown> {
  const { id: _id, type: _type, lifecycle: _lifecycle, source: _source, body: _body, ...properties } = entity;
  return detached(properties);
}

function dependencyBlocker(taskId: string, dependencyId: string, artifactPath?: string): ApplicationBlocker {
  return {
    code: "task-dependency-incomplete",
    message: `${taskId} depends on incomplete task ${dependencyId}`,
    entityId: dependencyId,
    ...(artifactPath ? { artifactPath } : {}),
  };
}

/** Immutable application queries over one evaluated Project Graph snapshot. */
export class ProjectQueryService {
  #graph: ProjectGraph;
  constructor(graph: ProjectGraph) { this.#graph = graph; }

  listEntities(options: { type?: string; query?: string } = {}): EntitySummary[] {
    const query = options.query?.trim().toLowerCase();
    return this.#graph.entities
      .filter((entity) => !options.type || entity.type === options.type)
      .filter((entity) => {
        if (!query) return true;
        const searchable = [entity.id, entityLabel(entity), entity.body, JSON.stringify(authoredProperties(entity))]
          .join("\n")
          .toLowerCase();
        return searchable.includes(query);
      })
      .map(summarizeEntity)
      .sort((a, b) => compareStrings(a.type, b.type) || compareStrings(a.id, b.id));
  }

  getEntity(id: string): EntityDetail | undefined {
    const entity = this.#graph.getEntity(id);
    if (!entity) return undefined;

    const readiness = entity.type === "task"
      ? deriveTaskReadiness(this.#graph).find((entry) => entry.task.id === id)
      : undefined;
    const implementationCoverage = entity.type === "requirement" || entity.type === "non-functional-requirement"
      ? this.#graph.incomingRelationships(entity.id).some((edge) => edge.type === "implements")
      : undefined;
    const verificationCoverage = entity.type === "acceptance-criterion"
      ? this.#graph.incomingRelationships(entity.id).some((edge) => edge.type === "verifies")
      : undefined;

    return {
      entity: detached(entity),
      label: entityLabel(entity),
      authoredProperties: authoredProperties(entity),
      derivedState: {
        ...(readiness ? { ready: readiness.ready, blockedBy: readiness.blockedBy } : {}),
        ...(implementationCoverage !== undefined ? { implementationCoverage } : {}),
        ...(verificationCoverage !== undefined ? { verificationCoverage } : {}),
      },
      relationships: this.relationships(entity.id),
    };
  }

  getTraceability(id: string): TraceabilityView | undefined {
    const entity = this.#graph.getEntity(id);
    if (!entity) return undefined;
    return { entity: summarizeEntity(entity), relationships: this.relationships(id) };
  }

  listTaskReadiness(): TaskReadinessView[] {
    return deriveTaskReadiness(this.#graph).map(({ task, ready, blockedBy }) => ({
      task: summarizeEntity(task),
      candidate: true,
      ready,
      blockers: blockedBy.map((dependencyId) => dependencyBlocker(
        task.id,
        dependencyId,
        this.#graph.getEntity(dependencyId)?.source.artifactPath,
      )),
    }));
  }

  getTaskReadiness(id: string): TaskReadinessView | undefined {
    const task = this.#graph.getEntity(id);
    if (!task || task.type !== "task") return undefined;
    const candidate = task.lifecycle === "planned";
    const blockedBy = taskDependencyBlockers(this.#graph, task);
    const blockers = blockedBy.map((dependencyId) => dependencyBlocker(
      task.id,
      dependencyId,
      this.#graph.getEntity(dependencyId)?.source.artifactPath,
    ));
    if (!candidate) {
      blockers.unshift({
        code: "task-not-planned",
        message: `${task.id} is ${task.lifecycle}; only planned tasks are readiness candidates`,
        entityId: task.id,
        artifactPath: task.source.artifactPath,
      });
    }
    return { task: summarizeEntity(task), candidate, ready: candidate && blockers.length === 0, blockers };
  }

  getTaskDependencies(id: string): TaskDependenciesView | undefined {
    const task = this.#graph.getEntity(id);
    if (!task || task.type !== "task") return undefined;
    const blocked = new Set(taskDependencyBlockers(this.#graph, task));
    const dependencyIds = [...new Set(this.#graph.outgoingRelationships(id)
      .filter((relationship) => relationship.type === "depends-on")
      .map((relationship) => relationship.to))].sort();
    return {
      task: summarizeEntity(task),
      dependencies: dependencyIds.map((dependencyId) => {
        const dependency = this.#graph.getEntity(dependencyId);
        return {
          id: dependencyId,
          entity: dependency ? summarizeEntity(dependency) : { id: dependencyId, missing: true as const },
          satisfied: !blocked.has(dependencyId),
        };
      }),
    };
  }

  getVerificationEvidence(id: string): VerificationEvidenceView | undefined {
    const verification = this.#graph.getEntity(id);
    if (!verification || verification.type !== "verification") return undefined;
    const result = evidenceSatisfaction(this.#graph, id);
    return detached({ verification: summarizeEntity(verification), ...result });
  }

  private relationships(id: string): RelationshipView[] {
    const outgoing: RelationshipView[] = this.#graph.outgoingRelationships(id).map((edge) => ({
      direction: "outgoing",
      type: edge.type,
      label: edge.type,
      counterpart: this.counterpart(edge.to),
      provenance: edge.provenance.kind,
    }));
    const incoming: RelationshipView[] = this.#graph.incomingProjections(id).map((edge) => ({
      direction: "incoming",
      type: edge.underlyingType,
      label: edge.label,
      counterpart: this.counterpart(edge.counterpart),
      provenance: edge.provenance.kind,
    }));
    return [...outgoing, ...incoming];
  }

  private counterpart(id: string): EntitySummary | { id: string; missing: true } {
    const entity = this.#graph.getEntity(id);
    return entity ? summarizeEntity(entity) : { id, missing: true };
  }
}
