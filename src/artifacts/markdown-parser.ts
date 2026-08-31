import { errorDiagnostic } from "../diagnostics.ts";
import { locateEntityId } from "./locate.ts";
import { looksMarked, SUPPORTED_LENGTHWISE_VERSION } from "./recognize.ts";
import type { ArtifactParseOutcome } from "./parse-result.ts";

interface Frontmatter {
  yamlText: string;
  body: string;
}

/** Splits `---\n<yaml>\n---\n<body>` from the start of a Markdown file, if present. */
function extractFrontmatter(text: string): Frontmatter | undefined {
  if (!text.startsWith("---")) return undefined;
  const firstLineEnd = text.indexOf("\n");
  if (firstLineEnd === -1) return undefined;

  const rest = text.slice(firstLineEnd + 1);
  const closing = /^---\s*$/m.exec(rest);
  if (!closing) return undefined;

  const yamlText = rest.slice(0, closing.index);
  const body = rest.slice(closing.index + closing[0].length).replace(/^\r?\n/, "");
  return { yamlText, body };
}

/**
 * Recognize and parse a Markdown+frontmatter artifact (REQ-003).
 *
 * Recognition requires `lengthwise: 1` inside the leading frontmatter block;
 * Markdown without frontmatter, or with frontmatter that omits the marker,
 * is ordinary content (AC-003-03). A Markdown artifact declares exactly one
 * entity per file — the frontmatter fields are the entity's raw properties,
 * and the remaining Markdown body is carried as the entity's narrative
 * `body`, unparsed and unconstrained (no ADR-specific heading structure is
 * required, per the TASK-004 Build Contract).
 */
export function parseMarkdownArtifact(path: string, text: string): ArtifactParseOutcome {
  const frontmatter = extractFrontmatter(text);
  if (!frontmatter) return { recognized: false };
  if (!looksMarked(frontmatter.yamlText)) return { recognized: false };

  let raw: unknown;
  try {
    raw = Bun.YAML.parse(frontmatter.yamlText);
  } catch (error) {
    return {
      recognized: true,
      ok: false,
      diagnostics: [
        errorDiagnostic(
          "artifact/invalid-yaml",
          `${path} declares Lengthwise frontmatter but it is not valid YAML: ${(error as Error).message}`,
          { location: { artifactPath: path } },
        ),
      ],
    };
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      recognized: true,
      ok: false,
      diagnostics: [
        errorDiagnostic("artifact/invalid-frontmatter", `${path} frontmatter is not a mapping.`, {
          location: { artifactPath: path },
        }),
      ],
    };
  }
  const fields = raw as Record<string, unknown>;

  if (!("lengthwise" in fields)) return { recognized: false };

  if (fields.lengthwise !== SUPPORTED_LENGTHWISE_VERSION) {
    return {
      recognized: true,
      ok: false,
      diagnostics: [
        errorDiagnostic(
          "artifact/unsupported-version",
          `${path} declares lengthwise: ${JSON.stringify(fields.lengthwise)}, but only version ${SUPPORTED_LENGTHWISE_VERSION} is supported.`,
          { location: { artifactPath: path } },
        ),
      ],
    };
  }

  const id = typeof fields.id === "string" ? fields.id : undefined;
  if (!id) {
    return {
      recognized: true,
      ok: false,
      diagnostics: [
        errorDiagnostic("artifact/missing-id", `${path} frontmatter has no string "id" field.`, {
          location: { artifactPath: path },
        }),
      ],
    };
  }

  const { lengthwise: _lengthwise, ...entityFields } = fields;
  const line = locateEntityId(frontmatter.yamlText, id);
  const body = frontmatter.body.trim();

  return {
    recognized: true,
    ok: true,
    entities: [
      {
        raw: body.length > 0 ? { ...entityFields, body } : entityFields,
        location: { artifactPath: path, line: line !== undefined ? line + 1 : undefined },
      },
    ],
  };
}
