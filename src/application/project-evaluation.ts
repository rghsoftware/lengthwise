import { runChecks } from "../checks/run.ts";
import type { ProjectConfig } from "../config/types.ts";
import type { Diagnostic } from "../diagnostics.ts";
import { buildProjectGraph } from "../graph/build.ts";
import type { ProjectGraph } from "../graph/project-graph.ts";

export type ProjectEvaluation =
  | {
      graphAvailable: false;
      repositoryValid: false;
      clean: false;
      buildDiagnostics: Diagnostic[];
      checkDiagnostics: [];
      diagnostics: Diagnostic[];
    }
  | {
      graphAvailable: true;
      repositoryValid: boolean;
      clean: boolean;
      graph: ProjectGraph;
      config: ProjectConfig;
      buildDiagnostics: Diagnostic[];
      checkDiagnostics: Diagnostic[];
      diagnostics: Diagnostic[];
    };

/**
 * Builds one immutable project snapshot and partitions repository-loading
 * diagnostics from graph-check findings. Consumers retain their own policy
 * for partial graphs while sharing one deterministic evaluation operation.
 */
export async function evaluateProject(repoRoot: string): Promise<ProjectEvaluation> {
  const built = await buildProjectGraph(repoRoot);
  if (!built.ok) {
    return {
      graphAvailable: false,
      repositoryValid: false,
      clean: false,
      buildDiagnostics: built.diagnostics,
      checkDiagnostics: [],
      diagnostics: built.diagnostics,
    };
  }

  const checkDiagnostics = runChecks(built.graph, built.config);
  const diagnostics = [...built.diagnostics, ...checkDiagnostics];
  return {
    graphAvailable: true,
    repositoryValid: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    clean: diagnostics.length === 0,
    graph: built.graph,
    config: built.config,
    buildDiagnostics: built.diagnostics,
    checkDiagnostics,
    diagnostics,
  };
}
