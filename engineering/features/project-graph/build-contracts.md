---
lengthwise: 1
id: DOC-F001-BUILD-CONTRACTS
type: document
lifecycle: accepted
---

# F-001 — Project Graph Build Contracts

**Feature:** F-001  
**Lifecycle:** ready  
**Significance:** L  
**Effective rigor:** standard

## Contract semantics

- **LOCKED** — must be followed; changing it requires explicit reconciliation/escalation.
- **BOUNDED** — implementer chooses within stated constraints.
- **DELEGATED** — implementation detail intentionally left open.

Build Contracts contain the relevant engineering slice, not the whole project.

## TASK-001 — Domain types and relationship registry

**Implements:** REQ-004, REQ-005, REQ-007, REQ-008, NFR-007  
**Governing:** DR-001, DR-002, DR-011, DR-012, DR-013, DR-014  
**Evidence:** VER-004, VER-005, VER-006, VER-012

### LOCKED
- TypeScript types are the canonical in-code domain model.
- Typia provides runtime validation/schema generation.
- Lifecycle is type-specific; derived/runtime state is separate.
- Relationships are typed, directional, authored using natural semantics, and conceptually stored once.
- Inverse semantics are projections.
- Provenance supports `declared | derived | observed | inferred`.
- Initial relationship vocabulary: `contains`, `addresses`, `has-acceptance-criterion`, `governs`, `realized-by`, `implements`, `verifies`, `depends-on`, `supersedes`.

### BOUNDED
Module layout, ID representation, registry implementation, helper types, exact Typia validator boundaries.

### DELEGATED
Naming and internal utilities that do not affect semantics.

---

## TASK-002 — Project configuration and artifact discovery

**Implements:** REQ-001, REQ-002, NFR-002, NFR-004  
**Governing:** DR-010, DR-011  
**Evidence:** VER-001, VER-002, VER-010

### LOCKED
- Configuration path is `.lengthwise/project.yaml`.
- Artifact locations are configurable.
- Discovery produces candidate files only; recognition is separate.
- Excludes override includes.
- Local-first operation.

### BOUNDED
Glob library, path normalization, loader organization, diagnostic representation.

---

## TASK-003 — YAML artifact parser

**Implements:** REQ-003, REQ-006, NFR-002  
**Governing:** DR-011, DR-012  
**Evidence:** VER-002, VER-004

### LOCKED
- YAML recognition requires explicit top-level `lengthwise: 1`.
- Unmarked YAML is ignored.
- Marked invalid content is an error.
- Structured YAML may contain multiple entities.
- Parsing does not own final graph semantics.

### BOUNDED
YAML library, intermediate parsed representation, source-location mechanism.

---

## TASK-004 — Markdown/frontmatter parser

**Implements:** REQ-003, NFR-002  
**Governing:** DR-010, DR-012  
**Evidence:** VER-002, VER-003, VER-004

### LOCKED
- Markdown recognition requires `lengthwise: 1` in frontmatter.
- Compatible existing narrative bodies need not be rewritten.
- Decision entities do not require ADR-specific headings.
- Unmarked Markdown is ignored.
- Marked invalid metadata is reported.

### BOUNDED
Markdown/frontmatter library, body representation, source-location strategy.

---

## TASK-005 — Normalization

**Dependencies:** TASK-001, TASK-003, TASK-004  
**Implements:** REQ-005, REQ-006, REQ-008, NFR-003, NFR-005, NFR-007  
**Evidence:** VER-004, VER-006, VER-012

### LOCKED
- Semantic identity is independent of representation.
- Downstream graph consumers do not depend on source format.
- Source provenance is retained.
- Explicit authored relationships normalize as `declared`.
- Normalization is deterministic.

### BOUNDED
Adapter architecture, normalization pipeline, source-map representation.

---

## TASK-006 — In-memory Project Graph

**Dependency:** TASK-005  
**Implements:** REQ-007, REQ-008, NFR-001, NFR-003, NFR-005  
**Evidence:** VER-005, VER-006, VER-009

### LOCKED
- The graph is derived.
- Graph semantics are independent of SQLite.
- Relationships are conceptually stored once and inversely traversable.
- Provenance remains queryable.
- Non-authoritative relationships cannot satisfy checks requiring authoritative evidence.

### BOUNDED
Adjacency/index structures, query API, traversal algorithms.

---

## TASK-007 — Structural and completeness checks

**Dependency:** TASK-006  
**Implements:** REQ-009, REQ-010, NFR-003, NFR-005  
**Evidence:** VER-007, VER-008

### LOCKED
- Findings are evidence/gaps, not product-quality scores.
- No required test count or unique verification-per-AC metric.
- Verification is many-to-many.
- Required verification needs satisfactory evidence; optional verification does not block.
- Non-automated verification is valid.
- Report multiple recoverable findings.
- Task dependency cycles are invalid.
- Effective rigor controls required evidence/process, not entity semantics.

### BOUNDED
Finding taxonomy, severity structure, check registry, minimal MVP implementation of light/standard/strict consistent with project policy.

---

## TASK-008 — Disposable SQLite graph index

**Dependency:** TASK-006  
**Implements:** REQ-011, NFR-001, NFR-003, NFR-004, NFR-006  
**Governing:** DR-002, DR-003, DR-004  
**Evidence:** VER-009, VER-010

### LOCKED
- The index is disposable.
- No authoritative engineering information exists only in SQLite.
- Deletion/corruption is recoverable through rebuild.
- Worktrees may have independent indexes.
- Workflow/runtime state does not belong in the graph index.

### BOUNDED
SQLite schema, Bun SQLite access mechanism, local schema versioning, transaction and indexing strategy.

---

## TASK-009 — Project Graph CLI

**Dependencies:** TASK-007, TASK-008  
**Implements:** REQ-012, NFR-004, NFR-005  
**Evidence:** VER-010, VER-011

### Required commands
- `lw index`
- `lw check`
- `lw show <ID>`
- `lw trace <ID>`
- `lw ready`

### LOCKED
- `lw index` reports success/failure.
- `lw check` distinguishes successful validation from blocking findings.
- `lw show` exposes semantic entity information and source.
- `lw trace` exposes meaningful traceability relationships.
- `lw ready` derives readiness from dependencies rather than persisted task `ready` lifecycle.
- Unknown IDs produce explicit not-found behavior.

### BOUNDED
CLI framework, formatting, detailed exit codes, structured output if low-cost.

---

## TASK-010 — Dogfood Lengthwise artifacts

**Dependency:** TASK-009  
**Evidence:** all required F-001 verifications, especially VER-009, VER-011, VER-012

### Objective
Use F-001 against Lengthwise's own engineering artifacts without repository-specific implementation exceptions.

### LOCKED
- Dogfood failures are evidence against the model or implementation; do not patch around them with Lengthwise-specific exceptions.
- Reconcile governing artifacts if implementation reveals an accepted design is wrong.
- Passing checks establishes satisfaction of the F-001 engineering contract, not general product quality.
