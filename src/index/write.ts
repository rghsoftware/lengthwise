import { dirname } from "node:path";
import type { ProjectGraph } from "../graph/project-graph.ts";
import { INDEX_DB_PATH, openIndex, rebuildIndex } from "./sqlite-index.ts";

/**
 * Rebuild the on-disk disposable index at `.lengthwise/index.db` from a
 * freshly built Project Graph (REQ-011, NFR-006). Safe to call whether or
 * not the file, or its parent directory, currently exists.
 */
export async function writeProjectIndex(repoRoot: string, graph: ProjectGraph): Promise<void> {
  const path = `${repoRoot}/${INDEX_DB_PATH}`;
  await Bun.$`mkdir -p ${dirname(path)}`.quiet();

  const db = openIndex(path);
  try {
    rebuildIndex(db, graph);
  } finally {
    // close(true) after a db.transaction() call spuriously throws "database
    // is locked" in this Bun version; close(false) releases the connection
    // once outstanding statements are finalized/GC'd, which is safe for a
    // short-lived CLI process that exits shortly after anyway.
    db.close(false);
  }
}

/** Deletes the on-disk index, simulating loss/corruption ahead of a rebuild (AC-011-05). */
export async function deleteProjectIndex(repoRoot: string): Promise<void> {
  const path = `${repoRoot}/${INDEX_DB_PATH}`;
  await Bun.$`rm -f ${path} ${path}-wal ${path}-shm ${path}-journal`.quiet();
}
