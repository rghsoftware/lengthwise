import { test, expect } from "bun:test";
import { ProjectGraph } from "../graph/project-graph.ts";
import {
  checkDanglingRelationships,
  checkDuplicateIds,
  checkRelationshipTypeConstraints,
  checkTaskDependencyCycles,
} from "./structural.ts";
import type { Entity } from "../domain/entities.ts";
import type { Relationship } from "../domain/relationships.ts";

const loc = (artifactPath: string, line: number) => ({ artifactPath, line });

function task(id: string): Entity {
  return { id, type: "task", lifecycle: "planned", title: id, source: loc("tasks.yaml", 1) };
}
function requirement(id: string): Entity {
  return {
    id,
    type: "requirement",
    lifecycle: "accepted",
    title: id,
    statement: "...",
    source: loc("requirements.yaml", 1),
  };
}
function declares(from: string, type: Relationship["type"], to: string): Relationship {
  return { type, from, to, provenance: { kind: "declared", source: loc("x.yaml", 1) } };
}

// AC-009-01
test("a project graph satisfying all constraints validates cleanly", () => {
  const graph = new ProjectGraph(
    [task("TASK-001"), requirement("REQ-001")],
    [declares("TASK-001", "implements", "REQ-001")],
  );
  expect(checkDanglingRelationships(graph)).toEqual([]);
  expect(checkRelationshipTypeConstraints(graph)).toEqual([]);
  expect(checkDuplicateIds(graph)).toEqual([]);
  expect(checkTaskDependencyCycles(graph)).toEqual([]);
});

// AC-007-05, AC-NFR-005-02: enough info to locate the responsible entity/relationship.
test("a dangling relationship is reported with source, type, and missing target", () => {
  const graph = new ProjectGraph(
    [task("TASK-001")],
    [declares("TASK-001", "implements", "REQ-999")],
  );
  const findings = checkDanglingRelationships(graph);
  expect(findings).toHaveLength(1);
  expect(findings[0]?.code).toBe("graph/dangling-relationship");
  expect(findings[0]?.message).toContain("TASK-001");
  expect(findings[0]?.message).toContain("REQ-999");
  expect(findings[0]?.entityId).toBe("TASK-001");
  expect(findings[0]?.location).toEqual({ artifactPath: "x.yaml", line: 1 });
});

// AC-007-04
test("a relationship whose source/target types violate the registry is reported", () => {
  const graph = new ProjectGraph(
    [task("TASK-001"), task("TASK-002")],
    [declares("TASK-001", "has-acceptance-criterion", "TASK-002")],
  );
  const findings = checkRelationshipTypeConstraints(graph);
  expect(findings).toHaveLength(1);
  expect(findings[0]?.code).toBe("graph/invalid-relationship-type");
});

// AC-009-02: multiple independent violations are all reported.
test("multiple independent violations are all reported, not just the first", () => {
  const graph = new ProjectGraph(
    [task("TASK-001")],
    [declares("TASK-001", "implements", "REQ-999"), declares("TASK-001", "verifies", "AC-999")],
  );
  expect(checkDanglingRelationships(graph)).toHaveLength(2);
});

// AC-009-05
test("a task dependency cycle is reported with participating tasks", () => {
  const graph = new ProjectGraph(
    [task("TASK-001"), task("TASK-002"), task("TASK-003")],
    [
      declares("TASK-001", "depends-on", "TASK-002"),
      declares("TASK-002", "depends-on", "TASK-003"),
      declares("TASK-003", "depends-on", "TASK-001"),
    ],
  );
  const findings = checkTaskDependencyCycles(graph);
  expect(findings).toHaveLength(1);
  expect(findings[0]?.code).toBe("graph/task-dependency-cycle");
  for (const id of ["TASK-001", "TASK-002", "TASK-003"]) {
    expect(findings[0]?.message).toContain(id);
  }
});

test("acyclic task dependencies report no cycle", () => {
  const graph = new ProjectGraph(
    [task("TASK-001"), task("TASK-002")],
    [declares("TASK-001", "depends-on", "TASK-002")],
  );
  expect(checkTaskDependencyCycles(graph)).toEqual([]);
});
