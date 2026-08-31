import typia from "typia";
import { errorDiagnostic, type Diagnostic } from "../diagnostics.ts";
import { PROJECT_CONFIG_PATH, type ProjectConfig } from "./types.ts";

export type LoadProjectConfigResult =
  | { ok: true; config: ProjectConfig }
  | { ok: false; diagnostics: Diagnostic[] };

const validateProjectConfig = typia.createValidate<ProjectConfig>();

/**
 * Load and validate `.lengthwise/project.yaml` (REQ-001).
 *
 * - Missing file: AC-001-03 — clear diagnostic, no silently-assumed config.
 * - Malformed YAML or a structurally invalid config: AC-001-02 — deterministic
 *   validation error identifying the problem and its source location.
 * - Valid config: AC-001-01 — recognized project, artifact-discovery config loaded.
 */
export async function loadProjectConfig(repoRoot: string): Promise<LoadProjectConfigResult> {
  const file = Bun.file(`${repoRoot}/${PROJECT_CONFIG_PATH}`);

  if (!(await file.exists())) {
    return {
      ok: false,
      diagnostics: [
        errorDiagnostic(
          "config/missing",
          `No Lengthwise project configuration found at ${PROJECT_CONFIG_PATH}.`,
          { location: { artifactPath: PROJECT_CONFIG_PATH } },
        ),
      ],
    };
  }

  const text = await file.text();
  let raw: unknown;
  try {
    raw = Bun.YAML.parse(text);
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        errorDiagnostic(
          "config/invalid-yaml",
          `${PROJECT_CONFIG_PATH} is not valid YAML: ${(error as Error).message}`,
          { location: { artifactPath: PROJECT_CONFIG_PATH } },
        ),
      ],
    };
  }

  const validation = validateProjectConfig(raw);
  if (!validation.success) {
    return {
      ok: false,
      diagnostics: validation.errors.map((error) =>
        errorDiagnostic(
          "config/invalid",
          `${PROJECT_CONFIG_PATH} field "${error.path}" is invalid: expected ${error.expected}.`,
          { location: { artifactPath: PROJECT_CONFIG_PATH } },
        ),
      ),
    };
  }

  return { ok: true, config: validation.data };
}
