---
lengthwise: 1
id: PLAN-F002
type: plan
lifecycle: accepted
---

# F-002 — Minimal Workbench Plan

## Delivery strategy

Build the workbench from the Project Graph outward:

```text
existing F-001 core
        │
        ▼
application service façade
  ├── safe artifact access
  ├── successful-build session
  └── normalized graph comparison
        │
        ▼
loopback HTTP API + lw serve
        │
        ▼
SvelteKit shell
  ├── navigation and inspection
  ├── relationship links
  ├── CodeMirror source editing
  ├── validation/finding navigation
  └── change feedback
        │
        ▼
automated evidence + dogfood usability review
```

Preserve the existing graph and check modules as the semantic core. Refactor only where needed to expose coherent application operations to both CLI and HTTP clients.

## Technology baseline

- Bun and TypeScript;
- existing Project Graph, check, and SQLite capabilities;
- SvelteKit for the local browser UI;
- [Tark UI](https://github.com/anubra266/tarkui) Svelte examples as the visual reference, using Tailwind CSS 4 and Ark UI primitives;
- CodeMirror 6 with Markdown and YAML language support;
- Bun-hosted local HTTP service launched by `lw serve`;
- Bun test for automated verification.

Exact package versions, UI component structure, API route naming, styling approach, and streaming mechanism are bounded implementation details.

## Task DAG

```text
TASK-011
   ├──────────────┐
   ▼              ▼
TASK-012       TASK-013
   └──────┬───────┘
          ▼
       TASK-014
          ▼
       TASK-015
          ▼
       TASK-016
          ▼
       TASK-017
          ▼
       TASK-018
       ┌──┴──┐
       ▼     ▼
TASK-019  TASK-020
```

Artifact safety and graph-session behavior are developed as core application services before UI integration. The UI is delivered as vertical capabilities after the transport contract exists. Evidence consolidation and dogfood evaluation occur only after the complete core loop is available.

TASK-020 was added and completed during implementation reconciliation. It preserves the accepted requirements while closing gaps discovered after the initial implementation: explicit conflict reload/recovery, navigation for findings whose responsible source differs from the open artifact, and complete automated coverage of normalized graph-change categories.

## Verification strategy

- service and policy tests prove deterministic graph, check, path-safety, conflict, and session semantics;
- HTTP/CLI integration tests prove the local client boundary and shared behavior;
- browser-level tests prove the observable navigation, editing, save, invalid-model recovery, and finding flows;
- code inspection verifies business logic has not migrated into Svelte components;
- human usability evaluation establishes whether representative engineers can understand the model and complete the core loop;
- human design review evaluates terminology, hierarchy, and state communication where automated assertions cannot establish comprehensibility.

## Delivery boundary

F-002 delivers a deliberately plain but coherent workbench. Advanced graph canvases, workflow controls, desktop packaging, remote access, and Git tooling require later features rather than opportunistic additions to this plan.
