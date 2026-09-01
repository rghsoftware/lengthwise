/**
 * Lifecycle is type-specific durable state (DR-013). It is intentionally
 * distinct from derived state (readiness, coverage, satisfaction) and
 * runtime state (running, waiting, failed) — see engineering/principles.md
 * "State model". Do not add a generic cross-type `status`.
 */

export type RequirementLifecycle = "draft" | "accepted" | "deprecated";
export type AcceptanceCriterionLifecycle = "draft" | "accepted" | "deprecated";
export type DecisionLifecycle = "proposed" | "accepted" | "superseded" | "rejected";
export type DocumentLifecycle = "draft" | "accepted" | "superseded";
export type PlanLifecycle = "draft" | "accepted" | "superseded";
export type FeatureLifecycle = "draft" | "ready" | "active" | "complete";
/** Readiness is derived (see checks module), never a persisted task lifecycle value. */
export type TaskLifecycle = "planned" | "in-progress" | "done" | "cancelled";
export type VerificationLifecycle = "draft" | "defined" | "retired";
export type RoadmapItemLifecycle = "planned" | "active" | "complete" | "deferred";
export type QuestionLifecycle = "open" | "answered" | "withdrawn";
export type EvidenceLifecycle = "recorded" | "superseded" | "withdrawn";
export type BuildContractLifecycle = "accepted" | "superseded";
