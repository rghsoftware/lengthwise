import type { ProjectGraph } from "../graph/project-graph.ts";
import { buildContractContext } from "./projections.ts";

export function contractCandidate(graph: ProjectGraph, taskId: string) {
  const context=buildContractContext(graph,taskId);
  const authority={LOCKED:[] as string[],BOUNDED:[] as string[],DELEGATED:[] as string[]};
  for(const id of context.decisions){const decision=graph.getEntity(id); if(decision?.type==="decision"&&decision.authority) authority[decision.authority].push(id);}
  const included=[...context.requirements,...context.criteria,...context.decisions,...context.verifications,...context.dependencies];
  return { id:`BC-${taskId}`, type:"build-contract" as const, title:`Build Contract for ${taskId}`, lifecycle:"accepted" as const, fingerprint:context.fingerprint, inputFingerprints:context.inputFingerprints, locked:authority.LOCKED, bounded:authority.BOUNDED, delegated:authority.DELEGATED, relationships:[{type:"contracts",to:taskId},...included.map(to=>({type:"includes",to}))] };
}
export function renderContractArtifact(graph:ProjectGraph, taskIds:string[]):string { return `lengthwise: 1\nentities:\n${[...taskIds].sort().map(id=>`  - ${JSON.stringify(contractCandidate(graph,id))}`).join("\n")}\n`; }
