import { errorDiagnostic } from "../diagnostics.ts";
import { locateEntityId } from "./locate.ts";
import { looksMarked, SUPPORTED_LENGTHWISE_VERSION } from "./recognize.ts";
import type { ArtifactParseOutcome, ParsedEntityBlock } from "./parse-result.ts";

/**
 * Recognize and parse a YAML artifact (REQ-003, REQ-006).
 *
 * Recognition requires an explicit top-level `lengthwise: 1`; anything else
 * — including a file with no marker at all — is ordinary content and is
 * ignored (AC-003-03). Parsing extracts each declared entity's raw fields
 * and best-effort source location; it does not itself validate entity
 * semantics (that is normalization's responsibility, TASK-005).
 */
export function parseYamlArtifact(path: string, text: string): ArtifactParseOutcome {
  if (!looksMarked(text)) return { recognized: false };

  let raw: unknown;
  try {
    raw = Bun.YAML.parse(text);
  } catch (error) {
    return {
      recognized: true,
      ok: false,
      diagnostics: [
        errorDiagnostic(
          "artifact/invalid-yaml",
          `${path} declares Lengthwise metadata but is not valid YAML: ${(error as Error).message}`,
          { location: { artifactPath: path } },
        ),
      ],
    };
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { recognized: false };
  }
  const document = raw as Record<string, unknown>;

  if (!("lengthwise" in document)) return { recognized: false };

  if (document.lengthwise !== SUPPORTED_LENGTHWISE_VERSION) {
    return {
      recognized: true,
      ok: false,
      diagnostics: [
        errorDiagnostic(
          "artifact/unsupported-version",
          `${path} declares lengthwise: ${JSON.stringify(document.lengthwise)}, but only version ${SUPPORTED_LENGTHWISE_VERSION} is supported.`,
          { location: { artifactPath: path } },
        ),
      ],
    };
  }

  const entitiesField = document.entities;
  if (!Array.isArray(entitiesField)) {
    return {
      recognized: true,
      ok: false,
      diagnostics: [
        errorDiagnostic(
          "artifact/missing-entities",
          `${path} is marked as a Lengthwise artifact but declares no "entities" list.`,
          { location: { artifactPath: path } },
        ),
      ],
    };
  }

  const entities: ParsedEntityBlock[] = [];
  const diagnostics = [];
  for (const [index, item] of entitiesField.entries()) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      diagnostics.push(
        errorDiagnostic(
          "artifact/invalid-entity",
          `${path} entities[${index}] is not a mapping and cannot declare an entity.`,
          { location: { artifactPath: path } },
        ),
      );
      continue;
    }
    const entityRaw = item as Record<string, unknown>;
    const id = typeof entityRaw.id === "string" ? entityRaw.id : undefined;
    if (!id) {
      diagnostics.push(
        errorDiagnostic(
          "artifact/missing-id",
          `${path} entities[${index}] has no string "id" field.`,
          { location: { artifactPath: path } },
        ),
      );
      continue;
    }
    entities.push({
      raw: entityRaw,
      location: { artifactPath: path, line: locateEntityId(text, id) },
    });
  }

  if (diagnostics.length > 0) return { recognized: true, ok: false, diagnostics };
  return { recognized: true, ok: true, entities };
}
