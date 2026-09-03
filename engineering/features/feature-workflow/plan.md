---
lengthwise: 1
id: PLAN-F003
type: plan
lifecycle: accepted
relationships:
  - { type: contains, to: TASK-021 }
  - { type: contains, to: TASK-022 }
  - { type: contains, to: TASK-023 }
  - { type: contains, to: TASK-024 }
  - { type: contains, to: TASK-025 }
  - { type: contains, to: TASK-026 }
  - { type: contains, to: TASK-027 }
  - { type: contains, to: TASK-028 }
  - { type: contains, to: TASK-029 }
  - { type: contains, to: TASK-030 }
  - { type: contains, to: TASK-031 }
  - { type: contains, to: TASK-032 }
  - { type: contains, to: TASK-033 }
  - { type: contains, to: TASK-034 }
  - { type: contains, to: TASK-035 }
---

# F-003 — Feature Workflow Plan

## Architecture

Extend the shared semantic core before adding workflow presentation:

```text
authoritative artifacts
        ↓
extended domain + Project Graph
  Question | Evidence | BuildContract
        ↓
lifecycle/rigor-aware checks + projections
        ↓
workflow application services
  ├── run reconciliation
  ├── eligibility and gates
  ├── contract generation/staleness
  ├── evidence satisfaction
  └── completion reconciliation
        ↕
.lengthwise/state.db
        ↓
existing loopback API
        ↓
Minimal Workbench workflow context
```

The workflow consumes graph and check results. It does not parameterize project validity by workflow phase. Operational transactions may propose or coordinate authoritative writes, but the existing artifact service remains the only write path and the rebuilt graph remains the engineering input to subsequent actions.

## Domain and relationship changes

Add entity types:

- `question`: `open | answered | withdrawn`, prompt, blocking flag, optional resolution;
- `evidence`: `recorded | superseded | withdrawn`, outcome, method/result reference, applicability or revision context;
- `build-contract`: `accepted | superseded`, task context, decision-authority sections, included entity identities, and governing-context fingerprint. A generated candidate is a derived projection until acceptance.

Add relationship semantics:

- Feature `has-question` Question; Question `concerns` narrower engineering context; Question `resolved-by` an authoritative governing entity;
- Evidence `supports` Verification, many-to-many;
- BuildContract `contracts` Task;
- BuildContract `includes` relevant context entities;
- BuildContract `governed-by` remains the inverse projection of existing Decision `governs` where direct governance is declared.

These authored directions are locked. TASK-021 defines clear inverse labels and type constraints in the relationship registry. Relationships must be declared once and retain provenance. The accepted registry must support deterministic traversal from a Feature to its specification, plan, tasks, contracts, verification definitions, and Evidence.

All entity types gain an optional explicit `rigor: light | standard | strict` override. Parent inheritance traverses incoming authoritative `contains` relationships; the nearest parent override wins, and an equally-near conflict is a finding. Relationship types such as `has-question` and `contracts` establish domain context but do not silently become policy parentage.

## Operational schema

`.lengthwise/state.db` owns only:

- workflow run identity, Feature ID, lifecycle, current activity, and timestamps;
- action attempt and idempotency identities;
- waits, cancellation, interruption, and retry state;
- gate requests and decisions with the graph/context fingerprint reviewed;
- implementation handoff/return coordination, structured completion claims, attempt identities, and verification-to-implementation retry context;
- successful reconciliation baselines and explanatory history;
- schema version and migrations.

Operational rows may reference entity IDs and fingerprints but never contain the sole authoritative representation of an engineering entity.

## Task DAG

```text
TASK-021
   ├──────────┬───────────┐
   ▼          ▼           ▼
TASK-022   TASK-023    TASK-024
   └────┬─────┴─────┬─────┘
        ▼           ▼
     TASK-025    TASK-028
        ▼           │
     TASK-026       │
        ▼           │
     TASK-027 ◄─────┘
        ├───────────┐
        ▼           ▼
     TASK-029    TASK-030
        └─────┬─────┘
              ▼
           TASK-031
              ▼
           TASK-032
              ▼
           TASK-033
              ▼
           TASK-034
              ▼
           TASK-035
```

TASK-022 migrates this feature's bootstrap document-form Build Contracts after the domain accepts `build-contract`. TASK-028 builds generation only after the new graph semantics, rigor rules, and operational foundation exist. UI work follows stable service behavior rather than defining workflow semantics in Svelte.

## Verification strategy

- domain/parser/graph tests establish new entity, lifecycle, relationship, and provenance semantics;
- policy tests establish lifecycle-aware completeness and parent rigor inheritance, including ambiguity diagnostics;
- SQLite integration tests establish isolation, migration, transaction, restart, and idempotency behavior;
- service tests establish reconciliation, gate eligibility, evidence satisfaction, contract slicing/fingerprints, staleness, readiness, and completion;
- HTTP/browser tests establish the observable workbench workflow and retained-graph repair behavior;
- fixture inspection establishes bounded contracts and implementer neutrality;
- dogfood runs F-003's own accepted artifacts through specification, contract, implementation-return, verification, reconciliation, and completion scenarios;
- focused service and restart scenarios prove false completion claims, successful same-contract retry, governing-context reconciliation, and durable retry resumption;
- human usability and design review evaluate comprehensibility and meaningful gate presentation.

## Bootstrap acceptance sequence

1. Accept F-003 specification, requirements/NFRs, DRs, and plan at the Specification gate.
2. Review the task DAG, verification topology, and bootstrap document-form Build Contracts.
3. Accept the Build Contract gate and transition F-003 to `ready` only after current checks pass.
4. Implement tasks in DAG order using the accepted contracts.
5. When TASK-022 lands, migrate `DOC-F003-BUILD-CONTRACTS` to first-class BuildContract entities without changing the accepted task boundaries.
6. Collect first-class Evidence once TASK-030 supports it; reconcile bootstrap evidence as needed.

## Delivery boundary

F-003 stops at provider-neutral implementation coordination. R-005 — Implementer Execution owns future implementer/provider invocation. No task in this plan may add code generation, provider adapters, worktree orchestration, remote execution, or parallel agent control.
