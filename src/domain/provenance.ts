/**
 * Provenance distinguishes why a relationship exists in the Project Graph.
 *
 * - declared: authored explicitly in an authoritative repository artifact.
 * - derived: produced by Lengthwise from other authoritative information
 *   (e.g. an inverse projection, or a structural fact implied by the repo).
 * - observed: captured from an external, non-authored signal (reserved for
 *   future providers; F-001 does not produce observed relationships).
 * - inferred: guessed from a heuristic rather than authoritative evidence
 *   (reserved for future providers; F-001 does not produce inferred
 *   relationships, and never infers relationships from ID naming).
 */
export type Provenance = "declared" | "derived" | "observed" | "inferred";

/** Where an authoritative declaration physically lives in the repository. */
export interface SourceLocation {
  /** Repository-relative path of the artifact file. */
  artifactPath: string;
  /** 1-based line number within the artifact, when known. */
  line?: number;
}

export interface DeclaredProvenanceInfo {
  kind: "declared";
  source: SourceLocation;
}

export interface DerivedProvenanceInfo {
  kind: "derived";
  /** Human-readable explanation of why this relationship exists (AC-008-03). */
  explanation: string;
  /** The authoritative fact this relationship was derived from, when localizable. */
  derivedFrom?: SourceLocation;
}

export interface ObservedProvenanceInfo {
  kind: "observed";
  explanation: string;
}

export interface InferredProvenanceInfo {
  kind: "inferred";
  explanation: string;
}

export type ProvenanceInfo =
  | DeclaredProvenanceInfo
  | DerivedProvenanceInfo
  | ObservedProvenanceInfo
  | InferredProvenanceInfo;

/** Non-authoritative provenance cannot satisfy checks requiring authoritative evidence (AC-008-04). */
export function isAuthoritative(provenance: ProvenanceInfo): boolean {
  return provenance.kind === "declared" || provenance.kind === "derived";
}

/** The source location backing a provenance record, when it has one. */
export function sourceOf(provenance: ProvenanceInfo): SourceLocation | undefined {
  if (provenance.kind === "declared") return provenance.source;
  if (provenance.kind === "derived") return provenance.derivedFrom;
  return undefined;
}
