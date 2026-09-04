# Lengthwise

Lengthwise is a local-first, provider-neutral engineering control plane. Git-tracked
Markdown and YAML artifacts are authoritative; the graph, workflow projections,
workbench, and AI handoffs derive from those artifacts.

To install dependencies:

```bash
bun install
```

To run the CLI:

```bash
bun run lw check
```

To launch the local Minimal Workbench:

```bash
bun run lw serve
```

The first launch builds the SvelteKit client when needed, then serves the workbench at `http://127.0.0.1:7331`. The URL remains stable across restarts. Use `bun run lw serve --port <PORT>` when a different fixed port is needed. The workbench edits recognized repository artifacts directly and validates the Project Graph after explicit saves.

The CLI and standalone workbench are clients of the same headless application and
domain services. Programmatic clients can import the in-process API without starting
a server:

```ts
import { LengthwiseApplication } from "lengthwise";

const opened = await LengthwiseApplication.open(process.cwd());
if (opened.ok) {
  console.log(opened.application.explainReadiness("TASK-039"));
}
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for client ownership, application operations,
snapshot semantics, and the provider-neutral AI context/invocation boundary.

The repository includes the eleven validated provider-neutral canonical skill
packages. `WorkflowCoordinator.prepareAiInvocation(runId, actionId)` returns a
serializable task package for a current eligible AI action; it never selects or
invokes a provider. Implementation packages become available after `handoff` has
atomically recorded their authoritative attempt identity.

Development verification:

```bash
bun run typecheck
bun run test
bun run build:workbench
bun run lw index
bun run lw check
```
