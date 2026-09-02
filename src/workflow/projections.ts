import type { ProjectGraph } from "../graph/project-graph.ts";

export function evidenceSatisfaction(graph: ProjectGraph, verificationId: string) {
  const evidence = graph.incomingRelationships(verificationId).filter(r => r.type === "supports").map(r => graph.getEntity(r.from)).filter(e => e?.type === "evidence");
  return { satisfied: evidence.some(e => e!.type === "evidence" && e!.lifecycle === "recorded" && e!.outcome === "passed"), evidence };
}
export function buildContractContext(graph: ProjectGraph, taskId: string) {
  const task = graph.getEntity(taskId); if (!task || task.type !== "task") throw new Error(`Unknown task ${taskId}`);
  const requirements = graph.outgoingRelationships(taskId).filter(r => r.type === "implements").map(r => r.to).sort();
  const criteria = requirements.flatMap(id => graph.outgoingRelationships(id).filter(r => r.type === "has-acceptance-criterion").map(r => r.to)).sort();
  const verifications = criteria.flatMap(id => graph.incomingRelationships(id).filter(r => r.type === "verifies").map(r => r.from)).sort();
  const dependencies = graph.outgoingRelationships(taskId).filter(r => r.type === "depends-on").map(r => r.to).sort();
  const context = { task: taskId, requirements, criteria, verifications: [...new Set(verifications)], dependencies };
  const semanticIds=[taskId,...requirements,...criteria,...context.verifications,...dependencies];
  const semantics=[...new Set(semanticIds)].sort().map(id=>{const entity=graph.getEntity(id); if(!entity) return {id,missing:true}; const {source:_source,body:_body,...authored}=entity; return authored;});
  return { ...context, fingerprint: Bun.hash(JSON.stringify({context,semantics})).toString(16) };
}
