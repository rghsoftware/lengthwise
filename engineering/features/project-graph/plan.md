---
lengthwise: 1
id: PLAN-F001
type: plan
lifecycle: accepted
---

# F-001 — Project Graph Plan

## Architectural boundary

Keep graph semantics independent of persistence and artifact representation:

```text
repo → discover → recognize/parse → normalize → ProjectGraph → validate/check → SQLite projection
```

## Technology baseline

- Bun
- TypeScript
- Typia
- SQLite
- YAML
- Markdown/frontmatter

## Suggested modules

```text
src/
├── config/
├── artifacts/
├── graph/
├── checks/
├── index/
└── cli/
```

Exact internal organization is delegated unless constrained by a Build Contract.

## Task DAG

```text
TASK-001

TASK-002     TASK-003     TASK-004
                  \       /
                   \     /
          TASK-001 + 003 + 004
                      ↓
                  TASK-005
                      ↓
                  TASK-006
                  /       \
            TASK-007     TASK-008
                  \       /
                   TASK-009
                      ↓
                  TASK-010
```

TASK-002 is independent after the project configuration contract is known. TASK-003 and TASK-004 are representation parsers and do not depend on the graph implementation.

F-001 is accepted as `ready`.
