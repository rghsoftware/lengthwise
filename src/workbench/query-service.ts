import type { Entity } from "../domain/entities.ts";
import { deriveTaskReadiness } from "../graph/readiness.ts";
import type { ProjectGraph } from "../graph/project-graph.ts";
import type { EntityDetail, EntitySummary, RelationshipView } from "./types.ts";

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
    source: entity.source,
  };
}

function authoredProperties(entity: Entity): Record<string, unknown> {
  const { id: _id, type: _type, lifecycle: _lifecycle, source: _source, ...properties } = entity;
  return properties;
}

export class WorkbenchQueryService {
  constructor(private readonly graph: ProjectGraph) {}

  listEntities(options: { type?: string; query?: string } = {}): EntitySummary[] {
    const query = options.query?.trim().toLocaleLowerCase();
    return this.graph.entities
      .filter((entity) => !options.type || entity.type === options.type)
      .filter((entity) => {
        if (!query) return true;
        const searchable = [entity.id, entityLabel(entity), JSON.stringify(authoredProperties(entity))]
          .join("\n")
          .toLocaleLowerCase();
        return searchable.includes(query);
      })
      .map(summarizeEntity)
      .sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
  }

  getEntity(id: string): EntityDetail | undefined {
    const entity = this.graph.getEntity(id);
    if (!entity) return undefined;

    const readiness = entity.type === "task"
      ? deriveTaskReadiness(this.graph).find((entry) => entry.task.id === id)
      : undefined;
    const implementationCoverage = entity.type === "requirement" || entity.type === "non-functional-requirement"
      ? this.graph.incomingRelationships(entity.id).some((edge) => edge.type === "implements")
      : undefined;
    const verificationCoverage = entity.type === "acceptance-criterion"
      ? this.graph.incomingRelationships(entity.id).some((edge) => edge.type === "verifies")
      : undefined;

    const outgoing: RelationshipView[] = this.graph.outgoingRelationships(entity.id).map((edge) => ({
      direction: "outgoing",
      type: edge.type,
      label: edge.type,
      counterpart: this.counterpart(edge.to),
      provenance: edge.provenance.kind,
    }));
    const incoming: RelationshipView[] = this.graph.incomingProjections(entity.id).map((edge) => ({
      direction: "incoming",
      type: edge.underlyingType,
      label: edge.label,
      counterpart: this.counterpart(edge.counterpart),
      provenance: edge.provenance.kind,
    }));

    return {
      entity,
      label: entityLabel(entity),
      authoredProperties: authoredProperties(entity),
      derivedState: {
        ...(readiness ? { ready: readiness.ready, blockedBy: readiness.blockedBy } : {}),
        ...(implementationCoverage !== undefined ? { implementationCoverage } : {}),
        ...(verificationCoverage !== undefined ? { verificationCoverage } : {}),
      },
      relationships: [...outgoing, ...incoming],
    };
  }

  private counterpart(id: string): EntitySummary | { id: string; missing: true } {
    const entity = this.graph.getEntity(id);
    return entity ? summarizeEntity(entity) : { id, missing: true };
  }
}
