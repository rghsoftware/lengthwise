---
lengthwise: 1
id: F-004
type: feature
title: Engineering Skills
lifecycle: ready
significance: L
relationships:
  - { type: addresses, to: REQ-039 }
  - { type: addresses, to: REQ-040 }
  - { type: addresses, to: REQ-041 }
  - { type: addresses, to: REQ-042 }
  - { type: addresses, to: REQ-043 }
  - { type: addresses, to: REQ-044 }
  - { type: addresses, to: REQ-045 }
  - { type: addresses, to: REQ-046 }
  - { type: addresses, to: REQ-047 }
  - { type: addresses, to: REQ-048 }
  - { type: addresses, to: REQ-049 }
  - { type: addresses, to: REQ-050 }
  - { type: addresses, to: REQ-051 }
  - { type: addresses, to: REQ-052 }
  - { type: addresses, to: REQ-053 }
  - { type: addresses, to: REQ-054 }
  - { type: addresses, to: REQ-055 }
  - { type: addresses, to: REQ-056 }
  - { type: addresses, to: REQ-057 }
  - { type: addresses, to: NFR-025 }
  - { type: addresses, to: NFR-026 }
  - { type: addresses, to: NFR-027 }
  - { type: addresses, to: NFR-028 }
  - { type: addresses, to: NFR-029 }
  - { type: addresses, to: NFR-030 }
  - { type: addresses, to: NFR-031 }
  - { type: addresses, to: NFR-032 }
  - { type: addresses, to: NFR-033 }
  - { type: has-question, to: Q-F004-001 }
  - { type: has-question, to: Q-F004-002 }
  - { type: has-question, to: Q-F004-003 }
  - { type: has-question, to: Q-F004-004 }
  - { type: contains, to: PLAN-F004 }
---

# F-004 — Engineering Skills

## Problem

F-003 can determine which engineering work is required next, bound implementation with accepted Build Contracts, record implementation-return claims, and route verification failures either to another implementation attempt or to reconciliation. It does not define the reusable AI methodology for performing those judgment-heavy activities. Today, a capable model must reconstruct that methodology from repository artifacts, operator prompts, and conversation history. Results can therefore vary by provider, session, and operator even when the governing Project Graph and workflow state are identical.

Provider-native skill systems create a second risk: if Lengthwise independently authors Codex, Claude, and later-provider instructions, its engineering method will fork. Differences in discovery paths or frontmatter could become accidental behavioral differences, and an installed provider copy could be mistaken for engineering authority.

The missing product layer is one canonical, reviewable engineering skill library that F-003 can name without knowing a provider and that Lengthwise can validate, render, install, diagnose, and update as derived provider-native packages.

## Goal

Define and deliver one authoritative set of reusable engineering skills that consistently carries out Lengthwise's AI-assisted engineering methodology across Codex and Claude, including complete accepted Build Contract implementation, evidence-conscious implementation review, verification-driven bounded retry, and reconciliation, while keeping provider-specific differences thin, explicit, and derived.

## Core hypothesis

Lengthwise can maintain one canonical Agent Skills-compatible engineering methodology and render it into supported providers' native discovery layouts without materially changing intended engineering behavior.

## Design principles

- Canonical skill instructions are provider-neutral engineering methodology.
- Provider divergence is a documented exception limited to packaging, discovery, supported metadata, and demonstrated runtime capability differences.
- Git-tracked canonical skills are durable product assets. Installed provider packages are derived operational artifacts and never become authoritative over canonical source.
- Workflow state names a canonical Lengthwise skill, never a provider command, package path, or session identifier.
- Skills perform judgment, synthesis, interpretation, implementation, review, and ambiguity resolution. Lengthwise retains deterministic validation, graph traversal, obligation calculation, Build Contract generation and staleness, readiness, completion eligibility, and routing constraints.
- Skills receive bounded task packages. They do not assume the whole repository is relevant merely because it is available.
- Human escalation is reserved for material or authority-bound decisions. DELEGATED implementation details remain with the implementer.
- A skill is available methodology, not a mandatory workflow phase. Effective rigor, graph state, and deterministic obligation calculation decide whether its semantic action is applicable.
- Provider discovery or implicit selection is execution plumbing, not engineering authorization. Every skill remains bounded by the supplied workflow action, context, Build Contract, and decision authority.

## Scope

- a bundled canonical engineering skill library;
- a minimal structured metadata contract for workflow binding, context slots, outcomes, post-skill deterministic checks, escalation reasons, and compatibility;
- structural validation of canonical skill packages and support-file references;
- the initial standard skill library defined below;
- canonical-skill binding on F-003 semantic next actions;
- skill-side context and outcome contracts, including retry context and implementation-return claims;
- a usable manual handoff loop that exposes a directly usable skill task package and accepts its structured outcome through an existing supported Lengthwise interface;
- Codex and Claude renderers using their current Agent Skills-compatible filesystem conventions;
- provider-package provenance, version, digest, compatibility, and divergence reporting;
- install, idempotent update, diagnosis, and safe removal of managed provider packages;
- deterministic renderer and installation tests, mocked workflow-processing fixtures, and clearly distinguished evidence from representative real skill exercises;
- manual installed-skill exercises through existing provider clients, including omitted-obligation retry, governing-context reconciliation, and pending external-verification scenarios;
- minimal workbench disclosure of the applicable canonical skill for an action when that helps the operator understand the next step.

## Explicit non-scope

- automated provider invocation, session construction, session resumption, or result transport;
- autonomous agent loops, multi-agent orchestration, planner/critic hierarchies, or model routing;
- automatic provider benchmarking;
- worktree, branch, commit, pull-request, remote-execution, or multi-machine orchestration;
- a public marketplace, remote skill distribution service, package dependency solver, or arbitrary workflow scripting;
- provider-specific forks of the engineering methodology without an accepted capability reason;
- replacing deterministic Build Contract generation, graph validation, obligation calculation, readiness, completion eligibility, or workflow routing with prompts;
- treating implementation-return claims themselves as verification Evidence;
- project-local custom skills, standard-skill overrides, override precedence, or customization trust boundaries;
- broad redesign of the Minimal Workbench for skill administration.

## Canonical skill representation

The canonical source is already an Agent Skill rather than a proprietary intermediate prompt language:

```text
skills/
└── implement-build-contract/
    ├── SKILL.md              # standard frontmatter + canonical methodology
    ├── lengthwise.yaml        # only Lengthwise's machine contract
    ├── references/            # optional, progressively loaded
    ├── scripts/               # optional deterministic helpers
    └── assets/                 # optional templates/resources
```

`SKILL.md` uses only the portable Agent Skills core for canonical metadata: `name` and `description`, plus `license` or `compatibility` only when genuinely applicable. The directory name and `name` are the canonical skill ID. `SKILL.md` is the primary methodology entry point, while canonical references, scripts, assets, and templates may contain progressively loaded methodology detail. The canonical package tree as a whole is the one authoritative methodology source; there are no parallel provider copies.

`lengthwise.yaml` is a small companion manifest, not an alternative skill language. It does not repeat the skill ID, display name, description, or prose methodology. Its accepted conceptual shape is:

```yaml
schemaVersion: 1
skillVersion: 1
workflowContractVersion: 1
bindings:
  - implementation-attempt
context:
  required:
    - task
    - accepted-build-contract
    - bounded-project-context
    - decision-authority
  optional:
    - prior-attempt
    - verification-retry
outcomes:
  - repository-change
  - implementation-completion-claim
postChecks:
  - project-graph
  - contract-current
  - applicable-verification
escalations:
  - locked-decision-conflict
  - material-product-decision
  - governing-context-conflict
```

Structured metadata owns values Lengthwise must validate or route. The canonical package owns how to reason and work. A renderer may add provider metadata to a rendered copy, but it may not edit canonical methodology unless a declared provider capability divergence authorizes a compatibility transform.

## Proposed standard skill library

The accepted baseline remains eleven skills. Each has a distinct engineering outcome; no additional narrow skill is currently justified.

| Skill | Responsibility | Boundary |
|---|---|---|
| `capture-feature` | Turn an idea into a bounded draft Feature frame and material Questions. | Artifact creation and ID safety remain deterministic application behavior. |
| `specify-feature` | Create or update requirements, NFRs, observable ACs, traceability, Questions, and required decision inputs. | It does not approve its own specification. |
| `clarify-feature` | Resolve material ambiguity, propagate answers into governing artifacts, and preserve Question history. | It does not ask about harmless DELEGATED details. |
| `review-specification` | Challenge completeness, coherence, observability, authority, and unresolved ambiguity before the human gate. | It recommends; the gate remains human where rigor requires it. |
| `plan-feature` | Produce the implementation plan, task DAG, implementation traceability, and material technical decisions. | Build Contract generation remains deterministic. |
| `design-verification` | Define proportionate verification methods, topology, applicability, and complementary evidence needs. | It does not fabricate Evidence or optimize counts. |
| `review-build-readiness` | Review the plan, generated contract scopes, decision authority, dependencies, verification obligations, and deterministic findings before the Build Contract gate. | It does not generate contracts or approve the gate. |
| `implement-build-contract` | Implement one complete accepted task-scoped contract and return a structured completion claim. | The claim is not Evidence or completion. |
| `review-implementation` | Inspect a returned implementation and claim against the entire accepted contract, execute or assess applicable verification, and recommend retry, reconciliation, or satisfactory routing with exact obligations. | It does not silently change governing truth or mark completion. |
| `review-verification` | Review the sufficiency, applicability, provenance, and complementarity of current Evidence for final verification judgment. | It does not privilege automation or duplicate evidence for metrics. |
| `reconcile-feature` | Synthesize discoveries across governing artifacts, contracts, implementation, and Evidence and propose the smallest coherent convergence path. | LOCKED or material changes escalate to the authorized human. |

`design-verification` remains separate from `plan-feature` because verification design is a reusable judgment activity during initial planning and reconciliation. `review-implementation` includes execution or inspection of applicable verification around an implementation return; this avoids adding a twelfth `verify-implementation` skill unless representative exercises show the combined responsibility is too broad.

## Workflow integration model

F-003 runtime activity remains coarse operational state. F-004 adds a stable semantic action kind because one activity can expose several different engineering methods. Each AI-capable `WorkflowAction` identifies exactly one canonical `skillId`; deterministic-only and human-only actions identify no skill.

```text
workflow activity + current graph + operational history
                         ↓
              semantic next action
                         ↓
       canonical skill ID + task-package contract
                         ↓
       manual provider use in F-004;
       later automated invocation in R-005
```

Proposed mapping:

| Workflow situation / semantic action | Canonical skill | Deterministic follow-up |
|---|---|---|
| capture and frame a new idea | `capture-feature` | validate artifact scope; rebuild/check graph |
| author or repair specification | `specify-feature` | rebuild/check; recalculate specification eligibility |
| resolve a material Question | `clarify-feature` | validate propagation; rebuild/check |
| prepare specification-gate judgment | `review-specification` | re-check fingerprint; human approval if required |
| author implementation plan | `plan-feature` | validate task DAG and traceability |
| define verification topology | `design-verification` | calculate coverage gaps |
| review generated contracts/readiness | `review-build-readiness` | generate/check contracts, staleness, and gate eligibility |
| initial or retry implementation attempt | `implement-build-contract` | record return claim; enter verification |
| implementation returned | `review-implementation` | constrain conclusive routing to retry, reconciliation, or satisfactory verification; otherwise retain a verification wait/blocker |
| final verification gate | `review-verification` | recalculate Evidence satisfaction and gate eligibility |
| governing truth or implementation diverged | `reconcile-feature` | rebuild/check, recalculate staleness and eligibility |
| generate Build Contract, calculate readiness/completion, route a reviewed outcome, persist a gate | none | deterministic Lengthwise behavior |

The action task package identifies the canonical skill and version contract; Feature/Task IDs; accepted Build Contract where applicable; relevant graph entity IDs and artifact sources; required and optional context slots; prior attempt and retry references; expected outcome kinds; deterministic checks to run afterward; decision authority; and allowed escalation reasons. It contains no provider-native command name or install path and is directly usable with the installed skill without requiring the operator to reconstruct another orchestration prompt.

F-004 makes the manual pre-invocation loop operational:

```text
F-003 determines an applicable semantic action
        ↓
Lengthwise exposes canonical skill identity + bounded task package
        ↓
operator uses the installed skill in an existing Codex or Claude client
        ↓
operator submits the validated structured outcome through Lengthwise
        ↓
F-003 deterministically checks artifacts and decides the next action
```

The existence or installation of all eleven skills creates no requirement to execute all eleven. Likewise, a provider selecting a discovered skill grants no additional authority beyond the current semantic action and task package.

## Provider renderer architecture

The renderer boundary is package-oriented:

```ts
interface SkillRenderer {
  readonly provider: ProviderId;
  readonly version: string;
  render(skill: ValidatedCanonicalSkill): RenderedSkillPackage;
}
```

The exact TypeScript shape is delegated. Semantically, a rendered package contains files, provenance, content digests, install-layout information, compatibility findings, and any declared divergence records. Renderers may:

- place the package in the provider's discovery layout;
- preserve or add supported frontmatter and sidecar metadata;
- add Codex `agents/openai.yaml` metadata where useful;
- apply provider compatibility transforms that have an explicit capability record.

Renderers may not independently rewrite methodology, remove obligations, change escalation rules, or substitute provider-specific workflow IDs. CI compares normalized `SKILL.md` bodies and support files across providers and fails undeclared behavioral divergence.

For the current proof:

- Codex renders a standard package discoverable under `.agents/skills/<name>` or the corresponding user scope, with optional `agents/openai.yaml` kept outside the canonical methodology.
- Claude renders the same standard package under `.claude/skills/<name>` or the corresponding user scope. Claude-only invocation control, tool grants, dynamic command injection, and subagent execution are not used by the baseline library.

No meaningful behavioral divergence is currently required. Both providers support the same Agent Skills core needed by F-004.

## Install and update lifecycle

The minimal CLI is:

```text
lw skills list
lw skills install --provider <codex|claude> [--scope <user|project>]
lw skills doctor --provider <codex|claude> [--scope <user|project>]
lw skills remove --provider <codex|claude> [--scope <user|project>]
```

Project scope is the default so changing one Lengthwise project's managed methodology does not silently change unrelated projects. User scope remains explicitly selectable. `install` is idempotent and also performs updates, so a separate `update` command is unnecessary in F-004. The operation loads and validates bundled canonical skills, resolves the supported renderer, renders to a staging location, checks target conflicts and modifications, installs the complete managed set with rollback on failure, and reports `installed`, `unchanged`, `updated`, `conflict`, or `failed` per package plus the overall result.

`doctor` reports canonical validity, provider support, discovery-path accessibility, installed versions, stale renderer output, missing files, modified managed files, provider precedence, collisions or shadowing where detectable, and partial-install recovery information. It does not imply that a discovery path alone determines which duplicate a provider selects. `remove` deletes only files proven to belong to the selected managed installation and refuses modified packages without explicit force policy.

Canonical skills are committed. Rendered provider installations are ignored/local derived artifacts or user-scope operational files; they are not committed as parallel sources. Release packaging includes canonical source and renderer code, not a second maintained methodology tree. CI may render ephemeral golden packages for validation.

## Version and provenance model

F-004 uses three independent identities rather than a package ecosystem:

- `skillVersion`: a positive monotonic integer bumped for any canonical package change that may affect behavior or declared workflow contract;
- `workflowContractVersion`: a positive integer identifying the task-package and outcome schema the skill expects;
- renderer identity/version: identifies packaging behavior independently of methodology.

A deterministic canonical content digest covers every canonical file intended to define behavior, including `SKILL.md`, `lengthwise.yaml`, and canonical support files. Canonical path ordering and byte normalization are defined by the implementation contract. Installation timestamps, destination paths, and other installation-instance facts are excluded from reproducible content identity.

Each installed package distinguishes canonical skill ID and version, workflow-contract version, canonical content digest, provider and renderer version, rendered content digest, and installation-instance metadata. A digest field or provenance sidecar is excluded from the digest it records through an unambiguous versioned rule; provenance may therefore describe content without recursively changing its own identity.

An installation is stale when its canonical version/digest or renderer version/output differs from the current bundle. A skill is incompatible when its workflow contract version is unsupported, even if its Markdown is valid. No dependency solver or version range negotiation is required.

## `implement-build-contract` methodology

The skill consumes one current accepted Build Contract, its task-scoped authoritative entities, decision authority, relevant repository context, and optional bounded retry context.

```text
read and confirm the accepted current Build Contract
                     ↓
enumerate every included obligation and verification expectation
                     ↓
inspect relevant existing implementation and constraints
                     ↓
implement within LOCKED / BOUNDED / DELEGATED authority
                     ↓
run applicable available checks and tests
                     ↓
self-review every contract obligation, not only changed code
                     ↓
unaddressed obligation or unsupported claim?
       yes → continue implementation or escalate a genuine authority conflict
       no  → return a structured completion claim
```

Compilation, one happy path, a green partial test, returning control, or saying "done" is never treated as proof that the contract is complete. The skill must preserve LOCKED decisions, make choices only within BOUNDED/DELEGATED authority, and refuse to rewrite governing requirements merely to make implementation pass.

The completion claim includes task ID, accepted Build Contract ID and fingerprint, implementation attempt ID, per-requirement and per-AC states, LOCKED-decision assessment, known gaps, changed files, checks/tests run with results, and items requiring external verification. An omitted obligation is unassessed, never successful. The claim is a self-assessment consumed by F-003 coordination and is not authoritative Evidence.

Unavailable human or external verification does not require endless implementation or a false completion claim. The implementer returns the implementation assessment it can support and explicitly identifies remaining external-verification requirements. Genuine verification results produced during implementation may separately become Evidence when recorded with normal provenance, applicability, revision/context, and Verification relationships; the completion claim itself does not.

On retry, the skill begins with the failed/missing obligations and blocking findings, inspects prior changes before rewriting them, preserves satisfactory work, and still rechecks the full accepted contract for regressions and hidden coupling.

## `review-implementation` methodology

The skill is independent from implementation methodology even if R-005 later invokes both in one provider session. It consumes the accepted current Build Contract, returned implementation claim, implementation attempt identity, relevant diff/files, required Verification definitions and current Evidence, and any prior attempt context.

It must:

1. reconstruct the complete obligation set from the accepted contract rather than trusting the claim's selected list;
2. inspect implementation and applicable behavior, run or assess proportionate available verification, and challenge unsupported claims;
3. identify each missing, incorrect, unverified, or LOCKED-conflicting obligation with Requirement/AC/Verification IDs where derivable;
4. distinguish implementation incompleteness from changed or contradictory governing truth;
5. produce one conclusive recommendation—`retry-implementation`, `reconcile`, or `satisfactory`—only when its prerequisites are established;
6. when no defect is demonstrated but required verification is pending or unavailable, identify the missing evidence and retain the existing verification wait/blocker rather than manufacturing a conclusive route;
7. identify evidence observations that may be recorded through Lengthwise's authoritative artifact flow without treating review prose as Evidence.

`retry-implementation` is valid only when the contract remains current and an implementation defect or unsatisfied implementation obligation is established. Missing evidence alone is not evidence of missing implementation. `reconcile` is required when accepted requirements, decisions, constraints, contract inputs, or verification definitions are no longer coherent with discovered truth. `satisfactory` is valid only when applicable required verification and task-state prerequisites support it; otherwise the result is inconclusive and F-003's existing wait/blocker semantics remain in force. The deterministic coordinator remains authoritative for route eligibility.

Review determines whether existing Evidence—including genuine results produced during implementation—is credible, current, applicable, linked, and sufficient. It does not rerun good verification merely because the implementer generated it; duplicate verification work has no inherent value.

## Retry-context model

The retry task package composes, rather than duplicates, current authoritative and operational context:

```text
current accepted Build Contract
+ prior implementation attempt and completion claim
+ failed/missing Verification obligations
+ affected ACs and Requirements where derivable
+ blocking findings and review rationale
+ relevant prior changed files/scope
+ explicit contract-current result
+ current decision authority
```

The stored F-003 retry event may continue to reference the prior attempt rather than copying the entire claim. The F-004 task-package projection resolves that reference and includes the claim and relevant changed-file context for the skill. A current contract is reused without regeneration or gate repetition. A stale contract suppresses implementation retry and routes to reconciliation.

## Human escalation semantics

All skills use a shared escalation vocabulary and include the exact governing entity or missing evidence where possible:

- `material-product-decision` — observable behavior or scope requires product authority;
- `conflicting-governing-requirements` — accepted obligations cannot simultaneously be satisfied;
- `locked-decision-conflict` — progress would require changing a LOCKED decision;
- `authority-boundary-exceeded` — an architecture or policy choice lies outside BOUNDED/DELEGATED authority;
- `unresolved-policy-conflict` — applicable policy is ambiguous or contradictory;
- `insufficient-evidence` — a required judgment cannot be justified from available evidence;
- `stale-build-contract` or `governing-context-conflict` — current governing truth invalidates the handoff boundary and requires reconciliation.

A skill does not escalate naming, local refactoring, test organization, or other harmless choices within explicit DELEGATED authority.

## Validation and quality verification

Deterministic validation checks package structure, required portable frontmatter, directory/name agreement, unique canonical IDs, schema and version fields, supported semantic-action bindings, known context/outcome/check/escalation identifiers, canonical support files, renderer compatibility, provenance integrity, installed digests, and duplicate or shadowed targets. Installation safety additionally constrains every destination to the selected provider/scope root, rejects traversal and symlink escape, stages replacements, never executes bundled scripts merely by installing them, preserves a prior managed set on failed update where feasible, and removes only proven managed files. This is a bounded installer safety contract, not a general filesystem sandbox.

Verification has three explicit layers. Deterministic packaging evidence establishes validation, renderer layout, provenance/digests, idempotent installation, conflict behavior, rollback, and safe removal. Mocked workflow fixtures establish that Lengthwise processes completion claims, retry findings, routes, stale contracts, and structured outcomes correctly; they do not prove methodology quality. Representative real exercises manually use installed skills in existing provider clients and undergo human engineering review.

The minimum real scenario set covers a current accepted Build Contract, a completion claim that omits or incorrectly claims an obligation, detection during review/verification, bounded same-contract retry, correction without unrelated rework or contract regeneration, repeated full-contract review, a separate governing-context change routed to reconciliation, and pending human/external verification retained as a blocker rather than falsely routed. Provider portability means preserving intended methodology, not identical model output, and does not require an eleven-skills-by-two-providers matrix.

## Failure behavior

- Invalid canonical skill: fail validation and render/install nothing from the invalid set.
- Unsupported provider/renderer pair: report it before changing the destination.
- Unavailable install location: report the exact scope/path and leave prior installation intact.
- User-modified managed file: report a conflict; do not overwrite silently.
- Stale generated skill: report why it is stale and let idempotent install update it when unmodified.
- Provider metadata change: update the renderer version and validate ephemeral output before release.
- Partial installation failure: restore the prior managed set or report a recoverable staged/backup state; never report success for an unknown mixture.

## Workbench boundary

The workbench may show the canonical skill ID/name/version next to an AI-capable next action. Provider installation and provider selection are not required workflow truth and should not be embedded in Feature lifecycle or Project Graph eligibility. CLI diagnosis is sufficient for F-004; a skill-management workbench is deferred unless user testing demonstrates a need.

## Resolved material decisions

The four specification Questions are answered and propagated:

1. canonical source is a standard Agent Skills package with `SKILL.md`, minimal `lengthwise.yaml`, and optional canonical support files;
2. project and user installation scopes are supported, with project scope the default;
3. F-004 supports bundled standard skills only while preserving extension seams;
4. Engineering Skills is `R-008`; the established `R-005 — Implementer Execution` identity remains unchanged and later owns automated provider invocation/session execution.

The eleven-skill boundary is a review point but not currently a blocking Question: the first methodology fixtures must demonstrate that `review-implementation` can coherently execute/assess applicable verification. If it cannot, adding a broader `verify-implementation` skill requires specification reconciliation rather than silent expansion.

## Existing-model contradictions and gaps

- F-003's `WorkflowActivity` vocabulary is too coarse to select this skill set; semantic action-level binding is required without replacing activity state.
- The current `ImplementationCompletionClaim` omits checks/tests run, results, and external-verification items requested by the implementation methodology. F-004 must extend the operational claim schema while preserving DR-028.
- Current retry events retain failed verifications, affected ACs/requirements, findings, gaps, and contract currency, but the action projection does not supply the complete previous claim or changed-file scope. F-004 must compose them from attempt history.
- Current CLI `workflow return` records a string claim, while the HTTP service accepts a structured object and the workbench captures only summary, gaps, and files. The task-package/outcome contract needs one coherent structured boundary before provider invocation in R-005.
- F-003 action IDs such as `repair-specification`, `handoff:<task>`, and `review-return:<task>` are operational/UI identities, not a stable methodology vocabulary.
- Current F-003 implementation-handoff projection treats every planned task with a current contract as eligible without applying task dependency readiness: for this accepted DAG it offers all eleven handoffs while `lw ready` correctly reports only `TASK-036`. F-004 semantic-action applicability must reuse deterministic dependency evaluation rather than duplicate or bypass it.
- The roadmap mismatch is resolved by `R-008 — Engineering Skills`; roadmap identity is intentionally not execution order.
- No provider abstraction exists in code beyond DR-006 and provider-neutral F-003 boundaries. F-004 therefore introduces the first packaging/provider abstraction but must not absorb runtime invocation.
- Repeated Bun CLI/test startup emits a non-fatal TypeScript directory-mismatch diagnostic on this host. It does not invalidate graph/test results but is an existing CLI quality issue, not an F-004 skill requirement unless it blocks installer usability.

## Completion boundary

F-004 can become ready only after the answered Questions remain propagated, the requirements/NFRs and observable ACs are accepted, required Decision Records and verification definitions exist, the task DAG is accepted, deterministic Build Contracts are generated and reviewed, and standard-rigor gates are satisfied. No skill implementation or provider installation work begins before that point.
