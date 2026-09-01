import { afterEach, expect, test } from "bun:test";
import { symlink } from "node:fs/promises";
import { ArtifactAccessError, ArtifactService } from "./artifact-service.ts";
import { compareSuccessfulGraphs } from "./change-service.ts";
import { WorkbenchSession } from "./session.ts";
import { startWorkbenchServer } from "./server.ts";
import { createFixtureRepo, removeFixtureRepo } from "../test-support/fixture-repo.ts";
import { buildProjectGraph } from "../graph/build.ts";
import { runChecks } from "../checks/run.ts";
import { ProjectGraph } from "../graph/project-graph.ts";
import { errorDiagnostic } from "../diagnostics.ts";

const cleanup: string[] = [];
const servers: Array<ReturnType<typeof Bun.serve>> = [];
afterEach(async () => {
  while (servers.length) servers.pop()!.stop(true);
  while (cleanup.length) await removeFixtureRepo(cleanup.pop()!);
});

const CONFIG = `
lengthwise: 1
project: { name: Workbench Fixture }
artifacts:
  include: ["engineering/**/*.yaml", "engineering/**/*.md"]
  exclude: ["engineering/excluded/**"]
policy: { rigor: light }
rigor:
  light: { requirements: required, acceptanceCriteria: required, implementationTraceability: basic, verificationCoverage: required, taskPlan: as-needed, materialDecisions: recorded, humanApproval: [specification] }
  standard: { requirements: required, acceptanceCriteria: required, implementationTraceability: required, verificationCoverage: required, taskPlan: required, materialDecisions: recorded, humanApproval: [specification, buildContract] }
  strict: { requirements: required, acceptanceCriteria: required, implementationTraceability: required, verificationCoverage: required, taskPlan: required, materialDecisions: recorded, independentReview: generally-required, humanApproval: [specification, buildContract, verification] }
`;

const MODEL = `lengthwise: 1
entities:
  - id: REQ-001
    type: requirement
    lifecycle: accepted
    title: Searchable requirement
    statement: The workbench shall explain the model.
    relationships:
      - { type: has-acceptance-criterion, to: AC-001-01 }
  - id: AC-001-01
    type: acceptance-criterion
    lifecycle: accepted
    statement: A visible result appears.
  - id: VER-001
    type: verification
    lifecycle: defined
    title: Visible result verification
    method: automated-test
    required: true
    relationships:
      - { type: verifies, to: AC-001-01 }
  - id: TASK-001
    type: task
    lifecycle: planned
    title: Implement the requirement
    relationships:
      - { type: implements, to: REQ-001 }
`;

async function fixture(): Promise<string> {
  const root = await createFixtureRepo({
    ".lengthwise/project.yaml": CONFIG,
    "engineering/model.yaml": MODEL,
    "engineering/ordinary.yaml": "ordinary: true\n",
    "engineering/excluded/secret.yaml": MODEL,
  });
  cleanup.push(root);
  return root;
}

test("session exposes searchable semantic entity detail and derived state", async () => {
  const root = await fixture();
  const started = await WorkbenchSession.start(root);
  expect(started.ok).toBe(true);
  if (!started.ok) return;

  expect(started.session.listEntities({ query: "searchable" }).map((entity) => entity.id)).toEqual(["REQ-001"]);
  expect(started.session.listEntities({ type: "verification" }).map((entity) => entity.id)).toEqual(["VER-001"]);
  const requirement = started.session.getEntity("REQ-001")!;
  expect(requirement.derivedState.implementationCoverage).toBe(true);
  expect(requirement.relationships.some((edge) => edge.counterpart.id === "TASK-001" && edge.direction === "incoming")).toBe(true);
  expect(started.session.getEntity("UNKNOWN")).toBeUndefined();
});

test("explicit save advances successful baseline and reports lifecycle change", async () => {
  const root = await fixture();
  const started = await WorkbenchSession.start(root);
  if (!started.ok) throw new Error("fixture did not start");
  const artifact = await started.session.readArtifact("engineering/model.yaml");
  const saved = await started.session.saveArtifact(
    artifact.path,
    artifact.content.replace("lifecycle: planned", "lifecycle: in-progress"),
    artifact.version,
  );
  expect(saved.snapshot.repositoryValid).toBe(true);
  expect(saved.snapshot.changes).toContainEqual({
    kind: "lifecycle-changed", entityId: "TASK-001", before: "planned", after: "in-progress",
  });
  expect(started.session.getEntity("TASK-001")!.entity.lifecycle).toBe("in-progress");
});

test("invalid saved content remains on disk while the last successful graph is retained and can recover", async () => {
  const root = await fixture();
  const started = await WorkbenchSession.start(root);
  if (!started.ok) throw new Error("fixture did not start");
  const artifact = await started.session.readArtifact("engineering/model.yaml");
  const failed = await started.session.saveArtifact(artifact.path, "lengthwise: 1\nentities: [", artifact.version);
  expect(failed.snapshot.repositoryValid).toBe(false);
  expect(failed.snapshot.retainedGraph).toBe(true);
  expect(started.session.getEntity("REQ-001")?.entity.id).toBe("REQ-001");
  expect((await started.session.readArtifact(artifact.path)).content).toBe("lengthwise: 1\nentities: [");

  const repaired = await started.session.saveArtifact(artifact.path, MODEL, failed.artifact.version);
  expect(repaired.snapshot.repositoryValid).toBe(true);
  expect(repaired.snapshot.retainedGraph).toBe(false);
});

test("blocking relationship findings mark the repository invalid without retaining the previous graph", async () => {
  const root = await fixture();
  const started = await WorkbenchSession.start(root);
  if (!started.ok) throw new Error("fixture did not start");
  const artifact = await started.session.readArtifact("engineering/model.yaml");
  const saved = await started.session.saveArtifact(
    artifact.path,
    artifact.content.replace("to: REQ-001", "to: REQ-MISSING"),
    artifact.version,
  );

  expect(saved.snapshot.repositoryValid).toBe(false);
  expect(saved.snapshot.retainedGraph).toBe(false);
  expect(saved.snapshot.diagnostics).toContainEqual(expect.objectContaining({
    code: "graph/dangling-relationship",
    severity: "error",
    entityId: "TASK-001",
  }));
  expect(started.session.getEntity("TASK-001")?.relationships).toContainEqual(expect.objectContaining({
    direction: "outgoing",
    counterpart: { id: "REQ-MISSING", missing: true },
  }));
});

test("stale editor version rejects save without overwriting external content", async () => {
  const root = await fixture();
  const started = await WorkbenchSession.start(root);
  if (!started.ok) throw new Error("fixture did not start");
  const artifact = await started.session.readArtifact("engineering/model.yaml");
  await Bun.write(`${root}/engineering/model.yaml`, MODEL.replace("Searchable", "Externally changed"));
  await expect(started.session.saveArtifact(artifact.path, MODEL.replace("Searchable", "Editor changed"), artifact.version))
    .rejects.toMatchObject({ code: "conflict" });
  expect(await Bun.file(`${root}/engineering/model.yaml`).text()).toContain("Externally changed");
});

test("artifact service rejects traversal, absolute, excluded, unrecognized, and symlink escape paths", async () => {
  const root = await fixture();
  const built = await buildProjectGraph(root);
  if (!built.ok) throw new Error("fixture did not build");
  const artifacts = await ArtifactService.create(root, built.config);
  for (const path of ["../outside.yaml", "/etc/passwd", "engineering/excluded/secret.yaml", "engineering/ordinary.yaml"]) {
    await expect(artifacts.read(path)).rejects.toBeInstanceOf(ArtifactAccessError);
  }

  const outside = `/tmp/lengthwise-outside-${crypto.randomUUID()}.yaml`;
  await Bun.write(outside, MODEL);
  cleanup.push(outside);
  await symlink(outside, `${root}/engineering/link.yaml`);
  const withLink = await ArtifactService.create(root, built.config);
  await expect(withLink.read("engineering/link.yaml")).rejects.toMatchObject({ code: "unauthorized" });
});

test("graph comparison is deterministic and independent of collection order", async () => {
  const root = await fixture();
  const before = await buildProjectGraph(root);
  if (!before.ok) throw new Error("fixture did not build");
  const diagnostics = runChecks(before.graph, before.config);
  const reversed = new ProjectGraph(
    [...before.graph.entities].reverse(), [...before.graph.relationships].reverse(),
  );
  expect(compareSuccessfulGraphs({ graph: before.graph, diagnostics }, { graph: reversed, diagnostics })).toEqual([]);
});

test("graph comparison reports every required normalized change category", async () => {
  const beforeRoot = await fixture();
  const afterRoot = await createFixtureRepo({
    ".lengthwise/project.yaml": CONFIG,
    "engineering/model.yaml": MODEL
      .replace("lifecycle: planned", "lifecycle: in-progress")
      .replace("      - { type: implements, to: REQ-001 }\n", "")
      .replace(/  - id: VER-001[\s\S]*?(?=  - id: TASK-001)/, "")
      .concat("  - id: TASK-002\n    type: task\n    lifecycle: planned\n    title: Newly added task\n    relationships:\n      - { type: depends-on, to: TASK-001 }\n"),
  });
  cleanup.push(afterRoot);
  const before = await buildProjectGraph(beforeRoot);
  const after = await buildProjectGraph(afterRoot);
  if (!before.ok || !after.ok) throw new Error("comparison fixtures did not build");
  const oldFinding = errorDiagnostic("test/resolved", "Resolved finding", { entityId: "REQ-001" });
  const newFinding = errorDiagnostic("test/added", "Added finding", { entityId: "TASK-002" });
  const changes = compareSuccessfulGraphs(
    { graph: before.graph, diagnostics: [oldFinding] },
    { graph: after.graph, diagnostics: [newFinding] },
  );
  expect(new Set(changes.map((change) => change.kind))).toEqual(new Set([
    "entity-added", "entity-removed", "lifecycle-changed",
    "relationship-added", "relationship-removed", "coverage-lost", "finding-added", "finding-resolved",
  ]));
  expect(changes.filter((change) => change.kind === "coverage-lost").map((change) => change.coverage).sort())
    .toEqual(["implementation", "verification"]);
});

test("failed rebuild does not advance the successful comparison baseline", async () => {
  const root = await fixture();
  const started = await WorkbenchSession.start(root);
  if (!started.ok) throw new Error("fixture did not start");
  const initial = await started.session.readArtifact("engineering/model.yaml");
  const failed = await started.session.saveArtifact(initial.path, "lengthwise: 1\nentities: [", initial.version);
  const recovered = await started.session.saveArtifact(
    initial.path,
    MODEL.replace("lifecycle: planned", "lifecycle: done"),
    failed.artifact.version,
  );
  expect(recovered.snapshot.changes).toContainEqual({
    kind: "lifecycle-changed", entityId: "TASK-001", before: "planned", after: "done",
  });
});

test("HTTP API is loopback, addressable, same-origin protected, and serves the built UI", async () => {
  const root = await fixture();
  const result = await startWorkbenchServer(root, { port: 0 });
  if (!result.ok) throw new Error("fixture server did not start");
  servers.push(result.server);
  expect(result.url.startsWith("http://127.0.0.1:")).toBe(true);

  const snapshot = await fetch(`${result.url}/api/snapshot`);
  expect(snapshot.status).toBe(200);
  const snapshotBody = await snapshot.json() as { snapshot: { entities: unknown[] } };
  expect(snapshotBody.snapshot.entities.length).toBe(4);
  expect((await fetch(`${result.url}/?entity=REQ-001`)).status).toBe(200);
  expect((await fetch(`${result.url}/api/artifact?path=%2e%2e%2foutside.yaml`)).status).toBe(403);

  const artifact = await result.session.readArtifact("engineering/model.yaml");
  const rejected = await fetch(`${result.url}/api/artifact`, {
    method: "PUT",
    headers: { "content-type": "application/json", origin: "https://untrusted.example" },
    body: JSON.stringify({ path: artifact.path, content: artifact.content, expectedVersion: artifact.version }),
  });
  expect(rejected.status).toBe(403);
});

test("server reports an unavailable requested port without disturbing the running server", async () => {
  const root = await fixture();
  const first = await startWorkbenchServer(root, { port: 0 });
  if (!first.ok) throw new Error("fixture server did not start");
  servers.push(first.server);
  const second = await startWorkbenchServer(root, { port: first.server.port });
  expect(second.ok).toBe(false);
  if (!second.ok) expect(second.diagnostics[0]?.code).toBe("server/start-failed");
  expect((await fetch(`${first.url}/api/snapshot`)).status).toBe(200);
});
