---
lengthwise: 1
id: DOC-F002-IMPLEMENTATION-EVIDENCE
type: document
lifecycle: accepted
---

# F-002 — Implementation Evidence

## Implemented slice

- UI-independent workbench query service with authored properties, source, relationship provenance, task readiness, and coverage state;
- configured-scope artifact authorization with traversal, absolute-path, exclusion, recognition, and symlink containment;
- SHA-256 optimistic concurrency tokens and atomic same-filesystem saves;
- retained last-successful graph behavior for parse/normalization failure and recovery on a later valid save;
- deterministic session comparison for entity, lifecycle, relationship, coverage, and finding changes;
- loopback Bun HTTP boundary with same-origin write enforcement and typed error responses;
- `lw serve`, including first-launch SvelteKit static build and explicit startup diagnostics;
- SvelteKit workbench with addressable entity selection, search/type filters, inspection, relationship navigation, CodeMirror 6 Markdown/YAML editing, explicit save, dirty/discard protection, finding context, and change feedback.

## Automated evidence

- Execution date: 2026-08-31;
- `bunx tsc --noEmit`: pass, no diagnostics;
- `bun test`: 95 tests pass, 0 fail, including ten workbench service/security/end-to-end integration tests;
- `bun run build:workbench`: pass; SvelteKit production client and server bundles generated successfully (the build reports a non-blocking large-chunk advisory);
- `bun run lw index`: pass after reconciliation, 220 entities and 333 relationships indexed;
- `bun run lw check`: pass, no findings;
- `bun run lw show F-002`, `bun run lw trace F-002`, and `bun run lw ready`: pass; F-002 is addressable and traceable, and TASK-019 is the remaining ready follow-up after TASK-020 completion;
- automated cases cover search and detail semantics, derived state, successful save/change comparison, invalid-save retention and repair, conflict rejection, traversal/absolute/excluded/unrecognized/symlink denial, ordering-independent comparison, loopback API operation, same-origin write rejection, and static client serving.

## Browser dogfood evidence

The production SvelteKit build was served through `lw serve` against the Lengthwise repository. A browser smoke evaluation established that:

- the address `?entity=F-002` loaded the expected feature inspector and complete authoritative Markdown artifact in CodeMirror;
- search narrowed the navigation set using authored text;
- selecting `TASK-011` updated the inspector and stable browser address;
- the browser reported no console warnings or errors.

The accepted browser behavioral plan was also exercised against an isolated four-entity fixture repository through the production workbench build:

- `?entity=REQ-001` opened the requested entity, source location, authored properties, derived implementation coverage, and both declared and derived relationships;
- authored-text search returned the matching acceptance criterion and verification; type filtering returned only the task;
- following the derived `implemented-by` relationship moved inspection and the stable address to `TASK-001`;
- editing the complete YAML artifact enabled Save; a valid lifecycle edit rebuilt the graph, updated the visible task lifecycle, and reported one `lifecycle-changed` consequence;
- saving malformed YAML kept the malformed text in the editor, displayed one source-addressable `artifact/invalid-yaml` finding, explicitly announced use of the last successful graph, and kept `TASK-001` navigable;
- repairing and saving the YAML restored a valid graph and cleared the retained-graph state;
- the browser console contained no warnings or errors during the successful, invalid, and repaired states.

The unsaved-navigation confirmation appeared during the final automation probe, but the browser driver timed out while the modal was active before it could capture a durable assertion. Its implementation was therefore verified by code inspection (`confirm` on artifact/entity navigation plus `beforeunload` registration), not counted as a completed browser assertion. No authoritative Lengthwise repository artifact was edited; all browser writes were confined to the disposable fixture.

## Verification disposition

| Verification | Disposition | Evidence |
| --- | --- | --- |
| VER-013 | Satisfied | CLI launch/error and HTTP integration tests; loopback default and same-origin write enforcement; production UI served. |
| VER-014 | Satisfied | Query/detail service tests plus browser search, type filter, addressable selection, authored/derived/source inspection. |
| VER-015 | Satisfied | Relationship projection tests plus browser traversal from derived relationship to its entity. |
| VER-016 | Satisfied with noted modal-capture limitation | Complete CodeMirror artifact editing and explicit save observed; conflict and filesystem authorization tests pass; encoded traversal has an HTTP-boundary regression case. Browser verification confirmed that a stale save preserves the rejected buffer and exposes an explicit repository-version reload action. Discard protection remains verified by implementation inspection because the earlier modal capture timed out. |
| VER-017 | Satisfied | Browser valid-save, malformed-save/retained-graph, finding, and repair/recovery sequence passed. Follow-up browser verification confirmed that a source-only finding opens a different responsible authorized artifact, with CodeMirror line targeting implemented for known lines. |
| VER-018 | Satisfied | Deterministic ordering, retained-baseline recovery, and every required entity, lifecycle, relationship, coverage, finding-added, and finding-resolved change category have dedicated automated assertions. |
| VER-019 | Satisfied | Contract tests and import inspection show graph build/check/artifact/change rules in `src/workbench`; the Svelte client consumes the HTTP API and contains presentation/orchestration only. |
| VER-020 | Pending human evaluation | Requires the accepted moderated human usability method; automated browser evidence is supporting evidence only. |
| VER-021 | Pending human review | Requires the accepted human design/comprehensibility review. |

## Tark UI, Tailwind, and Ark UI

The workbench follows Tark UI's actual distribution model: its Svelte registry examples are visual source material rather than an installed component package. Tailwind CSS 4 supplies the styling system, Ark UI supplies accessible behavior primitives, and local components preserve a narrow product-facing boundary. `Hint.svelte` uses Ark UI's tooltip composition directly; `Button.svelte` and `Badge.svelte` use Tark-style neutral palettes, compact rounded controls, subtle borders, state colors, and Tailwind utility classes.

## Remaining required evidence

TASK-020 is complete. VER-020 and VER-021 still require human usability/design evaluation through TASK-019, which remains planned and ready. F-002 remains active rather than complete until that human evaluation is performed and any material findings are reconciled. The non-blocking production-bundle size advisory is also worth revisiting if measured startup or interaction performance becomes a usability concern; it is not presently a failed acceptance criterion.
