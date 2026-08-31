import { test, expect } from "bun:test";
import { buildProjectGraph } from "../graph/build.ts";
import { loadProjectConfig } from "../config/load.ts";
import { runChecks } from "./run.ts";

// AC-009-04 / AC-NFR-003-02: dogfooding this repository's own artifacts —
// checks should be clean and repeatable.
test("this repository's own engineering artifacts pass all checks cleanly and deterministically", async () => {
  const repoRoot = process.cwd();
  const configResult = await loadProjectConfig(repoRoot);
  const graphResult = await buildProjectGraph(repoRoot);
  expect(configResult.ok).toBe(true);
  expect(graphResult.ok).toBe(true);
  if (!configResult.ok || !graphResult.ok) return;

  const first = runChecks(graphResult.graph, configResult.config);
  const second = runChecks(graphResult.graph, configResult.config);

  expect(first).toEqual([]);
  expect(second).toEqual(first);
});
