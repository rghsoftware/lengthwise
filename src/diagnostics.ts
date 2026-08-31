import type { SourceLocation } from "./domain/provenance.ts";

export type DiagnosticSeverity = "error" | "warning";

/**
 * An actionable, deterministic finding. Shared across config loading,
 * artifact recognition/parsing, and graph checks so every layer reports
 * problems the same way (AC-001-02, AC-009-03, AC-NFR-005-02).
 */
export interface Diagnostic {
  /** Stable machine-readable code, e.g. "config/invalid", "graph/dangling-relationship". */
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  location?: SourceLocation;
  entityId?: string;
}

export function errorDiagnostic(
  code: string,
  message: string,
  extra?: Pick<Diagnostic, "location" | "entityId">,
): Diagnostic {
  return { code, severity: "error", message, ...extra };
}

export function warningDiagnostic(
  code: string,
  message: string,
  extra?: Pick<Diagnostic, "location" | "entityId">,
): Diagnostic {
  return { code, severity: "warning", message, ...extra };
}
