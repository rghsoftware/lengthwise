import { test, expect, afterEach } from "bun:test";
import { buildProjectGraph } from "./build.ts";
import { createFixtureRepo, removeFixtureRepo } from "../test-support/fixture-repo.ts";
import { INDEX_DB_PATH } from "../index/sqlite-index.ts";

const cleanup: string[] = [];
afterEach(async () => {
  while (cleanup.length > 0) await removeFixtureRepo(cleanup.pop()!);
});

test("building the Project Graph from this repository's own artifacts succeeds", async () => {
  const result = await buildProjectGraph(process.cwd());

  expect(result.ok).toBe(true);
  if (!result.ok) return;

  expect(result.diagnostics).toEqual([]);

  const task001 = result.graph.getEntity("TASK-001");
  expect(task001?.type).toBe("task");

  // TASK-001 implements REQ-004, REQ-005, REQ-007, REQ-008, NFR-007 (tasks.yaml).
  const outgoing = result.graph.outgoingRelationships("TASK-001");
  expect(outgoing.some((r) => r.type === "implements" && r.to === "REQ-004")).toBe(true);

  // REQ-004's inverse projection should expose TASK-001 as implemented-by.
  const inverse = result.graph.incomingProjections("REQ-004");
  expect(inverse.some((p) => p.label === "implemented-by" && p.counterpart === "TASK-001")).toBe(
    true,
  );

  expect(result.graph.duplicateIds().size).toBe(0);
});

// AC-NFR-001-01: a fresh installation reconstructs the model without a pre-existing index.
test("the Project Graph builds from repository artifacts with no pre-existing index database", async () => {
  const root = await createFixtureRepo({
    ".lengthwise/project.yaml": `
lengthwise: 1
project:
  name: Fresh
artifacts:
  include: ["engineering/**/*.yaml"]
policy:
  rigor: light
rigor:
  light: { requirements: required, acceptanceCriteria: required, implementationTraceability: basic, verificationCoverage: required, taskPlan: as-needed, materialDecisions: recorded, humanApproval: [specification] }
  standard: { requirements: required, acceptanceCriteria: required, implementationTraceability: required, verificationCoverage: required, taskPlan: required, materialDecisions: recorded, humanApproval: [specification, buildContract] }
  strict: { requirements: required, acceptanceCriteria: required, implementationTraceability: required, verificationCoverage: required, taskPlan: required, materialDecisions: recorded, independentReview: generally-required, humanApproval: [specification, buildContract, verification] }
`,
    "engineering/tasks.yaml": `
lengthwise: 1
entities:
  - id: TASK-001
    type: task
    lifecycle: planned
    title: Fresh task
`,
  });
  cleanup.push(root);

  expect(await Bun.file(`${root}/${INDEX_DB_PATH}`).exists()).toBe(false);
  const result = await buildProjectGraph(root);
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.graph.getEntity("TASK-001")).toBeDefined();
});
