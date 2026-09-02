import { afterEach, expect, test } from "bun:test";
import { createFixtureRepo, removeFixtureRepo } from "../test-support/fixture-repo.ts";
import { WorkflowStateStore } from "./state-store.ts";
import { buildContractContext, evidenceSatisfaction } from "./projections.ts";
import { ProjectGraph } from "../graph/project-graph.ts";
import type { Entity } from "../domain/entities.ts";
import type { Relationship } from "../domain/relationships.ts";
import { requiredVerificationsForFeature } from "./coordinator.ts";

const roots:string[]=[]; afterEach(async()=>{for(const r of roots.splice(0)) await removeFixtureRepo(r)});
const source={artifactPath:"engineering/model.yaml",line:1};
function graph(entities:Entity[], relationships:Omit<Relationship,"provenance">[]) { return new ProjectGraph(entities,relationships.map(r=>({...r,provenance:{kind:"declared" as const,source}}))); }

test("operational state enforces one active run, persists history, and deduplicates events",async()=>{
  const root=await createFixtureRepo({".keep":""}); roots.push(root); const path=`${root}/state.db`;
  let store=new WorkflowStateStore(path); const run=store.start("F-001");
  expect(()=>store.start("F-001")).toThrow(); store.event(run.id,"specification-approved",{},"abc","same"); store.event(run.id,"specification-approved",{},"abc","same"); store.close();
  store=new WorkflowStateStore(path); expect(store.active("F-001")?.id).toBe(run.id); expect(store.events(run.id)).toHaveLength(1); store.update(run.id,"complete","complete"); expect(store.start("F-001").id).not.toBe(run.id); store.close();
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
