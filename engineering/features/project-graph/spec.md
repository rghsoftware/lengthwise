---
lengthwise: 1
id: F-001
type: feature
title: Project Graph
lifecycle: ready
significance: L
---

# F-001 — Project Graph

## Goal

Discover recognized engineering artifacts, parse Lengthwise metadata, normalize them into typed entities and relationships, validate the engineering model, and expose a disposable queryable Project Graph.

## Scope

- project configuration
- flexible artifact discovery
- explicit Lengthwise artifact recognition
- YAML parsing
- Markdown/frontmatter parsing
- typed entities and relationships
- relationship provenance
- graph normalization
- structural graph validation
- engineering completeness checks
- disposable SQLite indexing
- basic graph-query CLI

## Non-scope

- visual workbench
- workflow execution
- AI inference
- source-code traceability
- Codex integration
- workflow/runtime state
- Jira/Confluence
- automatic interpretation of unmarked prose
- arbitrary semantic schemas
- automatic architecture extraction

## Architectural flow

```text
repository
   ↓
configuration
   ↓
discovery
   ↓
candidate files
   ↓
recognition / parsing
   ↓
normalization
   ↓
Project Graph
   ↓
validation / completeness checks
   ↓
derived SQLite index
   ↓
CLI queries
```

Discovery and recognition are separate: discovery selects candidate files; recognition determines whether candidates are Lengthwise artifacts.

## Recognition

YAML:
```yaml
lengthwise: 1
entities:
  - id: REQ-001
    type: requirement
```

Markdown:
```markdown
---
lengthwise: 1
id: DR-001
type: decision
lifecycle: accepted
---
```

Unmarked YAML/Markdown is ignored. Marked-but-invalid Lengthwise content reports actionable diagnostics.

## Domain semantics

- Artifact, Entity, and Relationship are distinct.
- One supported structured artifact may declare multiple entities.
- IDs are explicit and stable.
- Relationships are not inferred from ID naming.
- Edges are stored semantically once; inverse labels are query projections.
- Provenance supports `declared`, `derived`, `observed`, and `inferred`.
- F-001 must produce `declared` and `derived`; the domain model must represent all four.
- Non-authoritative provenance cannot satisfy deterministic checks requiring authoritative evidence.

## Initial relationship vocabulary

`contains`, `addresses`, `has-acceptance-criterion`, `governs`, `realized-by`, `implements`, `verifies`, `depends-on`, `supersedes`

## Policy

F-001 significance: `L`.

Effective rigor: inherited `standard`.

Lifecycle is type-specific. Readiness, satisfaction, verification result, and runtime state are derived or operational rather than generic persisted status.

## CLI

- `lw index`
- `lw check`
- `lw show <ID>`
- `lw trace <ID>`
- `lw ready`

## Completion

F-001 is complete when required tasks are complete, required ACs have satisfactory evidence, no blocking findings remain, and implementation and governing artifacts have converged.
