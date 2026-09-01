import { buildProjectGraph } from "../graph/build.ts";
import { runChecks } from "../checks/run.ts";
import { deriveTaskReadiness } from "../graph/readiness.ts";
import { writeProjectIndex } from "../index/write.ts";
import { formatDiagnostic } from "./format.ts";
import type { Diagnostic } from "../diagnostics.ts";
import type { Entity } from "../domain/entities.ts";
import type { ProjectGraph } from "../graph/project-graph.ts";
import { startWorkbenchServer } from "../workbench/server.ts";

export interface CommandResult {
  exitCode: number;
  lines: string[];
  data: unknown;
  waitUntil?: Promise<void>;
}

/** `lw serve` — F-002 local browser workbench. */
export async function cmdServe(repoRoot: string): Promise<CommandResult> {
  const result = await startWorkbenchServer(repoRoot);
  if (!result.ok) return buildFailureResult(result.diagnostics);
  return {
    exitCode: 0,
    data: { ok: true, url: result.url },
    lines: [`Lengthwise workbench: ${result.url}`],
    waitUntil: new Promise<void>(() => {}),
  };
}

function authoredProperties(entity: Entity): Record<string, unknown> {
  const { id: _id, type: _type, lifecycle: _lifecycle, source: _source, ...rest } = entity;
  return rest;
}

function buildFailureResult(diagnostics: Diagnostic[]): CommandResult {
  return {
    exitCode: 1,
    data: { ok: false, diagnostics },
    lines: ["Could not build the Project Graph.", ...diagnostics.map(formatDiagnostic)],
  };
}

/** `lw index` — REQ-012, AC-012-01. Reports whether indexing succeeded. */
export async function cmdIndex(repoRoot: string): Promise<CommandResult> {
  const result = await buildProjectGraph(repoRoot);
  if (!result.ok) return buildFailureResult(result.diagnostics);

  await writeProjectIndex(repoRoot, result.graph);
  const ok = result.diagnostics.length === 0;
  const entityCount = result.graph.entities.length;
  const relationshipCount = result.graph.relationships.length;

  return {
    exitCode: ok ? 0 : 1,
    data: { ok, entityCount, relationshipCount, diagnostics: result.diagnostics },
    lines: [
      ok
        ? `Indexed ${entityCount} entities and ${relationshipCount} relationships.`
        : `Indexed with ${result.diagnostics.length} problem(s):`,
      ...result.diagnostics.map(formatDiagnostic),
    ],
  };
}

/** `lw check` — REQ-012, AC-012-02. Distinguishes clean validation from blocking findings. */
export async function cmdCheck(repoRoot: string): Promise<CommandResult> {
  const built = await buildProjectGraph(repoRoot);
  if (!built.ok) return buildFailureResult(built.diagnostics);

  const findings = runChecks(built.graph, built.config);
  const diagnostics = [...built.diagnostics, ...findings];
  const ok = diagnostics.length === 0;

  return {
    exitCode: ok ? 0 : 1,
    data: { ok, diagnostics },
    lines: ok
      ? ["Project Graph is valid: no findings."]
      : [`${diagnostics.length} finding(s):`, ...diagnostics.map(formatDiagnostic)],
  };
}

function notFoundResult(id: string): CommandResult {
  return {
    exitCode: 1,
    data: { ok: false, found: false, id },
    lines: [`No entity found with id "${id}".`],
  };
}

function describeRelationships(graph: ProjectGraph, id: string) {
  return {
    outgoing: graph.outgoingRelationships(id).map((relationship) => ({
      type: relationship.type,
      to: relationship.to,
      provenance: relationship.provenance.kind,
    })),
    incoming: graph.incomingProjections(id).map((projection) => ({
      label: projection.label,
      from: projection.counterpart,
      provenance: projection.provenance.kind,
    })),
  };
}

/** `lw show <ID>` — REQ-012, AC-012-03, AC-012-06. */
export async function cmdShow(repoRoot: string, id: string | undefined): Promise<CommandResult> {
  if (!id) return { exitCode: 1, data: { ok: false }, lines: ["Usage: lw show <ID>"] };

  const built = await buildProjectGraph(repoRoot);
  if (!built.ok) return buildFailureResult(built.diagnostics);

  const entity = built.graph.getEntity(id);
  if (!entity) return notFoundResult(id);

  const relationships = describeRelationships(built.graph, id);
  const properties = authoredProperties(entity);

  const lines = [
    `${entity.id} (${entity.type}) — ${entity.lifecycle}`,
    `source: ${entity.source.artifactPath}${entity.source.line ? ":" + entity.source.line : ""}`,
    ...Object.entries(properties)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`),
    ...relationships.outgoing.map((r) => `--${r.type}--> ${r.to} (${r.provenance})`),
    ...relationships.incoming.map((r) => `<--${r.label}-- ${r.from} (${r.provenance})`),
  ];

  return { exitCode: 0, data: { ok: true, entity, relationships }, lines };
}

/** `lw trace <ID>` — REQ-012, AC-012-04, AC-012-06. */
export async function cmdTrace(repoRoot: string, id: string | undefined): Promise<CommandResult> {
  if (!id) return { exitCode: 1, data: { ok: false }, lines: ["Usage: lw trace <ID>"] };

  const built = await buildProjectGraph(repoRoot);
  if (!built.ok) return buildFailureResult(built.diagnostics);

  const entity = built.graph.getEntity(id);
  if (!entity) return notFoundResult(id);

  const relationships = describeRelationships(built.graph, id);
  const lines = [
    `Traceability for ${entity.id} (${entity.type}):`,
    ...(relationships.outgoing.length === 0
      ? []
      : ["outgoing:", ...relationships.outgoing.map((r) => `  --${r.type}--> ${r.to}`)]),
    ...(relationships.incoming.length === 0
      ? []
      : ["incoming:", ...relationships.incoming.map((r) => `  <--${r.label}-- ${r.from}`)]),
  ];
  if (relationships.outgoing.length === 0 && relationships.incoming.length === 0) {
    lines.push("(no connected relationships)");
  }

  return { exitCode: 0, data: { ok: true, id: entity.id, ...relationships }, lines };
}

/** `lw ready` — REQ-012, AC-012-05. */
export async function cmdReady(repoRoot: string): Promise<CommandResult> {
  const built = await buildProjectGraph(repoRoot);
  if (!built.ok) return buildFailureResult(built.diagnostics);

  const readiness = deriveTaskReadiness(built.graph);
  const ready = readiness.filter((entry) => entry.ready);

  return {
    exitCode: 0,
    data: { ok: true, ready: ready.map((entry) => entry.task.id) },
    lines:
      ready.length === 0
        ? ["No tasks are ready."]
        : ready.map((entry) => `${entry.task.id} — ${entry.task.title}`),
  };
}
