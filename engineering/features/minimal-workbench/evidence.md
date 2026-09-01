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

- `bunx tsc --noEmit`: pass;
- `bun test`: 93 tests pass, including eight workbench service/security/end-to-end integration tests;
- `bun run build:workbench`: pass;
- automated cases cover search and detail semantics, derived state, successful save/change comparison, invalid-save retention and repair, conflict rejection, traversal/absolute/excluded/unrecognized/symlink denial, ordering-independent comparison, loopback API operation, same-origin write rejection, and static client serving.

## Browser dogfood evidence

The production SvelteKit build was served through `lw serve` against the Lengthwise repository. A browser smoke evaluation established that:

- the address `?entity=F-002` loaded the expected feature inspector and complete authoritative Markdown artifact in CodeMirror;
- search narrowed the navigation set using authored text;
- selecting `TASK-011` updated the inspector and stable browser address;
- the browser reported no console warnings or errors.

No authoritative repository edit was saved during browser dogfooding; write behavior is exercised in isolated fixture repositories.

## Tark UI, Tailwind, and Ark UI

The workbench follows Tark UI's actual distribution model: its Svelte registry examples are visual source material rather than an installed component package. Tailwind CSS 4 supplies the styling system, Ark UI supplies accessible behavior primitives, and local components preserve a narrow product-facing boundary. `Hint.svelte` uses Ark UI's tooltip composition directly; `Button.svelte` and `Badge.svelte` use Tark-style neutral palettes, compact rounded controls, subtle borders, state colors, and Tailwind utility classes.

## Remaining required evidence

VER-020 and VER-021 require human usability/design evaluation. TASK-019 remains planned and ready; F-002 remains active rather than complete until that evaluation is performed and any material findings are reconciled.
