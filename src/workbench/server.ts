import { extname, resolve } from "node:path";
import { ArtifactAccessError } from "./artifact-service.ts";
import { WorkbenchSession } from "./session.ts";
import { errorDiagnostic } from "../diagnostics.ts";
import { WorkflowCoordinator } from "../workflow/coordinator.ts";

export interface WorkbenchServerOptions {
  hostname?: string;
  port?: number;
  uiRoot?: string;
}

export type StartWorkbenchServerResult =
  | { ok: true; server: ReturnType<typeof Bun.serve>; session: WorkbenchSession; workflow: WorkflowCoordinator; url: string }
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

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

export async function startWorkbenchServer(
  repoRoot: string,
  options: WorkbenchServerOptions = {},
): Promise<StartWorkbenchServerResult> {
  const started = await WorkbenchSession.start(repoRoot);
  if (!started.ok) return started;
  const session = started.session;
  const workflow = await WorkflowCoordinator.open(repoRoot);
  const hostname = options.hostname ?? "127.0.0.1";
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
    port: options.port ?? 0,
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
          return entity ? json({ ok: true, entity }) : json({ ok: false, error: { code: "not-found" } }, 404);
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
          const body = await request.json() as { path?: unknown; content?: unknown; expectedVersion?: unknown };
          if (typeof body.path !== "string" || typeof body.content !== "string" || typeof body.expectedVersion !== "string") {
            return json({ ok: false, error: { code: "invalid-request" } }, 400);
          }
          return json({ ok: true, ...(await session.saveArtifact(body.path, body.content, body.expectedVersion)) });
        }
        if (url.pathname.startsWith("/api/workflow/") && request.method === "GET") {
          const featureId = decodeURIComponent(url.pathname.slice("/api/workflow/".length));
          const run=workflow.state.active(featureId);
          return json({ ok: true, assessment: await workflow.assess(featureId), run, history: workflow.state.history(featureId), events:run?workflow.state.events(run.id):[], attempts:run?workflow.state.attempts(run.id):[] });
        }
        if (url.pathname === "/api/workflow" && request.method === "POST") {
          if (request.headers.get("origin") !== origin) return json({ ok: false, error: { code: "untrusted-origin" } }, 403);
          const body = await request.json() as Record<string,unknown>;
          if(typeof body.idea==="string"&&typeof body.title==="string"&&typeof body.destination==="string") return json({ok:true,...await workflow.startFromIdea({idea:body.idea,title:body.title,destination:body.destination,featureId:typeof body.featureId==="string"?body.featureId:undefined,significance:["S","M","L","XL"].includes(String(body.significance))?body.significance as "S"|"M"|"L"|"XL":undefined})},201);
          if (typeof body.featureId !== "string") return json({ ok: false, error: { code: "invalid-request" } }, 400);
          return json({ ok: true, run: await workflow.start(body.featureId), assessment: await workflow.assess(body.featureId) }, 201);
        }
        if (url.pathname === "/api/workflow/gate" && request.method === "POST") {
          if (request.headers.get("origin") !== origin) return json({ ok: false, error: { code: "untrusted-origin" } }, 403);
          const body = await request.json() as { runId?: unknown; gate?: unknown; fingerprint?: unknown;lifecycleEffects?:unknown };
          if (typeof body.runId !== "string" || typeof body.fingerprint !== "string" || !["specification","build-contract","verification"].includes(String(body.gate))) return json({ ok: false, error: { code: "invalid-request" } }, 400);
          return json({ ok: true, run: await workflow.approve(body.runId, body.gate as "specification"|"build-contract"|"verification", body.fingerprint,Array.isArray(body.lifecycleEffects)?body.lifecycleEffects as Array<{entityId:string;from:string;to:string}>:[]) });
        }
        if (url.pathname === "/api/workflow/action" && request.method === "POST") {
          if (request.headers.get("origin") !== origin) return json({ ok: false, error: { code: "untrusted-origin" } }, 403);
          const body=await request.json() as Record<string,unknown>; if(typeof body.runId!=="string"||typeof body.action!=="string")return json({ok:false,error:{code:"invalid-request"}},400);
          let result:unknown;
          if(body.action==="handoff"&&typeof body.taskId==="string"&&typeof body.idempotencyKey==="string")result=await workflow.handoff(body.runId,body.taskId,body.idempotencyKey);
          else if(body.action==="return"&&typeof body.taskId==="string"&&typeof body.claim==="string"&&typeof body.idempotencyKey==="string")result=await workflow.returnImplementation(body.runId,body.taskId,body.claim,body.idempotencyKey);
          else if(body.action==="interrupt"&&typeof body.reason==="string")result=workflow.interrupt(body.runId,body.reason);
          else if(body.action==="resume")result=await workflow.resume(body.runId);
          else if(body.action==="retry"&&typeof body.attemptId==="string")result=await workflow.retry(body.runId,body.attemptId);
          else if(body.action==="cancel"&&typeof body.reason==="string")result=workflow.cancel(body.runId,body.reason);
          else if(body.action==="reconcile"&&typeof body.route==="string"&&typeof body.reason==="string")result=await workflow.reconcile(body.runId,body.route as "specify"|"plan"|"implement"|"verify"|"reconcile"|"complete",body.reason,typeof body.targetId==="string"?body.targetId:undefined);
          else if(body.action==="complete")result=await workflow.complete(body.runId);
          else return json({ok:false,error:{code:"invalid-request"}},400);
          return json({ok:true,result});
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
    return {
      ok: false,
      diagnostics: [errorDiagnostic("server/start-failed", `Could not start the workbench on ${hostname}:${options.port ?? "automatic port"}: ${(error as Error).message}`)],
    };
  }
  origin = `http://${hostname}:${server.port}`;
  return { ok: true, server, session, workflow, url: origin };
}
