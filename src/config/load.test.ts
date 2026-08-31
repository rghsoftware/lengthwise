import { test, expect, afterEach } from "bun:test";
import { loadProjectConfig } from "./load.ts";
import { createFixtureRepo, removeFixtureRepo } from "../test-support/fixture-repo.ts";

const cleanup: string[] = [];
afterEach(async () => {
  while (cleanup.length > 0) await removeFixtureRepo(cleanup.pop()!);
});

const VALID_CONFIG = `
lengthwise: 1

project:
  name: Fixture Project

artifacts:
  include:
    - "engineering/**/*.md"
    - "engineering/**/*.yaml"
  exclude:
    - "engineering/archive/**"

policy:
  rigor: standard

rigor:
  light:
    requirements: required
    acceptanceCriteria: required
    implementationTraceability: basic
    verificationCoverage: required
    taskPlan: as-needed
    materialDecisions: recorded
    humanApproval: [specification]
  standard:
    requirements: required
    acceptanceCriteria: required
    implementationTraceability: required
    verificationCoverage: required
    taskPlan: required
    materialDecisions: recorded
    humanApproval: [specification, buildContract]
  strict:
    requirements: required
    acceptanceCriteria: required
    implementationTraceability: required
    verificationCoverage: required
    taskPlan: required
    materialDecisions: recorded
    independentReview: generally-required
    humanApproval: [specification, buildContract, verification]
`;

// AC-001-01
test("valid project configuration is recognized and loads discovery config", async () => {
  const root = await createFixtureRepo({ ".lengthwise/project.yaml": VALID_CONFIG });
  cleanup.push(root);

  const result = await loadProjectConfig(root);

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.config.project.name).toBe("Fixture Project");
    expect(result.config.artifacts.include).toEqual([
      "engineering/**/*.md",
      "engineering/**/*.yaml",
    ]);
    expect(result.config.policy.rigor).toBe("standard");
  }
});

// AC-001-02
test("invalid project configuration reports a deterministic error with source location", async () => {
  const root = await createFixtureRepo({
    ".lengthwise/project.yaml": `
lengthwise: 1
project:
  name: Fixture Project
artifacts:
  include: "not-an-array"
policy:
  rigor: standard
rigor: {}
`,
  });
  cleanup.push(root);

  const result = await loadProjectConfig(root);

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0]?.code).toBe("config/invalid");
    expect(result.diagnostics[0]?.location?.artifactPath).toBe(".lengthwise/project.yaml");
  }
});

test("malformed YAML in project configuration reports a deterministic error", async () => {
  const root = await createFixtureRepo({
    ".lengthwise/project.yaml": "lengthwise: 1\nartifacts: [unterminated",
  });
  cleanup.push(root);

  const result = await loadProjectConfig(root);

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.diagnostics[0]?.code).toBe("config/invalid-yaml");
  }
});

// AC-001-03
test("a repository without project configuration fails with a clear diagnostic", async () => {
  const root = await createFixtureRepo({ "README.md": "no lengthwise config here" });
  cleanup.push(root);

  const result = await loadProjectConfig(root);

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.diagnostics[0]?.code).toBe("config/missing");
  }
});
