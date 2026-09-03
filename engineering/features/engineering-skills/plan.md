---
lengthwise: 1
id: PLAN-F004
type: plan
lifecycle: accepted
relationships:
  - { type: contains, to: TASK-036 }
  - { type: contains, to: TASK-037 }
  - { type: contains, to: TASK-038 }
  - { type: contains, to: TASK-039 }
  - { type: contains, to: TASK-040 }
  - { type: contains, to: TASK-041 }
  - { type: contains, to: TASK-042 }
  - { type: contains, to: TASK-043 }
  - { type: contains, to: TASK-044 }
  - { type: contains, to: TASK-045 }
  - { type: contains, to: TASK-046 }
---

# F-004 — Engineering Skills Plan

## Delivery architecture

Build the canonical methodology and its deterministic contracts before adding provider packaging or operator presentation:

```text
one bundled canonical skill tree
  SKILL.md + lengthwise.yaml + support files
                    ↓
       registry + structural validation
                    ├──────────────┐
                    ↓              ↓
       semantic action binding   provider renderers
       + bounded task package    Codex | Claude
                    ↓              ↓
       lossless outcome contract safe scoped installation
                    └──────┬───────┘
                           ↓
              manual operator handoff loop
                           ↓
              F-003 deterministic evaluation
```

Canonical package and workflow-contract services are provider-neutral. Renderers own only provider layout, supported metadata, provenance placement, and declared capability transforms. Installation services operate against an explicit provider and scope root, default to project scope, and never execute canonical skill scripts while installing.

F-004 extends the existing workflow application-service boundary rather than placing binding, validation, path, digest, or completion-claim semantics in CLI formatting or Svelte components. Provider invocation remains R-005.

## Canonical packages

TASK-036 establishes the package, metadata, version, digest, validation, and registry contracts. The registry loads only the eleven bundled skills in F-004. TASK-037 and TASK-038 author the upstream and downstream methodology packages against that contract; the split reflects different engineering risk and review fixtures, not provider forks or additional workflow phases.

Canonical identity includes every behavior-defining file under an allowed package root in deterministic path order. Versioned digest rules exclude recorded digest fields and rendered provenance sidecars from the identities they describe. Installation-instance time and destination path are recorded but do not affect reproducible content identity.

## Workflow and manual handoff

TASK-039 adds stable semantic action kinds, canonical skill bindings, and bounded task-package projection without replacing F-003's coarse runtime activities or dynamic action IDs. Applicability continues to derive from rigor, graph state, workflow state, and deterministic obligations; skill presence grants no authority.

TASK-040 unifies the structured implementation-return and review contract across services, CLI, HTTP, and workbench. It preserves DR-028: claims are operational self-assessment, omissions are unassessed, verification establishes satisfaction, current-contract defects retry, governing changes reconcile, and pending Evidence remains a wait/blocker. Qualifying verification results may be recorded as ordinary Evidence without unnecessary reruns.

TASK-043 exposes the directly usable manual loop after canonical skills and safe provider installations exist. The operator receives skill identity plus a complete bounded package, uses an installed skill in an existing provider client, and submits the structured outcome through Lengthwise. No production service starts or manages a provider session.

## Provider packaging and installation

TASK-041 implements Codex and Claude renderers over a common rendered-package contract. Cross-provider comparison normalizes canonical methodology and records any accepted capability divergence; identical provider outputs are not required.

TASK-042 implements list, install/update, doctor, and remove with project and user scopes. Project is the default. Writes are staged, contained within the selected root, checked for traversal and symlink escape, conflict-aware, recoverable where feasible, and limited to proven managed content. Diagnosis reports precedence, collisions, and shadowing where detectable without asserting a provider's duplicate-selection behavior from path alone.

## Task DAG

```text
                         TASK-036
                 ┌──────────┼──────────┐
                 ▼          ▼          ▼
              TASK-037   TASK-038   TASK-041
                 └────┬─────┘          ▼
                      ▼              TASK-042
                   TASK-039             │
                      ▼                 │
                   TASK-040             │
                      └────────┬────────┘
                               ▼
                            TASK-043
                               ▼
                            TASK-044
                               ▼
                            TASK-045
                               ▼
                            TASK-046
```

## Verification strategy

Verification remains layered:

- deterministic package and installer tests prove canonical validation, renderer layouts, reproducible provenance/digests, project/user scope behavior, conflict diagnosis, traversal and symlink containment, staging, rollback, and safe removal;
- deterministic workflow and interface tests prove semantic bindings, bounded task packages, lossless outcome equivalence, preserved workbench fields, inconclusive verification waits, retry/reconciliation constraints, and Evidence reuse rules;
- mocked outcomes prove coordinator processing only and are not methodology-quality Evidence;
- representative real exercises manually use installed skills for the highest-risk implementation, review, retry, governing-change, and pending-external-verification scenarios;
- human engineering review judges obligation completeness, authority handling, useful outcomes, and material portability without requiring identical model output or a full skill/provider matrix.

## Decision authority

### LOCKED

- DR-029 through DR-033 and all pre-existing decisions governing included requirements.
- One canonical methodology tree; no provider-specific behavior fork without an accepted capability record.
- Exactly the accepted eleven bundled skills; no project-local custom skills or overrides in F-004.
- Project scope defaults, user scope is explicit, and installed packages remain derived.
- F-003 remains authoritative for applicability, deterministic checks, routing constraints, Evidence satisfaction, readiness, and completion.
- Structured completion claims are lossless operational self-assessments, not Evidence.
- Real installed-skill exercises are required before methodology-quality verification can be satisfactory.

### BOUNDED

- TypeScript module organization, exact typed result shapes, digest algorithm, normalization rules, provenance sidecar filename, staging/backup technique, provider renderer class/function structure, and the exact CLI output presentation, within accepted observable contracts.
- Allocation of detailed methodology among a skill's SKILL.md and canonical support files, provided the package remains coherent and progressively discoverable.
- Representative scenario fixtures and which provider exercises which scenario, provided the required risk scenarios and both renderer formats receive proportionate review.

### DELEGATED

- Internal helper names, test helper organization, local refactoring, fixture filenames, and prose editing that does not change accepted engineering behavior, authority, or traceability.

## Delivery boundary

The implementation stops at usable installed methodology, bounded manual task packages, structured return submission, and deterministic F-003 continuation. It must not invoke Codex or Claude, create agent loops, manage worktrees or Git delivery, add project-local overrides, or grow into a marketplace or dependency solver. TASK-046 performs final dogfood reconciliation and readiness evidence; it does not begin R-005 execution work.
