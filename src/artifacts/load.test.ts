import { test, expect } from "bun:test";
import { loadArtifacts } from "./load.ts";
import { loadProjectConfig } from "../config/load.ts";

// End-to-end sanity check against this repository's own engineering
// artifacts, ahead of full dogfooding in TASK-010.
test("loading this repository's own artifacts recognizes them without diagnostics", async () => {
  const repoRoot = process.cwd();
  const configResult = await loadProjectConfig(repoRoot);
  expect(configResult.ok).toBe(true);
  if (!configResult.ok) return;

  const loaded = await loadArtifacts(repoRoot, configResult.config);

  expect(loaded.diagnostics).toEqual([]);
  const ids = loaded.blocks.map((block) => block.raw.id);
  expect(ids).toContain("REQ-001");
  expect(ids).toContain("F-001");
  expect(ids).toContain("DR-001");
  expect(ids).toContain("TASK-001");
});
