import type { ProjectGraph } from "../graph/project-graph.ts";
import { buildContractContext } from "./projections.ts";

export function contractCandidate(graph: ProjectGraph, taskId: string) {
  const context=buildContractContext(graph,taskId);
  return {
    id:`BC-${taskId}`, type:"build-contract" as const, title:`Build Contract for ${taskId}`, lifecycle:"accepted" as const,
    fingerprint:context.fingerprint,
    locked:["Satisfy the addressed requirements and verification obligations in this bounded context.","Preserve repository authority, state separation, deterministic checks, and accepted governing decisions."],
    bounded:["Internal design and decomposition choices that preserve the observable contract."],
    delegated:["Private naming and helper organization without contract impact."],
    relationships:[{type:"contracts",to:taskId},...context.requirements.map(to=>({type:"includes",to})),...context.criteria.map(to=>({type:"includes",to})),...context.verifications.map(to=>({type:"includes",to})),...context.dependencies.map(to=>({type:"includes",to}))]
  };
}

export function renderContractArtifact(graph:ProjectGraph, taskIds:string[]):string {
  return `lengthwise: 1\nentities:\n${[...taskIds].sort().map(id=>`  - ${JSON.stringify(contractCandidate(graph,id))}`).join("\n")}\n`;
}
