import type { SourceLocation } from "./provenance.ts";
import type {
  AcceptanceCriterionLifecycle,
  DecisionLifecycle,
  DocumentLifecycle,
  FeatureLifecycle,
  PlanLifecycle,
  RequirementLifecycle,
  RoadmapItemLifecycle,
  TaskLifecycle,
  VerificationLifecycle,
  QuestionLifecycle, EvidenceLifecycle, BuildContractLifecycle,
} from "./lifecycle.ts";
import type { tags } from "typia";

/**
 * Every recognized entity has an explicit, stable identifier independent of
 * its containing artifact (REQ-004). IDs are heterogeneous across types
 * (REQ-001, DR-001, AC-001-01, DOC-PRINCIPLES, ...) so identity is an opaque
 * non-empty string, never parsed for semantics or used to infer type or
 * relationships (spec.md "Do not infer relationships from ID naming").
 */
export type EntityId = string & tags.MinLength<1>;

interface EntityBase<TType extends string, TLifecycle extends string> {
  id: EntityId;
  type: TType;
  lifecycle: TLifecycle;
  /** Where the authoritative declaration for this entity lives (AC-012-03, AC-NFR-005-02). */
  source: SourceLocation;
  /**
   * Narrative content when the entity was declared via Markdown+frontmatter.
   * Semantic type does not dictate representation (DR-012), so this is
   * available to any entity type rather than hardcoded to document-like ones.
   */
  body?: string;
  rigor?: "light" | "standard" | "strict";
}

export interface RequirementEntity extends EntityBase<"requirement", RequirementLifecycle> {
  title: string & tags.MinLength<1>;
  statement: string & tags.MinLength<1>;
}

export interface NonFunctionalRequirementEntity
  extends EntityBase<"non-functional-requirement", RequirementLifecycle> {
  title: string & tags.MinLength<1>;
  statement: string & tags.MinLength<1>;
}

export interface AcceptanceCriterionEntity
  extends EntityBase<"acceptance-criterion", AcceptanceCriterionLifecycle> {
  statement: string & tags.MinLength<1>;
}

export interface DecisionEntity extends EntityBase<"decision", DecisionLifecycle> {
  title: string & tags.MinLength<1>;
  decision: string & tags.MinLength<1>;
  authority?: "LOCKED" | "BOUNDED" | "DELEGATED";
}

export interface DocumentEntity extends EntityBase<"document", DocumentLifecycle> {
  title?: string & tags.MinLength<1>;
}

export interface PlanEntity extends EntityBase<"plan", PlanLifecycle> {
  title?: string & tags.MinLength<1>;
}

export interface FeatureEntity extends EntityBase<"feature", FeatureLifecycle> {
  title: string & tags.MinLength<1>;
  significance: "S" | "M" | "L" | "XL";
}

export interface TaskEntity extends EntityBase<"task", TaskLifecycle> {
  title: string & tags.MinLength<1>;
}

export interface VerificationEntity extends EntityBase<"verification", VerificationLifecycle> {
  title: string & tags.MinLength<1>;
  /**
   * Free-form verification method (automated test, static analysis,
   * benchmark, inspection, human review, usability evaluation,
   * demonstration, hardware procedure, or other suitable method).
   * Not an enum: verification is evidence, not synonymous with testing,
   * and the method vocabulary must stay open (principles.md "Verification").
   */
  method: string & tags.MinLength<1>;
  required: boolean;
  evidenceRequirements?: string[];
}

export interface RoadmapItemEntity extends EntityBase<"roadmap-item", RoadmapItemLifecycle> {
  title: string & tags.MinLength<1>;
}
export interface QuestionEntity extends EntityBase<"question", QuestionLifecycle> {
  prompt: string & tags.MinLength<1>; blocking: boolean; resolution?: string;
}
export interface EvidenceEntity extends EntityBase<"evidence", EvidenceLifecycle> {
  title: string & tags.MinLength<1>; outcome: "passed" | "failed" | "inconclusive";
  result: string & tags.MinLength<1>; applicability: string & tags.MinLength<1>;
  contextFingerprint?: string;
  contextFingerprints?: Record<string,string>;
  revision?: string;
  kind?: string;
}
export interface BuildContractEntity extends EntityBase<"build-contract", BuildContractLifecycle> {
  title: string & tags.MinLength<1>; fingerprint: string & tags.MinLength<1>;
  locked: string[]; bounded: string[]; delegated: string[];
  inputFingerprints?: Record<string, string>;
}

export type Entity =
  | RequirementEntity
  | NonFunctionalRequirementEntity
  | AcceptanceCriterionEntity
  | DecisionEntity
  | DocumentEntity
  | PlanEntity
  | FeatureEntity
  | TaskEntity
  | VerificationEntity
  | RoadmapItemEntity
  | QuestionEntity
  | EvidenceEntity
  | BuildContractEntity;

export type EntityType = Entity["type"];

export const ENTITY_TYPES: readonly EntityType[] = [
  "requirement",
  "non-functional-requirement",
  "acceptance-criterion",
  "decision",
  "document",
  "plan",
  "feature",
  "task",
  "verification",
  "roadmap-item",
  "question", "evidence", "build-contract",
] as const;

export function isKnownEntityType(value: string): value is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(value);
}
