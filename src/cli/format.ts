import type { Diagnostic } from "../diagnostics.ts";

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const location = diagnostic.location
    ? ` (${diagnostic.location.artifactPath}${diagnostic.location.line ? ":" + diagnostic.location.line : ""})`
    : "";
  const entity = diagnostic.entityId ? ` [${diagnostic.entityId}]` : "";
  const level = diagnostic.severity === "error" ? "ERROR" : "WARN";
  return `${level} ${diagnostic.code}${entity}${location}: ${diagnostic.message}`;
}
