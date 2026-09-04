import type { Diagnostic } from "../diagnostics.ts";
import type { Entity, EntityType, EvidenceEntity } from "../domain/entities.ts";
import type { EvidenceStatus } from "../workflow/projections.ts";

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

export interface TraceabilityView {
  entity: EntitySummary;
  /** Direct declared and inverse-projected relationships; this is not a transitive traversal. */
  relationships: RelationshipView[];
}

export interface ApplicationBlocker {
  code: string;
  message: string;
  entityId?: string;
  artifactPath?: string;
}

export interface TaskReadinessView {
  task: EntitySummary;
  candidate: boolean;
  ready: boolean;
  blockers: ApplicationBlocker[];
}

export interface TaskDependencyView {
  id: string;
  entity: EntitySummary | { id: string; missing: true };
  satisfied: boolean;
}

export interface TaskDependenciesView {
  task: EntitySummary;
  dependencies: TaskDependencyView[];
}

export interface EvidenceAssessmentView {
  evidenceId: string;
  kind?: string;
  status: EvidenceStatus;
  source: Entity["source"];
  applicability: string;
}

export interface VerificationEvidenceView {
  verification: EntitySummary;
  satisfied: boolean;
  status: EvidenceStatus;
  currentFingerprint: string;
  requiredKinds: string[];
  missingComplements: string[];
  evidence: EvidenceEntity[];
  assessments: EvidenceAssessmentView[];
}

export interface ProjectCheckResult {
  graphAvailable: true;
  repositoryValid: boolean;
  clean: boolean;
  entityCount: number;
  relationshipCount: number;
  buildDiagnostics: Diagnostic[];
  checkDiagnostics: Diagnostic[];
  diagnostics: Diagnostic[];
}
