---
lengthwise: 1
id: DOC-AUDIT-2026-09-02-FEATURES
type: document
title: Feature audit of F-001, F-002, and F-003 against Lengthwise principles
lifecycle: draft
---

# Feature Audit — F-001 Project Graph, F-002 Minimal Workbench, F-003 Feature Workflow

**Date:** 2026-09-02
**Head audited:** `55990b6` (Complete F-003 workflow semantics)
**Method:** Read every governing artifact (`principles.md`, `requirements.yaml`, `decisions.yaml`, `roadmap.yaml`, `.lengthwise/project.yaml`) and every artifact under `engineering/features/**`; read all source under `src/` and `workbench-ui/src/`, and all 18 test files; re-executed the deterministic check, contract-staleness, readiness, and evidence-satisfaction logic directly against the repository; ran `bunx tsc --noEmit`.

This audit is a `document` entity in `draft` lifecycle. It asserts nothing about product quality beyond what the engineering contract defines (principles: *Process is evidence, not proof*).

## 1. Execution limitation

`bun test`, `lw check`, `lw index`, and `lw ready` could not run in the audit sandbox. Typia's `@ttsc/unplugin` preload compiles a Go plugin on first use and fetches `github.com/microsoft/typescript-go` from `storage.googleapis.com`, which the sandbox's egress policy denies (403 on CONNECT). All 18 test files therefore errored at load time, not at assertion time.

To still obtain observed rather than recorded results, the audit re-executed the modules that do not depend on Typia (`artifacts/*`, `graph/*`, `checks/*`, `workflow/projections.ts`) against the real repository with the preload disabled. `bunx tsc --noEmit` ran normally and passed.

Consequence: automated test pass/fail claims below are taken from the recorded evidence and from reading the test code, not from a fresh run. Everything else is observed.

## 2. Observed repository state

| Observation | Result |
| --- | --- |
| Recognized artifacts / entities / declared relationships | 25 / 371 / 898 |
| Parse or normalization diagnostics | 0 |
| Structural findings (`runStructuralChecks`) | 0 |
| Completeness findings (`runCompletenessChecks`, standard rigor) | 0 |
| Ready tasks (`deriveTaskReadiness`) | none |
| BuildContract entities and staleness (`contractStaleness`) | 14 accepted, all current |
| F-003 required verifications with satisfactory Evidence | 12 of 12 |
| F-002 required verifications with satisfactory Evidence | 0 of 7 (all `missing`) |
| F-001 required verifications in feature scope | 0 (F-001 declares no `addresses` edges) |
| Question entities anywhere in the repository | 0 |
| `bunx tsc --noEmit` | pass |
| Test functions in the suite at head | 104 (evidence for F-003 records 99; F-002 records 95) |

The recorded claims "`lw check` reports no findings" and "fourteen BuildContract entities are current" are confirmed by observation.

## 3. Verdict by feature

### F-001 Project Graph — complete, principle-aligned, with traceability and artifact-convergence gaps

The F-001 slice matches its Build Contracts closely. Discovery and recognition are separate; unmarked files are ignored; marked-invalid files report source-addressable diagnostics; relationships are stored once with derived inverse projections carrying provenance; the SQLite index is disposable and holds no authoritative data; readiness is derived, not persisted; lifecycle is type-specific with no generic status. Tests map to acceptance criteria by comment and cover the F-001 ACs well, including dogfood tests against the repository's own artifacts.

Gaps:

- **F-001 is not connected to its own requirements, plan, or contracts in the graph.** `spec.md` declares no `addresses` or `contains` relationships, so `lw trace F-001` yields only the roadmap edge, and F-003's feature-scope computation finds zero requirements and zero required verifications for F-001. (Principle: *Traceability should emerge from doing the work*; contrast F-003's spec, which declares both.)
- **F-001 artifacts do not agree with each other.** `spec.md` says `lifecycle: complete`; `build-contracts.md` header says `Lifecycle: ready`; `plan.md` ends "F-001 is accepted as `ready`". (Principle: *Convergence*.)
- **No evidence record exists for F-001.** Tasks are `done` and the feature is `complete`, but there is no evidence document or Evidence entity naming what was run and when. TASK-010's dogfood contract lists required evidence; only the test suite itself stands in for it.
- **AC-010-04 is proxied, and the proxy's justification has expired.** `checks/completeness.ts` (comment at lines 61-70) treats a criterion as verified when a `required: true` verification *definition* exists, because "F-001 does not implement verification-execution evidence tracking." After F-003 added Evidence entities, that justification no longer holds, yet `lw check` still ignores evidence. See finding M-4.

### F-002 Minimal Workbench — service layer complete and well tested; UI evidence is not durable

The application-service boundary is real and clean: `WorkbenchQueryService`, `ArtifactService`, `WorkbenchSession`, and `compareSuccessfulGraphs` own all graph, authorization, conflict, retained-graph, and comparison semantics; the Svelte page consumes typed API results and contains no second implementation of those rules (inspected; AC-NFR-008-03 holds). Authorization is server-side against configured discovery scope with `realpath` containment, SHA-256 version tokens, atomic same-directory rename, and same-origin write enforcement. Retained-graph, baseline-does-not-advance, deterministic comparison, every change category, conflict rejection, traversal/absolute/excluded/unrecognized/symlink denial, and encoded traversal at the HTTP boundary are all covered by committed tests.

Gaps:

- **The browser-level automated evidence named by four verification definitions does not exist in the repository.** VER-014, VER-015, VER-016, and VER-017 declare browser behavioral or end-to-end methods; the F-002 plan says "browser-level tests prove the observable navigation, editing, save, invalid-model recovery, and finding flows"; TASK-018 LOCKED requires "automated browser evidence." No Playwright or other browser test exists. `evidence.md` records a one-off driver session whose discard-protection assertion timed out. The evidence is therefore not reproducible. (Principle: durable evidence; *Verification is evidence*.)
- **VER-020 and VER-021 were closed by owner acceptance, not by their defined method.** TASK-019 LOCKED requires participants attempting the core loop with recorded task outcomes and observed confusion. `evidence.md` records "the repository owner accepted the recorded dogfood browser evidence." That is a rigor waiver. It may be the right call for an internal MVP, but it should be recorded as a decision or the verification definitions should be lowered, so artifacts and practice converge.
- **F-002 does not `address` its own NFRs.** `spec.md` addresses REQ-013..REQ-020 only, so NFR-008..NFR-012 and their verifications (VER-019, VER-021) fall outside the feature's graph scope. It also declares no `contains` edge to PLAN-F002 or its contracts document.
- **Under the project's own F-003 semantics, F-002 has no satisfactory evidence.** All seven in-scope required verifications resolve to `missing` because F-002's evidence is prose in `evidence.md`, not Evidence entities. `lw workflow status F-002` would report a `complete` feature as completion-ineligible. See finding M-2.

### F-003 Feature Workflow — strong foundation, but the `complete` lifecycle is not yet earned

What is genuinely done and good: Question, Evidence, and BuildContract are first-class typed entities with type-specific lifecycles and registered, authored-once relationships; `.lengthwise/state.db` is separate, gitignored, schema-versioned, and migrated transactionally with a partial-index uniqueness constraint enforcing one non-terminal run per feature; contract candidates are generated deterministically from registered graph paths with per-input fingerprints, and all fourteen accepted contracts are current; evidence satisfaction distinguishes missing, failing, inconclusive, stale, inapplicable, and missing-complement; gate approval is fingerprint-checked and idempotent; the bootstrap contracts document was migrated to entities and honestly kept as `superseded`; an inconclusive evidence attempt was retained as `superseded` rather than deleted.

What is not done, or not shown to be done:

- **AC-027-03 is not implemented.** Equally-near conflicting parent rigor overrides must "produce an actionable deterministic finding." `checks/rigor.ts:21` silently falls back to the project default and emits nothing. No diagnostic code for rigor ambiguity exists anywhere in `src/`.
- **Rigor inheritance has no tests at all.** `effectiveRigor`'s parent traversal is exercised by no test; VER-023 is nevertheless recorded as satisfied.
- **Question semantics have no tests and no dogfood instance.** No test file mentions a question; the repository contains zero Question entities. VER-022 is recorded as satisfied for AC-025-01..03.
- **Interrupt, resume, retry, cancel, handoff, return, reconcile, and complete have no tests.** No test calls any of these coordinator methods. VER-024 (AC-038-*), VER-025 (AC-024-*), VER-027, VER-029, and VER-030 are recorded as satisfied by the automated-suite Evidence.
- **No light / standard / strict fixtures exist.** TASK-033 LOCKED requires fixtures covering all three; AC-NFR-017-01 is unverified. Under `light` rigor the coordinator has no path from `plan` to `implement` except approving the not-required Build Contract gate or routing through `reconcile` (`state-store.ts:13`, `coordinator.ts:117-127`), which contradicts *Human approval should be scarce* and AC-NFR-017-01.
- **Workbench integration is partial.** The UI offers "Start workflow", per-gate "Approve", and navigation links. Handoff, return, interrupt, resume, retry, cancel, reconcile, complete, and run history are reachable only through `lw workflow`, which no spec, contract, or README documents. "Next engineering actions" buttons navigate to a target but do not perform the action. Questions render as a comma-separated ID list with no distinct visual treatment. This falls short of REQ-034, REQ-037, REQ-038, and TASK-032 LOCKED ("Lifecycle, derived eligibility, runtime wait, finding, and Question are visually and terminologically distinct").
- **VER-031 and VER-033 are marked satisfied by evidence whose method does not match the definition.** VER-031 is defined as an automated HTTP-and-browser end-to-end security test; VER-033 as a moderated human usability evaluation with specification, planning, and reconciliation scenarios. The supporting Evidence is a single repository-owner review on a 1440p display plus a superseded inconclusive browser attempt.
- **The recorded Evidence predates the final implementation commit and cannot go stale.** `EVID-F003-AUTOMATED-001` records 99 tests on 2026-09-01 (commit `c1bfef2`). Commit `55990b6` on 2026-09-02 changed 406 lines across the coordinator, state store, projections, server, and UI, and the suite now has 104 tests. The Evidence was not superseded or re-recorded. Because its `applicability` is free text with no `contextFingerprint` and no `fingerprint:` prefix, `evidenceSatisfaction` (`projections.ts:22-23`) can never classify it as stale.
- **No dogfood record of TASK-034.** TASK-034 LOCKED requires running F-003's own artifacts through return, verification, reconciliation, and completion-eligibility flows. Because gate events and runs live only in the untracked `state.db`, and no Evidence entity describes such a run, the repository carries no trace that this happened.

## 4. Findings

Severity reflects distance from the accepted contract, not product risk.

### High

**H-1. Rigor-ambiguity finding not implemented; verification recorded as satisfied anyway.**
`src/checks/rigor.ts:21`. AC-027-03 requires an actionable deterministic finding; the code returns the project default silently. VER-023 → `EVID-F003-AUTOMATED-001` claims satisfaction with zero tests of `effectiveRigor` inheritance. Reconcile by adding a `rigor/ambiguous-parent` diagnostic (emitted from the completeness runner so all consumers see it, per TASK-023 BOUNDED) and property tests for override, nearest-parent, and conflict cases.

**H-2. Evidence entities assert satisfaction for acceptance criteria the test suite does not exercise.**
`engineering/features/feature-workflow/evidence.yaml`. The automated Evidence supports VER-022, VER-023, VER-024, VER-025, VER-027, VER-028, VER-030, VER-032, yet the suite contains no tests for Questions, rigor inheritance, interruption/resume/retry/cancel, handoff/return, reconciliation, planning or completion eligibility, external-change reconciliation, invalid-repository non-advancement, unsupported-migration failure, or rigor-level fixtures. The manual Evidence supports VER-031 and VER-033 whose defined methods it does not meet. This is the pattern the principles warn against: *Verification exists to increase justified confidence, not produce green checkmarks.* Reconcile by narrowing each Evidence item's `supports` edges to the verifications its result actually establishes, adding the missing tests, and recording a decision if VER-033's moderated evaluation is being deferred.

**H-3. F-003 Evidence is stale relative to head and cannot be detected as stale.**
`evidence.yaml` (recorded 2026-09-01) versus commit `55990b6` (2026-09-02, 406 lines changed). AC-033-01 requires "revision or applicability context sufficient to decide whether it applies to current state." Reconcile by superseding the current Evidence, re-recording against head with the commit SHA in `applicability`, and setting `contextFingerprint` so the projection can detect drift. Consider extending the verification-context fingerprint (or a separate implementation-revision field) so evidence applicability is machine-decidable, since today the fingerprint covers only the verification definition and its criteria.

**H-4. Workbench cannot open artifacts created after session start; capture bypasses the artifact service.**
`src/workbench/artifact-service.ts:36-58` computes the authorized path set once; `src/workbench/session.ts:81-99` rebuilds the graph but never the `ArtifactService`. After `POST /api/workflow` captures a Feature, selecting it in the UI fails with `unauthorized` on its source. Separately, `src/workflow/coordinator.ts:41-53` writes the new artifact with `Bun.write` rather than through the artifact service, contrary to PLAN-F003 ("the existing artifact service remains the only write path") and TASK-025 LOCKED. Reconcile by re-creating or refreshing the authorized set on every rebuild and routing capture through `ArtifactService` (adding a create-if-absent operation with the same authorization).

**H-5. Workbench workflow integration is partial against REQ-034, REQ-037, REQ-038, and TASK-032.**
`workbench-ui/src/routes/+page.svelte:256-276`. Only start and gate approval are operable; every other coordinator operation is CLI-only and undocumented. Either implement the remaining operations in the workbench, or reconcile the spec, requirements, and TASK-032 contract to state that F-003 delivers the workflow through `lw workflow` with a read-only workbench view, and document the CLI.

### Medium

**M-1. F-002 browser evidence is not durable.** VER-014..VER-017 name browser methods; no browser tests are committed; `evidence.md` records an unrepeatable session. Reconcile by committing the browser scenarios (Playwright is available to the project) or by changing the verification methods to what is actually run and recording that as a decision.

**M-2. Pre-F-003 features have no Evidence entities; the tool's own semantics report them unverified.** All F-002 required verifications resolve to `missing`; F-001 has none in scope. TASK-022 migrated contracts but nothing migrated evidence. Reconcile either by recording Evidence entities for F-001 and F-002 from their existing evidence prose, or by an accepted decision that pre-F-003 features are grandfathered and by making the coordinator honour that decision explicitly.

**M-3. Feature-level traceability is inconsistent across the three features.** F-001 addresses nothing and contains nothing; F-002 addresses its REQs but not its NFRs and contains nothing; F-003 addresses all and contains its plan and contracts document. `lw trace` on F-001 or F-002 cannot reach their requirements. Reconcile the two older specs to the F-003 pattern.

**M-4. `lw check` does not evaluate evidence satisfaction or contract staleness.** Both live only inside `WorkflowCoordinator.assess`. DR-024 says completeness derives from type, lifecycle, and rigor; a `complete` feature whose required verifications lack satisfactory Evidence, or whose accepted contract is stale, is a completeness gap that `lw check` should surface deterministically. Adding `completeness/missing-evidence` (for `complete` features) and `contract/stale` checks would also retire the AC-010-04 proxy.

**M-5. Light rigor has no gate-free path to implementation.** `state-store.ts:13` transitions and `coordinator.ts:117` gate ordering require a Build Contract approval event to enter `implement` even when policy does not require that gate. AC-NFR-017-01 and TASK-033's light/standard/strict fixtures are unverified.

**M-6. Gate approvals exist only in untracked operational state.** By DR-022/DR-023 this is intended, and the lifecycle transition is the durable effect. But F-003's own completion criterion "applicable approvals are recorded" is unverifiable from a clone, and no artifact records who approved which gate against which fingerprint for any of the three features. Consider an authoritative approval record (for example an Evidence item of kind `approval` supporting a gate) if human gates are meant to be part of the durable evidence chain.

**M-7. F-001 artifact lifecycle disagreement.** `build-contracts.md` header `Lifecycle: ready` and `plan.md` "accepted as `ready`" versus `spec.md` `complete`.

### Low

**L-1. Semantic fingerprint drops nested object keys.** `src/workflow/projections.ts:7` passes a top-level key allowlist as the `JSON.stringify` replacer; nested keys not present at top level are omitted. Today this affects BuildContract `inputFingerprints` and would silently affect any future nested field. Use a canonical-serialization helper instead.

**L-2. Capture destination containment is lexical.** `coordinator.ts:41-53` checks `isWithin(realpath(root), resolve(root, path))` but does not `realpath` the destination's parent, so a symlinked directory inside the repository could redirect the write. Low risk on a loopback single-user tool, but AC-017-05 and AC-NFR-021-01 name symlink escape explicitly.

**L-3. F-003 code style diverges sharply from F-001/F-002.** `coordinator.ts`, `state-store.ts`, `projections.ts`, `contracts.ts`, and `cmdWorkflow` are written as very long single lines (several exceed 600 characters). This is not a principle violation, but it works against *bounded ambiguity, relevant context* for the next implementer and makes review of the highest-risk module the hardest.

**L-4. Documentation drift.** README documents only `check` and `serve`; `lw workflow` and `lw serve` are absent from F-001's CLI contract and F-003's spec; `AGENTS.md` says "Don't use vite" while DR-018 locks SvelteKit, which requires it; root `index.ts` is scaffold output. The first `lw` invocation on a fresh machine needs Go and network access to build the Typia plugin, which NFR-004 (local-first) and the README do not mention.

**L-5. `lw workflow start` always begins at `specify`** regardless of the feature's current lifecycle, and `approve` permits approving a gate that policy does not require. Minor semantic looseness; worth tightening when M-5 is addressed.

## 5. Principle-by-principle summary

| Principle | F-001 | F-002 | F-003 |
| --- | --- | --- | --- |
| Repository authority | Met | Met | Met (state.db operational only) |
| Project Graph as single derived model | Met | Met | Met; workflow builds its own graph per call rather than reusing the session's (acceptable) |
| Flexible storage, strict semantics | Met | Met | Met |
| Observable acceptance | Met | Met | Met in artifacts; several ACs unverified (H-2) |
| Verification is evidence | Met by tests; no record | Browser evidence not durable (M-1) | Evidence overclaims (H-2, H-3) |
| Quality over quantity | Met | Met | Evidence pattern produces checkmarks without confidence (H-2) |
| Process is evidence, not proof | Met | Met | Met in wording; completion claim exceeds evidence |
| Human judgment at material boundaries | Approvals unrecorded (M-6) | Approvals unrecorded (M-6) | Gate model good; light-rigor path forces a gate (M-5) |
| Rigor must earn its cost | Met | VER-020/021 waived without decision | Met |
| AI-first, implementer-neutral | Met | Met | Met (no provider paths found); style hurts context (L-3) |
| Traceability | Feature not linked (M-3) | NFRs not linked (M-3) | Met |
| Convergence | Artifacts disagree (M-7) | Evidence method vs definition (M-1) | Impl. and evidence diverged after last commit (H-3); UI vs REQ-037 (H-5) |
| State model | Met | Met | Met |
| Rigor and significance | Met | Met | AC-027-03 unimplemented (H-1) |

## 6. Recommended reconciliation order

1. Narrow the F-003 Evidence `supports` edges to what the suite actually establishes and re-record against head with revision context (H-2, H-3). This restores honesty in the model before anything else is built on it.
2. Implement the rigor-ambiguity finding and tests (H-1).
3. Fix the artifact-service refresh and route capture through it (H-4).
4. Decide the workbench scope for F-003: implement the remaining operations, or reconcile REQ-034/037/038 and TASK-032 to a CLI-driven workflow and document `lw workflow` (H-5).
5. Add the missing coordinator, Question, and rigor-fixture tests; then re-evaluate whether F-003 lifecycle should return to `active` until they pass.
6. Bring F-001 and F-002 into the same traceability and evidence model (M-2, M-3, M-7), or record a grandfathering decision.
7. Extend `lw check` with evidence and staleness completeness checks (M-4).
8. Address M-1, M-5, M-6, and the Low items as capacity allows.
