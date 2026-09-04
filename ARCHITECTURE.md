# Headless Core and Clients

Lengthwise is a local-first engineering control plane. Git-tracked engineering
artifacts are authoritative; every user interface, database, projection, and AI
handoff is derived or operational state.

The standalone workbench is a Lengthwise client. It is not the owner of the
domain model and is not the template for every future client.

## Layering

```text
IDE or host
  editor | SCM | terminal | debugger | AI runtime
       |
Lengthwise client adapter
  CLI | workbench | VS Code | Neovim | JetBrains | automation
       |
Lengthwise application API
  project queries | checks | workflow commands | explanations | AI projections
       |
Lengthwise core
  artifacts | graph | readiness | policy | contracts | evidence | workflow
       |
Repository artifacts       Operational state       Disposable index
Git-authoritative          .lengthwise/state.db    .lengthwise/index.db
```

Dependencies point downward. A client may format, navigate, and request an
operation. It must not independently decide readiness, workflow eligibility,
contract currency, Evidence satisfaction, or completion eligibility.

## Logical API

The repository-local Bun entry point is the side-effect-free package root:

```ts
import { LengthwiseApplication, WorkflowCoordinator } from "lengthwise";

const opened = await LengthwiseApplication.open(repoRoot);
if (!opened.ok) {
  // Configuration prevented any graph from being built.
  console.error(opened.diagnostics);
  return;
}

const readiness = opened.application.explainReadiness("TASK-039");
const checks = opened.application.checkProject();

const workflow = await WorkflowCoordinator.open(repoRoot);
const view = await workflow.inspectFeature("F-004");
await workflow.perform({
  kind: "handoff",
  runId: view.run!.id,
  taskId: "TASK-039",
  idempotencyKey: crypto.randomUUID(),
});
workflow.close();
```

`LengthwiseApplication` is an immutable view of one repository evaluation. Its
application operations include:

- `checkProject()`
- `listEntities(...)` and `getEntity(...)`
- `getTraceability(...)`, which returns direct declared and inverse-projected edges
- `listTaskReadiness()` and `explainReadiness(...)`
- `getTaskDependencies(...)`
- `getVerificationEvidence(...)`
- `rebuildIndex()`
- `buildAiContext(...)`

Open a new application instance to observe filesystem changes. This explicit
snapshot behavior prevents a client from accidentally mixing results from
different repository revisions.

`WorkflowCoordinator` is the command-oriented application service. It rebuilds
from authoritative artifacts before consequential decisions and owns:

- feature workflow assessment and structured blockers;
- active and historical workflow inspection;
- gate approval;
- implementation handoff, return, retry, and verification routing;
- interruption, reconciliation, cancellation, and completion;
- preparation of AI invocations from a current eligible workflow action;
- operational workflow persistence.

Implementation handoff, return, return evaluation, and gate approval use immediate
SQLite transactions. One task can have only one active implementation wait per run,
and active waits, unevaluated returns, and pending retries block final verification
and completion. Versioned monotonic event and attempt sequences make replay and
reconciliation independent of timestamp precision or random IDs. Returned claims are
normalized with authoritative Task, accepted Build Contract/fingerprint, and attempt
identity while preserving obligation assessments, gaps, changed files, checks and
results, and external-verification requirements across application, CLI, HTTP, and
workbench clients.

Call `close()` when a coordinator is no longer needed. Its SQLite store is an
implementation detail and is not exposed to clients.

## Evaluation Semantics

`evaluateProject` is the internal composition point for repository loading and
deterministic graph checks. It deliberately keeps two diagnostic partitions:

- build diagnostics come from configuration, discovery, parsing, and normalization;
- check diagnostics come from structural and completeness checks over the graph.

This preserves established policies without duplicating orchestration:

- `lw index` may write the available partial projection but reports build problems;
- `lw check` reports both partitions;
- the workbench retains its last successful graph after a build error, but adopts a
  newly built graph that has check findings;
- workflow advancement refuses a repository with build errors and applies its
  existing feature-scoped blockers to check findings.

`graphAvailable`, `repositoryValid`, and `clean` are intentionally distinct.
Clients should render these facts, not reinterpret graph diagnostics as their own
workflow policy.

## Workbench Client

The existing Svelte workbench remains intact as a rich client:

- `WorkbenchSession` owns editor-session behavior, optimistic saves, graph retention,
  and model-change comparison;
- `ProjectQueryService` supplies the same entity, relationship, and readiness
  projections used by the headless application facade;
- the Bun HTTP server adapts requests to application operations;
- `WorkflowCoordinator` supplies assessment, eligibility, blockers, and commands;
- workflow responses identify the current/pending gate, primary action, typed
  subject, and optional canonical AI binding so the browser does not infer them
  from activity names or action IDs;
- Svelte renders returned state and delegates text editing to CodeMirror.

The HTTP routes are a workbench transport adapter, not the canonical API. No
daemon or network protocol is required to use Lengthwise in process.

## Client Ownership

Lengthwise owns:

- artifact recognition and normalized entity semantics;
- graph traversal and traceability projections;
- workflow transitions and operational state;
- readiness, blockers, gates, and completion eligibility;
- Build Contract context and stale detection;
- verification and Evidence applicability;
- deterministic diagnostics and explanations;
- canonical engineering skills, bounded context, and AI action projections.

The host owns:

- text and code editing;
- file browsing, SCM, diff, merge, terminal, debugging, and language services;
- generic AI chat and session UI;
- provider selection, authentication, streaming, tool execution, and patch application.

A client can choose how to display a blocker or which native command opens its
artifact. It cannot recalculate whether the blocker exists.

## AI Boundary

Canonical skills loaded from the single bundled `skills/` source remain
provider-neutral Lengthwise semantics; `src/skills` owns validation and identity.
Registry validation enforces each standard skill's semantic binding plus its minimum
required context, outcomes, and deterministic post-checks; syntax-only manifests are
not accepted as compatible action contracts.
The AI application layer adds two projections without adding a model runtime:

1. `buildAiContext({ targetId, purpose })` selects a deterministic, deny-by-default
   graph slice. For an implementation task this includes the task, accepted Build
   Contract, requirements, acceptance criteria, decisions, dependencies, plan,
   verifications, relevant Questions, project policy, and scoped findings while
   excluding unrelated entities.
2. `WorkflowCoordinator.prepareAiInvocation(...)` re-assesses an active run,
   resolves the action's skill from that validated canonical registry, requires a
   current eligible skill-bound action, and supplies operational
   context such as the action fingerprint, prior attempt, retry context, or
   completion claim when available.

The invocation contains semantic action identity, methodology, required context
slots, expected outcomes, post-checks, and escalation reasons. It contains no
provider, model, credentials, transport, chat history, or execution loop.

Context that only workflow can supply, such as a prior attempt or an implementation
completion claim, is projected internally by the coordinator. Missing required
slots produce structured `ai-context-slot-missing` blockers; Lengthwise does not
fabricate them. An implementation handoff is persisted before its invocation is
prepared, so the package includes the authoritative implementation-attempt identity.

`WorkflowCoordinator.open` accepts `canonicalSkillRoot` only to locate the one
validated registry in a relocated deployment. It does not layer project-local
skills or accept caller-selected packages per action.

Bounded project context alone is not authorization to execute work. The
coordinator is the sole public invocation producer so eligibility and context
freshness are checked immediately before invocation projection.
Provider-specific instructions, skill directories, MCP resources, or command
formats are projections of this representation, never authority.

## Current Migrations

- `lw index`, `lw check`, `lw show`, `lw trace`, and `lw ready` use
  `LengthwiseApplication`.
- CLI workflow status and the workbench workflow endpoint use one
  `inspectFeature` operation.
- CLI and workbench workflow actions use one discriminated `perform` operation.
- The workbench session uses application-layer project evaluation and queries.
- AI-capable workflow actions identify their canonical skill, semantic action,
  context purpose, and actual task/Feature target.
- The package root now exports a side-effect-free programmatic API.

Deliberately deferred work:

- choosing an out-of-process transport;
- replacing page-local workbench transport DTO declarations with generated or shared
  browser-safe contracts;
- moving feature-capture file creation through a generalized artifact-creation service;
- completing the skill bindings and operational context projection for every
  workflow action;
- provider-specific AI projections and installation;
- producing a distributable JavaScript/declaration package for clients outside
  this Bun repository (the current source entry relies on repository transforms);
- grouping the remaining non-coordination multi-write workflow transitions into store
  transactions (handoff, return, return evaluation, and gate approval are already
  atomic, and active handoffs have a database uniqueness invariant);
- a full IDE extension.

## Next Vertical Slice

The next reference client should be a small VS Code extension that calls this
logical API in process. It should detect a configured project, list Features and
Tasks, open each entity's authoritative source, show the structured result of
`explainReadiness`, and expose one workflow command. It should use VS Code's own
editor, SCM, terminal, diff, authentication, and AI facilities rather than
recreating them.
