---
lengthwise: 1
id: DOC-PRINCIPLES
type: document
lifecycle: accepted
---

# Lengthwise Engineering Principles

Lengthwise optimizes software engineering for AI implementation by converting engineering intent into bounded, context-rich executable work while preserving human decision authority and producing durable evidence connecting intent, implementation, and verification. The engineering contracts remain usable by any competent implementer, human or AI.

## Repository authority

Git-tracked engineering artifacts are authoritative. The UI, Project Graph, agent conversation, and derived databases are not authoritative. Derived indexes must be rebuildable from repository artifacts.

## Project Graph

The Project Graph is the normalized, derived representation of engineering artifacts. Workflow, context selection, visualization, traceability, and execution projections operate from the same graph.

## Flexible storage, strict semantics

Artifact location is configurable. A file becomes a Lengthwise artifact only by explicitly declaring Lengthwise metadata. Ordinary Markdown and YAML remain ordinary files.

## Semantic type and representation

Entity semantics do not dictate file format. Compact structured information will typically use YAML; narrative artifacts will typically use Markdown plus frontmatter.

## Observable acceptance

Requirements define what must be true. Acceptance criteria define observable outcomes. Implementation is a black box unless a mechanism is itself explicitly required.

## Verification

Verification is evidence, not synonymous with automated testing. Valid methods include automated tests, static analysis, benchmarks, inspection, human review, usability evaluation, demonstrations, hardware procedures, and other suitable methods.

Verification is many-to-many: one verification may support multiple acceptance criteria, and one criterion may require multiple complementary verifications. All required verification definitions must have satisfactory applicable evidence before a criterion is considered verified.

## Quality over quantity

Lengthwise does not require one test per criterion, unique verification per requirement, arbitrary test counts, or duplicate evidence merely to improve a metric. Verification exists to increase justified confidence, not produce green checkmarks.

Metrics may expose gaps. They are not product-quality scores.

## Process is evidence, not proof

Engineering process can establish that the defined engineering contract was satisfied. It cannot guarantee that the contract was complete or correct, or that the product is coherent, useful, desirable, safe, maintainable, or otherwise good except where those properties were meaningfully specified and evaluated.

## Human judgment

Validation should be frequent. Human approval should be scarce and meaningful. Deterministic checks precede human judgment; human gates belong at material decision boundaries.

## Rigor must earn its cost

Required process should improve implementation decisions, improve justified confidence, or satisfy a genuine governance requirement. Otherwise Lengthwise should not require it.

## AI-first, implementer-neutral

Lengthwise is optimized for AI coding through bounded ambiguity, relevant context, deterministic feedback, explicit decision authority, and explicit evidence obligations. The same Build Contract remains usable by a human implementer.

## Traceability

Traceability should emerge from doing the work rather than be reconstructed afterward.

## Convergence

Implementation and governing engineering artifacts must agree before completion. If implementation reveals an accepted artifact is wrong, reconcile the artifact rather than forcing bad code.

## State model

Keep distinct:
- lifecycle state: durable, type-specific state;
- derived state: readiness, satisfaction, coverage, blocked state;
- runtime state: running, waiting, failed, pending approval.

Do not collapse these into a generic `status`.

## Rigor and significance

Significance is intrinsic to a change: `S | M | L | XL`.

Rigor is inherited policy: `light | standard | strict`.

Effective rigor is the nearest explicit override, otherwise the parent value, otherwise the project default. Future policy may incorporate release phase, subsystem, or other conditions without changing these semantics.
