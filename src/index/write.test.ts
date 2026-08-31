import { test, expect, afterEach } from "bun:test";
import { writeProjectIndex, deleteProjectIndex } from "./write.ts";
import { openIndex, readIndexedEntities, INDEX_DB_PATH } from "./sqlite-index.ts";
import { ProjectGraph } from "../graph/project-graph.ts";
import { createFixtureRepo, removeFixtureRepo } from "../test-support/fixture-repo.ts";
import type { Entity } from "../domain/entities.ts";

const cleanup: string[] = [];
afterEach(async () => {
  while (cleanup.length > 0) await removeFixtureRepo(cleanup.pop()!);
});

function task(id: string): Entity {
  return {
    id,
    type: "task",
    lifecycle: "planned",
    title: id,
    source: { artifactPath: "tasks.yaml", line: 1 },
  };
}

// AC-NFR-006-01, AC-011-05: usable after the index is deleted and rebuilt.
test("the project remains usable after the index file is deleted and rebuilt", async () => {
  const root = await createFixtureRepo({ "README.md": "placeholder" });
  cleanup.push(root);

  const graph = new ProjectGraph([task("TASK-001")], []);
  await writeProjectIndex(root, graph);
  expect(await Bun.file(`${root}/${INDEX_DB_PATH}`).exists()).toBe(true);

  await deleteProjectIndex(root);
  expect(await Bun.file(`${root}/${INDEX_DB_PATH}`).exists()).toBe(false);

  // AC-011-05 / AC-NFR-006-02: rebuild requires no manual recreation of
  // authoritative information — the same in-memory graph rebuilds it directly.
  await writeProjectIndex(root, graph);
  const db = openIndex(`${root}/${INDEX_DB_PATH}`);
  expect(readIndexedEntities(db).map((e) => e.id)).toEqual(["TASK-001"]);
});

test("writing the index creates the .lengthwise directory when absent", async () => {
  const root = await createFixtureRepo({ "README.md": "placeholder" });
  cleanup.push(root);

  await writeProjectIndex(root, new ProjectGraph([task("TASK-001")], []));

  expect(await Bun.file(`${root}/${INDEX_DB_PATH}`).exists()).toBe(true);
});
