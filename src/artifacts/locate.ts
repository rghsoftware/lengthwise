/**
 * Best-effort 1-based line number of the first occurrence of an entity's `id:`
 * declaration in the original source text. Bun's YAML parser does not expose
 * node positions, so this textual approximation is the source-location
 * mechanism (TASK-003/TASK-004 BOUNDED discretion) — good enough to locate a
 * declaration for a human or agent, not a byte-exact parser position.
 */
export function locateEntityId(text: string, id: string): number | undefined {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Matches both block style (`- id: FOO`) and flow style (`{ id: FOO, ... }`).
  const pattern = new RegExp(`\\bid:\\s*["']?${escaped}["']?(?=[,}\\s]|$)`, "m");
  const match = pattern.exec(text);
  if (!match) return undefined;
  return text.slice(0, match.index).split("\n").length;
}
