import type { Entity, EntityId, EntityType } from "../domain/entities.ts";
import { inverseLabelOf, type Relationship, type RelationshipType } from "../domain/relationships.ts";
import { sourceOf, type ProvenanceInfo } from "../domain/provenance.ts";

/**
 * A query-time inverse view of a stored relationship. Never a second stored
 * edge — relationships are conceptually stored once (TASK-001/TASK-006
 * LOCKED) — but its own provenance is legitimately `derived`: it is
 * mechanically produced by Lengthwise from the one authoritative stored
 * relationship, which satisfies "F-001 must produce declared and derived"
 * (spec.md "Domain semantics") without duplicating authored data.
 */
export interface RelationshipProjection {
  /** The inverse query-side label, e.g. "implemented-by" for a stored "implements" edge. */
  label: string;
  /** The relationship type as actually stored, i.e. the forward/declared direction. */
  underlyingType: RelationshipType;
  /** The entity at the other end of the underlying relationship. */
  counterpart: EntityId;
  provenance: ProvenanceInfo;
}

function pushInto<K>(index: Map<K, Relationship[]>, key: K, value: Relationship): void {
  const bucket = index.get(key);
  if (bucket) bucket.push(value);
  else index.set(key, [value]);
}

/**
 * The in-memory Project Graph (REQ-007, REQ-008). Derived from normalized
 * entities/relationships; has no knowledge of SQLite or any other
 * persistence mechanism (TASK-006 LOCKED).
 */
export class ProjectGraph {
  readonly entities: readonly Entity[];
  readonly relationships: readonly Relationship[];

  private readonly byId: Map<EntityId, Entity>;
  private readonly outgoingIndex: Map<EntityId, Relationship[]>;
  private readonly incomingIndex: Map<EntityId, Relationship[]>;

  constructor(entities: readonly Entity[], relationships: readonly Relationship[]) {
    this.entities = entities;
    this.relationships = relationships;

    this.byId = new Map();
    for (const entity of entities) {
      // First declaration wins for direct lookup; duplicateIds() surfaces
      // every declaration for `lw check` to report (AC-004-02).
      if (!this.byId.has(entity.id)) this.byId.set(entity.id, entity);
    }

    this.outgoingIndex = new Map();
    this.incomingIndex = new Map();
    for (const relationship of relationships) {
      pushInto(this.outgoingIndex, relationship.from, relationship);
      pushInto(this.incomingIndex, relationship.to, relationship);
    }
  }

  getEntity(id: EntityId): Entity | undefined {
    return this.byId.get(id);
  }

  hasEntity(id: EntityId): boolean {
    return this.byId.has(id);
  }

  entitiesOfType<T extends EntityType>(type: T): Extract<Entity, { type: T }>[] {
    return this.entities.filter((entity): entity is Extract<Entity, { type: T }> => entity.type === type);
  }

  /** Relationships stored with this entity as source, in their authored direction. */
  outgoingRelationships(id: EntityId): readonly Relationship[] {
    return this.outgoingIndex.get(id) ?? [];
  }

  /** Relationships stored with this entity as target — natural semantics, not inverted. */
  incomingRelationships(id: EntityId): readonly Relationship[] {
    return this.incomingIndex.get(id) ?? [];
  }

  /** Inverse-projection view of every relationship pointing at this entity (AC-007-03). */
  incomingProjections(id: EntityId): RelationshipProjection[] {
    return this.incomingRelationships(id).map((relationship) => ({
      label: inverseLabelOf(relationship.type),
      underlyingType: relationship.type,
      counterpart: relationship.from,
      provenance: {
        kind: "derived",
        explanation: `Derived from the declared "${relationship.type}" relationship authored on ${relationship.from}.`,
        derivedFrom: sourceOf(relationship.provenance),
      },
    }));
  }

  /** Entity ids declared more than once, each with every declaring entity (AC-004-02). */
  duplicateIds(): Map<EntityId, Entity[]> {
    const byId = new Map<EntityId, Entity[]>();
    for (const entity of this.entities) {
      const bucket = byId.get(entity.id);
      if (bucket) bucket.push(entity);
      else byId.set(entity.id, [entity]);
    }
    for (const [id, bucket] of byId) {
      if (bucket.length < 2) byId.delete(id);
    }
    return byId;
  }
}
