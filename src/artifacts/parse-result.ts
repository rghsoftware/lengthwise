import type { SourceLocation } from "../domain/provenance.ts";
import type { Diagnostic } from "../diagnostics.ts";

/** A single raw entity declaration lifted out of an artifact, not yet semantically validated. */
export interface ParsedEntityBlock {
  raw: Record<string, unknown>;
  location: SourceLocation;
}

/**
 * Outcome of attempting to recognize and parse one candidate file.
 *
 * `recognized: false` means the file carries no Lengthwise metadata and must
 * be treated as ordinary repository content (AC-003-03) — this is not an
 * error. `recognized: true, ok: false` means the file is Lengthwise-owned
 * but its declared content or metadata version is invalid (AC-003-04, AC-003-05).
 */
export type ArtifactParseOutcome =
  | { recognized: false }
  | { recognized: true; ok: true; entities: ParsedEntityBlock[] }
  | { recognized: true; ok: false; diagnostics: Diagnostic[] };
