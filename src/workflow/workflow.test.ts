import { afterEach, expect, test } from "bun:test";
import { createFixtureRepo, removeFixtureRepo } from "../test-support/fixture-repo.ts";
import { WorkflowStateStore } from "./state-store.ts";
import { buildContractContext, evidenceSatisfaction } from "./projections.ts";
import { ProjectGraph } from "../graph/project-graph.ts";
import type { Entity } from "../domain/entities.ts";
import type { Relationship } from "../domain/relationships.ts";
import { requiredVerificationsForFeature } from "./coordinator.ts";
import { WorkflowCoordinator } from "./coordinator.ts";
import { Database } from "bun:sqlite";

const roots:string[]=[]; afterEach(async()=>{for(const r of roots.splice(0)) await removeFixtureRepo(r)});
const source={artifactPath:"engineering/model.yaml",line:1};
function graph(entities:Entity[], relationships:Omit<Relationship,"provenance">[]) { return new ProjectGraph(entities,relationships.map(r=>({...r,provenance:{kind:"declared" as const,source}}))); }

test("operational state enforces one active run, persists history, and deduplicates events",async()=>{
  const root=await createFixtureRepo({".keep":""}); roots.push(root); const path=`${root}/state.db`;
  let store=new WorkflowStateStore(path); const run=store.start("F-001");
  expect(()=>store.start("F-001")).toThrow(); store.event(run.id,"specification-approved",{},"abc","same"); store.event(run.id,"specification-approved",{},"abc","same"); store.close();
  store=new WorkflowStateStore(path); expect(store.active("F-001")?.id).toBe(run.id); expect(store.events(run.id)).toHaveLength(1); store.update(run.id,"specify","running");store.update(run.id,"plan","running");store.update(run.id,"implement","running");store.update(run.id,"verify","running");store.update(run.id,"reconcile","running");store.update(run.id,"complete","complete"); expect(store.start("F-001").id).not.toBe(run.id); store.close();
});

test("contract context is bounded and deterministic while evidence satisfaction is many-to-many",()=>{
  const entities:Entity[]=[
    {id:"TASK-1",type:"task",title:"work",lifecycle:"planned",source}, {id:"REQ-1",type:"requirement",title:"r",statement:"s",lifecycle:"accepted",source},
    {id:"AC-1",type:"acceptance-criterion",statement:"a",lifecycle:"accepted",source}, {id:"VER-1",type:"verification",title:"v",method:"test",required:true,lifecycle:"defined",source},
    {id:"E-1",type:"evidence",title:"result",outcome:"passed",result:"ok",applicability:"rev",lifecycle:"recorded",source},
    {id:"REQ-X",type:"requirement",title:"unrelated",statement:"x",lifecycle:"draft",source}
  ];
  const relationships=[{type:"implements" as const,from:"TASK-1",to:"REQ-1"},{type:"has-acceptance-criterion" as const,from:"REQ-1",to:"AC-1"},{type:"verifies" as const,from:"VER-1",to:"AC-1"},{type:"supports" as const,from:"E-1",to:"VER-1"}];
  const g=graph(entities,relationships); const first=buildContractContext(g,"TASK-1"); const second=buildContractContext(g,"TASK-1");
  expect(first).toEqual(second); expect(first.requirements).toEqual(["REQ-1"]); expect(JSON.stringify(first)).not.toContain("REQ-X"); expect(evidenceSatisfaction(g,"VER-1").satisfied).toBe(true);
  const changed=graph(entities.map(e=>e.id==="REQ-1"?{...e,statement:"changed governing behavior"}:e) as Entity[],relationships);
  expect(buildContractContext(changed,"TASK-1").fingerprint).not.toBe(first.fingerprint);
});

test("completion verification scope is limited to acceptance criteria addressed by the feature",()=>{
  const entities:Entity[]=[
    {id:"F-1",type:"feature",title:"feature",lifecycle:"active",significance:"M",source},
    {id:"REQ-1",type:"requirement",title:"owned",statement:"s",lifecycle:"accepted",source},
    {id:"REQ-2",type:"requirement",title:"other",statement:"s",lifecycle:"accepted",source},
    {id:"AC-1",type:"acceptance-criterion",statement:"owned",lifecycle:"accepted",source},
    {id:"AC-2",type:"acceptance-criterion",statement:"other",lifecycle:"accepted",source},
    {id:"VER-1",type:"verification",title:"owned",method:"test",required:true,lifecycle:"defined",source},
    {id:"VER-2",type:"verification",title:"other",method:"test",required:true,lifecycle:"defined",source},
  ];
  const relationships=[
    {type:"addresses" as const,from:"F-1",to:"REQ-1"},
    {type:"has-acceptance-criterion" as const,from:"REQ-1",to:"AC-1"},
    {type:"has-acceptance-criterion" as const,from:"REQ-2",to:"AC-2"},
    {type:"verifies" as const,from:"VER-1",to:"AC-1"},
    {type:"verifies" as const,from:"VER-2",to:"AC-2"},
  ];
  expect(requiredVerificationsForFeature(graph(entities,relationships),"F-1")).toEqual(["VER-1"]);
});

test("state schema migration is transactional, typed, and adds idempotent attempts",async()=>{
  const root=await createFixtureRepo({".keep":""}); roots.push(root); const path=`${root}/state.db`; const db=new Database(path);
  db.exec(`CREATE TABLE schema_version(version INTEGER NOT NULL); INSERT INTO schema_version VALUES(1);
    CREATE TABLE workflow_runs(id TEXT PRIMARY KEY,feature_id TEXT NOT NULL,activity TEXT NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX one_active_run_per_feature ON workflow_runs(feature_id) WHERE state NOT IN ('cancelled','complete');
    CREATE TABLE workflow_events(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,kind TEXT NOT NULL,context_fingerprint TEXT,payload TEXT NOT NULL,created_at TEXT NOT NULL);
    INSERT INTO workflow_runs VALUES('R','F','planning','running','now','now');`); db.close();
  const store=new WorkflowStateStore(path); expect(store.schemaVersion()).toBe(2); expect(store.get("R")?.activity).toBe("plan");
  const first=store.beginAttempt("R","author:X","same","fp"); const retry=store.beginAttempt("R","author:X","same","fp"); expect(retry.id).toBe(first.id);
  store.finishAttempt(first.id,"interrupted"); expect(store.retryAttempt(first.id,"fp").state).toBe("running");
  expect(()=>store.update("R","unknown" as any,"running")).toThrow("Unsupported workflow activity"); store.close();
});

test("evidence applicability and complementary requirements are explicit",()=>{
  const entities:Entity[]=[
    {id:"AC",type:"acceptance-criterion",statement:"observable",lifecycle:"accepted",source},
    {id:"VER",type:"verification",title:"verify",method:"review",required:true,evidenceRequirements:["test","review"],lifecycle:"defined",source},
    {id:"E1",type:"evidence",title:"test",outcome:"passed",result:"ok",applicability:"current",kind:"test",lifecycle:"recorded",source},
    {id:"E2",type:"evidence",title:"old review",outcome:"passed",result:"ok",applicability:"fingerprint:old",kind:"review",lifecycle:"recorded",source},
  ];
  const g=graph(entities,[{type:"verifies",from:"VER",to:"AC"},{type:"supports",from:"E1",to:"VER"},{type:"supports",from:"E2",to:"VER"}]);
  const result=evidenceSatisfaction(g,"VER"); expect(result.satisfied).toBe(false); expect(result.status).toBe("missing-complement"); expect(result.assessments.find(a=>a.evidenceId==="E2")?.status).toBe("stale");
});

const WORKFLOW_CONFIG=`lengthwise: 1
project: { name: Workflow }
artifacts: { include: ["engineering/**/*.yaml"] }
policy: { rigor: light }
rigor:
  light: { requirements: required, acceptanceCriteria: required, implementationTraceability: basic, verificationCoverage: required, taskPlan: as-needed, materialDecisions: recorded, humanApproval: [specification] }
  standard: { requirements: required, acceptanceCriteria: required, implementationTraceability: required, verificationCoverage: required, taskPlan: required, materialDecisions: recorded, humanApproval: [specification, buildContract] }
  strict: { requirements: required, acceptanceCriteria: required, implementationTraceability: required, verificationCoverage: required, taskPlan: required, materialDecisions: recorded, independentReview: generally-required, humanApproval: [specification, buildContract, verification] }
`;

test("capture from an idea creates a draft Feature artifact and associated run",async()=>{
  const root=await createFixtureRepo({".lengthwise/project.yaml":WORKFLOW_CONFIG});roots.push(root);const coordinator=await WorkflowCoordinator.open(root);
  const captured=await coordinator.startFromIdea({featureId:"F-IDEA",title:"Captured idea",idea:"Make the workflow concrete.",destination:"engineering/features/idea.yaml"});
  expect(captured.run.featureId).toBe("F-IDEA");expect(captured.run.activity).toBe("specify");expect(await Bun.file(`${root}/engineering/features/idea.yaml`).text()).toContain("lifecycle: draft");expect(captured.assessment.actions.some(a=>a.target.entityId==="F-IDEA")).toBe(true);coordinator.close();
});

test("gate approval enforces eligibility, ordering, and reviewed fingerprint freshness",async()=>{
  const model=`lengthwise: 1
entities:
  - { id: F, type: feature, title: Feature, lifecycle: draft, significance: S, relationships: [{ type: addresses, to: REQ }] }
  - { id: REQ, type: requirement, title: Requirement, statement: Do it, lifecycle: accepted, relationships: [{ type: has-acceptance-criterion, to: AC }] }
  - { id: AC, type: acceptance-criterion, statement: It works, lifecycle: accepted }
  - { id: VER, type: verification, title: Verify, method: test, required: true, lifecycle: defined, relationships: [{ type: verifies, to: AC }] }
`;
  const root=await createFixtureRepo({".lengthwise/project.yaml":WORKFLOW_CONFIG,"engineering/model.yaml":model});roots.push(root);const coordinator=await WorkflowCoordinator.open(root);const run=await coordinator.start("F");const assessed=await coordinator.assess("F");
  await expect(coordinator.approve(run.id,"specification","stale")).rejects.toThrow("stale");const approved=await coordinator.approve(run.id,"specification",assessed.gates.specification.fingerprint);expect(approved.activity).toBe("plan");expect((await coordinator.assess("F")).gates.specification.approved).toBe(true);coordinator.close();
});
