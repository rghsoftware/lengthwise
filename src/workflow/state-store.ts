import { Database } from "bun:sqlite";

export const WORKFLOW_ACTIVITIES = ["capture", "specify", "plan", "implement", "verify", "reconcile", "complete"] as const;
export type WorkflowActivity = (typeof WORKFLOW_ACTIVITIES)[number];
export type RunState = "running" | "waiting-human" | "waiting-implementation" | "interrupted" | "cancelled" | "complete";
export type AttemptState = "running" | "interrupted" | "failed" | "succeeded";
export interface WorkflowRun { id: string; featureId: string; activity: WorkflowActivity; state: RunState; createdAt: string; updatedAt: string }
export interface WorkflowEvent { id: string; runId: string; kind: string; contextFingerprint?: string; payload: unknown; createdAt: string }
export interface WorkflowAttempt { id: string; runId: string; actionId: string; idempotencyKey: string; state: AttemptState; repositoryFingerprint?: string; result?: unknown; createdAt: string; updatedAt: string }
export interface ReconciliationBaseline { runId: string; fingerprint: string; assessment: unknown; createdAt: string }

const CURRENT_SCHEMA_VERSION = 3;
const ACTIVITY_TRANSITIONS:Record<WorkflowActivity,readonly WorkflowActivity[]>={capture:["specify"],specify:["plan","reconcile"],plan:["specify","implement","reconcile"],implement:["verify","reconcile"],verify:["implement","reconcile"],reconcile:["specify","plan","implement","verify","complete"],complete:[]};
function assertActivity(value: string): asserts value is WorkflowActivity {
  if (!(WORKFLOW_ACTIVITIES as readonly string[]).includes(value)) throw new Error(`Unsupported workflow activity ${JSON.stringify(value)}`);
}

export class WorkflowStateStore {
  private db: Database;
  constructor(path: string) { this.db = new Database(path, { create: true }); this.migrate(); }
  private migrate(): void {
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;");
    if (!this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'").get()) {
      this.db.transaction(() => { this.db.exec("CREATE TABLE schema_version(version INTEGER NOT NULL); INSERT INTO schema_version VALUES (0);"); })();
    }
    const version = Number((this.db.query("SELECT version FROM schema_version LIMIT 1").get() as { version: number } | null)?.version ?? 0);
    if (!Number.isInteger(version) || version < 0 || version > CURRENT_SCHEMA_VERSION) throw new Error(`Unsupported workflow state schema version ${version}; supported versions are 0-${CURRENT_SCHEMA_VERSION}. Restore a compatible state.db backup or upgrade Lengthwise.`);
    try {
      this.db.transaction(() => {
        let next = version;
        if (next === 0) {
          this.db.exec(`CREATE TABLE workflow_runs(id TEXT PRIMARY KEY, feature_id TEXT NOT NULL, activity TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
            CREATE UNIQUE INDEX one_active_run_per_feature ON workflow_runs(feature_id) WHERE state NOT IN ('cancelled','complete');
            CREATE TABLE workflow_events(id TEXT PRIMARY KEY, run_id TEXT NOT NULL, kind TEXT NOT NULL, context_fingerprint TEXT, payload TEXT NOT NULL, created_at TEXT NOT NULL);`);
          next = 1;
        }
        if (next === 1) {
          this.db.exec(`CREATE TABLE workflow_attempts(id TEXT PRIMARY KEY, run_id TEXT NOT NULL, action_id TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, state TEXT NOT NULL, repository_fingerprint TEXT, result TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE workflow_waits(id TEXT PRIMARY KEY, run_id TEXT NOT NULL, kind TEXT NOT NULL, target_id TEXT, state TEXT NOT NULL, created_at TEXT NOT NULL, resolved_at TEXT);
            CREATE TABLE reconciliation_baselines(id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, fingerprint TEXT NOT NULL, assessment TEXT NOT NULL, created_at TEXT NOT NULL);`);
          this.db.exec("UPDATE workflow_runs SET activity='plan' WHERE activity='planning'; UPDATE workflow_runs SET activity='implement' WHERE activity='implementation';");
          next = 2;
        }
        if(next===2){
          this.db.exec(`CREATE TABLE workflow_attempts_v3(id TEXT PRIMARY KEY, run_id TEXT NOT NULL, action_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, state TEXT NOT NULL, repository_fingerprint TEXT, result TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(run_id,action_id,idempotency_key));
            INSERT INTO workflow_attempts_v3 SELECT * FROM workflow_attempts;
            DROP TABLE workflow_attempts;
            ALTER TABLE workflow_attempts_v3 RENAME TO workflow_attempts;`);
          next=3;
        }
        this.db.query("UPDATE schema_version SET version=?").run(next);
      })();
    } catch (error) { throw new Error(`Workflow state migration from schema ${version} failed and was rolled back: ${(error as Error).message}`); }
  }
  schemaVersion(): number { return Number((this.db.query("SELECT version FROM schema_version LIMIT 1").get() as {version:number}).version); }
  start(featureId: string, activity: WorkflowActivity = "capture"): WorkflowRun {
    assertActivity(activity); const existing = this.active(featureId); if (existing) throw new Error(`Feature ${featureId} already has non-terminal workflow run ${existing.id}`);
    const now = new Date().toISOString(); const run: WorkflowRun = { id: crypto.randomUUID(), featureId, activity, state: "running", createdAt: now, updatedAt: now };
    this.db.query("INSERT INTO workflow_runs VALUES (?,?,?,?,?,?)").run(run.id, featureId, activity, run.state, now, now); return run;
  }
  active(featureId: string): WorkflowRun | undefined { return (this.db.query("SELECT id,feature_id featureId,activity,state,created_at createdAt,updated_at updatedAt FROM workflow_runs WHERE feature_id=? AND state NOT IN ('cancelled','complete')").get(featureId) as WorkflowRun | null) ?? undefined; }
  activeRuns(): WorkflowRun[] { return this.db.query("SELECT id,feature_id featureId,activity,state,created_at createdAt,updated_at updatedAt FROM workflow_runs WHERE state NOT IN ('cancelled','complete') ORDER BY updated_at DESC,id").all() as WorkflowRun[]; }
  get(id: string): WorkflowRun | undefined { return (this.db.query("SELECT id,feature_id featureId,activity,state,created_at createdAt,updated_at updatedAt FROM workflow_runs WHERE id=?").get(id) as WorkflowRun | null) ?? undefined; }
  update(id: string, activity: WorkflowActivity, state: RunState): WorkflowRun {
    assertActivity(activity); const current = this.get(id); if (!current) throw new Error(`Unknown workflow run ${id}`); if (["cancelled", "complete"].includes(current.state)) throw new Error(`Workflow run ${id} is terminal`);
    assertActivity(current.activity); if(activity!==current.activity&&!ACTIVITY_TRANSITIONS[current.activity].includes(activity))throw new Error(`Invalid workflow activity transition ${current.activity} -> ${activity}`);
    this.db.query("UPDATE workflow_runs SET activity=?,state=?,updated_at=? WHERE id=?").run(activity, state, new Date().toISOString(), id); return this.get(id)!;
  }
  history(featureId: string): WorkflowRun[] { return this.db.query("SELECT id,feature_id featureId,activity,state,created_at createdAt,updated_at updatedAt FROM workflow_runs WHERE feature_id=? ORDER BY created_at,id").all(featureId) as WorkflowRun[]; }
  latest(featureId:string):WorkflowRun|undefined{return (this.db.query("SELECT id,feature_id featureId,activity,state,created_at createdAt,updated_at updatedAt FROM workflow_runs WHERE feature_id=? ORDER BY created_at DESC,id DESC LIMIT 1").get(featureId) as WorkflowRun|null)??undefined;}
  event(runId: string, kind: string, payload: unknown, fingerprint?: string, id: string = crypto.randomUUID()): WorkflowEvent {
    if (!this.get(runId)) throw new Error(`Unknown workflow run ${runId}`); const now = new Date().toISOString(); this.db.query("INSERT OR IGNORE INTO workflow_events VALUES (?,?,?,?,?,?)").run(id, runId, kind, fingerprint ?? null, JSON.stringify(payload), now); return this.events(runId).find(event => event.id === id)!;
  }
  events(runId: string): WorkflowEvent[] { return (this.db.query("SELECT id,run_id runId,kind,context_fingerprint contextFingerprint,payload,created_at createdAt FROM workflow_events WHERE run_id=? ORDER BY created_at,id").all(runId) as Array<Omit<WorkflowEvent,"payload"> & {payload:string}>).map(e => ({...e, payload: JSON.parse(e.payload)})); }
  hasFreshEvent(runId: string, kind: string, fingerprint: string): boolean { return this.events(runId).some(event => event.kind === kind && event.contextFingerprint === fingerprint); }
  beginAttempt(runId: string, actionId: string, idempotencyKey: string, repositoryFingerprint?: string): WorkflowAttempt {
    if(!this.get(runId))throw new Error(`Unknown workflow run ${runId}`);const existing = this.attemptByKey(runId,actionId,idempotencyKey); if (existing) return existing; const now = new Date().toISOString(); const id = crypto.randomUUID();
    this.db.query("INSERT INTO workflow_attempts VALUES (?,?,?,?,?,?,?,?,?)").run(id, runId, actionId, idempotencyKey, "running", repositoryFingerprint ?? null, null, now, now); return this.attemptByKey(runId,actionId,idempotencyKey)!;
  }
  finishAttempt(id: string, state: Exclude<AttemptState,"running">, result?: unknown): WorkflowAttempt {
    this.db.query("UPDATE workflow_attempts SET state=?,result=?,updated_at=? WHERE id=?").run(state, result === undefined ? null : JSON.stringify(result), new Date().toISOString(), id);
    const attempt = this.db.query("SELECT id,run_id runId,action_id actionId,idempotency_key idempotencyKey,state,repository_fingerprint repositoryFingerprint,result,created_at createdAt,updated_at updatedAt FROM workflow_attempts WHERE id=?").get(id) as (Omit<WorkflowAttempt,"result"> & {result:string|null}) | null;
    if (!attempt) throw new Error(`Unknown workflow attempt ${id}`); return {...attempt, result:attempt.result ? JSON.parse(attempt.result) : undefined};
  }
  retryAttempt(id:string, repositoryFingerprint:string):WorkflowAttempt {
    const existing=this.db.query("SELECT state FROM workflow_attempts WHERE id=?").get(id) as {state:AttemptState}|null; if(!existing)throw new Error(`Unknown workflow attempt ${id}`); if(existing.state==="succeeded")return this.attemptsForId(id)!;
    this.db.query("UPDATE workflow_attempts SET state='running',repository_fingerprint=?,result=NULL,updated_at=? WHERE id=?").run(repositoryFingerprint,new Date().toISOString(),id); return this.attemptsForId(id)!;
  }
  private attemptsForId(id:string):WorkflowAttempt|undefined { const row=this.db.query("SELECT id,run_id runId,action_id actionId,idempotency_key idempotencyKey,state,repository_fingerprint repositoryFingerprint,result,created_at createdAt,updated_at updatedAt FROM workflow_attempts WHERE id=?").get(id) as (Omit<WorkflowAttempt,"result">&{result:string|null})|null; return row?{...row,result:row.result?JSON.parse(row.result):undefined}:undefined; }
  attemptByKey(runId:string,actionId:string,key: string): WorkflowAttempt | undefined {
    const attempt = this.db.query("SELECT id,run_id runId,action_id actionId,idempotency_key idempotencyKey,state,repository_fingerprint repositoryFingerprint,result,created_at createdAt,updated_at updatedAt FROM workflow_attempts WHERE run_id=? AND action_id=? AND idempotency_key=?").get(runId,actionId,key) as (Omit<WorkflowAttempt,"result"> & {result:string|null}) | null;
    return attempt ? {...attempt, result:attempt.result ? JSON.parse(attempt.result) : undefined} : undefined;
  }
  attempts(runId: string): WorkflowAttempt[] { return (this.db.query("SELECT id,run_id runId,action_id actionId,idempotency_key idempotencyKey,state,repository_fingerprint repositoryFingerprint,result,created_at createdAt,updated_at updatedAt FROM workflow_attempts WHERE run_id=? ORDER BY created_at,id").all(runId) as Array<Omit<WorkflowAttempt,"result"> & {result:string|null}>).map(a=>({...a,result:a.result?JSON.parse(a.result):undefined})); }
  wait(runId:string, kind:string, targetId?:string): void { this.db.query("INSERT INTO workflow_waits VALUES (?,?,?,?,?,?,NULL)").run(crypto.randomUUID(),runId,kind,targetId??null,"waiting",new Date().toISOString()); }
  resolveWaits(runId:string, kind:string,targetId?:string): void { this.db.query("UPDATE workflow_waits SET state='resolved',resolved_at=? WHERE run_id=? AND kind=? AND target_id IS ? AND state='waiting'").run(new Date().toISOString(),runId,kind,targetId??null); }
  waiting(runId:string,kind:string):Array<{targetId?:string}>{return (this.db.query("SELECT target_id targetId FROM workflow_waits WHERE run_id=? AND kind=? AND state='waiting' ORDER BY created_at,id").all(runId,kind) as Array<{targetId:string|null}>).map(r=>({targetId:r.targetId??undefined}));}
  recordBaseline(runId:string, fingerprint:string, assessment:unknown): void { this.db.query("INSERT INTO reconciliation_baselines(run_id,fingerprint,assessment,created_at) VALUES (?,?,?,?)").run(runId,fingerprint,JSON.stringify(assessment),new Date().toISOString()); }
  latestBaseline(runId:string): ReconciliationBaseline | undefined { const r=this.db.query("SELECT run_id runId,fingerprint,assessment,created_at createdAt FROM reconciliation_baselines WHERE run_id=? ORDER BY id DESC LIMIT 1").get(runId) as (Omit<ReconciliationBaseline,"assessment">&{assessment:string})|null; return r?{...r,assessment:JSON.parse(r.assessment)}:undefined; }
  close() { this.db.close(); }
}
