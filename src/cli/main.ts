#!/usr/bin/env bun
import { cmdCheck, cmdIndex, cmdReady, cmdShow, cmdTrace } from "./commands.ts";
import type { CommandResult } from "./commands.ts";

const USAGE = `Usage: lw <command> [args]

Commands:
  index          Build/rebuild the Project Graph index
  check          Validate the Project Graph and report findings
  show <ID>      Show an entity's type, properties, source, and relationships
  trace <ID>     Show an entity's traceability relationships
  ready          List tasks whose dependencies are satisfied

Flags:
  --json         Print machine-readable JSON instead of formatted text
`;

export async function runCli(argv: string[], repoRoot: string): Promise<CommandResult> {
  const args = argv.filter((arg) => arg !== "--json");
  const [command, ...rest] = args;

  switch (command) {
    case "index":
      return cmdIndex(repoRoot);
    case "check":
      return cmdCheck(repoRoot);
    case "show":
      return cmdShow(repoRoot, rest[0]);
    case "trace":
      return cmdTrace(repoRoot, rest[0]);
    case "ready":
      return cmdReady(repoRoot);
    default:
      return { exitCode: 1, lines: [USAGE], data: { ok: false, error: "unknown command" } };
  }
}

if (import.meta.main) {
  const useJson = process.argv.includes("--json");
  const result = await runCli(process.argv.slice(2), process.cwd());
  if (useJson) {
    console.log(JSON.stringify(result.data, null, 2));
  } else {
    for (const line of result.lines) console.log(line);
  }
  process.exit(result.exitCode);
}
