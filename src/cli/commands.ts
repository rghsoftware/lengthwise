import { LengthwiseApplication } from "../application/project-service.ts";
import type { RelationshipView } from "../application/project-types.ts";
import { formatDiagnostic } from "./format.ts";
import type { Diagnostic } from "../diagnostics.ts";
import type { Entity } from "../domain/entities.ts";
import { DEFAULT_WORKBENCH_PORT, startWorkbenchServer } from "../workbench/server.ts";
import { WorkflowCoordinator, isImplementationCompletionClaim, type ImplementationCompletionClaimInput, type WorkflowGate, type WorkflowReconciliationRoute } from "../workflow/coordinator.ts";

export interface CommandResult {
  exitCode: number;
  lines: string[];
  data: unknown;
  waitUntil?: Promise<void>;
}

export function parseServePort(args: string[]): { ok: true; port: number } | { ok: false; message: string } {
  if (args.length === 0) return { ok: true, port: DEFAULT_WORKBENCH_PORT };

  let value: string | undefined;
  if ((args[0] === "--port" || args[0] === "-p") && args.length === 2) value = args[1];
  else if (args.length === 1 && args[0]?.startsWith("--port=")) value = args[0].slice("--port=".length);
  else return { ok: false, message: "Usage: lw serve [--port <PORT>]" };

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return { ok: false, message: `Invalid port "${value ?? ""}". Choose a whole number from 1 to 65535.` };
  }
  return { ok: true, port };
}

/** `lw serve` — F-002 local browser workbench. */
export async function cmdServe(repoRoot: string, args: string[] = []): Promise<CommandResult> {
  const parsed = parseServePort(args);
  if (!parsed.ok) return { exitCode: 1, data: { ok: false, error: "invalid-port" }, lines: [parsed.message] };

  const result = await startWorkbenchServer(repoRoot, { port: parsed.port });
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
  const opened = await LengthwiseApplication.open(repoRoot);
  if (!opened.ok) return buildFailureResult(opened.diagnostics);

  const result = await opened.application.rebuildIndex();
  const ok = result.diagnostics.length === 0;
  const { entityCount, relationshipCount } = result;

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
  const opened = await LengthwiseApplication.open(repoRoot);
  if (!opened.ok) return buildFailureResult(opened.diagnostics);

  const diagnostics = opened.application.checkProject().diagnostics;
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

function describeRelationships(relationships: RelationshipView[]) {
  return {
    outgoing: relationships.filter((relationship) => relationship.direction === "outgoing").map((relationship) => ({
      type: relationship.type,
      to: relationship.counterpart.id,
      provenance: relationship.provenance,
    })),
    incoming: relationships.filter((relationship) => relationship.direction === "incoming").map((relationship) => ({
      label: relationship.label,
      from: relationship.counterpart.id,
      provenance: relationship.provenance,
    })),
  };
}

/** `lw show <ID>` — REQ-012, AC-012-03, AC-012-06. */
export async function cmdShow(repoRoot: string, id: string | undefined): Promise<CommandResult> {
  if (!id) return { exitCode: 1, data: { ok: false }, lines: ["Usage: lw show <ID>"] };

  const opened = await LengthwiseApplication.open(repoRoot);
  if (!opened.ok) return buildFailureResult(opened.diagnostics);

  const detail = opened.application.getEntity(id);
  if (!detail) return notFoundResult(id);
  const entity = detail.entity;

  const relationships = describeRelationships(detail.relationships);
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

  const opened = await LengthwiseApplication.open(repoRoot);
  if (!opened.ok) return buildFailureResult(opened.diagnostics);

  const traceability = opened.application.getTraceability(id);
  if (!traceability) return notFoundResult(id);
  const entity = traceability.entity;

  const relationships = describeRelationships(traceability.relationships);
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
  const opened = await LengthwiseApplication.open(repoRoot);
  if (!opened.ok) return buildFailureResult(opened.diagnostics);

  const readiness = opened.application.listTaskReadiness();
  const ready = readiness.filter((entry) => entry.ready);

  return {
    exitCode: 0,
    data: { ok: true, ready: ready.map((entry) => entry.task.id) },
    lines:
      ready.length === 0
        ? ["No tasks are ready."]
        : ready.map((entry) => `${entry.task.id} — ${entry.task.label}`),
  };
}

/** Provider-neutral workflow dogfooding surface for F-003. */
export async function cmdWorkflow(repoRoot:string,args:string[]):Promise<CommandResult>{
  const [action,...rest]=args; const workflow=await WorkflowCoordinator.open(repoRoot);
  try{
    let data:unknown;
    switch(action){
      case "status": {if(!rest[0])throw new Error("Usage: lw workflow status <FEATURE>");data=await workflow.inspectFeature(rest[0]);break;}
      case "start": if(!rest[0])throw new Error("Usage: lw workflow start <FEATURE>");else data={run:await workflow.start(rest[0]),assessment:await workflow.assess(rest[0])};break;
      case "capture": if(rest.length<4)throw new Error("Usage: lw workflow capture <FEATURE> <TITLE> <DESTINATION> <IDEA>");else data=await workflow.startFromIdea({featureId:rest[0],title:rest[1]!,destination:rest[2]!,idea:rest.slice(3).join(" ")});break;
      case "approve": if(rest.length<3)throw new Error("Usage: lw workflow approve <RUN> <GATE> <FINGERPRINT>");else data=await workflow.approve(rest[0]!,rest[1] as WorkflowGate,rest[2]!);break;
      case "handoff": if(rest.length<3)throw new Error("Usage: lw workflow handoff <RUN> <TASK> <IDEMPOTENCY_KEY>");else data=await workflow.perform({kind:"handoff",runId:rest[0]!,taskId:rest[1]!,idempotencyKey:rest[2]!});break;
      case "return": {if(rest.length<4)throw new Error("Usage: lw workflow return <RUN> <TASK> <IDEMPOTENCY_KEY> <CLAIM_OR_JSON>");const text=rest.slice(3).join(" ");let claim:string|ImplementationCompletionClaimInput=text;if(text.trim().startsWith("{")){try{claim=JSON.parse(text);}catch{throw new Error("Implementation return JSON is invalid");}if(!isImplementationCompletionClaim(claim))throw new Error("Implementation return claim has an invalid structure");}data=await workflow.perform({kind:"return-implementation",runId:rest[0]!,taskId:rest[1]!,claim,idempotencyKey:rest[2]!});break;}
      case "evaluate-return": {if(rest.length<4)throw new Error("Usage: lw workflow evaluate-return <RUN> <TASK> <retry-implementation|reconcile|satisfactory> <IDEMPOTENCY_KEY> [JSON_CONTEXT_OR_REASON]");const [runId,taskId,outcome,idempotencyKey,...detail]=rest;if(!["retry-implementation","reconcile","satisfactory"].includes(outcome!))throw new Error("Unsupported implementation-return outcome");let context:Record<string,unknown>={};if(detail.length){const value=detail.join(" ");try{context=JSON.parse(value);}catch{context={reason:value};}}data=await workflow.perform({kind:"evaluate-implementation-return",runId:runId!,taskId:taskId!,outcome:outcome as "retry-implementation"|"reconcile"|"satisfactory",idempotencyKey:idempotencyKey!,failedVerifications:Array.isArray(context.failedVerifications)?context.failedVerifications as string[]:undefined,blockingFindings:Array.isArray(context.blockingFindings)?context.blockingFindings as string[]:undefined,knownGaps:Array.isArray(context.knownGaps)?context.knownGaps as string[]:undefined,reason:typeof context.reason==="string"?context.reason:undefined});break;}
      case "interrupt": if(!rest[0])throw new Error("Usage: lw workflow interrupt <RUN> [REASON]");else data=await workflow.perform({kind:"interrupt",runId:rest[0],reason:rest.slice(1).join(" ")||"Interrupted by operator"});break;
      case "resume": if(!rest[0])throw new Error("Usage: lw workflow resume <RUN>");else data=await workflow.perform({kind:"resume",runId:rest[0]});break;
      case "retry": if(rest.length<2)throw new Error("Usage: lw workflow retry <RUN> <ATTEMPT>");else data=await workflow.perform({kind:"retry",runId:rest[0]!,attemptId:rest[1]!});break;
      case "cancel": if(!rest[0])throw new Error("Usage: lw workflow cancel <RUN> [REASON]");else data=await workflow.perform({kind:"cancel",runId:rest[0],reason:rest.slice(1).join(" ")||"Cancelled by operator"});break;
      case "reconcile": if(rest.length<3)throw new Error("Usage: lw workflow reconcile <RUN> <ROUTE> <REASON>");else data=await workflow.perform({kind:"reconcile",runId:rest[0]!,route:rest[1] as WorkflowReconciliationRoute,reason:rest.slice(2).join(" ")});break;
      case "complete": if(!rest[0])throw new Error("Usage: lw workflow complete <RUN>");else data=await workflow.perform({kind:"complete",runId:rest[0]});break;
      default: throw new Error("Usage: lw workflow <status|start|capture|approve|handoff|return|evaluate-return|interrupt|resume|retry|cancel|reconcile|complete> ...");
    }
    return {exitCode:0,data:{ok:true,...(typeof data==="object"&&data?data:{result:data})},lines:[JSON.stringify(data,null,2)]};
  }catch(error){return {exitCode:1,data:{ok:false,error:(error as Error).message},lines:[(error as Error).message]};}
  finally{workflow.close();}
}
