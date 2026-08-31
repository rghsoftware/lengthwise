import { test, expect } from "bun:test";
import { ProjectGraph } from "./project-graph.ts";
import { deriveTaskReadiness } from "./readiness.ts";
import type { Entity, TaskEntity } from "../domain/entities.ts";
import type { Relationship } from "../domain/relationships.ts";

const loc = (artifactPath: string, line: number) => ({ artifactPath, line });

function task(id: string, lifecycle: TaskEntity["lifecycle"] = "planned"): Entity {
  return { id, type: "task", lifecycle, title: id, source: loc("tasks.yaml", 1) };
}
function declares(from: string, type: Relationship["type"], to: string): Relationship {
  return { type, from, to, provenance: { kind: "declared", source: loc("x.yaml", 1) } };
}

// AC-012-05
test("a task with no dependencies is ready", () => {
  const graph = new ProjectGraph([task("TASK-001")], []);
  const [readiness] = deriveTaskReadiness(graph);
  expect(readiness).toMatchObject({ ready: true, blockedBy: [] });
});

test("a task depending on an incomplete task is blocked", () => {
  const graph = new ProjectGraph(
    [task("TASK-001"), task("TASK-002", "planned")],
    [declares("TASK-001", "depends-on", "TASK-002")],
  );
  const [readiness] = deriveTaskReadiness(graph);
  expect(readiness?.ready).toBe(false);
  expect(readiness?.blockedBy).toEqual(["TASK-002"]);
});

test("a task depending on a done task is ready", () => {
  const graph = new ProjectGraph(
    [task("TASK-001"), task("TASK-002", "done")],
    [declares("TASK-001", "depends-on", "TASK-002")],
  );
  const [readiness] = deriveTaskReadiness(graph);
  expect(readiness?.ready).toBe(true);
});

// TASK-009 LOCKED: readiness derives from dependencies, not a persisted "ready" lifecycle —
// in-progress/done/cancelled tasks are not readiness candidates at all.
test("only planned tasks are considered for readiness", () => {
  const graph = new ProjectGraph(
    [task("TASK-001", "in-progress"), task("TASK-002", "done"), task("TASK-003", "cancelled")],
    [],
  );
  expect(deriveTaskReadiness(graph)).toEqual([]);
});
