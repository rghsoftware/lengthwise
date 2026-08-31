import { test, expect, afterEach } from "bun:test";
import { discoverCandidateFiles } from "./discover.ts";
import { createFixtureRepo, removeFixtureRepo } from "../test-support/fixture-repo.ts";
import type { ProjectConfig } from "../config/types.ts";

const cleanup: string[] = [];
afterEach(async () => {
  while (cleanup.length > 0) await removeFixtureRepo(cleanup.pop()!);
});

function configWith(include: string[], exclude?: string[]): ProjectConfig {
  return {
    lengthwise: 1,
    project: { name: "Fixture" },
    artifacts: { include, exclude },
    policy: { rigor: "standard" },
    rigor: {
      light: {
        requirements: "required",
        acceptanceCriteria: "required",
        implementationTraceability: "basic",
        verificationCoverage: "required",
        taskPlan: "as-needed",
        materialDecisions: "recorded",
        humanApproval: ["specification"],
      },
      standard: {
        requirements: "required",
        acceptanceCriteria: "required",
        implementationTraceability: "required",
        verificationCoverage: "required",
        taskPlan: "required",
        materialDecisions: "recorded",
        humanApproval: ["specification", "buildContract"],
      },
      strict: {
        requirements: "required",
        acceptanceCriteria: "required",
        implementationTraceability: "required",
        verificationCoverage: "required",
        taskPlan: "required",
        materialDecisions: "recorded",
        independentReview: "generally-required",
        humanApproval: ["specification", "buildContract", "verification"],
      },
    },
  };
}

// AC-002-01, AC-002-02
test("discovery includes matched files and excludes overrides matches", async () => {
  const root = await createFixtureRepo({
    "engineering/requirements.yaml": "lengthwise: 1",
    "engineering/archive/old.yaml": "lengthwise: 1",
    "engineering/notes.txt": "not a candidate extension",
  });
  cleanup.push(root);

  const candidates = await discoverCandidateFiles(
    root,
    configWith(["engineering/**/*.yaml"], ["engineering/archive/**"]),
  );

  expect(candidates).toEqual(["engineering/requirements.yaml"]);
});

// AC-002-04
test("files outside discovery scope contribute no candidates", async () => {
  const root = await createFixtureRepo({
    "src/index.ts": "console.log(1)",
    "engineering/requirements.yaml": "lengthwise: 1",
  });
  cleanup.push(root);

  const candidates = await discoverCandidateFiles(root, configWith(["engineering/**/*.yaml"]));

  expect(candidates).toEqual(["engineering/requirements.yaml"]);
});

// AC-002-03 (identity independence from location) is exercised end-to-end in
// normalization tests (TASK-005), where the same entity id is parsed from
// artifacts at two different included locations.
