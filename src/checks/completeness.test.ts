import { test, expect } from "bun:test";
import { ProjectGraph } from "../graph/project-graph.ts";
import {
  checkAcceptanceCriteriaCoverage,
  checkImplementationTraceability,
  checkVerificationCoverage,
} from "./completeness.ts";
import type { ProjectConfig, RigorPolicy } from "../config/types.ts";
import type { Entity, RequirementEntity } from "../domain/entities.ts";
import type { Relationship } from "../domain/relationships.ts";

const loc = (artifactPath: string, line: number) => ({ artifactPath, line });

function standardRigor(): RigorPolicy {
  return {
    requirements: "required",
    acceptanceCriteria: "required",
    implementationTraceability: "required",
    verificationCoverage: "required",
    taskPlan: "required",
    materialDecisions: "recorded",
    humanApproval: ["specification", "buildContract"],
  };
}

function config(rigor: RigorPolicy): ProjectConfig {
  return {
    lengthwise: 1,
    project: { name: "Fixture" },
    artifacts: { include: ["**/*.yaml"] },
    policy: { rigor: "standard" },
    rigor: { light: rigor, standard: rigor, strict: rigor },
  };
}

function requirement(id: string, lifecycle: RequirementEntity["lifecycle"] = "accepted"): Entity {
  return {
    id,
    type: "requirement",
    lifecycle,
    title: id,
    statement: "...",
    source: loc("requirements.yaml", 1),
  };
}
function acceptanceCriterion(id: string): Entity {
  return {
    id,
    type: "acceptance-criterion",
    lifecycle: "accepted",
    statement: "...",
    source: loc("requirements.yaml", 1),
  };
}
function task(id: string): Entity {
  return { id, type: "task", lifecycle: "planned", title: id, source: loc("tasks.yaml", 1) };
}
function verification(id: string, required: boolean): Entity {
  return {
    id,
    type: "verification",
    lifecycle: "defined",
    title: id,
    method: "automated-test",
    required,
    source: loc("verification.yaml", 1),
  };
}
function declares(from: string, type: Relationship["type"], to: string): Relationship {
  return { type, from, to, provenance: { kind: "declared", source: loc("x.yaml", 1) } };
}

// AC-010-01
test("an accepted requirement with no acceptance criteria is reported incomplete", () => {
  const graph = new ProjectGraph([requirement("REQ-001")], []);
  const findings = checkAcceptanceCriteriaCoverage(graph, config(standardRigor()));
  expect(findings).toHaveLength(1);
  expect(findings[0]?.code).toBe("completeness/missing-acceptance-criteria");
});

test("an accepted requirement with an acceptance criterion is not reported", () => {
  const graph = new ProjectGraph(
    [requirement("REQ-001"), acceptanceCriterion("AC-001-01")],
    [declares("REQ-001", "has-acceptance-criterion", "AC-001-01")],
  );
  expect(checkAcceptanceCriteriaCoverage(graph, config(standardRigor()))).toEqual([]);
});

test("a draft requirement is not held to acceptance-criteria completeness", () => {
  const graph = new ProjectGraph([requirement("REQ-001", "draft")], []);
  expect(checkAcceptanceCriteriaCoverage(graph, config(standardRigor()))).toEqual([]);
});

// AC-010-02
test("an accepted requirement with no implementing task is reported as a traceability gap", () => {
  const graph = new ProjectGraph([requirement("REQ-001")], []);
  const findings = checkImplementationTraceability(graph, config(standardRigor()));
  expect(findings).toHaveLength(1);
  expect(findings[0]?.code).toBe("completeness/missing-implementation");
});

test("an accepted requirement implemented by a task is not reported", () => {
  const graph = new ProjectGraph(
    [requirement("REQ-001"), task("TASK-001")],
    [declares("TASK-001", "implements", "REQ-001")],
  );
  expect(checkImplementationTraceability(graph, config(standardRigor()))).toEqual([]);
});

// AC-010-03
test("an accepted acceptance criterion with no required verification is reported as a coverage gap", () => {
  const graph = new ProjectGraph([acceptanceCriterion("AC-001-01")], []);
  const findings = checkVerificationCoverage(graph, config(standardRigor()));
  expect(findings).toHaveLength(1);
  expect(findings[0]?.code).toBe("completeness/missing-verification");
});

// AC-010-05: an optional verification's absence never blocks — only required ones count,
// and a present-but-optional verification does not satisfy the gate on its own.
test("only a required verification satisfies coverage; an optional one alone does not", () => {
  const graph = new ProjectGraph(
    [acceptanceCriterion("AC-001-01"), verification("VER-OPT", false)],
    [declares("VER-OPT", "verifies", "AC-001-01")],
  );
  expect(checkVerificationCoverage(graph, config(standardRigor()))).toHaveLength(1);
});

test("a required verification definition satisfies coverage", () => {
  const graph = new ProjectGraph(
    [acceptanceCriterion("AC-001-01"), verification("VER-001", true)],
    [declares("VER-001", "verifies", "AC-001-01")],
  );
  expect(checkVerificationCoverage(graph, config(standardRigor()))).toEqual([]);
});

// TASK-007 LOCKED: effective rigor controls required evidence, not entity semantics —
// with a rigor level that does not require coverage, nothing is reported.
test("when effective rigor does not require verification coverage, nothing is reported", () => {
  const graph = new ProjectGraph([acceptanceCriterion("AC-001-01")], []);
  const lightish = { ...standardRigor(), verificationCoverage: "basic" as const };
  expect(checkVerificationCoverage(graph, config(lightish))).toEqual([]);
});
