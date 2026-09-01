---
lengthwise: 1
id: F-002
type: feature
title: Minimal Workbench
lifecycle: ready
significance: L
relationships:
  - { type: addresses, to: REQ-013 }
  - { type: addresses, to: REQ-014 }
  - { type: addresses, to: REQ-015 }
  - { type: addresses, to: REQ-016 }
  - { type: addresses, to: REQ-017 }
  - { type: addresses, to: REQ-018 }
  - { type: addresses, to: REQ-019 }
  - { type: addresses, to: REQ-020 }
---

# F-002 — Minimal Workbench

## Goal

Provide a usable local browser interface for inspecting, understanding, navigating, editing, and validating the authoritative Lengthwise engineering model.

The workbench exists to teach us how engineers use the Project Graph before Lengthwise commits to specialized graph visualizations.

## Core loop

```text
inspect
  ↓
understand
  ↓
edit authoritative artifact
  ↓
save
  ↓
re-index and validate
  ↓
inspect consequences
```

## Scope

- launch a local workbench from the Lengthwise CLI;
- browse and search entities by ID, type, title, and other useful authored text;
- inspect authored properties, type-specific lifecycle, derived state, source, and relationships;
- navigate incoming and outgoing relationships as ordinary entity links;
- read and edit the authoritative Markdown or YAML artifact containing an entity;
- provide CodeMirror 6 language support for Markdown, YAML, and Markdown frontmatter;
- use explicit save with a visible dirty state and protection against accidental discard;
- after save, rebuild the graph and run the same checks used by other Lengthwise clients;
- retain the last successfully built graph when a saved artifact makes the repository invalid;
- show actionable findings and navigate them to responsible entities and source locations where known;
- summarize meaningful model changes between consecutive successful graph builds in the workbench session;
- keep graph, validation, artifact, and change semantics in reusable application services outside UI components.

## Information architecture

The minimum usable structure is:

```text
entity navigation/search
        │
        ▼
entity inspection ── relationship links ──► entity inspection
        │
        ▼
authoritative source editor
        │
        ▼
validation findings + model-change summary
```

Exact pane arrangement and visual styling are bounded implementation choices. The user must be able to keep their place through the edit/validate/consequence loop.

## Save and invalid-model semantics

Save is explicit. A successful write updates the repository artifact, then attempts to rebuild and check the engineering model.

If rebuilding fails, the saved artifact remains authoritative and the UI clearly identifies the repository as invalid. Navigation continues against the last successfully built graph so the user can understand and repair the failure. The editor continues to show the saved artifact, not stale graph-derived text. A later successful rebuild replaces the retained graph.

The UI warns before an unsaved edit would be discarded through entity/artifact navigation, reload, or closing the page using the browser mechanisms available to it.

## Model-change feedback

After each successful rebuild, compare the resulting normalized graph to the previous successful graph in the current workbench session. Report, where present:

- entities added or removed;
- lifecycle changes;
- relationships added or removed;
- verification or implementation coverage lost;
- blocking findings added or resolved.

This summary is graph-oriented and session-scoped. It is not a line diff, Git history viewer, or general replacement for Git tooling. Failed rebuilds do not advance the comparison baseline.

## Architectural boundary

```text
authoritative repository artifacts
              │
              ▼
Lengthwise application services
  ├── artifact read/write
  ├── graph build/query
  ├── checks/findings
  └── successful-build comparison
              │
              ▼
local HTTP boundary
              │
              ▼
SvelteKit + CodeMirror workbench
```

The CLI, workbench, and later clients consume the same application behavior. Svelte components may compose and present results but do not reimplement graph, validation, source-safety, or graph-diff rules.

## Local trust boundary

The MVP is a single-user local development tool. It binds to loopback by default, serves only the explicitly selected Lengthwise project, accepts artifact paths only after server-side resolution against configured discovery scope, and does not expose a general filesystem API. Remote hosting, authentication, multi-user concurrency, and cross-machine access are outside F-002.

## Non-scope

- visual traceability graph canvas;
- execution DAG visualization;
- architecture visualization;
- structured forms replacing repository artifacts;
- arbitrary repository file editing or artifact creation UI;
- Git line diffs, staging, commits, or history;
- workflow orchestration or feature lifecycle automation;
- AI/Codex execution or provider abstraction work;
- worktree orchestration;
- Turso or multi-machine state;
- Electron, Tauri, or another desktop wrapper;
- remote deployment, authentication, or collaboration;
- visual polish without a usability purpose.

## Technology policy

- Bun and TypeScript remain the backend/core baseline.
- SvelteKit is the browser UI framework.
- Tark UI's Svelte component set is the default source for workbench UI components.
- CodeMirror 6 is the source editor.
- `lw serve` launches the browser-hosted local UI.
- HTTP is required for the local client boundary; WebSocket or server-sent-event use is bounded by demonstrated interaction needs.

## Policy

F-002 significance is `L`: it introduces a write-capable user interface and a new application/service boundary over the authoritative engineering model. Effective rigor is inherited `standard`.

## Completion

F-002 is complete when required tasks are done, required verifications have satisfactory evidence, no blocking findings remain, the observable core loop passes automated and human usability evaluation, and implementation and governing artifacts have converged.
