import { test, expect } from "bun:test";
import { ProjectGraph } from "./project-graph.ts";
import type { Entity } from "../domain/entities.ts";
import type { Relationship } from "../domain/relationships.ts";

const loc = (artifactPath: string, line: number) => ({ artifactPath, line });

const task: Entity = {
  id: "TASK-001",
  type: "task",
  lifecycle: "planned",
  title: "Define domain types",
  source: loc("engineering/features/project-graph/tasks.yaml", 3),
};
const requirement: Entity = {
  id: "REQ-001",
  type: "requirement",
  lifecycle: "accepted",
  title: "Project configuration",
  statement: "Lengthwise shall load project configuration.",
  source: loc("engineering/requirements.yaml", 3),
};
const implementsRelationship: Relationship = {
  type: "implements",
  from: "TASK-001",
  to: "REQ-001",
  provenance: { kind: "declared", source: task.source },
};

// AC-007-01, AC-007-02
test("a declared relationship is exposed with its declared type and direction", () => {
  const graph = new ProjectGraph([task, requirement], [implementsRelationship]);
  const outgoing = graph.outgoingRelationships("TASK-001");
  expect(outgoing).toHaveLength(1);
  expect(outgoing[0]).toMatchObject({ type: "implements", from: "TASK-001", to: "REQ-001" });
});

// AC-007-03: inverse projection without a second authoritative declaration.
test("querying the target exposes the inverse projection without a second stored relationship", () => {
  const graph = new ProjectGraph([task, requirement], [implementsRelationship]);
  const projections = graph.incomingProjections("REQ-001");
  expect(projections).toHaveLength(1);
  expect(projections[0]?.label).toBe("implemented-by");
  expect(projections[0]?.counterpart).toBe("TASK-001");
  // Only one Relationship object exists in the whole graph — the inverse is synthesized, not stored.
  expect(graph.relationships).toHaveLength(1);
});

// REQ-008 / AC-008-01, AC-008-02, AC-008-03
test("the inverse projection carries derived provenance explaining its origin", () => {
  const graph = new ProjectGraph([task, requirement], [implementsRelationship]);
  const [projection] = graph.incomingProjections("REQ-001");
  expect(projection?.provenance.kind).toBe("derived");
  if (projection?.provenance.kind === "derived") {
    expect(projection.provenance.explanation).toContain("implements");
    expect(projection.provenance.derivedFrom).toEqual(task.source);
  }
  // The original stored relationship is declared, distinguishable from the derived projection.
  expect(graph.outgoingRelationships("TASK-001")[0]?.provenance.kind).toBe("declared");
});

// AC-004-02: duplicate identity surfaced with both source declarations.
test("duplicate entity ids are surfaced with every declaring source", () => {
  const duplicateTask: Entity = { ...task, source: loc("engineering/other.yaml", 9) };
  const graph = new ProjectGraph([task, duplicateTask, requirement], []);
  const duplicates = graph.duplicateIds();
  expect(duplicates.size).toBe(1);
  expect(duplicates.get("TASK-001")).toHaveLength(2);
});

test("entitiesOfType narrows to the requested type", () => {
  const graph = new ProjectGraph([task, requirement], []);
  const tasks = graph.entitiesOfType("task");
  expect(tasks).toHaveLength(1);
  expect(tasks[0]?.id).toBe("TASK-001");
});

test("an unknown id is absent rather than throwing", () => {
  const graph = new ProjectGraph([task], []);
  expect(graph.getEntity("NOPE")).toBeUndefined();
  expect(graph.hasEntity("NOPE")).toBe(false);
});
