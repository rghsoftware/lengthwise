import type { ProjectGraph } from "../graph/project-graph.ts";
import type { Diagnostic } from "../diagnostics.ts";
import type { ProjectConfig } from "../config/types.ts";
import { evaluateProject } from "../application/project-evaluation.ts";
import { ProjectQueryService } from "../application/project-query-service.ts";
import type { EntityDetail, EntitySummary } from "../application/project-types.ts";
import { ArtifactService } from "./artifact-service.ts";
import { compareSuccessfulGraphs } from "./change-service.ts";
import type { ArtifactDocument, ModelChange, WorkbenchSnapshot } from "./types.ts";
import { ENTITY_LIFECYCLES, updateLifecycleContent } from "./lifecycle-service.ts";

interface SuccessfulBuild {
  graph: ProjectGraph;
  config: ProjectConfig;
  diagnostics: Diagnostic[];
  repositoryValid: boolean;
}

export type SessionStartResult =
  | { ok: true; session: WorkbenchSession }
  | { ok: false; diagnostics: Diagnostic[] };

export class WorkbenchSession {
  private revision = 1;
  private changes: ModelChange[] = [];
  private repositoryValid: boolean;
  private usingRetainedGraph = false;
  private failureDiagnostics: Diagnostic[] = [];

  private constructor(
    readonly repoRoot: string,
    private current: SuccessfulBuild,
    readonly artifacts: ArtifactService,
  ) {
    this.repositoryValid = current.repositoryValid;
  }

  static async start(repoRoot: string): Promise<SessionStartResult> {
    const evaluated = await evaluateProject(repoRoot);
    if (!evaluated.graphAvailable || evaluated.buildDiagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      return { ok: false, diagnostics: evaluated.buildDiagnostics };
    }
    const artifacts = await ArtifactService.create(repoRoot, evaluated.config);
    return {
      ok: true,
      session: new WorkbenchSession(
        repoRoot,
        {
          graph: evaluated.graph,
          config: evaluated.config,
          diagnostics: evaluated.checkDiagnostics,
          repositoryValid: evaluated.repositoryValid,
        },
        artifacts,
      ),
    };
  }

  snapshot(): WorkbenchSnapshot {
    return {
      revision: this.revision,
      repositoryValid: this.repositoryValid,
      retainedGraph: this.usingRetainedGraph,
      entities: this.query().listEntities(),
      diagnostics: this.usingRetainedGraph ? this.failureDiagnostics : this.current.diagnostics,
      changes: this.changes,
    };
  }

  listEntities(options: { type?: string; query?: string } = {}): EntitySummary[] {
    return this.query().listEntities(options);
  }

  getEntity(id: string): EntityDetail | undefined {
    return this.query().getEntity(id);
  }

  readArtifact(path: string): Promise<ArtifactDocument> {
    return this.artifacts.read(path);
  }

  async saveArtifact(path: string, content: string, expectedVersion: string): Promise<{
    artifact: ArtifactDocument;
    snapshot: WorkbenchSnapshot;
  }> {
    const artifact = await this.artifacts.write(path, content, expectedVersion);
    await this.rebuild();
    return { artifact, snapshot: this.snapshot() };
  }

  async updateEntityLifecycle(id: string, lifecycle: string, expectedVersion: string): Promise<{
    artifact: ArtifactDocument;
    snapshot: WorkbenchSnapshot;
    entity: EntityDetail;
  }> {
    const entity = this.current.graph.getEntity(id);
    if (!entity) throw new Error(`Unknown entity ${id}`);
    if (!ENTITY_LIFECYCLES[entity.type].includes(lifecycle)) throw new Error(`Unsupported ${entity.type} lifecycle ${JSON.stringify(lifecycle)}`);
    const current = await this.artifacts.read(entity.source.artifactPath);
    const content = updateLifecycleContent(current.content, id, entity.lifecycle, lifecycle);
    const saved = await this.saveArtifact(entity.source.artifactPath, content, expectedVersion);
    const updated = this.getEntity(id);
    if (!updated || updated.entity.lifecycle !== lifecycle) throw new Error(`Lifecycle update for ${id} did not produce the requested authoritative state`);
    return {...saved, entity:updated};
  }

  private async rebuild(): Promise<void> {
    const evaluated = await evaluateProject(this.repoRoot);
    if (!evaluated.graphAvailable || evaluated.buildDiagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      this.repositoryValid = false;
      this.usingRetainedGraph = true;
      this.failureDiagnostics = evaluated.buildDiagnostics;
      this.changes = [];
      this.revision += 1;
      return;
    }

    const next: SuccessfulBuild = {
      graph: evaluated.graph,
      config: evaluated.config,
      diagnostics: evaluated.checkDiagnostics,
      repositoryValid: evaluated.repositoryValid,
    };
    this.changes = compareSuccessfulGraphs(this.current, next);
    this.current = next;
    this.repositoryValid = next.repositoryValid;
    this.usingRetainedGraph = false;
    this.failureDiagnostics = [];
    this.revision += 1;
  }

  private query(): ProjectQueryService {
    return new ProjectQueryService(this.current.graph);
  }
}
