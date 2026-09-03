export const STANDARD_SKILL_IDS = [
  "capture-feature",
  "specify-feature",
  "clarify-feature",
  "review-specification",
  "plan-feature",
  "design-verification",
  "review-build-readiness",
  "implement-build-contract",
  "review-implementation",
  "review-verification",
  "reconcile-feature",
] as const;

export type StandardSkillId = (typeof STANDARD_SKILL_IDS)[number];

export const BUNDLED_SKILLS_DIRECTORY = "skills";
export const CANONICAL_SKILL_ENTRYPOINT = "SKILL.md";
export const LENGTHWISE_SKILL_MANIFEST = "lengthwise.yaml";
export const SKILL_PROVENANCE_SIDECAR = ".lengthwise-provenance.json";
