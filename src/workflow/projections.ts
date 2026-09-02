import type { Entity } from "../domain/entities.ts";
import type { ProjectGraph } from "../graph/project-graph.ts";

export function entitySemanticFingerprint(entity: Entity | undefined): string {
  if (!entity) return "missing";
  const { source: _source, ...authored } = entity;
  return Bun.hash(JSON.stringify(authored, Object.keys(authored).sort())).toString(16);
}
function contractInputFingerprint(entity:Entity|undefined):string{if(!entity)return "missing";if(entity.type!=="task")return entitySemanticFingerprint(entity);const {source:_source,lifecycle:_lifecycle,...semantic}=entity;return Bun.hash(JSON.stringify(semantic,Object.keys(semantic).sort())).toString(16);}
export function verificationContextFingerprint(graph: ProjectGraph, verificationId: string): string {
  const verification = graph.getEntity(verificationId);
  const criteria = graph.outgoingRelationships(verificationId).filter(r=>r.type==="verifies").map(r=>r.to).sort();
  return Bun.hash(JSON.stringify({ verification: entitySemanticFingerprint(verification), criteria: criteria.map(id=>[id,entitySemanticFingerprint(graph.getEntity(id))]) })).toString(16);
}
export type EvidenceStatus = "satisfactory" | "missing" | "failing" | "inconclusive" | "stale" | "inapplicable" | "missing-complement";
export function evidenceSatisfaction(graph: ProjectGraph, verificationId: string, currentRevision?:string) {
  const verification = graph.getEntity(verificationId); if (!verification || verification.type !== "verification") throw new Error(`Unknown verification ${verificationId}`);
  const currentFingerprint = verificationContextFingerprint(graph, verificationId);
  const evidence = graph.incomingRelationships(verificationId).filter(r => r.type === "supports").map(r => graph.getEntity(r.from)).filter((e): e is Extract<Entity,{type:"evidence"}> => e?.type === "evidence");
  const assessments = evidence.map(item => {
    let status: EvidenceStatus;
    const declaredFingerprint=item.contextFingerprints?.[verificationId]??item.contextFingerprint??(item.applicability.startsWith("fingerprint:")?item.applicability.slice(12).trim():undefined);
    if (item.lifecycle !== "recorded" || /^inapplicable\b/i.test(item.applicability)) status = "inapplicable";
    else if(item.revision&&(!currentRevision||item.revision!==currentRevision)) status="stale";
    else if (!declaredFingerprint) status = "inapplicable";
    else if (declaredFingerprint !== currentFingerprint) status = "stale";
    else if (item.outcome === "failed") status = "failing";
    else if (item.outcome === "inconclusive") status = "inconclusive";
    else status = "satisfactory";
    return { evidenceId:item.id, kind:item.kind, status, source:item.source, applicability:item.applicability };
  });
  const satisfactory = assessments.filter(a=>a.status==="satisfactory");
  const requirements = [...new Set(verification.evidenceRequirements ?? [])].sort();
  const missingComplements = requirements.filter(kind=>!satisfactory.some(item=>item.kind===kind));
  const satisfied = satisfactory.length > 0 && missingComplements.length === 0;
  const status: EvidenceStatus = satisfied ? "satisfactory" : evidence.length===0 ? "missing" : missingComplements.length ? "missing-complement" : assessments.some(a=>a.status==="failing") ? "failing" : assessments.some(a=>a.status==="stale") ? "stale" : assessments.some(a=>a.status==="inconclusive") ? "inconclusive" : "inapplicable";
  return { satisfied, status, currentFingerprint, requiredKinds:requirements, missingComplements, evidence, assessments };
}
export function buildContractContext(graph: ProjectGraph, taskId: string) {
  const task = graph.getEntity(taskId); if (!task || task.type !== "task") throw new Error(`Unknown task ${taskId}`);
  const requirements = graph.outgoingRelationships(taskId).filter(r => r.type === "implements").map(r => r.to).sort();
  const criteria = requirements.flatMap(id => graph.outgoingRelationships(id).filter(r => r.type === "has-acceptance-criterion").map(r => r.to)).sort();
  const verifications = [...new Set(criteria.flatMap(id => graph.incomingRelationships(id).filter(r => r.type === "verifies").map(r => r.from)))].sort();
  const dependencies = graph.outgoingRelationships(taskId).filter(r => r.type === "depends-on").map(r => r.to).sort();
  const governed = new Set([taskId,...requirements,...criteria,...verifications]);
  const decisions = graph.entitiesOfType("decision").filter(d=>d.lifecycle==="accepted" && graph.outgoingRelationships(d.id).some(r=>r.type==="governs"&&governed.has(r.to))).map(d=>d.id).sort();
  const context = { task: taskId, requirements, criteria, decisions, verifications, dependencies };
  const semanticIds=[taskId,...requirements,...criteria,...decisions,...verifications,...dependencies];
  const inputFingerprints=Object.fromEntries([...new Set(semanticIds)].sort().map(id=>[id,contractInputFingerprint(graph.getEntity(id))]));
  return { ...context, inputFingerprints, fingerprint: Bun.hash(JSON.stringify({context,inputFingerprints})).toString(16) };
}
export function contractStaleness(graph:ProjectGraph, contractId:string) {
  const contract=graph.getEntity(contractId); if(!contract||contract.type!=="build-contract") throw new Error(`Unknown BuildContract ${contractId}`);
  const taskId=graph.outgoingRelationships(contractId).find(r=>r.type==="contracts")?.to;
  if(!taskId) return {stale:true,changedInputs:[{id:contractId,reason:"missing contracted task"}],currentFingerprint:"missing"};
  const current=buildContractContext(graph,taskId); const previous=contract.inputFingerprints;
  const changedInputs = previous ? [...new Set([...Object.keys(previous),...Object.keys(current.inputFingerprints)])].sort().filter(id=>previous[id]!==current.inputFingerprints[id]).map(id=>({id,reason:previous[id]===undefined?"added":current.inputFingerprints[id]===undefined?"removed":"changed"})) : contract.fingerprint===current.fingerprint ? [] : [{id:contractId,reason:"legacy contract lacks per-input fingerprints; governing context changed"}];
  return {stale:contract.fingerprint!==current.fingerprint,changedInputs,currentFingerprint:current.fingerprint};
}
