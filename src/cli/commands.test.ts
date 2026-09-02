import { test, expect, afterEach } from "bun:test";
import { runCli } from "./main.ts";
import { createFixtureRepo, removeFixtureRepo } from "../test-support/fixture-repo.ts";
import { INDEX_DB_PATH } from "../index/sqlite-index.ts";

const cleanup: string[] = [];
afterEach(async () => {
  while (cleanup.length > 0) await removeFixtureRepo(cleanup.pop()!);
});

const CONFIG = `
lengthwise: 1
project:
  name: Fixture Project
artifacts:
  include: ["engineering/**/*.yaml"]
policy:
  rigor: light
rigor:
  light: { requirements: required, acceptanceCriteria: required, implementationTraceability: basic, verificationCoverage: required, taskPlan: as-needed, materialDecisions: recorded, humanApproval: [specification] }
  standard: { requirements: required, acceptanceCriteria: required, implementationTraceability: required, verificationCoverage: required, taskPlan: required, materialDecisions: recorded, humanApproval: [specification, buildContract] }
  strict: { requirements: required, acceptanceCriteria: required, implementationTraceability: required, verificationCoverage: required, taskPlan: required, materialDecisions: recorded, independentReview: generally-required, humanApproval: [specification, buildContract, verification] }
`;

const ENTITIES = `
lengthwise: 1
entities:
  - id: TASK-001
    type: task
    lifecycle: planned
    title: First task
    relationships:
      - type: implements
        to: REQ-001
  - id: REQ-001
    type: requirement
    lifecycle: accepted
    title: A requirement
    statement: Something must be true.
    relationships:
      - type: has-acceptance-criterion
        to: AC-001-01
  - id: AC-001-01
    type: acceptance-criterion
    lifecycle: accepted
    statement: Observable outcome.
  - id: VER-001
    type: verification
    lifecycle: defined
    title: Coverage for AC-001-01
    method: automated-test
    required: true
    relationships:
      - type: verifies
        to: AC-001-01
`;

async function fixtureRepo(): Promise<string> {
  const root = await createFixtureRepo({
    ".lengthwise/project.yaml": CONFIG,
    "engineering/entities.yaml": ENTITIES,
  });
  cleanup.push(root);
  return root;
}

// AC-012-01
test("lw index reports success and writes the disposable index", async () => {
  const root = await fixtureRepo();
  const result = await runCli(["index"], root);
  expect(result.exitCode).toBe(0);
  expect(await Bun.file(`${root}/${INDEX_DB_PATH}`).exists()).toBe(true);
});

// AC-012-02
test("lw check reports success for a complete, valid project", async () => {
  const root = await fixtureRepo();
  const clean = await runCli(["check"], root);
  expect(clean.exitCode).toBe(0);
  expect((clean.data as { ok: boolean; diagnostics: unknown[] }).diagnostics).toEqual([]);
});

test("lw check reports a blocking finding for a dangling relationship", async () => {
  const root = await createFixtureRepo({
    ".lengthwise/project.yaml": CONFIG,
    "engineering/entities.yaml": `
lengthwise: 1
entities:
  - id: TASK-001
    type: task
    lifecycle: planned
    title: First task
    relationships:
      - type: implements
        to: REQ-999
`,
  });
  cleanup.push(root);

  const result = await runCli(["check"], root);
  expect(result.exitCode).toBe(1);
  expect(result.lines.some((line) => line.includes("dangling-relationship"))).toBe(true);
});

// AC-012-03
test("lw show exposes entity type, properties, source, and relationships", async () => {
  const root = await fixtureRepo();
  const result = await runCli(["show", "REQ-001"], root);
  expect(result.exitCode).toBe(0);
  expect(result.lines[0]).toContain("REQ-001");
  expect(result.lines[0]).toContain("requirement");
  expect(result.lines.some((line) => line.startsWith("source:"))).toBe(true);
  expect(result.lines.some((line) => line.includes("has-acceptance-criterion"))).toBe(true);
});

// AC-012-04
test("lw trace exposes connected traceability relationships in both directions", async () => {
  const root = await fixtureRepo();
  const result = await runCli(["trace", "REQ-001"], root);
  expect(result.exitCode).toBe(0);
  expect(result.lines.some((line) => line.includes("has-acceptance-criterion"))).toBe(true);
  expect(result.lines.some((line) => line.includes("implemented-by"))).toBe(true);
});

// AC-012-05
test("lw ready lists only tasks whose dependencies are satisfied", async () => {
  const root = await createFixtureRepo({
    ".lengthwise/project.yaml": CONFIG,
    "engineering/entities.yaml": `
lengthwise: 1
entities:
  - id: TASK-001
    type: task
    lifecycle: planned
    title: Free task
  - id: TASK-002
    type: task
    lifecycle: planned
    title: Blocked task
    relationships:
      - type: depends-on
        to: TASK-001
`,
  });
  cleanup.push(root);

  const result = await runCli(["ready"], root);
  expect(result.exitCode).toBe(0);
  expect((result.data as { ready: string[] }).ready).toEqual(["TASK-001"]);
});

// AC-012-06
test("show and trace return an explicit not-found result for a nonexistent id", async () => {
  const root = await fixtureRepo();
  const show = await runCli(["show", "NOPE-999"], root);
  const trace = await runCli(["trace", "NOPE-999"], root);
  expect(show.exitCode).toBe(1);
  expect(trace.exitCode).toBe(1);
  expect(show.lines[0]).toContain("No entity found");
  expect(trace.lines[0]).toContain("No entity found");
});

// --json flag
test("--json prints the structured data payload", async () => {
  const root = await fixtureRepo();
  const result = await runCli(["show", "REQ-001", "--json"], root);
  expect((result.data as { ok: boolean }).ok).toBe(true);
  expect((result.data as { entity: { id: string } }).entity.id).toBe("REQ-001");
});

test("lw serve rejects a directory without Lengthwise configuration", async () => {
  const root = await createFixtureRepo({});
  cleanup.push(root);
  const result = await runCli(["serve"], root);
  expect(result.exitCode).toBe(1);
  expect(result.lines.some((line) => line.includes("config/missing"))).toBe(true);
  expect(result.waitUntil).toBeUndefined();
});

test("workflow CLI starts, reports, and cancels a persisted run",async()=>{
  const root=await createFixtureRepo({".lengthwise/project.yaml":CONFIG,"engineering/entities.yaml":`${ENTITIES}\n  - { id: F-CLI, type: feature, title: CLI workflow, lifecycle: draft, significance: S, relationships: [{ type: addresses, to: REQ-001 }] }\n`});cleanup.push(root);
  const started=await runCli(["workflow","start","F-CLI"],root);expect(started.exitCode).toBe(0);const runId=(started.data as any).run.id;
  const status=await runCli(["workflow","status","F-CLI"],root);expect((status.data as any).run.id).toBe(runId);expect((status.data as any).assessment.actions.length).toBeGreaterThan(0);
  const cancelled=await runCli(["workflow","cancel",runId,"operator request"],root);expect((cancelled.data as any).state).toBe("cancelled");
});

// Dogfood: the real Lengthwise repository's own artifacts, end to end through the CLI.
test("lw check, show, trace, and ready work against this repository's own artifacts", async () => {
  const repoRoot = process.cwd();

  const check = await runCli(["check"], repoRoot);
  expect(check.exitCode).toBe(0);

  const show = await runCli(["show", "F-001"], repoRoot);
  expect(show.exitCode).toBe(0);
  expect(show.lines[0]).toContain("feature");

  const trace = await runCli(["trace", "REQ-004"], repoRoot);
  expect(trace.exitCode).toBe(0);
  expect(trace.lines.some((line) => line.includes("implemented-by"))).toBe(true);

  const ready = await runCli(["ready"], repoRoot);
  expect(ready.exitCode).toBe(0);
  // F-002 implementation and owner-accepted evaluation are complete.
  expect((ready.data as { ready: string[] }).ready.filter((id) => /^TASK-01[1-9]$|^TASK-020$/.test(id))).toEqual([]);
});
