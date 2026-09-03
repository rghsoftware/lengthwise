import { SKILL_DIGEST_RULE } from "./digest.ts";
import { SUPPORTED_WORKFLOW_CONTRACT_VERSIONS } from "./types.ts";
import type {
  CurrentRenderedSkillIdentity,
  InstalledSkillAssessment,
  InstalledSkillProvenance,
} from "./types.ts";

export function assessInstalledSkill(
  installed: InstalledSkillProvenance,
  current: CurrentRenderedSkillIdentity,
  actualRenderedDigest: string,
): InstalledSkillAssessment {
  const incompatible: string[] = [];
  if (installed.provenanceSchemaVersion !== 1) incompatible.push("unsupported provenance schema version");
  if (installed.digestRuleVersion !== SKILL_DIGEST_RULE.version) incompatible.push("unsupported digest rule version");
  if (!(SUPPORTED_WORKFLOW_CONTRACT_VERSIONS as readonly number[]).includes(installed.workflowContractVersion)) {
    incompatible.push("unsupported installed workflow-contract version");
  }
  if (!(SUPPORTED_WORKFLOW_CONTRACT_VERSIONS as readonly number[]).includes(current.workflowContractVersion)) {
    incompatible.push("unsupported current workflow-contract version");
  }
  if (installed.canonicalSkillId !== current.canonicalSkillId) incompatible.push("canonical skill identity differs");
  if (installed.provider !== current.provider) incompatible.push("provider identity differs");
  if (incompatible.length > 0) return { status: "incompatible", reasons: incompatible };

  if (installed.renderedDigest !== actualRenderedDigest) {
    return { status: "modified", reasons: ["installed rendered content differs from recorded provenance"] };
  }

  const canonicalReasons: string[] = [];
  if (installed.canonicalSkillVersion !== current.canonicalSkillVersion) {
    canonicalReasons.push("canonical skill version changed");
  }
  if (installed.workflowContractVersion !== current.workflowContractVersion) {
    canonicalReasons.push("workflow-contract version changed");
  }
  if (installed.canonicalDigest !== current.canonicalDigest) canonicalReasons.push("canonical content changed");
  if (canonicalReasons.length > 0) return { status: "stale-canonical", reasons: canonicalReasons };

  const rendererReasons: string[] = [];
  if (installed.rendererVersion !== current.rendererVersion) rendererReasons.push("renderer version changed");
  if (installed.renderedDigest !== current.renderedDigest) rendererReasons.push("rendered packaging changed");
  if (rendererReasons.length > 0) return { status: "stale-renderer", reasons: rendererReasons };

  return { status: "current", reasons: [] };
}
