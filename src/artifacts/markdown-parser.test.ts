import { test, expect } from "bun:test";
import { parseMarkdownArtifact } from "./markdown-parser.ts";

const DOC = `---
lengthwise: 1
id: DOC-PRINCIPLES
type: document
lifecycle: accepted
---

# Lengthwise Engineering Principles

Some narrative content.
`;

// AC-003-02
test("recognizes Markdown with frontmatter carrying a supported lengthwise marker", () => {
  const result = parseMarkdownArtifact("engineering/principles.md", DOC);
  expect(result.recognized).toBe(true);
  if (result.recognized && result.ok) {
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]?.raw.id).toBe("DOC-PRINCIPLES");
    expect(result.entities[0]?.raw.type).toBe("document");
    expect(result.entities[0]?.raw.body).toContain("Lengthwise Engineering Principles");
    expect(result.entities[0]?.location.line).toBe(3);
  } else {
    throw new Error("expected ok result");
  }
});

// AC-003-03
test("Markdown without frontmatter is not recognized", () => {
  const result = parseMarkdownArtifact("README.md", "# Just a readme\n\nNothing special.\n");
  expect(result.recognized).toBe(false);
});

test("Markdown with frontmatter but no lengthwise marker is not recognized", () => {
  const result = parseMarkdownArtifact(
    "docs/adr-0001.md",
    "---\ntitle: Some ADR\ndate: 2026-01-01\n---\n\nBody.\n",
  );
  expect(result.recognized).toBe(false);
});

// AC-003-04
test("an unsupported lengthwise metadata version is reported", () => {
  const result = parseMarkdownArtifact(
    "engineering/future.md",
    "---\nlengthwise: 2\nid: DOC-FUTURE\ntype: document\n---\nBody.\n",
  );
  expect(result.recognized).toBe(true);
  if (result.recognized && !result.ok) {
    expect(result.diagnostics[0]?.code).toBe("artifact/unsupported-version");
  } else {
    throw new Error("expected a failed recognition result");
  }
});

// AC-003-05
test("marked-but-invalid frontmatter is identified as Lengthwise-owned and reports failure", () => {
  const result = parseMarkdownArtifact(
    "engineering/broken.md",
    "---\nlengthwise: 1\ntype: document\n---\nBody.\n", // missing id
  );
  expect(result.recognized).toBe(true);
  if (result.recognized && !result.ok) {
    expect(result.diagnostics[0]?.code).toBe("artifact/missing-id");
  } else {
    throw new Error("expected a failed recognition result");
  }
});

// TASK-004 LOCKED: decision entities do not require ADR-specific headings.
test("a decision-typed Markdown artifact needs no ADR heading structure", () => {
  const result = parseMarkdownArtifact(
    "engineering/decisions/dr-099.md",
    "---\nlengthwise: 1\nid: DR-099\ntype: decision\nlifecycle: accepted\n---\n\nJust prose, no ## Context / ## Decision headings.\n",
  );
  expect(result.recognized).toBe(true);
  if (result.recognized && result.ok) {
    expect(result.entities[0]?.raw.type).toBe("decision");
  } else {
    throw new Error("expected ok result");
  }
});

// AC-NFR-002-02
test("an existing compatible document becomes recognized by adding minimal metadata alone", () => {
  const preexisting = "# Existing Narrative Doc\n\nUnchanged prose body, never rewritten.\n";
  const adopted = `---\nlengthwise: 1\nid: DOC-ADOPTED\ntype: document\nlifecycle: accepted\n---\n\n${preexisting}`;
  const result = parseMarkdownArtifact("docs/adopted.md", adopted);
  expect(result.recognized).toBe(true);
  if (result.recognized && result.ok) {
    expect(result.entities[0]?.raw.body).toBe(preexisting.trim());
  } else {
    throw new Error("expected ok result");
  }
});
