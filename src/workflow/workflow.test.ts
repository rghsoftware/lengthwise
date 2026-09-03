import { afterEach, expect, test } from "bun:test";
import { createFixtureRepo, removeFixtureRepo } from "../test-support/fixture-repo.ts";
import { WorkflowStateStore } from "./state-store.ts";
import { buildContractContext, evidenceSatisfaction, verificationContextFingerprint } from "./projections.ts";
import { ProjectGraph } from "../graph/project-graph.ts";
import type { Entity } from "../domain/entities.ts";
import type { Relationship } from "../domain/relationships.ts";
import { requiredVerificationsForFeature } from "./coordinator.ts";
import { WorkflowCoordinator } from "./coordinator.ts";
import { Database } from "bun:sqlite";
import { symlink } from "node:fs/promises";
import { buildProjectGraph } from "../graph/build.ts";
import { deriveTaskReadiness } from "../graph/readiness.ts";
import { renderContractArtifact } from "./contracts.ts";

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
    {id:"REQ-X",type:"requirement",title:"unrelated",statement:"x",lifecycle:"draft",source}
  ];
  const baseRelationships=[{type:"implements" as const,from:"TASK-1",to:"REQ-1"},{type:"has-acceptance-criterion" as const,from:"REQ-1",to:"AC-1"},{type:"verifies" as const,from:"VER-1",to:"AC-1"}];
  const contextFingerprint=verificationContextFingerprint(graph(entities,baseRelationships),"VER-1");entities.push({id:"E-1",type:"evidence",title:"result",outcome:"passed",result:"ok",applicability:"current",contextFingerprint,lifecycle:"recorded",source});
  const relationships=[...baseRelationships,{type:"supports" as const,from:"E-1",to:"VER-1"}];const g=graph(entities,relationships); const first=buildContractContext(g,"TASK-1"); const second=buildContractContext(g,"TASK-1");
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
  const store=new WorkflowStateStore(path); expect(store.schemaVersion()).toBe(3); expect(store.get("R")?.activity).toBe("plan");
  const first=store.beginAttempt("R","author:X","same","fp"); const retry=store.beginAttempt("R","author:X","same","fp"); expect(retry.id).toBe(first.id);
  store.finishAttempt(first.id,"interrupted"); expect(store.retryAttempt(first.id,"fp").state).toBe("running");
  expect(()=>store.update("R","unknown" as any,"running")).toThrow("Unsupported workflow activity"); store.close();
});

test("evidence applicability and complementary requirements are explicit",()=>{
  const entities:Entity[]=[
    {id:"AC",type:"acceptance-criterion",statement:"observable",lifecycle:"accepted",source},
    {id:"VER",type:"verification",title:"verify",method:"review",required:true,evidenceRequirements:["test","review"],lifecycle:"defined",source},
  ];
  const current=verificationContextFingerprint(graph(entities,[{type:"verifies",from:"VER",to:"AC"}]),"VER");entities.push({id:"E1",type:"evidence",title:"test",outcome:"passed",result:"ok",applicability:"current",contextFingerprint:current,kind:"test",lifecycle:"recorded",source},{id:"E2",type:"evidence",title:"old review",outcome:"passed",result:"ok",applicability:"fingerprint:old",kind:"review",lifecycle:"recorded",source});
  const g=graph(entities,[{type:"verifies",from:"VER",to:"AC"},{type:"supports",from:"E1",to:"VER"},{type:"supports",from:"E2",to:"VER"}]);
  const result=evidenceSatisfaction(g,"VER"); expect(result.satisfied).toBe(false); expect(result.status).toBe("missing-complement"); expect(result.assessments.find(a=>a.evidenceId==="E2")?.status).toBe("stale");
});

test("unversioned free-form Evidence is inapplicable rather than silently current",()=>{const entities:Entity[]=[{id:"AC",type:"acceptance-criterion",statement:"observable",lifecycle:"accepted",source},{id:"VER",type:"verification",title:"verify",method:"test",required:true,lifecycle:"defined",source},{id:"E",type:"evidence",title:"old",outcome:"passed",result:"passed",applicability:"Reviewed yesterday",lifecycle:"recorded",source}];const result=evidenceSatisfaction(graph(entities,[{type:"verifies",from:"VER",to:"AC"},{type:"supports",from:"E",to:"VER"}]),"VER");expect(result.satisfied).toBe(false);expect(result.assessments[0]?.status).toBe("inapplicable");});

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

test("material specification edits invalidate a prior approval",async()=>{
  const model=`lengthwise: 1
entities:
  - { id: F, type: feature, title: Feature, lifecycle: draft, significance: S, relationships: [{ type: addresses, to: REQ }] }
  - { id: REQ, type: requirement, title: Requirement, statement: Original behavior, lifecycle: accepted, relationships: [{ type: has-acceptance-criterion, to: AC }] }
  - { id: AC, type: acceptance-criterion, statement: It works, lifecycle: accepted }
  - { id: VER, type: verification, title: Verify, method: test, required: true, lifecycle: defined, relationships: [{ type: verifies, to: AC }] }
`;
  const root=await createFixtureRepo({".lengthwise/project.yaml":WORKFLOW_CONFIG,"engineering/model.yaml":model});roots.push(root);const coordinator=await WorkflowCoordinator.open(root);const run=await coordinator.start("F");const before=await coordinator.assess("F");await coordinator.approve(run.id,"specification",before.gates.specification.fingerprint);
  await Bun.write(`${root}/engineering/model.yaml`,model.replace("Original behavior","Materially changed behavior"));const after=await coordinator.assess("F");expect(after.gates.specification.fingerprint).not.toBe(before.gates.specification.fingerprint);expect(after.gates.specification.approved).toBe(false);coordinator.close();
});

test("a blocked specification exposes one actionable repair target",async()=>{
  const model=`lengthwise: 1
entities:
  - { id: F-WORK, type: feature, title: Feature, lifecycle: draft, significance: S, relationships: [{ type: addresses, to: REQ-MISSING }] }
`;
  const root=await createFixtureRepo({".lengthwise/project.yaml":WORKFLOW_CONFIG,"engineering/model.yaml":model});roots.push(root);const coordinator=await WorkflowCoordinator.open(root);
  const assessment=await coordinator.assess("F-WORK");const repair=assessment.actions.find(action=>action.id==="repair-specification");
  expect(repair).toEqual(expect.objectContaining({eligible:true,target:expect.objectContaining({entityId:"F-WORK"})}));
  expect(repair?.requiredInputs[0]).toContain("does not exist");coordinator.close();
});

test("a completed Feature cannot start a run and an existing run offers explicit reconciliation choices",async()=>{
  const model=`lengthwise: 1
entities:
  - { id: F-DONE, type: feature, title: Complete Feature, lifecycle: complete, significance: S }
`;
  const root=await createFixtureRepo({".lengthwise/project.yaml":WORKFLOW_CONFIG,"engineering/model.yaml":model});roots.push(root);const coordinator=await WorkflowCoordinator.open(root);
  await expect(coordinator.start("F-DONE")).rejects.toThrow("reopen it to active");coordinator.state.start("F-DONE","specify");const assessment=await coordinator.assess("F-DONE");
  expect(assessment.gates.specification.blockers[0]?.code).toBe("lifecycle-run-conflict");expect(assessment.actions.map(action=>action.id)).toEqual(["reopen-feature","cancel-stale-run"]);coordinator.close();
});

test("attempt identity is isolated by run and action and waits resolve by target",async()=>{
  const root=await createFixtureRepo({".keep":""});roots.push(root);const store=new WorkflowStateStore(`${root}/state.db`);const one=store.start("F1");const two=store.start("F2");
  const a=store.beginAttempt(one.id,"handoff:T","same");const b=store.beginAttempt(two.id,"handoff:T","same");const c=store.beginAttempt(one.id,"return:T","same");expect(new Set([a.id,b.id,c.id]).size).toBe(3);
  store.wait(one.id,"implementation","T1");store.wait(one.id,"implementation","T2");store.resolveWaits(one.id,"implementation","T1");expect(store.waiting(one.id,"implementation")).toEqual([{targetId:"T2"}]);store.close();
});

test("capture rejects a destination whose parent symlink escapes the repository",async()=>{
  const root=await createFixtureRepo({".lengthwise/project.yaml":WORKFLOW_CONFIG,"engineering/.keep":""});roots.push(root);const outside=await createFixtureRepo({".keep":""});roots.push(outside);await symlink(outside,`${root}/engineering/link`);const coordinator=await WorkflowCoordinator.open(root);
  await expect(coordinator.startFromIdea({featureId:"F-ESCAPE",title:"Escape",idea:"No",destination:"engineering/link/new/escape.yaml"})).rejects.toThrow("outside the selected project");expect(await Bun.file(`${outside}/new`).exists()).toBe(false);coordinator.close();
});

const STANDARD_CONFIG=WORKFLOW_CONFIG.replace("policy: { rigor: light }","policy: { rigor: standard }");
const FULL_MODEL=`lengthwise: 1
entities:
  - { id: F-FULL, type: feature, title: Full workflow, lifecycle: draft, significance: M, relationships: [{ type: addresses, to: REQ-FULL }] }
  - { id: REQ-FULL, type: requirement, title: Full requirement, statement: Complete the workflow, lifecycle: accepted, relationships: [{ type: has-acceptance-criterion, to: AC-FULL }] }
  - { id: AC-FULL, type: acceptance-criterion, statement: The workflow completes, lifecycle: accepted }
  - { id: VER-FULL, type: verification, title: Full verification, method: automated, required: true, lifecycle: defined, relationships: [{ type: verifies, to: AC-FULL }] }
  - { id: TASK-FULL, type: task, title: Implement it, lifecycle: planned, relationships: [{ type: implements, to: REQ-FULL }] }
  - { id: PLAN-FULL, type: plan, title: Plan, lifecycle: accepted, relationships: [{ type: contains, to: TASK-FULL }] }
`;

test("material accepted Build Contract edits invalidate prior gate approval",async()=>{
  const root=await createFixtureRepo({".lengthwise/project.yaml":STANDARD_CONFIG,"engineering/model.yaml":FULL_MODEL});roots.push(root);
  const built=await buildProjectGraph(root);if(!built.ok)throw new Error("fixture failed");
  const contract=renderContractArtifact(built.graph,["TASK-FULL"]);await Bun.write(`${root}/engineering/contracts.yaml`,contract);
  const coordinator=await WorkflowCoordinator.open(root);const run=await coordinator.start("F-FULL");let assessment=await coordinator.assess("F-FULL");
  await coordinator.approve(run.id,"specification",assessment.gates.specification.fingerprint);assessment=await coordinator.assess("F-FULL");
  await coordinator.approve(run.id,"build-contract",assessment.gates["build-contract"].fingerprint);const approved=await coordinator.assess("F-FULL");
  await Bun.write(`${root}/engineering/contracts.yaml`,contract.replace("Build Contract for TASK-FULL","Materially revised Build Contract for TASK-FULL"));
  const revised=await coordinator.assess("F-FULL");
  expect(revised.tasks[0]).toMatchObject({contractStale:false,changedInputs:[]});
  expect(revised.gates["build-contract"].fingerprint).not.toBe(approved.gates["build-contract"].fingerprint);
  expect(revised.gates["build-contract"].approved).toBe(false);coordinator.close();
});

test("handoff, interruption, resume, retry, return verification, completion, and terminal projection converge",async()=>{
  const root=await createFixtureRepo({".lengthwise/project.yaml":STANDARD_CONFIG,"engineering/model.yaml":FULL_MODEL});roots.push(root);let built=await buildProjectGraph(root);if(!built.ok)throw new Error("fixture failed");await Bun.write(`${root}/engineering/contracts.yaml`,renderContractArtifact(built.graph,["TASK-FULL"]));
  const coordinator=await WorkflowCoordinator.open(root);const run=await coordinator.start("F-FULL");let assessed=await coordinator.assess("F-FULL");await coordinator.approve(run.id,"specification",assessed.gates.specification.fingerprint);assessed=await coordinator.assess("F-FULL");expect(assessed.actions.some(action=>action.id.startsWith("author-contract:"))).toBe(false);expect(assessed.actions[0]?.id).toBe("review-build-contract");expect(assessed.actions[0]?.target).toEqual({entityId:"BC-TASK-FULL",artifactPath:"engineering/contracts.yaml"});await coordinator.approve(run.id,"build-contract",assessed.gates["build-contract"].fingerprint);assessed=await coordinator.assess("F-FULL");expect(assessed.actions.find(action=>action.id==="handoff:TASK-FULL")?.target).toEqual({entityId:"BC-TASK-FULL",artifactPath:"engineering/contracts.yaml"});
  await coordinator.handoff(run.id,"TASK-FULL","handoff-key");assessed=await coordinator.assess("F-FULL");expect(assessed.actions.some(action=>action.id==="handoff:TASK-FULL")).toBe(false);expect(assessed.actions.find(action=>action.id==="return:TASK-FULL")?.kind).toBe("implementation-return");const authored=coordinator.state.beginAttempt(run.id,"author:progress","progress-key",assessed.fingerprint);expect(coordinator.interrupt(run.id,"pause").state).toBe("interrupted");const resumed=await coordinator.resume(run.id);expect(resumed.classifications[0]?.classification).toBe("no-write-observed");expect((await coordinator.retry(run.id,authored.id)).state).toBe("running");coordinator.state.finishAttempt(authored.id,"succeeded");
  const returned=await coordinator.returnImplementation(run.id,"TASK-FULL","implementation finished","return-key");expect(returned.result).toEqual(expect.objectContaining({remaining:[]}));
  await Bun.write(`${root}/engineering/model.yaml`,FULL_MODEL.replace("lifecycle: planned","lifecycle: done"));built=await buildProjectGraph(root);if(!built.ok)throw new Error("updated fixture failed");const evidenceFingerprint=verificationContextFingerprint(built.graph,"VER-FULL");await Bun.write(`${root}/engineering/evidence.yaml`,`lengthwise: 1\nentities:\n  - { id: E-FULL, type: evidence, title: Result, lifecycle: recorded, outcome: passed, result: Passed, applicability: current, contextFingerprint: ${evidenceFingerprint}, relationships: [{ type: supports, to: VER-FULL }] }\n`);
  expect((await coordinator.assess("F-FULL")).reconciliation.required).toBe(false);await coordinator.evaluateImplementationReturn(run.id,{taskId:"TASK-FULL",outcome:"satisfactory",idempotencyKey:"verified"});await Bun.write(`${root}/engineering/model.yaml`,FULL_MODEL.replace("lifecycle: draft","lifecycle: complete").replace("lifecycle: planned","lifecycle: done"));expect((await coordinator.complete(run.id)).state).toBe("complete");
  const terminal=await coordinator.assess("F-FULL");expect(terminal.gates.specification.approved).toBe(true);expect(terminal.gates["build-contract"].approved).toBe(true);expect(terminal.completionEligible).toBe(true);expect(terminal.actions).toEqual([]);coordinator.close();
});

test("cancellation preserves terminal history and permits a later run",async()=>{
  const root=await createFixtureRepo({".lengthwise/project.yaml":WORKFLOW_CONFIG,"engineering/model.yaml":FULL_MODEL});roots.push(root);const coordinator=await WorkflowCoordinator.open(root);const first=await coordinator.start("F-FULL");expect(coordinator.cancel(first.id,"not now").state).toBe("cancelled");const second=await coordinator.start("F-FULL");expect(second.id).not.toBe(first.id);expect(coordinator.state.history("F-FULL")).toHaveLength(2);coordinator.close();
});

test("completed tasks are not offered for implementation handoff",async()=>{
  const root=await createFixtureRepo({".lengthwise/project.yaml":STANDARD_CONFIG,"engineering/model.yaml":FULL_MODEL.replace("lifecycle: planned","lifecycle: done")});roots.push(root);const built=await buildProjectGraph(root);if(!built.ok)throw new Error("fixture failed");await Bun.write(`${root}/engineering/contracts.yaml`,renderContractArtifact(built.graph,["TASK-FULL"]));const coordinator=await WorkflowCoordinator.open(root);const run=await coordinator.start("F-FULL");let assessment=await coordinator.assess("F-FULL");await coordinator.approve(run.id,"specification",assessment.gates.specification.fingerprint);assessment=await coordinator.assess("F-FULL");await coordinator.approve(run.id,"build-contract",assessment.gates["build-contract"].fingerprint);assessment=await coordinator.assess("F-FULL");expect(assessment.tasks[0]?.lifecycle).toBe("done");expect(assessment.actions.some(action=>action.id==="handoff:TASK-FULL")).toBe(false);coordinator.close();
});

// AC-042-06
test("contracted handoff eligibility shares dependency readiness and unlocks without re-gating",async()=>{
  const model=`lengthwise: 1
entities:
  - { id: F-DAG, type: feature, title: DAG workflow, lifecycle: draft, significance: M, relationships: [{ type: addresses, to: REQ-DAG }] }
  - { id: REQ-DAG, type: requirement, title: DAG requirement, statement: Respect task order, lifecycle: accepted, relationships: [{ type: has-acceptance-criterion, to: AC-DAG }] }
  - { id: AC-DAG, type: acceptance-criterion, statement: Dependencies gate handoff, lifecycle: accepted }
  - { id: VER-DAG, type: verification, title: DAG verification, method: automated, required: true, lifecycle: defined, relationships: [{ type: verifies, to: AC-DAG }] }
  - { id: TASK-BASE, type: task, title: Base task, lifecycle: planned, relationships: [{ type: implements, to: REQ-DAG }] }
  - { id: TASK-CHILD, type: task, title: Dependent task, lifecycle: planned, relationships: [{ type: implements, to: REQ-DAG }, { type: depends-on, to: TASK-BASE }] }
  - { id: PLAN-DAG, type: plan, title: DAG plan, lifecycle: accepted, relationships: [{ type: contains, to: TASK-BASE }, { type: contains, to: TASK-CHILD }] }
`;
  const root=await createFixtureRepo({".lengthwise/project.yaml":STANDARD_CONFIG,"engineering/model.yaml":model});roots.push(root);
  let built=await buildProjectGraph(root);if(!built.ok)throw new Error("fixture failed");
  await Bun.write(`${root}/engineering/contracts.yaml`,renderContractArtifact(built.graph,["TASK-BASE","TASK-CHILD"]));
  const coordinator=await WorkflowCoordinator.open(root);const run=await coordinator.start("F-DAG");
  let assessment=await coordinator.assess("F-DAG");await coordinator.approve(run.id,"specification",assessment.gates.specification.fingerprint);
  assessment=await coordinator.assess("F-DAG");await coordinator.approve(run.id,"build-contract",assessment.gates["build-contract"].fingerprint);
  assessment=await coordinator.assess("F-DAG");

  const initialReadiness=new Map(deriveTaskReadiness(built.graph).map(result=>[result.task.id,result]));
  expect(initialReadiness.get("TASK-BASE")).toMatchObject({ready:true,blockedBy:[]});
  expect(initialReadiness.get("TASK-CHILD")).toMatchObject({ready:false,blockedBy:["TASK-BASE"]});
  expect(assessment.tasks.find(task=>task.id==="TASK-BASE")).toMatchObject({blockedBy:[],handoffEligible:true});
  expect(assessment.tasks.find(task=>task.id==="TASK-CHILD")).toMatchObject({blockedBy:["TASK-BASE"],handoffEligible:false});
  expect(assessment.actions.find(action=>action.id==="handoff:TASK-BASE")?.eligible).toBe(true);
  expect(assessment.actions.find(action=>action.id==="handoff:TASK-CHILD")).toMatchObject({eligible:false,blockers:[{code:"task-dependency-incomplete",entityId:"TASK-BASE",artifactPath:"engineering/model.yaml",message:"TASK-CHILD depends on incomplete task TASK-BASE"}]});
  await expect(coordinator.handoff(run.id,"TASK-CHILD","blocked-handoff")).rejects.toThrow("not eligible for handoff");

  await Bun.write(`${root}/engineering/model.yaml`,model.replace("TASK-BASE, type: task, title: Base task, lifecycle: planned","TASK-BASE, type: task, title: Base task, lifecycle: done"));
  built=await buildProjectGraph(root);if(!built.ok)throw new Error("updated fixture failed");
  assessment=await coordinator.assess("F-DAG");
  expect(deriveTaskReadiness(built.graph).find(result=>result.task.id==="TASK-CHILD")).toMatchObject({ready:true,blockedBy:[]});
  expect(assessment.tasks.find(task=>task.id==="TASK-CHILD")).toMatchObject({contract:"BC-TASK-CHILD",contractStale:false,blockedBy:[],handoffEligible:true});
  expect(assessment.gates["build-contract"].approved).toBe(true);
  expect(assessment.actions.find(action=>action.id==="handoff:TASK-CHILD")).toMatchObject({eligible:true,blockers:[]});
  await expect(coordinator.handoff(run.id,"TASK-CHILD","unlocked-handoff")).resolves.toMatchObject({state:"succeeded"});
  coordinator.close();
});

test("returning one of multiple handed-off tasks preserves the other implementation wait",async()=>{
  const model=FULL_MODEL.replace("  - { id: PLAN-FULL",`  - { id: TASK-SECOND, type: task, title: Implement second, lifecycle: planned, relationships: [{ type: implements, to: REQ-FULL }] }\n  - { id: PLAN-FULL`).replace("relationships: [{ type: contains, to: TASK-FULL }]","relationships: [{ type: contains, to: TASK-FULL }, { type: contains, to: TASK-SECOND }]");
  const root=await createFixtureRepo({".lengthwise/project.yaml":STANDARD_CONFIG,"engineering/model.yaml":model});roots.push(root);const built=await buildProjectGraph(root);if(!built.ok)throw new Error("fixture failed");await Bun.write(`${root}/engineering/contracts.yaml`,renderContractArtifact(built.graph,["TASK-FULL","TASK-SECOND"]));const coordinator=await WorkflowCoordinator.open(root);const run=await coordinator.start("F-FULL");let a=await coordinator.assess("F-FULL");await coordinator.approve(run.id,"specification",a.gates.specification.fingerprint);a=await coordinator.assess("F-FULL");await coordinator.approve(run.id,"build-contract",a.gates["build-contract"].fingerprint);await coordinator.handoff(run.id,"TASK-FULL","h1");await coordinator.handoff(run.id,"TASK-SECOND","h2");
  const returned=await coordinator.returnImplementation(run.id,"TASK-FULL","first done","r1");expect(returned.result).toEqual(expect.objectContaining({remaining:["TASK-SECOND"]}));expect(coordinator.state.get(run.id)).toMatchObject({activity:"implement",state:"waiting-implementation"});expect(coordinator.state.waiting(run.id,"implementation")).toEqual([{targetId:"TASK-SECOND"}]);coordinator.close();
});

async function readyRun(root:string){let built=await buildProjectGraph(root);if(!built.ok)throw new Error("fixture failed");await Bun.write(`${root}/engineering/contracts.yaml`,renderContractArtifact(built.graph,["TASK-FULL"]));const coordinator=await WorkflowCoordinator.open(root);const run=await coordinator.start("F-FULL");let assessment=await coordinator.assess("F-FULL");await coordinator.approve(run.id,"specification",assessment.gates.specification.fingerprint);assessment=await coordinator.assess("F-FULL");await coordinator.approve(run.id,"build-contract",assessment.gates["build-contract"].fingerprint);return {coordinator,run};}

test("false implementation completion claim returns visible unmet obligations to implementation",async()=>{
  const root=await createFixtureRepo({".lengthwise/project.yaml":STANDARD_CONFIG,"engineering/model.yaml":FULL_MODEL});roots.push(root);const {coordinator,run}=await readyRun(root);await coordinator.handoff(run.id,"TASK-FULL","handoff-1");await coordinator.returnImplementation(run.id,"TASK-FULL",{summary:"Complete",claims:{requirements:[{id:"REQ-FULL",state:"addressed"}],acceptanceCriteria:[{id:"AC-FULL",state:"addressed"}]},changedFiles:["src/feature.ts"]},"return-1");
  let assessment=await coordinator.assess("F-FULL");expect(assessment.completionEligible).toBe(false);expect(assessment.implementation.pendingReturns[0]?.claim.summary).toBe("Complete");expect(assessment.actions.some(action=>action.id==="review-return:TASK-FULL")).toBe(true);
  await coordinator.evaluateImplementationReturn(run.id,{taskId:"TASK-FULL",outcome:"retry-implementation",failedVerifications:["VER-FULL"],blockingFindings:["Expected behavior was not observed"],knownGaps:["AC behavior missing"],idempotencyKey:"route-1"});assessment=await coordinator.assess("F-FULL");const retry=assessment.implementation.retryContexts[0];expect(coordinator.state.get(run.id)?.activity).toBe("implement");expect(retry).toEqual(expect.objectContaining({taskId:"TASK-FULL",failedVerifications:["VER-FULL"],affectedAcceptanceCriteria:["AC-FULL"],affectedRequirements:["REQ-FULL"],contractId:"BC-TASK-FULL",contractCurrent:true,nextEligibleAction:"implementation-handoff"}));expect(assessment.actions.find(action=>action.id==="handoff:TASK-FULL")?.requiredInputs.join(" ")).toContain("AC-FULL");coordinator.close();
});

test("a successful implementation retry uses the accepted contract without re-gating",async()=>{
  const root=await createFixtureRepo({".lengthwise/project.yaml":STANDARD_CONFIG,"engineering/model.yaml":FULL_MODEL});roots.push(root);const {coordinator,run}=await readyRun(root);await coordinator.handoff(run.id,"TASK-FULL","handoff-1");await coordinator.returnImplementation(run.id,"TASK-FULL",{summary:"Attempt one complete"},"return-1");await coordinator.evaluateImplementationReturn(run.id,{taskId:"TASK-FULL",outcome:"retry-implementation",failedVerifications:["VER-FULL"],idempotencyKey:"route-1"});const second=await coordinator.handoff(run.id,"TASK-FULL","handoff-2");expect(second.result).toEqual(expect.objectContaining({attemptNumber:2,contractId:"BC-TASK-FULL"}));
  await Bun.write(`${root}/engineering/model.yaml`,FULL_MODEL.replace("lifecycle: planned","lifecycle: done"));const built=await buildProjectGraph(root);if(!built.ok)throw new Error("updated fixture failed");const evidenceFingerprint=verificationContextFingerprint(built.graph,"VER-FULL");await Bun.write(`${root}/engineering/evidence.yaml`,`lengthwise: 1\nentities:\n  - { id: E-FULL, type: evidence, title: Result, lifecycle: recorded, outcome: passed, result: Passed, applicability: current, contextFingerprint: ${evidenceFingerprint}, relationships: [{ type: supports, to: VER-FULL }] }\n`);await coordinator.returnImplementation(run.id,"TASK-FULL",{summary:"Missing behavior implemented",knownGaps:[],changedFiles:["src/feature.ts"]},"return-2");await coordinator.evaluateImplementationReturn(run.id,{taskId:"TASK-FULL",outcome:"satisfactory",idempotencyKey:"route-2"});const assessment=await coordinator.assess("F-FULL");expect(assessment.implementation.attempts).toHaveLength(2);expect(assessment.gates["build-contract"].approved).toBe(true);expect(assessment.completionEligible).toBe(true);expect(assessment.reconciliation.required).toBe(false);coordinator.close();
});

test("verification routes changed governing truth to reconciliation instead of implementation retry",async()=>{
  const root=await createFixtureRepo({".lengthwise/project.yaml":STANDARD_CONFIG,"engineering/model.yaml":FULL_MODEL});roots.push(root);const {coordinator,run}=await readyRun(root);await coordinator.handoff(run.id,"TASK-FULL","handoff-1");await coordinator.returnImplementation(run.id,"TASK-FULL",{summary:"Contract cannot satisfy the platform constraint",claims:{acceptanceCriteria:[{id:"AC-FULL",state:"not-addressed"}]}},"return-1");await coordinator.evaluateImplementationReturn(run.id,{taskId:"TASK-FULL",outcome:"reconcile",failedVerifications:["VER-FULL"],reason:"The accepted criterion conflicts with the discovered platform constraint",idempotencyKey:"route-1"});const assessment=await coordinator.assess("F-FULL");expect(coordinator.state.get(run.id)?.activity).toBe("reconcile");expect(assessment.reconciliation.reasons[0]).toEqual(expect.objectContaining({code:"governing-context-conflict",entityId:"TASK-FULL"}));expect(assessment.implementation.retryContexts).toEqual([]);expect(assessment.actions.some(action=>action.id==="handoff:TASK-FULL"&&action.eligible)).toBe(false);coordinator.close();
});

test("restart resumes the accepted contract, attempt history, missing obligations, and retry action",async()=>{
  const root=await createFixtureRepo({".lengthwise/project.yaml":STANDARD_CONFIG,"engineering/model.yaml":FULL_MODEL});roots.push(root);let {coordinator,run}=await readyRun(root);await coordinator.handoff(run.id,"TASK-FULL","handoff-1");await coordinator.returnImplementation(run.id,"TASK-FULL",{summary:"Complete",knownGaps:["Known edge case"]},"return-1");await coordinator.evaluateImplementationReturn(run.id,{taskId:"TASK-FULL",outcome:"retry-implementation",failedVerifications:["VER-FULL"],blockingFindings:["Assertion failed"],idempotencyKey:"route-1"});coordinator.close();coordinator=await WorkflowCoordinator.open(root);const resumed=await coordinator.assess("F-FULL");expect(resumed.implementation.attempts).toHaveLength(1);expect(resumed.implementation.retryContexts[0]).toEqual(expect.objectContaining({contractId:"BC-TASK-FULL",failedVerifications:["VER-FULL"],knownGaps:["Known edge case"],nextEligibleAction:"implementation-handoff"}));expect(resumed.actions.find(action=>action.id==="handoff:TASK-FULL")?.eligible).toBe(true);coordinator.close();
});
