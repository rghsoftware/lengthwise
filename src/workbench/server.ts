import { extname, resolve } from "node:path";
import { ArtifactAccessError } from "./artifact-service.ts";
import { WorkbenchSession } from "./session.ts";
import { errorDiagnostic } from "../diagnostics.ts";
import {
  WorkflowCoordinator,
  isImplementationCompletionClaim,
  type ImplementationCompletionClaimInput,
  type WorkflowCommand,
  type WorkflowReconciliationRoute,
} from "../workflow/coordinator.ts";
import { ENTITY_LIFECYCLES } from "./lifecycle-service.ts";

export interface WorkbenchServerOptions {
  hostname?: string;
  port?: number;
  uiRoot?: string;
}

export const DEFAULT_WORKBENCH_PORT = 7331;

export type StartWorkbenchServerResult =
  | { ok: true; server: ReturnType<typeof Bun.serve>; session: WorkbenchSession; workflow: WorkflowCoordinator; url: string; close: () => void }
  | { ok: false; diagnostics: import("../diagnostics.ts").Diagnostic[] };

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store", ...headers } });
}

function errorResponse(error: unknown): Response {
  if (error instanceof ArtifactAccessError) {
    const status = error.code === "conflict" ? 409 : error.code === "not-found" ? 404 : 403;
    return json({ ok: false, error: { code: error.code, message: error.message } }, status);
  }
  return json({ ok: false, error: { code: "internal", message: (error as Error).message } }, 500);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function requestObject(request: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const value: unknown = await request.json();
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

const RECONCILIATION_ROUTES: readonly WorkflowReconciliationRoute[] = ["specify", "plan", "implement", "verify", "reconcile", "complete"];

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

function parseWorkflowCommand(body: Record<string, unknown>): WorkflowCommand | undefined {
  if (typeof body.runId !== "string" || typeof body.action !== "string") return undefined;
  if (body.action === "handoff" && typeof body.taskId === "string" && typeof body.idempotencyKey === "string") {
    return { kind: "handoff", runId: body.runId, taskId: body.taskId, idempotencyKey: body.idempotencyKey };
  }
  if (body.action === "return" && typeof body.taskId === "string" && typeof body.idempotencyKey === "string"
    && (typeof body.claim === "string" || isImplementationCompletionClaim(body.claim))) {
    return {
      kind: "return-implementation",
      runId: body.runId,
      taskId: body.taskId,
      claim: body.claim as ImplementationCompletionClaimInput | string,
      idempotencyKey: body.idempotencyKey,
    };
  }
  if (body.action === "evaluate-return" && typeof body.taskId === "string" && typeof body.idempotencyKey === "string"
    && ["retry-implementation", "reconcile", "satisfactory"].includes(String(body.outcome))) {
    return {
      kind: "evaluate-implementation-return",
      runId: body.runId,
      taskId: body.taskId,
      outcome: body.outcome as "retry-implementation" | "reconcile" | "satisfactory",
      idempotencyKey: body.idempotencyKey,
      failedVerifications: stringArray(body.failedVerifications),
      blockingFindings: stringArray(body.blockingFindings),
      knownGaps: stringArray(body.knownGaps),
      reason: typeof body.reason === "string" ? body.reason : undefined,
    };
  }
  if (body.action === "interrupt" && typeof body.reason === "string") {
    return { kind: "interrupt", runId: body.runId, reason: body.reason };
  }
  if (body.action === "resume") return { kind: "resume", runId: body.runId };
  if (body.action === "retry" && typeof body.attemptId === "string") {
    return { kind: "retry", runId: body.runId, attemptId: body.attemptId };
  }
  if (body.action === "cancel" && typeof body.reason === "string") {
    return { kind: "cancel", runId: body.runId, reason: body.reason };
  }
  if (body.action === "reconcile" && typeof body.route === "string" && typeof body.reason === "string"
    && (RECONCILIATION_ROUTES as readonly string[]).includes(body.route)) {
    return {
      kind: "reconcile",
      runId: body.runId,
      route: body.route as WorkflowReconciliationRoute,
      reason: body.reason,
      targetId: typeof body.targetId === "string" ? body.targetId : undefined,
    };
  }
  if (body.action === "complete") return { kind: "complete", runId: body.runId };
  return undefined;
}

export async function startWorkbenchServer(
  repoRoot: string,
  options: WorkbenchServerOptions = {},
): Promise<StartWorkbenchServerResult> {
  const started = await WorkbenchSession.start(repoRoot);
  if (!started.ok) return started;
  const session = started.session;
  const workflow = await WorkflowCoordinator.open(repoRoot);
  const hostname = options.hostname ?? "127.0.0.1";
  const port = options.port ?? DEFAULT_WORKBENCH_PORT;
  const uiRoot = options.uiRoot ?? resolve(import.meta.dir, "../../workbench-ui/build");

  if (!options.uiRoot && !(await Bun.file(resolve(uiRoot, "index.html")).exists())) {
    const projectRoot = resolve(import.meta.dir, "../..");
    const build = Bun.spawn(["bun", "run", "build:workbench"], {
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await build.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(build.stderr).text();
      workflow.close();
      return {
        ok: false,
        diagnostics: [errorDiagnostic("server/ui-build-failed", `Could not build the workbench UI: ${stderr.trim()}`)],
      };
    }
  }

  let origin = "";
  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({
    hostname,
    port,
    async fetch(request) {
      const url = new URL(request.url);
      try {
        if (url.pathname === "/api/snapshot" && request.method === "GET") {
          return json({ ok: true, snapshot: session.snapshot() });
        }
        if (url.pathname === "/api/entities" && request.method === "GET") {
          return json({
            ok: true,
            entities: session.listEntities({
              type: url.searchParams.get("type") || undefined,
              query: url.searchParams.get("query") || undefined,
            }),
          });
        }
        if (url.pathname.startsWith("/api/entities/") && request.method === "GET") {
          const id = decodeURIComponent(url.pathname.slice("/api/entities/".length));
          const entity = session.getEntity(id);
          return entity ? json({ ok: true, entity, lifecycleOptions:ENTITY_LIFECYCLES[entity.entity.type] }) : json({ ok: false, error: { code: "not-found" } }, 404);
        }
        if (url.pathname.startsWith("/api/entities/") && url.pathname.endsWith("/lifecycle") && request.method === "PUT") {
          if (request.headers.get("origin") !== origin) return json({ ok: false, error: { code: "untrusted-origin" } }, 403);
          const id = decodeURIComponent(url.pathname.slice("/api/entities/".length, -"/lifecycle".length));
           const body = await requestObject(request);
           if (!body || typeof body.lifecycle !== "string" || typeof body.expectedVersion !== "string") return json({ ok: false, error: { code: "invalid-request" } }, 400);
           const entity=session.getEntity(id)?.entity;const activeRun=entity?.type==="feature"?workflow.getActiveRun(id):undefined;
           if(entity?.type==="feature"&&body.lifecycle==="complete"&&activeRun){const assessment=await workflow.assess(id);if(!assessment.completionEligible)return json({ok:false,error:{code:"completion-ineligible",message:"Resolve the Feature's workflow blockers before marking it complete"}},409);const updated=await session.updateEntityLifecycle(id,body.lifecycle,body.expectedVersion);await workflow.perform({kind:"complete",runId:activeRun.id});return json({ok:true,...updated,run:workflow.getLatestRun(id)});}
          return json({ ok: true, ...(await session.updateEntityLifecycle(id, body.lifecycle, body.expectedVersion)) });
        }
        if (url.pathname === "/api/artifact" && request.method === "GET") {
          const path = url.searchParams.get("path");
          if (!path) return json({ ok: false, error: { code: "missing-path" } }, 400);
          return json({ ok: true, artifact: await session.readArtifact(path) });
        }
        if (url.pathname === "/api/artifact" && request.method === "PUT") {
          if (request.headers.get("origin") !== origin) {
            return json({ ok: false, error: { code: "untrusted-origin" } }, 403);
          }
           const body = await requestObject(request);
           if (!body || typeof body.path !== "string" || typeof body.content !== "string" || typeof body.expectedVersion !== "string") {
            return json({ ok: false, error: { code: "invalid-request" } }, 400);
          }
          return json({ ok: true, ...(await session.saveArtifact(body.path, body.content, body.expectedVersion)) });
        }
        if (url.pathname === "/api/workflows" && request.method === "GET") {
           const runs = workflow.listActiveRuns().filter((run) => {
            const feature = session.getEntity(run.featureId)?.entity;
            return feature?.type !== "feature" || feature.lifecycle !== "complete";
          });
          return json({ ok: true, runs });
        }
        if (url.pathname.startsWith("/api/workflow/") && request.method === "GET") {
          const featureId = decodeURIComponent(url.pathname.slice("/api/workflow/".length));
           return json({ ok: true, ...(await workflow.inspectFeature(featureId)) });
        }
        if (url.pathname === "/api/workflow" && request.method === "POST") {
          if (request.headers.get("origin") !== origin) return json({ ok: false, error: { code: "untrusted-origin" } }, 403);
           const body = await requestObject(request);if(!body)return json({ok:false,error:{code:"invalid-request"}},400);
           if(typeof body.idea==="string"&&typeof body.title==="string"&&typeof body.destination==="string") return json({ok:true,...await workflow.startFromIdea({idea:body.idea,title:body.title,destination:body.destination,featureId:typeof body.featureId==="string"?body.featureId:undefined,significance:["S","M","L","XL"].includes(String(body.significance))?body.significance as "S"|"M"|"L"|"XL":undefined})},201);
          if (typeof body.featureId !== "string") return json({ ok: false, error: { code: "invalid-request" } }, 400);
          return json({ ok: true, run: await workflow.start(body.featureId), assessment: await workflow.assess(body.featureId) }, 201);
        }
        if (url.pathname === "/api/workflow/gate" && request.method === "POST") {
          if (request.headers.get("origin") !== origin) return json({ ok: false, error: { code: "untrusted-origin" } }, 403);
           const body = await requestObject(request);
           if (!body || typeof body.runId !== "string" || typeof body.fingerprint !== "string" || !["specification","build-contract","verification"].includes(String(body.gate))) return json({ ok: false, error: { code: "invalid-request" } }, 400);
          return json({ ok: true, run: await workflow.approve(body.runId, body.gate as "specification"|"build-contract"|"verification", body.fingerprint,Array.isArray(body.lifecycleEffects)?body.lifecycleEffects as Array<{entityId:string;from:string;to:string}>:[]) });
        }
        if (url.pathname === "/api/workflow/action" && request.method === "POST") {
          if (request.headers.get("origin") !== origin) return json({ ok: false, error: { code: "untrusted-origin" } }, 403);
           const body=await requestObject(request);const command=body?parseWorkflowCommand(body):undefined;if(!command)return json({ok:false,error:{code:"invalid-request"}},400);
           return json({ok:true,result:await workflow.perform(command)});
        }
        if (url.pathname.startsWith("/api/")) return json({ ok: false, error: { code: "not-found" } }, 404);

        const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        const assetPath = resolve(uiRoot, requested);
        if (!assetPath.startsWith(`${resolve(uiRoot)}/`)) return new Response("Not found", { status: 404 });
        let file = Bun.file(assetPath);
        if (!(await file.exists())) file = Bun.file(resolve(uiRoot, "index.html"));
        if (!(await file.exists())) {
          return new Response("Workbench UI has not been built. Run `bun run build:workbench`.", { status: 503 });
        }
        return new Response(file, { headers: { "content-type": MIME[extname(file.name ?? assetPath)] ?? "application/octet-stream" } });
      } catch (error) {
        return errorResponse(error);
      }
    },
    });
  } catch (error) {
    workflow.close();
    return {
      ok: false,
      diagnostics: [errorDiagnostic("server/start-failed", `Could not start the workbench on ${hostname}:${port}: ${(error as Error).message}`)],
    };
  }
  origin = `http://${hostname}:${server.port}`;
  let closed=false;const close=()=>{if(closed)return;closed=true;server.stop(true);workflow.close();};
  return { ok: true, server, session, workflow, url: origin, close };
}
