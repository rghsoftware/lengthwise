import type { Diagnostic } from "../diagnostics.ts";
import type { Entity } from "../domain/entities.ts";
import type { RelationshipType } from "../domain/relationships.ts";
import type {
  SemanticActionBinding,
  SkillContextSlot,
  SkillEscalationReason,
  SkillOutcomeKind,
  SkillPostCheck,
  ValidatedCanonicalSkill,
} from "../skills/types.ts";
import type { ApplicationBlocker, TaskReadinessView } from "../application/project-types.ts";

export const AI_CONTEXT_PURPOSES = [
  "specify",
  "clarify",
  "plan",
  "review-build-contract",
  "implement",
  "verify",
  "reconcile",
  "explain-readiness",
] as const;

export type AiContextPurpose = (typeof AI_CONTEXT_PURPOSES)[number];

export const AI_CONTEXT_ROLES = [
  "target",
  "feature",
  "task",
  "requirement",
  "acceptance-criterion",
  "decision",
  "plan",
  "build-contract",
  "dependency",
  "verification",
  "evidence",
  "question",
  "supporting-context",
] as const;

export type AiContextRole = (typeof AI_CONTEXT_ROLES)[number];

export interface AiContextEntity {
  entity: Entity;
  roles: AiContextRole[];
}

export interface AiContextRelationship {
  type: RelationshipType;
  from: string;
  to: string;
  provenance: string;
}

export interface AiContractContext {
  id: string;
  taskId?: string;
  current: boolean;
  currentFingerprint: string;
  changedInputs: Array<{ id: string; reason: string }>;
}

export interface AiVerificationContext {
  id: string;
  satisfied: boolean;
  status: string;
  currentFingerprint: string;
  evidenceIds: string[];
  missingComplements: string[];
}

export interface AiBoundedContext {
  schemaVersion: 1;
  targetId: string;
  purpose: AiContextPurpose;
  project: {
    name: string;
    defaultRigor: string;
    effectiveRigor: unknown;
  };
  entities: AiContextEntity[];
  relationships: AiContextRelationship[];
  artifactPaths: string[];
  diagnostics: Diagnostic[];
  readiness?: TaskReadinessView;
  contracts: AiContractContext[];
  verifications: AiVerificationContext[];
  selection: "purpose-bounded-deny-by-default";
  excludedEntityCount: number;
  fingerprint: string;
}

export interface AiSkillProjection {
  id: string;
  name: string;
  description: string;
  skillVersion: number;
  workflowContractVersion: number;
  canonicalDigest: string;
  bindings: SemanticActionBinding[];
  methodology: string;
  resources: Array<{ path: string; encoding: "utf-8" | "base64"; content: string }>;
  requiredContext: SkillContextSlot[];
  optionalContext: SkillContextSlot[];
  outcomes: SkillOutcomeKind[];
  postChecks: SkillPostCheck[];
  escalations: SkillEscalationReason[];
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type AiSupplementalContextSlot = Extract<
  SkillContextSlot,
  "current-workflow-action" | "prior-attempt" | "verification-retry" | "implementation-completion-claim"
>;

export interface AiInvocationRequest {
  targetId: string;
  purpose: AiContextPurpose;
  semanticAction: SemanticActionBinding;
  skill: ValidatedCanonicalSkill;
  supplementalContext?: Partial<Record<AiSupplementalContextSlot, JsonValue>>;
}

/** Serializable input for an external AI host; it has no execution semantics. */
export interface AiInvocation {
  kind: "lengthwise-ai-invocation";
  schemaVersion: 1;
  id: string;
  action: {
    targetId: string;
    purpose: AiContextPurpose;
    semanticAction: SemanticActionBinding;
  };
  skill: AiSkillProjection;
  context: AiBoundedContext;
  contextSlots: Partial<Record<SkillContextSlot, unknown>>;
  expectedOutcomes: SkillOutcomeKind[];
  postChecks: SkillPostCheck[];
  escalationReasons: SkillEscalationReason[];
}

export type AiContextResult =
  | { ok: true; context: AiBoundedContext }
  | { ok: false; blockers: ApplicationBlocker[] };

export type AiInvocationResult =
  | { ok: true; invocation: AiInvocation }
  | { ok: false; blockers: ApplicationBlocker[] };
