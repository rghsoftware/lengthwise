import type { tags } from "typia";

export type RigorLevelName = "light" | "standard" | "strict";
export type RigorRequirementLevel = "required" | "basic" | "as-needed";
export type MaterialDecisionsLevel = "recorded";
export type IndependentReviewLevel = "generally-required";
export type HumanApprovalGate = "specification" | "buildContract" | "verification";

export interface RigorPolicy {
  requirements: RigorRequirementLevel;
  acceptanceCriteria: RigorRequirementLevel;
  implementationTraceability: RigorRequirementLevel;
  verificationCoverage: RigorRequirementLevel;
  taskPlan: RigorRequirementLevel;
  materialDecisions: MaterialDecisionsLevel;
  independentReview?: IndependentReviewLevel;
  humanApproval: HumanApprovalGate[];
}

/** `.lengthwise/project.yaml` — the project configuration artifact (REQ-001). */
export interface ProjectConfig {
  lengthwise: 1;
  project: {
    name: string & tags.MinLength<1>;
  };
  artifacts: {
    include: (string & tags.MinLength<1>)[];
    exclude?: (string & tags.MinLength<1>)[];
  };
  policy: {
    rigor: RigorLevelName;
  };
  rigor: Record<RigorLevelName, RigorPolicy>;
}

export const PROJECT_CONFIG_PATH = ".lengthwise/project.yaml";
