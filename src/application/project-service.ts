import { AiApplicationService } from "../ai/application-service.ts";
import type { AiContextPurpose, AiContextResult } from "../ai/types.ts";
import type { Diagnostic } from "../diagnostics.ts";
import { writeProjectIndex } from "../index/write.ts";
import { resolve } from "node:path";
import { evaluateProject, type ProjectEvaluation } from "./project-evaluation.ts";
import { ProjectQueryService } from "./project-query-service.ts";
import type {
  EntityDetail,
  EntitySummary,
  ProjectCheckResult,
  TaskDependenciesView,
  TaskReadinessView,
  TraceabilityView,
  VerificationEvidenceView,
} from "./project-types.ts";

type AvailableProjectEvaluation = Extract<ProjectEvaluation, { graphAvailable: true }>;

export type OpenLengthwiseApplicationResult =
  | { ok: true; application: LengthwiseApplication }
  | { ok: false; diagnostics: Diagnostic[] };

/**
 * Logical, in-process application API for clients that inspect one immutable
 * repository snapshot. Reopen it to observe later filesystem changes.
 */
export class LengthwiseApplication {
  #queries: ProjectQueryService;
  #ai: AiApplicationService;
  #evaluation: AvailableProjectEvaluation;
  #repoRoot: string;

  private constructor(repoRoot: string, evaluation: AvailableProjectEvaluation) {
    this.#repoRoot = repoRoot;
    this.#evaluation = evaluation;
    this.#queries = new ProjectQueryService(evaluation.graph);
    this.#ai = new AiApplicationService(evaluation.graph, evaluation.config, evaluation.diagnostics);
    Object.preventExtensions(this);
  }

  static async open(repoRoot: string): Promise<OpenLengthwiseApplicationResult> {
    const absoluteRoot = resolve(repoRoot);
    const evaluation = await evaluateProject(absoluteRoot);
    if (!evaluation.graphAvailable) return { ok: false, diagnostics: evaluation.diagnostics };
    return { ok: true, application: new LengthwiseApplication(absoluteRoot, evaluation) };
  }

  get repoRoot(): string { return this.#repoRoot; }

  checkProject(): ProjectCheckResult {
    return structuredClone({
      graphAvailable: true,
      repositoryValid: this.#evaluation.repositoryValid,
      clean: this.#evaluation.clean,
      entityCount: this.#evaluation.graph.entities.length,
      relationshipCount: this.#evaluation.graph.relationships.length,
      buildDiagnostics: this.#evaluation.buildDiagnostics,
      checkDiagnostics: this.#evaluation.checkDiagnostics,
      diagnostics: this.#evaluation.diagnostics,
    });
  }

  listEntities(options: { type?: string; query?: string } = {}): EntitySummary[] {
    return this.#queries.listEntities(options);
  }

  getEntity(id: string): EntityDetail | undefined {
    return this.#queries.getEntity(id);
  }

  getTraceability(id: string): TraceabilityView | undefined {
    return this.#queries.getTraceability(id);
  }

  listTaskReadiness(): TaskReadinessView[] {
    return this.#queries.listTaskReadiness();
  }

  explainReadiness(taskId: string): TaskReadinessView | undefined {
    return this.#queries.getTaskReadiness(taskId);
  }

  getTaskDependencies(taskId: string): TaskDependenciesView | undefined {
    return this.#queries.getTaskDependencies(taskId);
  }

  getVerificationEvidence(verificationId: string): VerificationEvidenceView | undefined {
    return this.#queries.getVerificationEvidence(verificationId);
  }

  async rebuildIndex(): Promise<{ entityCount: number; relationshipCount: number; diagnostics: Diagnostic[] }> {
    await writeProjectIndex(this.repoRoot, this.#evaluation.graph);
    return {
      entityCount: this.#evaluation.graph.entities.length,
      relationshipCount: this.#evaluation.graph.relationships.length,
      diagnostics: structuredClone(this.#evaluation.buildDiagnostics),
    };
  }

  buildAiContext(input: { targetId: string; purpose: AiContextPurpose }): AiContextResult {
    return this.#ai.buildContext(input);
  }

}
