import { test, expect } from "bun:test";
import { parseYamlArtifact } from "./yaml-parser.ts";

// AC-003-01
test("recognizes YAML with a supported lengthwise marker and valid content", () => {
  const result = parseYamlArtifact(
    "engineering/requirements.yaml",
    `lengthwise: 1\nentities:\n  - id: REQ-001\n    type: requirement\n`,
  );
  expect(result.recognized).toBe(true);
  if (result.recognized && result.ok) {
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]?.raw.id).toBe("REQ-001");
    expect(result.entities[0]?.location.line).toBe(3);
  } else {
    throw new Error("expected ok result");
  }
});

// AC-003-03
test("ordinary YAML without a lengthwise marker is not recognized", () => {
  const result = parseYamlArtifact("package.yaml", `name: something\nversion: 1\n`);
  expect(result.recognized).toBe(false);
});

// AC-003-04
test("an unsupported lengthwise metadata version is reported, not silently coerced", () => {
  const result = parseYamlArtifact(
    "engineering/future.yaml",
    `lengthwise: 2\nentities:\n  - id: REQ-999\n    type: requirement\n`,
  );
  expect(result.recognized).toBe(true);
  if (result.recognized && !result.ok) {
    expect(result.diagnostics[0]?.code).toBe("artifact/unsupported-version");
  } else {
    throw new Error("expected a failed recognition result");
  }
});

// AC-003-05
test("marked-but-invalid YAML is identified as Lengthwise-owned and reports failure", () => {
  const result = parseYamlArtifact(
    "engineering/broken.yaml",
    `lengthwise: 1\nentities:\n  - type: requirement\n`, // missing id
  );
  expect(result.recognized).toBe(true);
  if (result.recognized && !result.ok) {
    expect(result.diagnostics[0]?.code).toBe("artifact/missing-id");
  } else {
    throw new Error("expected a failed recognition result");
  }
});

test("malformed YAML that carries the marker text is reported rather than ignored", () => {
  const result = parseYamlArtifact(
    "engineering/malformed.yaml",
    `lengthwise: 1\nentities: [unterminated\n`,
  );
  expect(result.recognized).toBe(true);
  if (result.recognized && !result.ok) {
    expect(result.diagnostics[0]?.code).toBe("artifact/invalid-yaml");
  } else {
    throw new Error("expected a failed recognition result");
  }
});

// REQ-006 / AC-006-01, AC-006-03
test("a structured artifact declares multiple independent entities without cross-attribution", () => {
  const result = parseYamlArtifact(
    "engineering/requirements.yaml",
    [
      "lengthwise: 1",
      "entities:",
      "  - id: REQ-001",
      "    type: requirement",
      "    relationships:",
      "      - type: has-acceptance-criterion",
      "        to: AC-001-01",
      "  - id: AC-001-01",
      "    type: acceptance-criterion",
      "",
    ].join("\n"),
  );
  expect(result.recognized).toBe(true);
  if (result.recognized && result.ok) {
    expect(result.entities).toHaveLength(2);
    expect(result.entities[0]?.raw.id).toBe("REQ-001");
    expect(result.entities[1]?.raw.id).toBe("AC-001-01");
    expect(result.entities[1]?.raw.relationships).toBeUndefined();
  } else {
    throw new Error("expected ok result");
  }
});
