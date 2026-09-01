import { mkdir } from "node:fs/promises";
import { buildProjectGraph } from "../graph/build.ts";
import { runChecks } from "../checks/run.ts";
import type { Diagnostic } from "../diagnostics.ts";
import { WorkflowStateStore, type WorkflowRun } from "./state-store.ts";
import { buildContractContext, evidenceSatisfaction } from "./projections.ts";

export interface WorkflowAssessment { featureId: string; repositoryValid: boolean; diagnostics: Diagnostic[]; blockingQuestions: string[]; tasks: Array<{id:string; contract?: string; contractStale?: boolean}>; specificationEligible: boolean; buildContractEligible: boolean; completionEligible: boolean; fingerprint: string }

export class WorkflowCoordinator {
  private constructor(readonly repoRoot: string, readonly state: WorkflowStateStore) {}
  static async open(repoRoot: string) { await mkdir(`${repoRoot}/.lengthwise`, { recursive: true }); return new WorkflowCoordinator(repoRoot, new WorkflowStateStore(`${repoRoot}/.lengthwise/state.db`)); }
  async start(featureId: string): Promise<WorkflowRun> { const assessment = await this.assess(featureId); if (!assessment.repositoryValid) throw new Error("Repository is not valid"); return this.state.start(featureId, "specify"); }
  async assess(featureId: string): Promise<WorkflowAssessment> {
    const built = await buildProjectGraph(this.repoRoot); if (!built.ok) return {featureId,repositoryValid:false,diagnostics:built.diagnostics,blockingQuestions:[],tasks:[],specificationEligible:false,buildContractEligible:false,completionEligible:false,fingerprint:"invalid"};
    const feature = built.graph.getEntity(featureId); if (!feature || feature.type !== "feature") throw new Error(`Unknown feature ${featureId}`);
    const diagnostics = runChecks(built.graph,built.config); const blockingQuestions = built.graph.outgoingRelationships(featureId).filter(r=>r.type==="has-question").map(r=>built.graph.getEntity(r.to)).filter(q=>q?.type==="question"&&q.lifecycle==="open"&&q.blocking).map(q=>q!.id);
    const requirements = built.graph.outgoingRelationships(featureId).filter(r=>r.type==="addresses").map(r=>r.to);
    const tasks = built.graph.entitiesOfType("task").filter(t=>built.graph.outgoingRelationships(t.id).some(r=>r.type==="implements"&&requirements.includes(r.to))).map(t=>{const context=buildContractContext(built.graph,t.id);const contract=built.graph.incomingRelationships(t.id).filter(r=>r.type==="contracts").map(r=>built.graph.getEntity(r.from)).find(e=>e?.type==="build-contract"&&e.lifecycle==="accepted");return {id:t.id,contract:contract?.id,contractStale:contract?.type==="build-contract"?contract.fingerprint!==context.fingerprint:undefined};});
    const hasErrors=diagnostics.some(d=>d.severity==="error"); const specificationEligible=!hasErrors&&!blockingQuestions.length;
    const buildContractEligible=specificationEligible&&tasks.length>0&&tasks.every(t=>t.contract&&!t.contractStale);
    const completionEligible=buildContractEligible&&tasks.every(t=>built.graph.getEntity(t.id)?.lifecycle==="done")&&built.graph.entitiesOfType("verification").filter(v=>v.required).every(v=>evidenceSatisfaction(built.graph,v.id).satisfied);
    const fingerprint=Bun.hash(JSON.stringify({featureId,requirements:[...requirements].sort(),tasks})).toString(16);
    return {featureId,repositoryValid:true,diagnostics,blockingQuestions,tasks,specificationEligible,buildContractEligible,completionEligible,fingerprint};
  }
  approve(runId:string, gate:"specification"|"build-contract"|"verification", fingerprint:string){ this.state.event(runId,`${gate}-approved`,{},fingerprint,`${runId}:${gate}:${fingerprint}`); return this.state.update(runId,gate==="build-contract"?"implementation":"planning","running"); }
  close(){this.state.close();}
}
