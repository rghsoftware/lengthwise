import { Database } from "bun:sqlite";

export type RunState = "running" | "waiting-human" | "waiting-implementation" | "cancelled" | "complete";
export interface WorkflowRun { id: string; featureId: string; activity: string; state: RunState; createdAt: string; updatedAt: string }
export interface WorkflowEvent { id: string; runId: string; kind: string; contextFingerprint?: string; payload: unknown; createdAt: string }

export class WorkflowStateStore {
  private db: Database;
  constructor(path: string) {
    this.db = new Database(path, { create: true });
    this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS schema_version(version INTEGER NOT NULL);
      INSERT INTO schema_version SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM schema_version);
      CREATE TABLE IF NOT EXISTS workflow_runs(id TEXT PRIMARY KEY, feature_id TEXT NOT NULL, activity TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_run_per_feature ON workflow_runs(feature_id) WHERE state NOT IN ('cancelled','complete');
      CREATE TABLE IF NOT EXISTS workflow_events(id TEXT PRIMARY KEY, run_id TEXT NOT NULL, kind TEXT NOT NULL, context_fingerprint TEXT, payload TEXT NOT NULL, created_at TEXT NOT NULL);`);
  }
  start(featureId: string, activity = "capture"): WorkflowRun {
    const now = new Date().toISOString(); const run: WorkflowRun = { id: crypto.randomUUID(), featureId, activity, state: "running", createdAt: now, updatedAt: now };
    this.db.query("INSERT INTO workflow_runs VALUES (?,?,?,?,?,?)").run(run.id, featureId, activity, run.state, now, now); return run;
  }
  active(featureId: string): WorkflowRun | undefined {
    const r = this.db.query("SELECT id,feature_id featureId,activity,state,created_at createdAt,updated_at updatedAt FROM workflow_runs WHERE feature_id=? AND state NOT IN ('cancelled','complete')").get(featureId) as WorkflowRun | null; return r ?? undefined;
  }
  get(id: string): WorkflowRun | undefined { return (this.db.query("SELECT id,feature_id featureId,activity,state,created_at createdAt,updated_at updatedAt FROM workflow_runs WHERE id=?").get(id) as WorkflowRun | null) ?? undefined; }
  update(id: string, activity: string, state: RunState): WorkflowRun {
    const now = new Date().toISOString(); this.db.query("UPDATE workflow_runs SET activity=?,state=?,updated_at=? WHERE id=?").run(activity, state, now, id);
    const run = this.get(id); if (!run) throw new Error(`Unknown workflow run ${id}`); return run;
  }
  history(featureId: string): WorkflowRun[] { return this.db.query("SELECT id,feature_id featureId,activity,state,created_at createdAt,updated_at updatedAt FROM workflow_runs WHERE feature_id=? ORDER BY created_at,id").all(featureId) as WorkflowRun[]; }
  event(runId: string, kind: string, payload: unknown, fingerprint?: string, id: string = crypto.randomUUID()) { this.db.query("INSERT OR IGNORE INTO workflow_events VALUES (?,?,?,?,?,?)").run(id, runId, kind, fingerprint ?? null, JSON.stringify(payload), new Date().toISOString()); }
  events(runId: string): WorkflowEvent[] { return (this.db.query("SELECT id,run_id runId,kind,context_fingerprint contextFingerprint,payload,created_at createdAt FROM workflow_events WHERE run_id=? ORDER BY created_at,id").all(runId) as Array<Omit<WorkflowEvent,"payload"> & {payload:string}>).map(e => ({...e, payload: JSON.parse(e.payload)})); }
  close() { this.db.close(); }
}
