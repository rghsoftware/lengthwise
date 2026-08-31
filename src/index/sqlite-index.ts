import { Database } from "bun:sqlite";
import type { Entity } from "../domain/entities.ts";
import type { Relationship } from "../domain/relationships.ts";
import type { ProjectGraph } from "../graph/project-graph.ts";

/** Canonical on-disk location of the disposable index (AC-NFR-006-01). */
export const INDEX_DB_PATH = ".lengthwise/index.db";

const SCHEMA_VERSION = 1;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS entities (
    id TEXT NOT NULL,
    type TEXT NOT NULL,
    lifecycle TEXT NOT NULL,
    artifact_path TEXT NOT NULL,
    line INTEGER,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_entities_id ON entities(id);
  CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
  CREATE TABLE IF NOT EXISTS relationships (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    provenance_kind TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships(from_id);
  CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships(to_id);
`;

/**
 * Open (creating if absent) the disposable SQLite projection and ensure its
 * schema exists. `entities` intentionally has no unique constraint on `id`:
 * duplicate identity is a graph *finding* (`lw check`, AC-004-02), not a
 * storage-layer invariant the index should enforce or lose data over.
 */
export function openIndex(path: string): Database {
  const db = new Database(path, { create: true });
  db.run(SCHEMA);
  return db;
}

/**
 * Replace the index's contents with a snapshot of `graph` (REQ-011). This is
 * a full rebuild, not an incremental sync — the index is disposable and the
 * repository is always the source of truth (DR-002, DR-004).
 */
export function rebuildIndex(db: Database, graph: ProjectGraph): void {
  const rebuild = db.transaction(() => {
    db.run("DELETE FROM entities;");
    db.run("DELETE FROM relationships;");

    const insertEntity = db.prepare(
      "INSERT INTO entities (id, type, lifecycle, artifact_path, line, data) VALUES ($id, $type, $lifecycle, $artifactPath, $line, $data)",
    );
    for (const entity of graph.entities) {
      insertEntity.run({
        $id: entity.id,
        $type: entity.type,
        $lifecycle: entity.lifecycle,
        $artifactPath: entity.source.artifactPath,
        $line: entity.source.line ?? null,
        $data: JSON.stringify(entity),
      });
    }

    const insertRelationship = db.prepare(
      "INSERT INTO relationships (type, from_id, to_id, provenance_kind, data) VALUES ($type, $from, $to, $provenanceKind, $data)",
    );
    for (const relationship of graph.relationships) {
      insertRelationship.run({
        $type: relationship.type,
        $from: relationship.from,
        $to: relationship.to,
        $provenanceKind: relationship.provenance.kind,
        $data: JSON.stringify(relationship),
      });
    }

    const setMeta = db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ($key, $value)");
    setMeta.run({ $key: "schemaVersion", $value: String(SCHEMA_VERSION) });
    setMeta.run({ $key: "rebuiltAt", $value: new Date().toISOString() });
  });
  rebuild();
}

/** Reconstructs the entities stored in the index, for round-trip verification (AC-011-01). */
export function readIndexedEntities(db: Database): Entity[] {
  const rows = db.query("SELECT data FROM entities ORDER BY rowid").all() as { data: string }[];
  return rows.map((row) => JSON.parse(row.data) as Entity);
}

/** Reconstructs the relationships stored in the index, for round-trip verification (AC-011-01). */
export function readIndexedRelationships(db: Database): Relationship[] {
  const rows = db.query("SELECT data FROM relationships ORDER BY seq").all() as {
    data: string;
  }[];
  return rows.map((row) => JSON.parse(row.data) as Relationship);
}
