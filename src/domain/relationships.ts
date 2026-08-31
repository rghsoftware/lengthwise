import type { EntityId, EntityType } from "./entities.ts";
import type { ProvenanceInfo } from "./provenance.ts";

/**
 * Initial relationship vocabulary (spec.md "Initial relationship vocabulary").
 * Relationships are typed, directional, authored with natural semantics, and
 * conceptually stored once — inverse labels are query projections, never a
 * second authoritative declaration (AC-007-03).
 */
export const RELATIONSHIP_TYPES = [
  "contains",
  "addresses",
  "has-acceptance-criterion",
  "governs",
  "realized-by",
  "implements",
  "verifies",
  "depends-on",
  "supersedes",
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/** A relationship, stored once in the direction it was authored or derived in. */
export interface Relationship {
  type: RelationshipType;
  from: EntityId;
  to: EntityId;
  provenance: ProvenanceInfo;
}

type TypeConstraint = readonly EntityType[] | "any";

export interface RelationshipDefinition {
  type: RelationshipType;
  /** Query-side projection label for traversing the edge from target back to source. */
  inverseLabel: string;
  sourceTypes: TypeConstraint;
  /** "same-as-source" ties the target constraint to whatever type the source actually is. */
  targetTypes: TypeConstraint | "same-as-source";
  description: string;
}

/**
 * Source/target constraints for each relationship type (REQ-007). Types not
 * yet instantiated by this repository's own artifacts (contains, addresses,
 * governs) still need principled constraints so the registry is exercisable
 * and extensible (NFR-007) ahead of future artifacts using them.
 */
export const RELATIONSHIP_REGISTRY: Record<RelationshipType, RelationshipDefinition> = {
  contains: {
    type: "contains",
    inverseLabel: "contained-in",
    sourceTypes: ["document", "plan", "feature"],
    targetTypes: "any",
    description: "A container-like entity structurally holds another entity.",
  },
  addresses: {
    type: "addresses",
    inverseLabel: "addressed-by",
    sourceTypes: ["decision", "task", "feature"],
    targetTypes: ["requirement", "non-functional-requirement"],
    description: "An entity speaks to a requirement or non-functional-requirement's concern.",
  },
  "has-acceptance-criterion": {
    type: "has-acceptance-criterion",
    inverseLabel: "acceptance-criterion-of",
    sourceTypes: ["requirement", "non-functional-requirement"],
    targetTypes: ["acceptance-criterion"],
    description: "A requirement defines an observable acceptance criterion.",
  },
  governs: {
    type: "governs",
    inverseLabel: "governed-by",
    sourceTypes: ["decision"],
    targetTypes: "any",
    description: "A decision constrains or governs another entity.",
  },
  "realized-by": {
    type: "realized-by",
    inverseLabel: "realizes",
    sourceTypes: ["roadmap-item"],
    targetTypes: ["feature"],
    description: "A roadmap item is realized by a feature.",
  },
  implements: {
    type: "implements",
    inverseLabel: "implemented-by",
    sourceTypes: ["task"],
    targetTypes: ["requirement", "non-functional-requirement"],
    description: "A task implements a requirement or non-functional-requirement.",
  },
  verifies: {
    type: "verifies",
    inverseLabel: "verified-by",
    sourceTypes: ["verification"],
    targetTypes: ["acceptance-criterion"],
    description: "A verification definition verifies an acceptance criterion.",
  },
  "depends-on": {
    type: "depends-on",
    inverseLabel: "required-by",
    sourceTypes: ["task"],
    targetTypes: ["task"],
    description: "A task depends on another task's completion.",
  },
  supersedes: {
    type: "supersedes",
    inverseLabel: "superseded-by",
    sourceTypes: "any",
    targetTypes: "same-as-source",
    description: "An entity replaces an earlier entity of the same type.",
  },
};

function matchesConstraint(constraint: TypeConstraint, type: EntityType): boolean {
  return constraint === "any" || (constraint as readonly EntityType[]).includes(type);
}

/**
 * Whether a relationship of `type` may run from `sourceType` to `targetType`
 * (REQ-007, AC-007-04).
 */
export function isRelationshipAllowed(
  type: RelationshipType,
  sourceType: EntityType,
  targetType: EntityType,
): boolean {
  const definition = RELATIONSHIP_REGISTRY[type];
  if (!matchesConstraint(definition.sourceTypes, sourceType)) return false;
  if (definition.targetTypes === "same-as-source") return targetType === sourceType;
  return matchesConstraint(definition.targetTypes, targetType);
}

export function isKnownRelationshipType(value: string): value is RelationshipType {
  return (RELATIONSHIP_TYPES as readonly string[]).includes(value);
}

export function inverseLabelOf(type: RelationshipType): string {
  return RELATIONSHIP_REGISTRY[type].inverseLabel;
}
