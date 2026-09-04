import { afterEach, expect, test } from "bun:test";
import { INDEX_DB_PATH } from "../index/sqlite-index.ts";
import { createFixtureRepo, removeFixtureRepo } from "../test-support/fixture-repo.ts";
import { evaluateProject } from "./project-evaluation.ts";
import { LengthwiseApplication } from "./project-service.ts";

const roots: string[] = [];
afterEach(async () => {
  while (roots.length) await removeFixtureRepo(roots.pop()!);
});

const CONFIG = `
lengthwise: 1
project: { name: Application Fixture }
artifacts:
  include: ["engineering/**/*.yaml"]
policy: { rigor: light }
rigor:
  light: { requirements: required, acceptanceCriteria: required, implementationTraceability: basic, verificationCoverage: required, taskPlan: as-needed, materialDecisions: recorded, humanApproval: [specification] }
  standard: { requirements: required, acceptanceCriteria: required, implementationTraceability: required, verificationCoverage: required, taskPlan: required, materialDecisions: recorded, humanApproval: [specification, buildContract] }
  strict: { requirements: required, acceptanceCriteria: required, implementationTraceability: required, verificationCoverage: required, taskPlan: required, materialDecisions: recorded, independentReview: generally-required, humanApproval: [specification, buildContract, verification] }
`;

const MODEL = `
lengthwise: 1
entities:
  - id: REQ-APP
    type: requirement
    lifecycle: accepted
    title: Application boundary
    statement: Clients use shared semantics.
    relationships:
      - { type: has-acceptance-criterion, to: AC-APP-01 }
  - id: AC-APP-01
    type: acceptance-criterion
    lifecycle: accepted
    statement: Blockers are structured.
  - id: VER-APP
    type: verification
    lifecycle: defined
    title: Boundary verification
    method: automated-test
    required: true
    relationships:
      - { type: verifies, to: AC-APP-01 }
  - id: TASK-APP-01
    type: task
    lifecycle: planned
    title: Ready task
    relationships:
      - { type: implements, to: REQ-APP }
  - id: TASK-APP-02
    type: task
    lifecycle: planned
    title: Blocked task
    relationships:
      - { type: implements, to: REQ-APP }
      - { type: depends-on, to: TASK-APP-01 }
  - id: TASK-APP-03
    type: task
    lifecycle: done
    title: Completed task
`;

async function fixture(model = MODEL): Promise<string> {
  const root = await createFixtureRepo({
    ".lengthwise/project.yaml": CONFIG,
    "engineering/model.yaml": model,
  });
  roots.push(root);
  return root;
}

test("project evaluation separates graph availability, load diagnostics, and check findings", async () => {
  const missing = await createFixtureRepo({});
  roots.push(missing);
  expect(await evaluateProject(missing)).toMatchObject({
    graphAvailable: false,
    repositoryValid: false,
    buildDiagnostics: [expect.objectContaining({ code: "config/missing" })],
    checkDiagnostics: [],
  });

  const malformed = await fixture();
  await Bun.write(`${malformed}/engineering/bad.yaml`, "lengthwise: 1\nentities: [");
  const partial = await evaluateProject(malformed);
  expect(partial.graphAvailable).toBe(true);
  if (!partial.graphAvailable) return;
  expect(partial.buildDiagnostics.length).toBeGreaterThan(0);
  expect(partial.buildDiagnostics.every((diagnostic) => diagnostic.severity === "error")).toBe(true);
  expect(partial.diagnostics.slice(0, partial.buildDiagnostics.length)).toEqual(partial.buildDiagnostics);

  const dangling = await fixture(MODEL.replace("to: TASK-APP-01", "to: TASK-MISSING"));
  const checked = await evaluateProject(dangling);
  expect(checked.graphAvailable).toBe(true);
  if (!checked.graphAvailable) return;
  expect(checked.buildDiagnostics).toEqual([]);
  expect(checked.checkDiagnostics).toContainEqual(expect.objectContaining({ code: "graph/dangling-relationship" }));
  expect(checked.repositoryValid).toBe(false);
});

test("application queries expose one authoritative readiness and traceability projection", async () => {
  const root = await fixture();
  const opened = await LengthwiseApplication.open(root);
  expect(opened.ok).toBe(true);
  if (!opened.ok) return;
  const application = opened.application;
  expect(Object.getOwnPropertyNames(application)).toEqual([]);
  expect(Object.isExtensible(application)).toBe(false);
  expect(Reflect.get(application, "evaluation")).toBeUndefined();
  expect(Reflect.get(application, "queries")).toBeUndefined();

  expect(application.checkProject()).toMatchObject({ repositoryValid: true, clean: true, entityCount: 6 });
  expect(application.getEntity("REQ-APP")?.relationships).toContainEqual(expect.objectContaining({
    direction: "incoming",
    label: "implemented-by",
    provenance: "derived",
  }));
  expect(application.getTraceability("REQ-APP")?.relationships.some((relationship) => relationship.label === "implemented-by")).toBe(true);
  expect(application.getTraceability("UNKNOWN")).toBeUndefined();

  const readiness = application.listTaskReadiness();
  expect(readiness.map((item) => [item.task.id, item.ready])).toEqual([
    ["TASK-APP-01", true],
    ["TASK-APP-02", false],
  ]);
  expect(application.explainReadiness("TASK-APP-02")?.blockers).toEqual([
    expect.objectContaining({ code: "task-dependency-incomplete", entityId: "TASK-APP-01" }),
  ]);
  expect(application.explainReadiness("TASK-APP-03")).toMatchObject({
    candidate: false,
    ready: false,
    blockers: [expect.objectContaining({ code: "task-not-planned" })],
  });
  expect(application.getTaskDependencies("TASK-APP-02")?.dependencies).toEqual([
    expect.objectContaining({ id: "TASK-APP-01", satisfied: false }),
  ]);
  expect(application.getVerificationEvidence("VER-APP")).toMatchObject({
    satisfied: false,
    status: "missing",
    evidence: [],
  });

  const detached = application.getEntity("TASK-APP-01")!;
  (detached.entity as { lifecycle: string }).lifecycle = "done";
  detached.entity.source.artifactPath = "forged.yaml";
  const reported = application.checkProject();
  reported.diagnostics.push({ code: "forged", severity: "error", message: "client mutation" });
  expect(application.getEntity("TASK-APP-01")?.entity).toMatchObject({
    lifecycle: "planned",
    source: { artifactPath: "engineering/model.yaml" },
  });
  expect(application.checkProject().diagnostics).toEqual([]);

  await application.rebuildIndex();
  expect(await Bun.file(`${root}/${INDEX_DB_PATH}`).exists()).toBe(true);
});
