import { buildProjectGraph } from "../graph/build.ts";
import type { ProjectGraph } from "../graph/project-graph.ts";
import { runChecks } from "../checks/run.ts";
import type { Diagnostic } from "../diagnostics.ts";
import type { ProjectConfig } from "../config/types.ts";
import { ArtifactService } from "./artifact-service.ts";
import { compareSuccessfulGraphs } from "./change-service.ts";
import { WorkbenchQueryService } from "./query-service.ts";
import type { ArtifactDocument, EntityDetail, EntitySummary, ModelChange, WorkbenchSnapshot } from "./types.ts";

interface SuccessfulBuild {
  graph: ProjectGraph;
  config: ProjectConfig;
  diagnostics: Diagnostic[];
}

export type SessionStartResult =
  | { ok: true; session: WorkbenchSession }
  | { ok: false; diagnostics: Diagnostic[] };

export class WorkbenchSession {
  private revision = 1;
  private changes: ModelChange[] = [];
  private repositoryValid = true;
  private failureDiagnostics: Diagnostic[] = [];

  private constructor(
    readonly repoRoot: string,
    private current: SuccessfulBuild,
    readonly artifacts: ArtifactService,
  ) {}

  static async start(repoRoot: string): Promise<SessionStartResult> {
    const built = await buildProjectGraph(repoRoot);
    if (!built.ok || built.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      return { ok: false, diagnostics: built.diagnostics };
    }
    const diagnostics = runChecks(built.graph, built.config);
    const artifacts = await ArtifactService.create(repoRoot, built.config);
    return {
      ok: true,
      session: new WorkbenchSession(repoRoot, { graph: built.graph, config: built.config, diagnostics }, artifacts),
    };
  }

  snapshot(): WorkbenchSnapshot {
    return {
      revision: this.revision,
      repositoryValid: this.repositoryValid,
      retainedGraph: !this.repositoryValid,
      entities: this.query().listEntities(),
      diagnostics: this.repositoryValid ? this.current.diagnostics : this.failureDiagnostics,
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

  private async rebuild(): Promise<void> {
    const built = await buildProjectGraph(this.repoRoot);
    const buildDiagnostics = built.ok ? built.diagnostics : built.diagnostics;
    if (!built.ok || buildDiagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      this.repositoryValid = false;
      this.failureDiagnostics = buildDiagnostics;
      this.changes = [];
      this.revision += 1;
      return;
    }

    const next: SuccessfulBuild = {
      graph: built.graph,
      config: built.config,
      diagnostics: runChecks(built.graph, built.config),
    };
    this.changes = compareSuccessfulGraphs(this.current, next);
    this.current = next;
    this.repositoryValid = true;
    this.failureDiagnostics = [];
    this.revision += 1;
  }

  private query(): WorkbenchQueryService {
    return new WorkbenchQueryService(this.current.graph);
  }
}
