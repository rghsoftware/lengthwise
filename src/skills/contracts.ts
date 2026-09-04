import type { StandardSkillId } from "./constants.ts";
import type {
  SemanticActionBinding,
  SkillContextSlot,
  SkillOutcomeKind,
  SkillPostCheck,
} from "./types.ts";

export interface StandardSkillContract {
  semanticAction: SemanticActionBinding;
  requiredContext: readonly SkillContextSlot[];
  requiredOutcomes: readonly SkillOutcomeKind[];
  requiredPostChecks: readonly SkillPostCheck[];
}

/** Minimum task-package contract for each standard semantic action. */
const standardSkillContracts: Record<StandardSkillId, StandardSkillContract> = {
  "capture-feature": {
    semanticAction: "capture-feature",
    requiredContext: ["current-workflow-action"],
    requiredOutcomes: ["feature-frame"],
    requiredPostChecks: ["project-graph"],
  },
  "specify-feature": {
    semanticAction: "specify-feature",
    requiredContext: [
      "current-workflow-action",
      "feature",
      "bounded-project-context",
    ],
    requiredOutcomes: ["specification-update"],
    requiredPostChecks: ["project-graph", "specification-eligibility"],
  },
  "clarify-feature": {
    semanticAction: "clarify-feature",
    requiredContext: [
      "current-workflow-action",
      "feature",
      "questions",
      "bounded-project-context",
    ],
    requiredOutcomes: ["clarification-resolution"],
    requiredPostChecks: ["project-graph", "specification-eligibility"],
  },
  "review-specification": {
    semanticAction: "review-specification",
    requiredContext: [
      "current-workflow-action",
      "feature",
      "bounded-project-context",
    ],
    requiredOutcomes: ["specification-review"],
    requiredPostChecks: ["specification-eligibility"],
  },
  "plan-feature": {
    semanticAction: "plan-feature",
    requiredContext: [
      "current-workflow-action",
      "feature",
      "bounded-project-context",
    ],
    requiredOutcomes: ["implementation-plan"],
    requiredPostChecks: ["task-dag", "traceability"],
  },
  "design-verification": {
    semanticAction: "design-verification",
    requiredContext: [
      "current-workflow-action",
      "feature",
      "bounded-project-context",
    ],
    requiredOutcomes: ["verification-design"],
    requiredPostChecks: ["verification-coverage"],
  },
  "review-build-readiness": {
    semanticAction: "review-build-readiness",
    requiredContext: [
      "current-workflow-action",
      "feature",
      "bounded-project-context",
    ],
    requiredOutcomes: ["build-readiness-review"],
    requiredPostChecks: ["build-contract-generation", "readiness"],
  },
  "implement-build-contract": {
    semanticAction: "implementation-attempt",
    requiredContext: [
      "current-workflow-action",
      "task",
      "accepted-build-contract",
      "bounded-project-context",
    ],
    requiredOutcomes: ["implementation-completion-claim"],
    requiredPostChecks: [
      "contract-current",
      "applicable-verification",
      "readiness",
    ],
  },
  "review-implementation": {
    semanticAction: "review-implementation",
    requiredContext: [
      "current-workflow-action",
      "task",
      "accepted-build-contract",
      "bounded-project-context",
      "prior-attempt",
      "implementation-completion-claim",
      "verification-definitions",
      "evidence",
    ],
    requiredOutcomes: ["implementation-review"],
    requiredPostChecks: [
      "applicable-verification",
      "evidence-applicability",
      "workflow-routing",
    ],
  },
  "review-verification": {
    semanticAction: "review-verification",
    requiredContext: [
      "current-workflow-action",
      "verification-definitions",
      "evidence",
      "bounded-project-context",
    ],
    requiredOutcomes: ["verification-review"],
    requiredPostChecks: ["evidence-applicability", "completion-eligibility"],
  },
  "reconcile-feature": {
    semanticAction: "reconcile-feature",
    requiredContext: [
      "current-workflow-action",
      "feature",
      "bounded-project-context",
    ],
    requiredOutcomes: ["reconciliation-proposal"],
    requiredPostChecks: [
      "project-graph",
      "contract-current",
      "workflow-routing",
    ],
  },
};

for (const contract of Object.values(standardSkillContracts)) {
  Object.freeze(contract.requiredContext);
  Object.freeze(contract.requiredOutcomes);
  Object.freeze(contract.requiredPostChecks);
  Object.freeze(contract);
}

export const STANDARD_SKILL_CONTRACTS: Readonly<
  Record<StandardSkillId, StandardSkillContract>
> = Object.freeze(standardSkillContracts);
