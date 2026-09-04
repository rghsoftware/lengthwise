import type { Diagnostic } from "../diagnostics.ts";
import type { EntitySummary } from "../application/project-types.ts";

export type { EntityDetail, EntitySummary, RelationshipView } from "../application/project-types.ts";

export type ModelChange =
  | { kind: "entity-added" | "entity-removed"; entityId: string; entityType: string; label: string }
  | { kind: "lifecycle-changed"; entityId: string; before: string; after: string }
  | { kind: "relationship-added" | "relationship-removed"; from: string; type: string; to: string }
  | { kind: "coverage-lost"; entityId: string; coverage: "implementation" | "verification" }
  | { kind: "finding-added" | "finding-resolved"; fingerprint: string; diagnostic: Diagnostic };

export interface WorkbenchSnapshot {
  revision: number;
  repositoryValid: boolean;
  retainedGraph: boolean;
  entities: EntitySummary[];
  diagnostics: Diagnostic[];
  changes: ModelChange[];
}

export interface ArtifactDocument {
  path: string;
  language: "markdown" | "yaml";
  content: string;
  version: string;
}
