import type { EntityType } from "../domain/entities.ts";

export const ENTITY_LIFECYCLES: Record<EntityType, readonly string[]> = {
  requirement: ["draft", "accepted", "deprecated"],
  "non-functional-requirement": ["draft", "accepted", "deprecated"],
  "acceptance-criterion": ["draft", "accepted", "deprecated"],
  decision: ["proposed", "accepted", "superseded", "rejected"],
  document: ["draft", "accepted", "superseded"],
  plan: ["draft", "accepted", "superseded"],
  feature: ["draft", "ready", "active", "complete"],
  task: ["planned", "in-progress", "done", "cancelled"],
  verification: ["draft", "defined", "retired"],
  "roadmap-item": ["planned", "active", "complete", "deferred"],
  question: ["open", "answered", "withdrawn"],
  evidence: ["recorded", "superseded", "withdrawn"],
  "build-contract": ["accepted", "superseded"],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceLifecycle(line: string, current: string, next: string): string | undefined {
  const match = /((?:"lifecycle"|'lifecycle'|lifecycle)\s*:\s*)("[^"]*"|'[^']*'|[^,\s}\]]+)/.exec(line);
  if (!match) return undefined;
  const encoded = match[2]!;
  const actual = encoded.replace(/^(?:"|')|(?:"|')$/g, "");
  if (actual !== current) throw new Error(`Lifecycle changed after the entity was loaded; expected ${current}, found ${actual}.`);
  const quote = encoded.startsWith('"') ? '"' : encoded.startsWith("'") ? "'" : "";
  return `${line.slice(0, match.index)}${match[1]}${quote}${next}${quote}${line.slice(match.index + match[0].length)}`;
}

export function updateLifecycleContent(content: string, entityId: string, current: string, next: string): string {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  const id = escapeRegExp(entityId);
  const idPattern = new RegExp(`(?:^|[\\s{,-])(?:"id"|'id'|id)\\s*:\\s*(?:"${id}"|'${id}'|${id})(?=\\s*[,}\\]]|\\s*$)`);
  const candidates = lines.flatMap((line, index) => idPattern.test(line) ? [index] : []);
  if (candidates.length !== 1) throw new Error(`Could not uniquely locate ${entityId}'s authoritative lifecycle field.`);
  const start = candidates[0]!;
  const inline = replaceLifecycle(lines[start]!, current, next);
  if (inline !== undefined) lines[start] = inline;
  else {
    const startIndent = /^\s*/.exec(lines[start]!)![0].length;
    let changed = false;
    for (let index = start + 1; index < lines.length; index += 1) {
      const line = lines[index]!;
      if (/^\s*-\s+(?:"id"|'id'|id)\s*:/.test(line) && /^\s*/.exec(line)![0].length <= startIndent) break;
      const replacement = replaceLifecycle(line, current, next);
      if (replacement !== undefined) { lines[index] = replacement; changed = true; break; }
    }
    if (!changed) throw new Error(`Could not locate ${entityId}'s lifecycle field.`);
  }
  return lines.join(newline);
}
