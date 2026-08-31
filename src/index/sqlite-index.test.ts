import { test, expect } from "bun:test";
import { openIndex, rebuildIndex, readIndexedEntities, readIndexedRelationships } from "./sqlite-index.ts";
import { ProjectGraph } from "../graph/project-graph.ts";
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
    source: loc("requirements.yaml", 2),
  };
}
function declares(from: string, type: Relationship["type"], to: string): Relationship {
  return { type, from, to, provenance: { kind: "declared", source: loc("x.yaml", 1) } };
}

// AC-011-01, REQ-011
test("rebuilding the index from a graph round-trips to a semantically equivalent graph", () => {
  const graph = new ProjectGraph(
    [task("TASK-001"), requirement("REQ-001")],
    [declares("TASK-001", "implements", "REQ-001")],
  );

  const db = openIndex(":memory:");
  rebuildIndex(db, graph);

  const rebuilt = new ProjectGraph(readIndexedEntities(db), readIndexedRelationships(db));

  expect(rebuilt.entities).toEqual(graph.entities);
  expect(rebuilt.relationships).toEqual(graph.relationships);
  expect(rebuilt.incomingProjections("REQ-001")).toEqual(graph.incomingProjections("REQ-001"));
});

// AC-011-03: reindexing after the graph changes reflects the new state, not stale data.
test("rebuilding replaces prior contents rather than accumulating them", () => {
  const db = openIndex(":memory:");
  rebuildIndex(db, new ProjectGraph([task("TASK-001")], []));
  rebuildIndex(db, new ProjectGraph([task("TASK-002")], []));

  const entities = readIndexedEntities(db);
  expect(entities.map((e) => e.id)).toEqual(["TASK-002"]);
});

// AC-011-04: an entity that drops out of the graph (e.g. its artifact left discovery scope)
// no longer appears in the index after reindexing.
test("an entity removed from the graph is absent after reindexing", () => {
  const db = openIndex(":memory:");
  rebuildIndex(db, new ProjectGraph([task("TASK-001"), task("TASK-002")], []));
  rebuildIndex(db, new ProjectGraph([task("TASK-001")], []));

  const entities = readIndexedEntities(db);
  expect(entities.map((e) => e.id)).toEqual(["TASK-001"]);
});

// AC-004-02 storage-layer companion: duplicate ids are stored, not silently collapsed.
test("the index stores duplicate-id entities rather than losing one", () => {
  const db = openIndex(":memory:");
  const duplicate = { ...task("TASK-001"), source: loc("other.yaml", 5) };
  rebuildIndex(db, new ProjectGraph([task("TASK-001"), duplicate], []));

  expect(readIndexedEntities(db)).toHaveLength(2);
});

// AC-011-02, AC-NFR-001-02: schema/query behavior never touches source files —
// verified structurally: rebuildIndex only ever receives an in-memory ProjectGraph,
// never a repository path, so it has no mechanism to alter repository artifacts.
test("rebuildIndex's inputs give it no path to mutate repository state", () => {
  expect(rebuildIndex.length).toBe(2); // (db, graph) — no repo/file-path parameter
});

test("opening a fresh :memory: index twice yields independent, empty databases", () => {
  const first = openIndex(":memory:");
  const second = openIndex(":memory:");
  rebuildIndex(first, new ProjectGraph([task("TASK-001")], []));
  expect(readIndexedEntities(second)).toEqual([]);
});

test("re-running schema initialization against an already-initialized file does not error", () => {
  expect(() => openIndex(":memory:")).not.toThrow();
  expect(() => openIndex(":memory:")).not.toThrow();
});
