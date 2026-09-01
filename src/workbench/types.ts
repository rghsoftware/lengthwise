import type { Diagnostic } from "../diagnostics.ts";
import type { Entity, EntityType } from "../domain/entities.ts";

export interface EntitySummary {
  id: string;
  type: EntityType;
  lifecycle: string;
  label: string;
  source: Entity["source"];
}

export interface RelationshipView {
  direction: "incoming" | "outgoing";
  type: string;
  label: string;
  counterpart: EntitySummary | { id: string; missing: true };
  provenance: string;
}

export interface EntityDetail {
  entity: Entity;
  label: string;
  authoredProperties: Record<string, unknown>;
  derivedState: Record<string, unknown>;
  relationships: RelationshipView[];
}

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
