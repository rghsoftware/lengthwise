import type { tags } from "typia";

export const SUPPORTED_SKILL_SCHEMA_VERSION = 1 as const;
export const SUPPORTED_WORKFLOW_CONTRACT_VERSIONS = [1] as const;

export const SEMANTIC_ACTION_BINDINGS = [
  "capture-feature",
  "specify-feature",
  "clarify-feature",
  "review-specification",
  "plan-feature",
  "design-verification",
  "review-build-readiness",
  "implementation-attempt",
  "review-implementation",
  "review-verification",
  "reconcile-feature",
] as const;

export const SKILL_CONTEXT_SLOTS = [
  "current-workflow-action",
  "feature",
  "task",
  "accepted-build-contract",
  "bounded-project-context",
  "authoritative-artifacts",
  "decision-authority",
  "questions",
  "plan",
  "prior-attempt",
  "verification-retry",
  "implementation-completion-claim",
  "verification-definitions",
  "evidence",
  "graph-findings",
] as const;

export const SKILL_OUTCOME_KINDS = [
  "feature-frame",
  "specification-update",
  "clarification-resolution",
  "specification-review",
  "implementation-plan",
  "verification-design",
  "build-readiness-review",
  "repository-change",
  "implementation-completion-claim",
  "implementation-review",
  "verification-review",
  "reconciliation-proposal",
] as const;

export const SKILL_POST_CHECKS = [
  "project-graph",
  "traceability",
  "specification-eligibility",
  "task-dag",
  "verification-coverage",
  "build-contract-generation",
  "contract-current",
  "applicable-verification",
  "evidence-applicability",
  "readiness",
  "completion-eligibility",
  "workflow-routing",
] as const;

export const SKILL_ESCALATION_REASONS = [
  "material-product-decision",
  "conflicting-governing-requirements",
  "locked-decision-conflict",
  "authority-boundary-exceeded",
  "unresolved-policy-conflict",
  "insufficient-evidence",
  "stale-build-contract",
  "governing-context-conflict",
] as const;

export type SemanticActionBinding = (typeof SEMANTIC_ACTION_BINDINGS)[number];
export type SkillContextSlot = (typeof SKILL_CONTEXT_SLOTS)[number];
export type SkillOutcomeKind = (typeof SKILL_OUTCOME_KINDS)[number];
export type SkillPostCheck = (typeof SKILL_POST_CHECKS)[number];
export type SkillEscalationReason = (typeof SKILL_ESCALATION_REASONS)[number];

export interface CanonicalSkillFrontmatter {
  name: string & tags.MinLength<1> & tags.MaxLength<64>;
  description: string & tags.MinLength<1> & tags.MaxLength<1024>;
  license?: string & tags.MinLength<1>;
  compatibility?: string & tags.MinLength<1>;
}

export interface CanonicalSkillManifest {
  schemaVersion: typeof SUPPORTED_SKILL_SCHEMA_VERSION;
  skillVersion: number;
  workflowContractVersion: (typeof SUPPORTED_WORKFLOW_CONTRACT_VERSIONS)[number];
  bindings: SemanticActionBinding[];
  context: {
    required: SkillContextSlot[];
    optional: SkillContextSlot[];
  };
  outcomes: SkillOutcomeKind[];
  postChecks: SkillPostCheck[];
  escalations: SkillEscalationReason[];
}

export interface CanonicalSkillFile {
  /** POSIX path relative to the canonical package root. */
  path: string;
  content: Uint8Array;
}

export interface ValidatedCanonicalSkill {
  id: string;
  root: string;
  frontmatter: CanonicalSkillFrontmatter;
  methodology: string;
  manifest: CanonicalSkillManifest;
  files: readonly CanonicalSkillFile[];
  canonicalDigest: string;
}

export interface SkillDiagnostic {
  code: string;
  message: string;
  packagePath: string;
  field?: string;
}

export interface CanonicalSkillRegistry {
  root: string;
  skills: ReadonlyMap<string, ValidatedCanonicalSkill>;
}

export type LoadCanonicalSkillRegistryResult =
  | { ok: true; registry: CanonicalSkillRegistry; diagnostics: [] }
  | { ok: false; diagnostics: SkillDiagnostic[] };

export type SkillProviderId = "codex" | "claude" | (string & {});
export type SkillInstallScope = "project" | "user";

export interface InstalledSkillProvenance {
  provenanceSchemaVersion: 1;
  digestRuleVersion: number;
  canonicalSkillId: string;
  canonicalSkillVersion: number;
  workflowContractVersion: number;
  canonicalDigest: string;
  provider: SkillProviderId;
  rendererVersion: string;
  renderedDigest: string;
  scope: SkillInstallScope;
  installedAt: string;
  destination: string;
}

export interface CurrentRenderedSkillIdentity {
  canonicalSkillId: string;
  canonicalSkillVersion: number;
  workflowContractVersion: number;
  canonicalDigest: string;
  provider: SkillProviderId;
  rendererVersion: string;
  renderedDigest: string;
}

export type InstalledSkillStatus =
  | "current"
  | "modified"
  | "stale-canonical"
  | "stale-renderer"
  | "incompatible";

export interface InstalledSkillAssessment {
  status: InstalledSkillStatus;
  reasons: string[];
}
