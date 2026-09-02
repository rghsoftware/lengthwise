---
lengthwise: 1
id: F-003
type: feature
title: Feature Workflow
lifecycle: active
significance: XL
relationships:
  - { type: addresses, to: REQ-021 }
  - { type: addresses, to: REQ-022 }
  - { type: addresses, to: REQ-023 }
  - { type: addresses, to: REQ-024 }
  - { type: addresses, to: REQ-025 }
  - { type: addresses, to: REQ-026 }
  - { type: addresses, to: REQ-027 }
  - { type: addresses, to: REQ-028 }
  - { type: addresses, to: REQ-029 }
  - { type: addresses, to: REQ-030 }
  - { type: addresses, to: REQ-031 }
  - { type: addresses, to: REQ-032 }
  - { type: addresses, to: REQ-033 }
  - { type: addresses, to: REQ-034 }
  - { type: addresses, to: REQ-035 }
  - { type: addresses, to: REQ-036 }
  - { type: addresses, to: REQ-037 }
  - { type: addresses, to: REQ-038 }
  - { type: addresses, to: NFR-013 }
  - { type: addresses, to: NFR-014 }
  - { type: addresses, to: NFR-015 }
  - { type: addresses, to: NFR-016 }
  - { type: addresses, to: NFR-017 }
  - { type: addresses, to: NFR-018 }
  - { type: addresses, to: NFR-019 }
  - { type: addresses, to: NFR-020 }
  - { type: addresses, to: NFR-021 }
  - { type: addresses, to: NFR-022 }
  - { type: addresses, to: NFR-023 }
  - { type: addresses, to: NFR-024 }
  - { type: contains, to: PLAN-F003 }
  - { type: contains, to: DOC-F003-BUILD-CONTRACTS }
---

# F-003 — Feature Workflow

## Problem

Lengthwise can represent, validate, inspect, and edit an engineering model, but the coordination required to create and evolve that model is still performed manually through operator knowledge and implementation prompts. F-001 and F-002 repeatedly required humans and Codex to decide what artifact came next, surface unresolved questions, run checks, judge readiness, assemble bounded implementation context, collect evidence, reconcile discoveries, and determine completion.

That coordination is not resumable and is not consistently derived from current repository state. Important unresolved decisions can remain only in conversation history, while verification and handoff boundaries are not yet machine-addressable engineering entities.

## Goal

Provide a resumable, rigor-aware workflow in the Minimal Workbench that guides a feature from an initial idea through specification, planning, implementation readiness, external implementation coordination, verification, reconciliation, and completion while keeping Git-tracked artifacts authoritative and reserving human approval for material decision boundaries.

## Semantic workflow

```text
Capture
  idea → create or attach draft Feature
       ↓
Specify
  specification + requirements/NFRs + ACs + questions + decisions
       ↓ continuous deterministic checks
Specification Gate
       ↓ accepted governing specification
Plan
  plan + task DAG + verification topology + decision authority
       ↓ generate bounded Build Contracts
Build Contract Gate
       ↓ accepted handoff contracts
Ready (derived)
       ↓ manual implementation handoff
Implement
       ↓ implementation completion claim
Verify
       ↓ required Evidence
Reconcile
       ↺ update governing artifacts, implementation, contracts, or evidence
Complete (derived eligibility, then lifecycle transition)
```

Clarification and validation are cross-cutting activities rather than single linear phases. Reconciliation may return work to specification, planning, implementation, or verification. `ready` and completion eligibility are derived; workflow activity never replaces entity lifecycle.

## State separation

```text
authoritative artifact
  Feature.lifecycle: draft | ready | active | complete

derived state
  specification complete, contract current, implementation ready,
  verification satisfied, completion eligible

operational state
  run activity, completed actions, attempts, waits, gate events,
  interruption, cancellation, reconciliation baseline
```

At most one non-terminal workflow run may exist for a feature. Historical runs remain operationally inspectable.

## Authoritative and operational flow

```text
Git-tracked engineering artifacts
              ↓
         Project Graph
              ↓
     checks + derived eligibility
              ↓
        workflow coordinator
              ↓
 .lengthwise/state.db (operational only)
```

`.lengthwise/index.db` remains disposable derived graph state. `.lengthwise/state.db` stores resumable workflow operations and approval events but never substitutes for requirements, decisions, questions, plans, tasks, verification definitions, evidence, or accepted Build Contracts.

## Entity model additions

### Question

A Question is a first-class entity that may be embedded in an existing artifact.

- lifecycle: `open | answered | withdrawn`;
- explicit `blocking: boolean`;
- prompt and resolution fields;
- stable identity and source provenance;
- `Feature --has-question--> Question` supplies feature scope;
- `Question --concerns--> Entity` identifies narrower engineering context where needed;
- `Question --resolved-by--> Entity` identifies the authoritative governing entity into which an answer was propagated.

An answered Question is historical engineering context, not governing truth by itself. A blocking Question ceases to block only when its resolution is represented in the applicable authoritative Requirement, Decision, Plan, BuildContract, or other governing entity.

### Evidence

Evidence uses lifecycle `recorded | superseded | withdrawn` and records an observed verification result, including method/result reference, outcome, applicability or revision context, and source provenance. `Evidence --supports--> Verification` is many-to-many: one item may support several verifications and one verification may require several complementary evidence items. Evidence applicability and satisfaction are derived; Evidence does not alter the definition lifecycle of a Verification.

### BuildContract

A BuildContract is a first-class authoritative entity with lifecycle `accepted | superseded` representing an accepted implementation handoff boundary. A generated candidate is derived data, not a BuildContract entity, until accepted and saved to Git. `BuildContract --contracts--> Task` identifies its handoff scope and `BuildContract --includes--> Entity` records its bounded context. Its machine-readable content records relevant requirements/NFRs, ACs, governing decisions, LOCKED/BOUNDED/DELEGATED authority, dependencies, verification obligations, and a deterministic governing-context fingerprint. A later graph state can therefore derive whether the accepted contract is current or stale without changing its lifecycle.

F-003's accepted contracts are first-class machine-readable BuildContract entities. The pre-implementation bootstrap document is retained as superseded history after TASK-022 migrated its handoff boundaries.

## Rigor and completeness

Structural validity is always enforced. Completeness remains a function of entity type, lifecycle, and effective rigor; it is not workflow-phase-aware. Effective rigor resolves from the nearest explicit entity override, otherwise its graph parent, otherwise the project default. F-003 does not add release-phase, subsystem, or arbitrary conditional policy rules.

The same semantic workflow is used at all rigor levels. Policy changes which artifacts, evidence, traceability, and approvals are required. Under the current policy, standard rigor requires specification and Build Contract gates; strict also requires final verification approval.

## Human gates

Machine checks precede both default human gates:

- **Specification gate:** Are we building the right thing, and is intended behavior sufficiently defined?
- **Build Contract gate:** Is the work sufficiently specified, planned, bounded, and verifiable to hand to an implementer?

Gate approvals are operational events. Their durable effect is the resulting accepted lifecycle or saved authoritative artifact. F-003 adds no Approval entity. A final verification/completion gate exists only where effective rigor requires it.

## Workbench interaction needs

The existing workbench gains a feature workflow context showing current activity, derived eligibility, outstanding findings, unresolved questions, pending gate, stale contracts, verification obligations, and next eligible actions. Every item navigates to its responsible entity or artifact. Workflow authoring continues to use explicit repository saves and F-002's retained-graph repair semantics.

## Scope

- workflow start, resume, cancellation, retry, and history;
- feature and artifact creation within configured repository scope;
- Question, Evidence, and BuildContract domain semantics;
- lifecycle/rigor-aware completeness and basic inherited rigor;
- specification and planning guidance;
- deterministic gate eligibility and operational gate events;
- task DAG and verification-plan coordination;
- deterministic bounded Build Contract generation, review, acceptance, and staleness;
- manual implementation handoff/return coordination;
- evidence tracking, reconciliation, readiness, and completion eligibility;
- `.lengthwise/state.db` operational persistence;
- Minimal Workbench workflow integration.

## Non-scope

- Codex App Server or other provider execution;
- automatic code generation or implementation;
- provider selection and adapter integration;
- branches, worktrees, commits, pull requests, or GitHub automation;
- parallel task agents, concurrent runs for one feature, or merge semantics;
- remote execution, multi-machine coordination, Turso, or enterprise permissions;
- arbitrary user-programmable workflows or conditional policy languages;
- advanced architecture, traceability, or execution graph visualization;
- automatic acceptance of material product, contract, evidence, or reconciliation decisions;
- guarantees of product quality from process completion.

## Completion

F-003 is complete when its required tasks are done, required verification definitions have satisfactory Evidence, no blocking findings or Questions remain, accepted Build Contracts and governing artifacts are current, implementation and governing artifacts have converged, applicable approvals are recorded, and derived completion eligibility permits the feature lifecycle to transition to `complete`.
