import { validateEntity } from "../domain/validate.ts";
import { isKnownEntityType, type Entity, type EntityId } from "../domain/entities.ts";
import { isKnownRelationshipType, type Relationship } from "../domain/relationships.ts";
import type { SourceLocation } from "../domain/provenance.ts";
import { errorDiagnostic, type Diagnostic } from "../diagnostics.ts";
import type { ParsedEntityBlock } from "../artifacts/parse-result.ts";

export interface NormalizationResult {
  entities: Entity[];
  relationships: Relationship[];
  diagnostics: Diagnostic[];
}

/**
 * Normalize raw parsed entity blocks (from either the YAML or Markdown
 * parser) into canonical, typed graph entities and declared relationships
 * (REQ-005, REQ-008).
 *
 * Semantic identity is independent of representation: both parsers already
 * reduced their input to the same `{ raw, location }` shape, so this
 * function never branches on source format (TASK-005 LOCKED). Processing
 * order follows the input array, which callers construct deterministically
 * (sorted discovery paths, in-file declaration order), so normalization
 * itself introduces no nondeterminism (NFR-003).
 */
export function normalizeEntities(blocks: readonly ParsedEntityBlock[]): NormalizationResult {
  const entities: Entity[] = [];
  const relationships: Relationship[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const block of blocks) {
    const { relationships: rawRelationships, ...rawEntityFields } = block.raw;
    const id = typeof rawEntityFields.id === "string" ? rawEntityFields.id : undefined;
    const type = typeof rawEntityFields.type === "string" ? rawEntityFields.type : undefined;

    if (!type || !isKnownEntityType(type)) {
      diagnostics.push(
        errorDiagnostic(
          "entity/unsupported-type",
          `Entity ${id ?? "<unknown id>"} declares unsupported type ${JSON.stringify(type)}.`,
          { location: block.location, entityId: id },
        ),
      );
      continue;
    }

    const candidate = { ...rawEntityFields, source: block.location };
    const validation = validateEntity(type, candidate);
    if (!validation.success) {
      const detail = validation.errors
        .map((error) => `${error.path} expected ${error.expected}`)
        .join("; ");
      diagnostics.push(
        errorDiagnostic(
          "entity/invalid",
          `Entity ${id ?? "<unknown id>"} of type ${type} is invalid: ${detail}.`,
          { location: block.location, entityId: id },
        ),
      );
      continue;
    }

    entities.push(validation.data);

    if (rawRelationships === undefined) continue;
    if (!Array.isArray(rawRelationships)) {
      diagnostics.push(
        errorDiagnostic(
          "relationship/invalid",
          `Entity ${validation.data.id} declares "relationships" that is not a list.`,
          { location: block.location, entityId: validation.data.id },
        ),
      );
      continue;
    }
    for (const [index, rawRelationship] of rawRelationships.entries()) {
      const outcome = normalizeRelationship(
        validation.data.id,
        block.location,
        index,
        rawRelationship,
      );
      if (outcome.ok) relationships.push(outcome.relationship);
      else diagnostics.push(outcome.diagnostic);
    }
  }

  return { entities, relationships, diagnostics };
}

function normalizeRelationship(
  fromId: EntityId,
  location: SourceLocation,
  index: number,
  raw: unknown,
): { ok: true; relationship: Relationship } | { ok: false; diagnostic: Diagnostic } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      diagnostic: errorDiagnostic(
        "relationship/invalid",
        `Entity ${fromId} relationships[${index}] is not a mapping.`,
        { location, entityId: fromId },
      ),
    };
  }
  const fields = raw as Record<string, unknown>;
  const type = typeof fields.type === "string" ? fields.type : undefined;
  const to = typeof fields.to === "string" ? fields.to : undefined;

  if (!type || !isKnownRelationshipType(type)) {
    return {
      ok: false,
      diagnostic: errorDiagnostic(
        "relationship/unsupported-type",
        `Entity ${fromId} relationships[${index}] declares unsupported type ${JSON.stringify(type)}.`,
        { location, entityId: fromId },
      ),
    };
  }
  if (!to) {
    return {
      ok: false,
      diagnostic: errorDiagnostic(
        "relationship/missing-target",
        `Entity ${fromId} relationships[${index}] has no "to" target.`,
        { location, entityId: fromId },
      ),
    };
  }

  return {
    ok: true,
    relationship: {
      type,
      from: fromId,
      to: to as EntityId,
      // Explicit authored relationships normalize as declared (TASK-005 LOCKED).
      provenance: { kind: "declared", source: location },
    },
  };
}
