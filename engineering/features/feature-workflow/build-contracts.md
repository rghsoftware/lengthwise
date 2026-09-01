---
lengthwise: 1
id: DOC-F003-BUILD-CONTRACTS
type: document
lifecycle: accepted
---

# F-003 — Feature Workflow Bootstrap Build Contracts

**Feature:** F-003
**Significance:** XL
**Effective rigor:** standard
**Bootstrap representation:** document pending TASK-022 migration to first-class `build-contract` entities

## Contract semantics

- **LOCKED** — required; changing it requires reconciliation with governing artifacts.
- **BOUNDED** — implementation judgment is permitted only within the stated boundary.
- **DELEGATED** — intentionally left to the implementer because it does not change the engineering contract.

Each task contract is a bounded context slice. The repository principles, F-003 specification, addressed requirements/NFRs and ACs, accepted governing decisions, dependencies, and named verification definitions remain authoritative when referenced. These contracts do not authorize implementation until the Specification and Build Contract gates are accepted.

## Cross-cutting contract

### LOCKED

- Git artifacts remain authoritative; the Project Graph remains derived (DR-001, DR-002).
- Lifecycle, derived eligibility, and operational workflow state remain distinct (DR-003, DR-013).
- `.lengthwise/index.db` is derived; `.lengthwise/state.db` is operational and never authoritative (DR-023).
- Structural and completeness checks are not parameterized by workflow phase (DR-024).
- Effective rigor follows explicit override, parent, then project default (DR-025).
- Questions, Evidence, and accepted Build Contracts use the first-class semantics in DR-019 through DR-021.
- Approval events are operational; their durable effect is an explicit authoritative change (DR-022).
- At most one non-terminal run exists per Feature (DR-026).
- Deterministic completion eligibility does not bypass rigor-required human judgment (DR-027).
- Existing F-002 explicit-save, conflict, source authorization, retained-graph, and loopback trust boundaries remain in force.
- No contract permits provider execution, code generation, worktrees, remote execution, parallel agents, or Git/PR automation.

### BOUNDED

Internal module layout, class versus functional decomposition, normalized internal record shapes, UI component composition, and performance optimizations that preserve deterministic semantic output and source explainability.

### DELEGATED

Private helper names, test helper organization, and presentation details with no effect on behavior, accessibility, state communication, or authority.

## TASK-021 — Extend domain entities and relationship registry

**Implements:** REQ-025, REQ-030, REQ-031, REQ-033, NFR-013
**Governing:** DR-001, DR-002, DR-003, DR-011, DR-012, DR-013, DR-019, DR-020, DR-021
**Verification:** VER-022

### LOCKED

- Add Question, Evidence, and BuildContract to the TypeScript canonical domain union and untrusted-boundary validation.
- Use Question lifecycle `open | answered | withdrawn` and explicit `blocking: boolean`.
- Evidence lifecycle is `recorded | superseded | withdrawn`; outcome and applicability/revision context remain distinct from lifecycle and Verification definition lifecycle.
- BuildContract lifecycle is `accepted | superseded`; a generated candidate is a derived projection until acceptance.
- BuildContract includes contracted task identity, authority classifications, included context identities, and a normalized governing-context fingerprint.
- Register authored-once directional relationships `has-question`, `concerns`, `resolved-by`, `supports`, `contracts`, and `includes` with the directions defined by PLAN-F003.
- Preserve stable ID, source provenance, inverse projection, and type constraints.

### BOUNDED

Field names for result references and applicability context; exact relationship names and authored directions provided they read naturally, traverse deterministically, and are recorded in the accepted registry.

### DELEGATED

Type alias decomposition and registry helper organization.

## TASK-022 — Parse, normalize, and migrate workflow engineering entities

**Implements:** REQ-022, REQ-025, REQ-030, REQ-031, REQ-033, NFR-013
**Depends on:** TASK-021
**Verification:** VER-022

### LOCKED

- YAML and Markdown/frontmatter representations can declare all three new types, including embedded Question and Evidence entities.
- Marked invalid declarations produce source-addressable diagnostics; ordinary unmarked content remains ignored.
- Normalization preserves semantic identity and declared relationship provenance.
- Migrate this document's per-task accepted contract content into first-class BuildContract entities after the type is supported; preserve task boundaries and authority classifications.
- Migration is an explicit authoritative artifact change, not a hidden database import.

### BOUNDED

Whether generated BuildContracts use a multi-entity YAML artifact or individual Markdown/frontmatter artifacts; migration tooling versus a documented one-time repository edit.

### DELEGATED

Parser helper reuse and fixture file layout.

## TASK-023 — Implement lifecycle-aware completeness and rigor inheritance

**Implements:** REQ-026, REQ-027, NFR-014, NFR-017
**Depends on:** TASK-021
**Governing:** DR-014, DR-024, DR-025
**Verification:** VER-023

### LOCKED

- Structural checks always run and are independent of workflow activity.
- Completeness checks use entity type, lifecycle, and effective rigor only.
- Effective rigor resolves explicit entity override, then nearest containing parent override, then project default.
- Equally-near conflicting parent policies yield a deterministic actionable finding.
- No release-phase, subsystem, time-based, or arbitrary conditional policy engine is added.
- Light, standard, and strict share one implementation path.

### BOUNDED

Parent traversal and caching algorithm; whether ambiguity is rejected during graph checks or policy resolution, provided all consumers receive the same result.

### DELEGATED

Diagnostic helper decomposition.

## TASK-024 — Implement operational workflow state store

**Implements:** REQ-023, REQ-038, NFR-013, NFR-016, NFR-023
**Depends on:** TASK-021
**Governing:** DR-003, DR-004, DR-023, DR-026
**Verification:** VER-024

### LOCKED

- Use `.lengthwise/state.db`, separate from `.lengthwise/index.db`.
- Persist run history, activity, attempts/idempotency, waits, gate events with reviewed fingerprints, handoff/return events, reconciliation baselines, and schema version.
- Enforce at most one non-terminal run per Feature transactionally.
- Schema changes are versioned and transactional; failed or unsupported migration does not partially advance.
- Cancellation never rolls back or deletes Git artifacts.
- Runtime records reference authoritative entity IDs but cannot be their sole representation.

### BOUNDED

SQLite table decomposition, event-log versus current-snapshot projection, timestamp representation, and retention/index strategy.

### DELEGATED

SQL formatting and private repository interfaces.

## TASK-025 — Implement workflow run and repository reconciliation services

**Implements:** REQ-021, REQ-024, REQ-038, NFR-015, NFR-016
**Depends on:** TASK-022, TASK-023, TASK-024
**Verification:** VER-025

### LOCKED

- Start from an idea creates a draft Feature only through an explicit authorized artifact save; start from an existing Feature does not duplicate it.
- Start, resume, and consequential actions rebuild/check and reconcile against current authoritative state.
- Invalid repository state prevents advancement while preserving F-002 repair semantics.
- Reconciliation explains satisfied, invalidated, and stale conditions.
- Retried actions use persisted idempotency identity and detect divergent external changes before writing.
- Runtime current activity does not change Feature lifecycle automatically.

### BOUNDED

Activity vocabulary and service command/result organization provided it maps to the semantic workflow and remains distinct from lifecycle.

### DELEGATED

Internal event names and logging layout.

## TASK-026 — Implement specification authoring and gate coordination

**Implements:** REQ-022, REQ-025, REQ-028, NFR-015
**Depends on:** TASK-025
**Governing:** DR-007, DR-019, DR-022, DR-024
**Verification:** VER-026

### LOCKED

- Guidance is derived from current artifacts, completeness policy, Questions, and findings.
- Blocking Questions must be resolved and propagated before they cease blocking the gate.
- Machine prerequisites run before human judgment and link to responsible context.
- Approval records the reviewed context fingerprint and applies only explicit reviewed lifecycle/artifact changes.
- No Approval entity or approval-after-every-authoring-step behavior is added.

### BOUNDED

Artifact templates and ordering of eligible specification actions; batch versus individual lifecycle saves if all changes are reviewable and conflict-safe.

### DELEGATED

Prompt copy that does not change gate meaning.

## TASK-027 — Implement planning guidance and derived readiness

**Implements:** REQ-029, REQ-036, NFR-015
**Depends on:** TASK-026, TASK-028
**Verification:** VER-027

### LOCKED

- Planning obligations derive from effective rigor and current graph state.
- Required plan, tasks, acyclic dependencies, implementation traceability, verification topology, material decisions, Questions, and contracts participate where applicable.
- Readiness is a derived explanation, never a persisted generic status.
- Every blocker identifies entity, relationship, policy, Question, finding, contract, or gate context.

### BOUNDED

Grouping and priority ordering of planning suggestions; reuse or extension of existing readiness projection APIs.

### DELEGATED

Internal scoring is prohibited; display ordering among equally eligible actions is delegated if deterministic.

## TASK-028 — Implement deterministic Build Contract generation and staleness

**Implements:** REQ-030, REQ-031, NFR-014, NFR-018
**Depends on:** TASK-022, TASK-023, TASK-024
**Governing:** DR-002, DR-009, DR-021
**Verification:** VER-028

### LOCKED

- Candidate generation begins from one task and traverses only registered relevant authoritative graph paths and applicable policy.
- Include task, implemented requirements/NFRs, their ACs, governing decisions, LOCKED/BOUNDED/DELEGATED decisions, dependencies, and verification obligations.
- Exclude unrelated graph branches and explain every inclusion.
- Fingerprint normalized relevant semantics; ignore formatting, source path, ordering, and unrelated changes.
- A candidate is derived until explicitly accepted and saved as a BuildContract entity.
- Staleness compares current relevant context to the accepted fingerprint and reports changed inputs.

### BOUNDED

Canonical serialization and hash algorithm; transitive dependency depth where justified and made explicit in the slice explanation.

### DELEGATED

Human-readable rendering layout derived from the machine-readable entity.

## TASK-029 — Implement Build Contract gate and implementation coordination

**Implements:** REQ-032, REQ-034, NFR-019
**Depends on:** TASK-027
**Governing:** DR-007, DR-021, DR-022
**Verification:** VER-029

### LOCKED

- Gate eligibility requires applicable accepted current contracts, valid task DAG, required traceability/verification, no blocking implementation Questions, and no blocking findings.
- Approval records an operational event against reviewed contract fingerprints.
- Handoff and return are operational, provider-neutral events referencing accepted contracts.
- A return claim does not imply verification, reconciliation, task completion, or feature completion.
- No implementer invocation, provider field, worktree action, or code generation is added.

### BOUNDED

Manual export/copy affordance and coordination event labels.

### DELEGATED

Visual styling of handoff history.

## TASK-030 — Implement Evidence applicability and verification satisfaction

**Implements:** REQ-033, REQ-036, NFR-022
**Depends on:** TASK-027
**Governing:** DR-020 and the Verification principles
**Verification:** VER-022, VER-032

### LOCKED

- Evidence supports Verification definitions many-to-many and retains provenance, outcome, and applicability context.
- Missing, failing, inconclusive, stale, inapplicable, and satisfactory states remain distinguishable.
- Required Verification satisfaction uses all required applicable evidence semantics; optional verification absence does not block.
- Duplicate evidence does not increase satisfaction and no method is privileged for being automated.
- Evidence history remains inspectable after supersession or loss of applicability.

### BOUNDED

Initial closed outcome vocabulary and applicability fingerprint representation, provided unsupported outcomes fail validation rather than silently satisfy.

### DELEGATED

Evidence summary formatting.

## TASK-031 — Implement reconciliation and completion eligibility

**Implements:** REQ-035, REQ-036, NFR-015
**Depends on:** TASK-029, TASK-030
**Governing:** DR-009, DR-027
**Verification:** VER-027, VER-030

### LOCKED

- Reconciliation may require changing governing artifacts, contracts, implementation claims, task state, or Evidence; it never assumes the original specification was correct.
- Changed governing artifacts invalidate only affected contracts/eligibility through deterministic dependency semantics.
- Completion eligibility requires applicable task completion, satisfactory Evidence, no blocking Questions/findings, current contracts, convergence, and required gate effects.
- Strict or other configured rigor can require final human verification approval; otherwise eligibility still requires an explicit Feature lifecycle save.
- Output is an explainable projection, not an automatic claim of product quality.

### BOUNDED

Reconciliation suggestion ordering and whether convergence is represented by a dedicated projection or composed eligibility predicates.

### DELEGATED

Internal memoization.

## TASK-032 — Integrate Feature Workflow into the Minimal Workbench

**Implements:** REQ-037, NFR-020, NFR-021, NFR-024
**Depends on:** TASK-031
**Governing:** DR-015, DR-016, DR-017, DR-018
**Verification:** VER-026, VER-029, VER-031, VER-033

### LOCKED

- Add feature/run context, current activity, eligibility, Questions, findings, gate, contracts, verification obligations, and next actions to the existing workbench.
- All semantic decisions remain in reusable services; Svelte presents and orchestrates typed operations.
- Every blocker and obligation navigates to responsible entity/artifact where known.
- Lifecycle, derived eligibility, runtime wait, finding, and Question are visually and terminologically distinct.
- Preserve explicit save, dirty/conflict protection, retained graph, loopback, same-origin, and artifact authorization behavior.
- Do not redesign unrelated workbench surfaces or add graph/DAG visualization beyond workflow comprehension.

### BOUNDED

Pane placement, responsive layout, compact task dependency presentation, and use of existing versus new local UI primitives.

### DELEGATED

Cosmetic details without usability or accessibility impact.

## TASK-033 — Complete automated workflow verification

**Implements:** NFR-014, NFR-016, NFR-018, NFR-020, NFR-021, NFR-022, NFR-023
**Depends on:** TASK-032
**Verification:** VER-022 through VER-032

### LOCKED

- Execute all required automated verification definitions with fixtures covering light, standard, strict, restart, external change, ambiguity, invalid artifacts, stale contracts, many-to-many Evidence, reconciliation, and security boundaries.
- Record first-class Evidence with applicability context for the implementation revision once supported.
- Do not create duplicate tests merely to increase a count.
- Any failed or inconclusive required result remains a completion blocker.

### BOUNDED

Fixture decomposition, test-file grouping, and selective browser scenario consolidation that preserves observable coverage.

### DELEGATED

Test helper naming.

## TASK-034 — Dogfood, reconcile, and evaluate Feature Workflow

**Implements:** NFR-019, NFR-024
**Depends on:** TASK-033
**Verification:** VER-029, VER-030, VER-033

### LOCKED

- Run Lengthwise's own F-003 artifacts through implementation return, verification, reconciliation, and completion-eligibility flows.
- Conduct the required human usability evaluation with specification, planning, and reconciliation scenarios.
- Record Evidence and update governing artifacts when dogfood reveals a specification or plan defect.
- Confirm no provider execution or excluded orchestration capability entered F-003.
- Completion requires convergence and repository-owner acceptance where rigor requires it.

### BOUNDED

Participant count and scenario fixtures sufficient to expose comprehension failures; evidence artifact organization.

### DELEGATED

Session scheduling and note-taking format.
