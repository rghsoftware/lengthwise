import { test, expect } from "bun:test";
import { normalizeEntities } from "./normalize.ts";
import type { ParsedEntityBlock } from "../artifacts/parse-result.ts";

function block(path: string, raw: Record<string, unknown>, line = 1): ParsedEntityBlock {
  return { raw, location: { artifactPath: path, line } };
}

// AC-004-01, AC-005-01
test("a valid raw block normalizes to a typed entity addressable by id", () => {
  const result = normalizeEntities([
    block("engineering/requirements.yaml", {
      id: "REQ-001",
      type: "requirement",
      lifecycle: "accepted",
      title: "Project configuration",
      statement: "Lengthwise shall load project configuration.",
    }),
  ]);

  expect(result.diagnostics).toEqual([]);
  expect(result.entities).toHaveLength(1);
  expect(result.entities[0]).toMatchObject({ id: "REQ-001", type: "requirement" });
});

// AC-004-03, AC-004-04: identity/semantics are independent of containing artifact location.
test("the same entity content normalizes identically regardless of source path", () => {
  const fields = {
    id: "DR-001",
    type: "decision",
    lifecycle: "accepted",
    title: "Repository artifacts are authoritative",
    decision: "Git-tracked repository artifacts are the authoritative engineering truth.",
  };
  const a = normalizeEntities([block("engineering/decisions.yaml", fields)]);
  const b = normalizeEntities([block("engineering/moved/decisions.yaml", fields)]);

  expect(a.entities[0]?.id).toBe(b.entities[0]?.id);
  expect(a.entities[0]?.type).toBe(b.entities[0]?.type);
  expect((a.entities[0] as any).decision).toBe((b.entities[0] as any).decision);
});

// AC-005-02
test("an entity with an unsupported type is reported and excluded", () => {
  const result = normalizeEntities([
    block("engineering/mystery.yaml", { id: "X-001", type: "widget" }),
  ]);

  expect(result.entities).toEqual([]);
  expect(result.diagnostics[0]?.code).toBe("entity/unsupported-type");
  expect(result.diagnostics[0]?.entityId).toBe("X-001");
});

// AC-005-03
test("an entity violating its type's structural constraint is reported and excluded", () => {
  const result = normalizeEntities([
    block("engineering/requirements.yaml", {
      id: "REQ-002",
      type: "requirement",
      lifecycle: "accepted",
      title: "Missing statement",
      // statement omitted — violates the required-field constraint
    }),
  ]);

  expect(result.entities).toEqual([]);
  expect(result.diagnostics[0]?.code).toBe("entity/invalid");
  expect(result.diagnostics[0]?.entityId).toBe("REQ-002");
});

// AC-006-01, AC-006-02, AC-006-03
test("a multi-entity block normalizes each entity independently with relationships attributed correctly", () => {
  const result = normalizeEntities([
    block("engineering/requirements.yaml", {
      id: "REQ-001",
      type: "requirement",
      lifecycle: "accepted",
      title: "Project configuration",
      statement: "Lengthwise shall load project configuration.",
      relationships: [{ type: "has-acceptance-criterion", to: "AC-001-01" }],
    }),
    block(
      "engineering/requirements.yaml",
      { id: "AC-001-01", type: "acceptance-criterion", lifecycle: "accepted", statement: "..." },
      2,
    ),
  ]);

  expect(result.diagnostics).toEqual([]);
  expect(result.entities.map((e) => e.id)).toEqual(["REQ-001", "AC-001-01"]);
  expect(result.relationships).toHaveLength(1);
  expect(result.relationships[0]).toMatchObject({
    type: "has-acceptance-criterion",
    from: "REQ-001",
    to: "AC-001-01",
  });
  // The AC entity carries no relationships of its own — not attributed to it.
});

// REQ-008, AC-008-01, AC-008-02: declared relationships carry declared provenance with source.
test("authored relationships normalize with declared provenance and source location", () => {
  const result = normalizeEntities([
    block(
      "engineering/features/project-graph/tasks.yaml",
      {
        id: "TASK-001",
        type: "task",
        lifecycle: "planned",
        title: "Define domain types",
        relationships: [{ type: "implements", to: "REQ-004" }],
      },
      3,
    ),
  ]);

  expect(result.relationships[0]?.provenance).toEqual({
    kind: "declared",
    source: { artifactPath: "engineering/features/project-graph/tasks.yaml", line: 3 },
  });
});

test("an unsupported relationship type is reported rather than silently dropped", () => {
  const result = normalizeEntities([
    block("engineering/tasks.yaml", {
      id: "TASK-001",
      type: "task",
      lifecycle: "planned",
      title: "Define domain types",
      relationships: [{ type: "bogus-verb", to: "REQ-004" }],
    }),
  ]);

  expect(result.entities).toHaveLength(1);
  expect(result.relationships).toEqual([]);
  expect(result.diagnostics[0]?.code).toBe("relationship/unsupported-type");
});

// NFR-003 / AC-NFR-003-01
test("normalizing identical input twice produces semantically equivalent output", () => {
  const blocks = [
    block("engineering/tasks.yaml", {
      id: "TASK-001",
      type: "task",
      lifecycle: "planned",
      title: "Define domain types",
      relationships: [{ type: "implements", to: "REQ-004" }],
    }),
  ];

  const first = normalizeEntities(blocks);
  const second = normalizeEntities(blocks);

  expect(first).toEqual(second);
});
