import { test, expect } from "bun:test";
import typia from "typia";
import type { RequirementEntity, TaskEntity } from "./entities.ts";
import { isKnownEntityType } from "./entities.ts";
import {
  inverseLabelOf,
  isKnownRelationshipType,
  isRelationshipAllowed,
  RELATIONSHIP_TYPES,
} from "./relationships.ts";
import { isAuthoritative } from "./provenance.ts";

test("known entity types round-trip", () => {
  expect(isKnownEntityType("task")).toBe(true);
  expect(isKnownEntityType("nonsense")).toBe(false);
});

// AC-008-04: non-authoritative provenance cannot satisfy checks requiring authoritative evidence.
test("declared and derived provenance are authoritative; observed and inferred are not", () => {
  expect(isAuthoritative({ kind: "declared", source: { artifactPath: "x.yaml" } })).toBe(true);
  expect(isAuthoritative({ kind: "derived", explanation: "..." })).toBe(true);
  expect(isAuthoritative({ kind: "observed", explanation: "..." })).toBe(false);
  expect(isAuthoritative({ kind: "inferred", explanation: "..." })).toBe(false);
});

test("relationship registry allows implements task->requirement only", () => {
  expect(isRelationshipAllowed("implements", "task", "requirement")).toBe(true);
  expect(isRelationshipAllowed("implements", "task", "non-functional-requirement")).toBe(true);
  expect(isRelationshipAllowed("implements", "decision", "requirement")).toBe(false);
  expect(isRelationshipAllowed("implements", "task", "task")).toBe(false);
});

test("depends-on is task-to-task only", () => {
  expect(isRelationshipAllowed("depends-on", "task", "task")).toBe(true);
  expect(isRelationshipAllowed("depends-on", "task", "requirement")).toBe(false);
});

test("supersedes requires matching source/target type", () => {
  expect(isRelationshipAllowed("supersedes", "decision", "decision")).toBe(true);
  expect(isRelationshipAllowed("supersedes", "decision", "requirement")).toBe(false);
});

test("inverse label projection for implements", () => {
  expect(inverseLabelOf("implements")).toBe("implemented-by");
});

test("all vocabulary relationship types are registered and recognized", () => {
  for (const type of RELATIONSHIP_TYPES) {
    expect(isKnownRelationshipType(type)).toBe(true);
  }
  expect(isKnownRelationshipType("bogus")).toBe(false);
});

test("typia validates a well-formed requirement entity", () => {
  const validate = typia.createValidate<RequirementEntity>();
  const result = validate({
    id: "REQ-001",
    type: "requirement",
    lifecycle: "accepted",
    source: { artifactPath: "engineering/requirements.yaml", line: 3 },
    title: "Project configuration",
    statement: "Lengthwise shall load project configuration.",
  });
  expect(result.success).toBe(true);
});

test("typia rejects a requirement entity with an empty statement", () => {
  const validate = typia.createValidate<RequirementEntity>();
  const result = validate({
    id: "REQ-001",
    type: "requirement",
    lifecycle: "accepted",
    source: { artifactPath: "engineering/requirements.yaml" },
    title: "Project configuration",
    statement: "",
  });
  expect(result.success).toBe(false);
});

test("typia rejects an entity with an unsupported lifecycle value for its type", () => {
  const validate = typia.createValidate<TaskEntity>();
  const result = validate({
    id: "TASK-001",
    type: "task",
    lifecycle: "ready",
    source: { artifactPath: "engineering/features/project-graph/tasks.yaml" },
    title: "Define domain types",
  });
  expect(result.success).toBe(false);
});
