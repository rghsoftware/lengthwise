import { afterEach, expect, test } from "bun:test";
import { symlink, utimes } from "node:fs/promises";
import { createFixtureRepo, removeFixtureRepo } from "../test-support/fixture-repo.ts";
import { STANDARD_SKILL_IDS } from "./constants.ts";
import { STANDARD_SKILL_CONTRACTS } from "./contracts.ts";
import {
  SKILL_DIGEST_RULE,
  canonicalSkillDigest,
  comparePosixRelativePaths,
  renderedSkillDigest,
} from "./digest.ts";
import { loadCanonicalSkillRegistry } from "./load.ts";
import { assessInstalledSkill } from "./provenance.ts";
import {
  SEMANTIC_ACTION_BINDINGS,
  SKILL_CONTEXT_SLOTS,
  SKILL_ESCALATION_REASONS,
  SKILL_OUTCOME_KINDS,
  SKILL_POST_CHECKS,
  SUPPORTED_WORKFLOW_CONTRACT_VERSIONS,
  type CanonicalSkillFile,
  type CurrentRenderedSkillIdentity,
  type InstalledSkillProvenance,
} from "./types.ts";

const cleanup: string[] = [];
afterEach(async () => {
  while (cleanup.length > 0) await removeFixtureRepo(cleanup.pop()!);
});

function skillFiles(id: (typeof STANDARD_SKILL_IDS)[number]): Record<string, string> {
  const contract = STANDARD_SKILL_CONTRACTS[id];
  const list = (values: readonly string[]) => values.map((value) => `  - ${value}`).join("\n");
  return {
    [`${id}/SKILL.md`]: `---\nname: ${id}\ndescription: Portable methodology for ${id}.\n---\n# ${id}\n\nUse the supplied authority and bounded context.\n\n[Details](references/details.md)\n`,
    [`${id}/lengthwise.yaml`]: `schemaVersion: 1\nskillVersion: 1\nworkflowContractVersion: 1\nbindings:\n${list([contract.semanticAction])}\ncontext:\n  required:\n${contract.requiredContext.map((value) => `    - ${value}`).join("\n")}\n  optional: []\noutcomes:\n${list(contract.requiredOutcomes)}\npostChecks:\n${list(contract.requiredPostChecks)}\nescalations:\n  - locked-decision-conflict\n`,
    [`${id}/references/details.md`]: `# Supporting methodology for ${id}\n`,
  };
}

function standardFiles(): Record<string, string> {
  return Object.assign({}, ...STANDARD_SKILL_IDS.map(skillFiles));
}

async function fixture(files = standardFiles()): Promise<string> {
  const root = await createFixtureRepo(files);
  cleanup.push(root);
  return root;
}

async function overwrite(root: string, relativePath: string, content: string): Promise<void> {
  await Bun.write(`${root}/${relativePath}`, content);
}

async function appendInvalidUtf8(root: string, relativePath: string): Promise<void> {
  const original = new Uint8Array(await Bun.file(`${root}/${relativePath}`).arrayBuffer());
  const corrupted = new Uint8Array(original.byteLength + 1);
  corrupted.set(original);
  corrupted[corrupted.byteLength - 1] = 0xff;
  await Bun.write(`${root}/${relativePath}`, corrupted);
}

function codes(result: Awaited<ReturnType<typeof loadCanonicalSkillRegistry>>): string[] {
  return result.diagnostics.map((item) => item.code);
}

// AC-039-01, AC-039-02, AC-041-01, AC-041-03, AC-NFR-029-01
test("loads exactly the eleven bundled Agent Skills packages from one canonical root", async () => {
  const root = await fixture();
  const result = await loadCanonicalSkillRegistry(root);

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect([...result.registry.skills.keys()].sort()).toEqual([...STANDARD_SKILL_IDS].sort());
  const implementation = result.registry.skills.get("implement-build-contract")!;
  expect(implementation.frontmatter.name).toBe("implement-build-contract");
  expect(implementation.manifest.bindings).toEqual(["implementation-attempt"]);
  expect(implementation.methodology).toContain("Use the supplied authority");
  expect(implementation.files.map((file) => file.path)).toContain("references/details.md");
  expect(implementation.manifest).not.toHaveProperty("description");
  expect(implementation.manifest).not.toHaveProperty("methodology");
});

test("standard skills must satisfy their semantic action task-package contracts", async () => {
  const root = await fixture();
  const path = "implement-build-contract/lengthwise.yaml";
  const manifest = await Bun.file(`${root}/${path}`).text();
  await overwrite(root, path, manifest
    .replace("    - accepted-build-contract\n", "")
    .replace("  - implementation-completion-claim\n", "  - repository-change\n")
    .replace("  - contract-current\n", ""));
  const result = await loadCanonicalSkillRegistry(root);
  expect(codes(result)).toEqual(expect.arrayContaining([
    "skill/action-required-context-missing",
    "skill/action-outcome-missing",
    "skill/action-post-check-missing",
  ]));
});

test("exported canonical validation policy is immutable at runtime", () => {
  expect([
    STANDARD_SKILL_IDS,
    SUPPORTED_WORKFLOW_CONTRACT_VERSIONS,
    SEMANTIC_ACTION_BINDINGS,
    SKILL_CONTEXT_SLOTS,
    SKILL_OUTCOME_KINDS,
    SKILL_POST_CHECKS,
    SKILL_ESCALATION_REASONS,
    STANDARD_SKILL_CONTRACTS,
    ...Object.values(STANDARD_SKILL_CONTRACTS),
    ...Object.values(STANDARD_SKILL_CONTRACTS).flatMap((contract) => [
      contract.requiredContext,
      contract.requiredOutcomes,
      contract.requiredPostChecks,
    ]),
  ].every(Object.isFrozen)).toBe(true);
  expect(() =>
    (STANDARD_SKILL_CONTRACTS["implement-build-contract"].requiredContext as string[]).pop(),
  ).toThrow();
});

// AC-039-03, AC-048-01, AC-048-02, AC-NFR-026-02, AC-NFR-026-03
test("canonical identity is deterministic and covers methodology support files", async () => {
  const encoder = new TextEncoder();
  const files: CanonicalSkillFile[] = [
    { path: "references/detail.md", content: encoder.encode("detail") },
    { path: "SKILL.md", content: encoder.encode("method") },
    { path: "lengthwise.yaml", content: encoder.encode("contract") },
  ];
  const reversed = [...files].reverse();
  const first = canonicalSkillDigest(files);

  expect(canonicalSkillDigest(reversed)).toBe(first);
  expect(canonicalSkillDigest(files.map((file) => ({ ...file, content: file.path === "references/detail.md" ? encoder.encode("changed") : file.content })))).not.toBe(first);
  expect(canonicalSkillDigest([...files, { path: ".lengthwise-provenance.json", content: encoder.encode("self-referential instance data") }])).toBe(first);
  expect(renderedSkillDigest(files)).not.toBe(first);

  const one = await fixture();
  const two = await fixture();
  await utimes(`${two}/capture-feature/SKILL.md`, new Date(1_000), new Date(2_000));
  const [loadedOne, loadedTwo] = await Promise.all([
    loadCanonicalSkillRegistry(one),
    loadCanonicalSkillRegistry(two),
  ]);
  expect(loadedOne.ok && loadedTwo.ok).toBe(true);
  if (loadedOne.ok && loadedTwo.ok) {
    expect(loadedOne.registry.skills.get("capture-feature")!.canonicalDigest).toBe(
      loadedTwo.registry.skills.get("capture-feature")!.canonicalDigest,
    );
  }
});

// AC-048-04, AC-048-05, AC-NFR-026-04
test("canonical path ordering is explicit UTF-8 byte order rather than host collation", () => {
  const paths = ["å.md", "z.md", "ä.md", "a.md"];
  const encoder = new TextEncoder();

  expect(SKILL_DIGEST_RULE).toMatchObject({
    version: 2,
    pathOrder: "ascending-utf8-bytewise-posix-relative-path",
  });
  expect(paths.sort(comparePosixRelativePaths)).toEqual(["a.md", "z.md", "ä.md", "å.md"]);
  expect(canonicalSkillDigest(paths.map((path) => ({ path, content: encoder.encode(path) })))).toBe(
    "sha256:2364c4096c3b2ddb92548bdfe4de25dd181b1468a5d6b0bd6709a20a37097433",
  );
});

// AC-040-01, AC-040-02, AC-NFR-031-01
test("rejects malformed packages, unsupported contracts, and missing support files", async () => {
  const root = await fixture();
  await overwrite(root, "capture-feature/SKILL.md", `---\nname: wrong-id\ndescription: Test.\n---\n[missing](references/nope.md)\n`);
  await overwrite(root, "capture-feature/lengthwise.yaml", `schemaVersion: 99\nskillVersion: 0\nworkflowContractVersion: 99\nbindings:\n  - invented-action\ncontext:\n  required:\n    - invented-context\n  optional: []\noutcomes:\n  - invented-output\npostChecks:\n  - invented-check\nescalations:\n  - invented-escalation\ndescription: duplicated truth\n`);

  const result = await loadCanonicalSkillRegistry(root);
  expect(result.ok).toBe(false);
  expect(codes(result)).toEqual(expect.arrayContaining([
    "skill/name-directory-mismatch",
    "skill/missing-support-file",
    "skill/unsupported-schema-version",
    "skill/invalid-version",
    "skill/unsupported-workflow-contract",
    "skill/unsupported-manifest-value",
    "skill/unsupported-manifest-field",
  ]));
  expect(result.diagnostics.every((item) => item.packagePath.startsWith(root))).toBe(true);
  expect(result.diagnostics.some((item) => item.field === "workflowContractVersion")).toBe(true);
});

// AC-039-03, AC-040-01
test("validates inline and reference-definition support-file links", async () => {
  const files = standardFiles();
  files["capture-feature/SKILL.md"] = `---\nname: capture-feature\ndescription: Test.\n---\n[Inline](references/inline-missing.md)\n\n[Reference][details]\n\n[details]: references/reference-missing.md\n`;
  delete files["capture-feature/references/details.md"];
  const root = await fixture(files);

  const result = await loadCanonicalSkillRegistry(root);
  expect(result.ok).toBe(false);
  expect(result.diagnostics.filter((item) => item.code === "skill/missing-support-file").map((item) => item.message)).toEqual([
    expect.stringContaining("references/inline-missing.md"),
    expect.stringContaining("references/reference-missing.md"),
  ]);
});

// AC-039-03, AC-040-01: support validation follows CommonMark syntax rather than matching link-like text.
test("accepts valid CommonMark destinations and ignores code or escaped examples", async () => {
  const files = standardFiles();
  files["capture-feature/SKILL.md"] = `---
name: capture-feature
description: Test.
---
[Angle URL](<https://example.com/docs>)
[Network URL](//example.com/docs)
[Parenthesized](references/detail(v2).md)
[Spaced][details]

[details]: <references/detail file.md>

\`[Inline code](missing-inline.md)\`
\\[Escaped syntax](missing-escaped.md)

~~~markdown
[Fenced example](missing-fenced.md)
[Reference example]: missing-reference.md
~~~
`;
  delete files["capture-feature/references/details.md"];
  files["capture-feature/references/detail(v2).md"] = "Parenthesized support file.\n";
  files["capture-feature/references/detail file.md"] = "Spaced support file.\n";
  const root = await fixture(files);

  expect(await loadCanonicalSkillRegistry(root)).toMatchObject({ ok: true, diagnostics: [] });
});

// AC-040-01
test("rejects non-UTF-8 canonical text files instead of decoding replacement characters", async () => {
  for (const relativePath of ["capture-feature/SKILL.md", "capture-feature/lengthwise.yaml", "capture-feature/references/details.md"]) {
    const root = await fixture();
    await appendInvalidUtf8(root, relativePath);

    const result = await loadCanonicalSkillRegistry(root);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "skill/invalid-text-encoding",
      field: relativePath.slice("capture-feature/".length),
    }));
  }
});

// AC-040-01
test("reports missing entrypoints and malformed portable frontmatter without constructing a registry", async () => {
  const missingFiles = standardFiles();
  delete missingFiles["capture-feature/SKILL.md"];
  const missing = await fixture(missingFiles);
  expect(codes(await loadCanonicalSkillRegistry(missing))).toContain("skill/missing-entrypoint");

  const noManifestFiles = standardFiles();
  delete noManifestFiles["capture-feature/lengthwise.yaml"];
  const noManifest = await fixture(noManifestFiles);
  expect(codes(await loadCanonicalSkillRegistry(noManifest))).toContain("skill/missing-manifest");

  const malformedFiles = standardFiles();
  malformedFiles["capture-feature/SKILL.md"] = "---\nname: [broken\n---\nMethod\n";
  const malformed = await fixture(malformedFiles);
  expect(codes(await loadCanonicalSkillRegistry(malformed))).toContain("skill/invalid-frontmatter");

  const nonPortableFiles = standardFiles();
  nonPortableFiles["capture-feature/SKILL.md"] = `---\nname: capture-feature\ndescription: Test.\nprovider-only: true\n---\nMethod.\n`;
  delete nonPortableFiles["capture-feature/references/details.md"];
  const nonPortable = await fixture(nonPortableFiles);
  expect(codes(await loadCanonicalSkillRegistry(nonPortable))).toContain("skill/unsupported-frontmatter");
});

// AC-040-01, AC-040-03, AC-NFR-026-01
test("enforces the bundled registry inventory and unique semantic ownership", async () => {
  const missing = await fixture(Object.fromEntries(Object.entries(standardFiles()).filter(([path]) => !path.startsWith("capture-feature/"))));
  expect(codes(await loadCanonicalSkillRegistry(missing))).toContain("skill/missing-standard-skill");

  const extraFiles = standardFiles();
  Object.assign(extraFiles, {
    "local-override/SKILL.md": "---\nname: local-override\ndescription: Not bundled.\n---\nNo.\n",
    "local-override/lengthwise.yaml": "schemaVersion: 1\n",
  });
  const extra = await fixture(extraFiles);
  expect(codes(await loadCanonicalSkillRegistry(extra))).toContain("skill/unexpected-skill");

  const duplicate = await fixture();
  const manifest = await Bun.file(`${duplicate}/specify-feature/lengthwise.yaml`).text();
  await overwrite(duplicate, "specify-feature/lengthwise.yaml", manifest.replace("specify-feature", "capture-feature"));
  expect(codes(await loadCanonicalSkillRegistry(duplicate))).toContain("skill/duplicate-binding");

  const duplicateId = await fixture();
  await overwrite(
    duplicateId,
    "specify-feature/SKILL.md",
    `---\nname: capture-feature\ndescription: Duplicate identity.\n---\nMethod.\n`,
  );
  const duplicateIdResult = await loadCanonicalSkillRegistry(duplicateId);
  expect(codes(duplicateIdResult)).toEqual(expect.arrayContaining(["skill/duplicate-id", "skill/name-directory-mismatch"]));
});

// AC-040-01, AC-NFR-026-01
test("rejects package path escapes, symlinks, and canonical provenance sidecars", async () => {
  const root = await fixture();
  await overwrite(root, "capture-feature/SKILL.md", `---
name: capture-feature
description: Test.
---
[parent escape](../outside.md)
[encoded escape](%2e%2e/outside.md)
[Windows absolute](C:/outside.md)
[encoded Windows absolute](C%3A/outside.md)
[file URI](file:///outside.md)
`);
  await overwrite(root, "capture-feature/.lengthwise-provenance.json", "{}\n");
  await overwrite(root, "outside.md", "outside\n");
  await symlink(`${root}/outside.md`, `${root}/capture-feature/references/link.md`);

  const result = await loadCanonicalSkillRegistry(root);
  expect(codes(result)).toEqual(expect.arrayContaining([
    "skill/support-path-escape",
    "skill/symlink-unsupported",
    "skill/reserved-provenance-file",
  ]));
  expect(result.diagnostics.filter((item) => item.code === "skill/support-path-escape")).toHaveLength(5);
});

const installed: InstalledSkillProvenance = {
  provenanceSchemaVersion: 1,
  digestRuleVersion: 2,
  canonicalSkillId: "specify-feature",
  canonicalSkillVersion: 3,
  workflowContractVersion: 1,
  canonicalDigest: "sha256:canonical",
  provider: "codex",
  rendererVersion: "codex-renderer@2",
  renderedDigest: "sha256:rendered",
  scope: "project",
  installedAt: "2026-09-02T00:00:00.000Z",
  destination: "/project/.codex/skills/specify-feature",
};
const current: CurrentRenderedSkillIdentity = {
  canonicalSkillId: installed.canonicalSkillId,
  canonicalSkillVersion: installed.canonicalSkillVersion,
  workflowContractVersion: installed.workflowContractVersion,
  canonicalDigest: installed.canonicalDigest,
  provider: installed.provider,
  rendererVersion: installed.rendererVersion,
  renderedDigest: installed.renderedDigest,
};

// AC-048-01 through AC-048-05, AC-NFR-031-02
test("distinguishes installation modification, canonical staleness, renderer staleness, and incompatibility", () => {
  expect(assessInstalledSkill(installed, current, installed.renderedDigest).status).toBe("current");
  expect(assessInstalledSkill(installed, current, "sha256:manual-edit").status).toBe("modified");
  expect(assessInstalledSkill(installed, { ...current, canonicalDigest: "sha256:new-method" }, installed.renderedDigest).status).toBe("stale-canonical");
  expect(assessInstalledSkill(installed, { ...current, rendererVersion: "codex-renderer@3", renderedDigest: "sha256:new-render" }, installed.renderedDigest).status).toBe("stale-renderer");
  expect(assessInstalledSkill(installed, { ...current, provider: "claude" }, installed.renderedDigest).status).toBe("incompatible");
  expect(assessInstalledSkill({ ...installed, workflowContractVersion: 99 }, current, installed.renderedDigest).status).toBe("incompatible");
  expect(assessInstalledSkill({ ...installed, digestRuleVersion: 1 }, current, installed.renderedDigest).status).toBe("incompatible");

  const otherInstance = { ...installed, installedAt: "2030-01-01T00:00:00.000Z", destination: "/other/place" };
  expect(assessInstalledSkill(otherInstance, current, installed.renderedDigest).status).toBe("current");
});

// AC-040-02, AC-NFR-029-02: structural validation deliberately does not certify prose quality.
test("does not claim that structurally valid methodology is engineering-effective", async () => {
  const files = standardFiles();
  files["capture-feature/SKILL.md"] = `---\nname: capture-feature\ndescription: Structurally valid.\n---\nBananas are purple.\n`;
  delete files["capture-feature/references/details.md"];
  const root = await fixture(files);
  const result = await loadCanonicalSkillRegistry(root);

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.registry.skills.get("capture-feature")!.methodology).toContain("Bananas");
    expect(result.registry.skills.get("capture-feature")).not.toHaveProperty("methodologyVerified");
  }
});
