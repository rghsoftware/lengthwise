---
lengthwise: 1
id: DOC-F002-BUILD-CONTRACTS
type: document
lifecycle: accepted
---

# F-002 — Minimal Workbench Build Contracts

**Feature:** F-002
**Lifecycle:** complete
**Significance:** L
**Effective rigor:** standard

## Contract semantics

- **LOCKED** — required; changing it requires explicit reconciliation with governing artifacts.
- **BOUNDED** — the implementer chooses within stated constraints.
- **DELEGATED** — intentionally left to implementation judgment.

These contracts contain the relevant slice for each task. They do not replace the feature specification, requirements, accepted decisions, or repository principles.

## Cross-cutting constraints

### LOCKED

- Git-tracked repository artifacts remain authoritative (DR-001).
- The Project Graph remains derived and rebuildable (DR-002).
- Durable lifecycle, derived model state, editor state, and service runtime state remain distinct (DR-003, DR-013).
- Existing graph and check semantics are reused rather than reimplemented for the UI.
- Saved invalid content remains authoritative; the last successful graph is retained and visibly labeled until a later successful rebuild (DR-015).
- Graph-change comparison uses consecutive successful workbench-session graphs; failure does not advance the baseline (DR-016).
- Editing uses explicit save, visible dirty state, and discard protection (DR-017).
- The MVP is a SvelteKit and CodeMirror 6 browser client over reusable services and a loopback HTTP boundary launched by `lw serve` (DR-018).
- Use [Tark UI's Svelte examples](https://github.com/anubra266/tarkui) as the visual reference with Tailwind CSS 4 and Ark UI primitives. A custom or alternate primitive is allowed when Tark UI and Ark UI have no suitable pattern or when using one would violate a locked accessibility, interaction, security, or state-communication contract; document any material exception in implementation evidence.
- No task may add a graph canvas, workflow engine, desktop wrapper, remote service, general filesystem editor, or Git-management surface to F-002.

### BOUNDED

Tark UI pattern selection within the locked exception rule, Tailwind and Ark UI package versions compatible with the repository, internal module layout, API resource naming, component decomposition, and whether event updates use request/response, SSE, or WebSocket.

## TASK-011 — Reusable workbench application services

**Implements:** NFR-008
**Governing:** DR-001, DR-002, DR-003, DR-009, DR-018
**Evidence:** VER-019

### Objective

Create UI-independent operations that present coherent entity-list, entity-detail, derived-state, check, and source metadata contracts while reusing F-001 graph behavior.

### LOCKED

- Services return semantic data rather than CLI-formatted text or Svelte-specific view models.
- The CLI and HTTP adapters call shared graph-building and check behavior.
- Entity detail includes authored properties, source, incoming and outgoing relationships, provenance kind, and applicable derived state.
- Unknown entities and graph-build failure are explicit typed outcomes.
- No new authoritative persistence is introduced.

### BOUNDED

Service class versus functional organization, result/error types, query indexing, pagination if justified by fixtures, and refactoring required to remove CLI-only coupling.

### DELEGATED

Internal names and helper utilities that do not affect service semantics.

## TASK-012 — Authorized artifact read and conflict-safe write

**Implements:** REQ-017, NFR-009, NFR-010
**Governing:** DR-001, DR-010, DR-012, DR-017, DR-018
**Evidence:** VER-016

### LOCKED

- Reads and writes target the complete actual Markdown or YAML artifact, never an entity-shaped database copy.
- A requested path is resolved and authorized server-side against the selected repository and configured discovery scope before every read and write.
- Traversal, absolute-path substitution, symlink escape, excluded paths, and unrecognized files are rejected.
- Authorization is not based only on filename extension or a client-provided entity/source record.
- Save requires a version token derived from content loaded or last saved; a mismatch rejects the write without overwriting current content.
- Successful writes use an atomic same-filesystem replacement strategy where the platform permits it and preserve the artifact's intended text bytes other than the submitted content.
- The service reports conflict, authorization, read, and write failures distinctly.

### BOUNDED

Version-token algorithm, atomic-write implementation, newline handling when the submitted editor buffer explicitly changes it, and internal authorization-cache strategy.

### DELEGATED

Temporary filename convention and low-level filesystem helper organization.

## TASK-013 — Successful-build session and graph comparison

**Implements:** REQ-018, REQ-020, NFR-011
**Governing:** DR-002, DR-003, DR-015, DR-016
**Evidence:** VER-017, VER-018

### LOCKED

- A session begins with an attempted full graph build and check run.
- Only successful graph builds become the navigable current graph and a comparison baseline.
- When graph construction succeeds, its complete check result is stored with that baseline even when checks contain blocking findings, enabling added/resolved finding comparison.
- A saved artifact is not rolled back merely because build or checks report problems.
- Build failure retains the previous successful graph and separately exposes current saved-artifact diagnostics.
- A later successful build replaces the retained graph and compares against the previous successful baseline.
- Entity comparison uses stable ID and semantic fields; relationship comparison uses normalized semantic identity, not array position.
- Change categories include entity added/removed, lifecycle changed, relationship added/removed, relevant coverage lost, and blocking finding added/resolved.
- Output ordering is deterministic.
- The result does not claim to be a Git or line diff.

### BOUNDED

Session storage location, in-memory snapshot representation, and normalized change-record schema.

### DELEGATED

Comparison helper decomposition and internal collection types.

## TASK-014 — Loopback API and `lw serve`

**Implements:** REQ-013
**Governing:** DR-007, DR-018
**Evidence:** VER-013, VER-016, VER-019

### LOCKED

- `lw serve` validates the selected Lengthwise project before presenting a usable workbench URL.
- Default binding is loopback only.
- The service reports its actual local URL and handles unavailable requested ports clearly.
- Write endpoints reject untrusted browser origins under the default configuration.
- API validation occurs at the untrusted HTTP boundary.
- The API exposes only operations required for F-002; it is not a general filesystem or command-execution endpoint.
- Server shutdown does not change repository artifacts or authoritative model state.

### BOUNDED

Default port selection, browser auto-open behavior, API paths, JSON schemas, CSRF/origin mechanism, request limits, static asset integration, and graceful-shutdown details.

### DELEGATED

Logging format and development-only server diagnostics.

## TASK-015 — Entity navigation, inspection, and relationships

**Implements:** REQ-014, REQ-015, REQ-016
**Governing:** DR-008, DR-013, DR-018
**Evidence:** VER-014, VER-015, VER-020

### LOCKED

- Navigation distinguishes ID, type, type-specific lifecycle, and a useful label when present.
- Search supports type filtering and case-insensitive matching over IDs and useful authored text.
- Entity selection has a stable browser address within the workbench.
- Entity detail distinguishes authored properties, derived state, source, incoming edges, and outgoing edges.
- Relationship entries expose semantic label/direction, counterpart, and provenance and navigate as ordinary links.
- Unknown route, empty search, loading, build failure, and service failure are distinct visible states.
- No graph canvas is introduced.

### BOUNDED

Pane layout, responsive breakpoints, search tokenization, keyboard navigation, list virtualization when justified, and the exact presentation of provenance and derived state.

### DELEGATED

Icons, typography, spacing, and component naming consistent with usability needs.

## TASK-016 — CodeMirror editing and validation feedback

**Implements:** REQ-017, REQ-018, REQ-019
**Governing:** DR-001, DR-015, DR-017, DR-018
**Evidence:** VER-016, VER-017, VER-020, VER-021

### LOCKED

- CodeMirror 6 edits the complete artifact with Markdown, YAML, and Markdown-frontmatter language support as applicable.
- Editor dirty state is based on divergence from the last loaded or successfully saved artifact content.
- Save is explicit and has a keyboard-accessible invocation.
- Unsaved navigation is intercepted inside the application; reload/close protection uses the browser's available mechanism.
- Save progress, rebuild progress, successful refresh, write failure, conflict, build failure, check findings, and recovery are visibly distinct.
- On build failure, the editor shows current saved content while entity navigation is labeled as the last successful graph.
- Findings display category/message and known entity/path/line context; known contexts are navigable.
- UI code consumes service outcomes and does not reconstruct graph or check semantics.

### BOUNDED

Editor theme, tab width, line wrapping, finding panel placement, source-line highlighting, shortcut choice, and whether editor state is preserved while navigating within the same artifact.

### DELEGATED

Animations, microcopy, and visual emphasis subject to comprehensibility review.

## TASK-017 — Successful graph-change consequences

**Implements:** REQ-020
**Governing:** DR-008, DR-016
**Evidence:** VER-018, VER-020

### LOCKED

- The UI presents every non-empty normalized change category returned by the comparison service.
- Change items link to current entities or relevant finding/source context when such a target exists.
- Removed entities and relationships remain understandable without pretending they still exist in the current graph.
- The baseline is identified as the previous successful graph in this workbench session.
- Failed rebuilds do not show partial model changes as though they were accepted into the baseline.
- Presentation does not resemble or claim a line-level or Git diff.

### BOUNDED

Grouping, ordering within normalized categories, summary counts, dismissal behavior, and empty/no-change presentation.

### DELEGATED

Labels and visual treatment that preserve the locked semantics.

## TASK-018 — Automated verification and boundary inspection

**Implements:** NFR-008, NFR-009, NFR-010, NFR-011
**Evidence:** VER-013 through VER-019

### LOCKED

- Use isolated fixture repositories for write, invalid-model, conflict, traversal, symlink, origin, and graph-change cases.
- Automated browser evidence exercises observable user behavior rather than component internals alone.
- Security cases include encoded traversal, absolute paths, symlink escape, excluded/unrecognized artifacts, stale version tokens, and untrusted origins.
- Service/CLI equivalence compares semantic diagnostics, not incidental formatting.
- Inspection confirms Svelte components do not own graph construction, validation rules, artifact authorization, or comparison semantics.
- Tests restore or discard all fixture mutations and do not edit the dogfood repository's authoritative artifacts.

### BOUNDED

Browser automation library, fixture builder extensions, test-file organization, and CI grouping.

### DELEGATED

Test helper names and non-semantic fixture prose.

## TASK-019 — Dogfood and usability evaluation

**Implements:** NFR-012
**Governing:** DR-007, DR-009
**Evidence:** VER-020, VER-021

### LOCKED

- Evaluation uses the complete core loop against a representative Lengthwise repository containing multiple entity and finding types.
- Participants attempt entity search, relationship traversal, source editing, explicit save, validation interpretation, invalid-model repair, and change interpretation.
- The evaluator records task outcome, observed confusion, and participant explanation rather than relying only on preference ratings.
- Comprehensibility review covers terminology, information hierarchy, empty states, dirty/saved distinctions, retained-graph state, and failures.
- Material failures lead to product or artifact reconciliation; they are not waived because automated tests pass.
- Evidence distinguishes demonstrated usability from visual polish requests outside F-002.

### BOUNDED

Participant count appropriate to an internal MVP, evaluation script details, note format, and which representative artifact edits are used.

### DELEGATED

Scheduling and facilitation logistics.

## TASK-020 — Reconciled interaction and verification gaps

**Implements:** REQ-019, REQ-020, NFR-010
**Evidence:** VER-016, VER-017, VER-018

### Objective

Close implementation gaps found while reconciling the completed slice with its accepted contracts, without broadening F-002.

### LOCKED

- A stale-version conflict preserves the rejected editor buffer, identifies the affected artifact, and offers an explicit way to load the current repository version without presenting the rejected buffer as saved.
- Activating a finding with known source context opens its authorized responsible artifact when different from the current artifact and targets the known line when the editor can do so.
- Automated comparison tests exercise entity addition/removal, lifecycle change, relationship addition/removal, coverage loss, and finding addition/resolution, including proof that failed rebuilds do not advance the successful baseline.
- Automated HTTP security evidence includes encoded traversal at the untrusted boundary in addition to direct service path tests.
- Changes remain inside the existing local HTTP, artifact-service, session, comparison-service, and Svelte presentation boundaries.

### BOUNDED

Conflict-recovery control placement, editor line-target presentation, and test organization.

### DELEGATED

Microcopy and non-semantic styling consistent with the existing workbench.

## As-built bounded choices

- The session and successful graph baseline are in memory and last for the server process lifetime.
- Artifact versions are SHA-256 content hashes; successful saves use a temporary file and same-directory atomic rename.
- The HTTP boundary uses request/response JSON endpoints; F-002 demonstrated no need for SSE or WebSockets.
- `lw serve` binds to the stable default `127.0.0.1:7331`; `--port <PORT>` provides an explicit override. An occupied requested port produces a clear startup failure rather than silently changing the URL. The command reports but does not automatically open the URL.
- Non-loopback binding exists only as an internal server option used for local development. It is not a supported `lw serve` flag, and remote/cross-machine operation remains outside F-002's trust boundary.
- The SvelteKit client is emitted as a static production build and served by Bun. Tailwind CSS 4 supplies local Tark-inspired presentation components; Ark UI is used where a suitable behavior primitive is present.
