import { effectiveRigor } from "../checks/rigor.ts";
import type { ProjectConfig } from "../config/types.ts";
import type { Diagnostic } from "../diagnostics.ts";
import type { Entity } from "../domain/entities.ts";
import type { ProjectGraph } from "../graph/project-graph.ts";
import { taskDependencyBlockers } from "../graph/readiness.ts";
import { CANONICAL_SKILL_ENTRYPOINT, LENGTHWISE_SKILL_MANIFEST } from "../skills/constants.ts";
import type { SkillContextSlot, ValidatedCanonicalSkill } from "../skills/types.ts";
import { buildContractContext, contractStaleness, evidenceSatisfaction } from "../workflow/projections.ts";
import { summarizeEntity } from "../application/project-query-service.ts";
import type { ApplicationBlocker, TaskReadinessView } from "../application/project-types.ts";
import type {
  AiBoundedContext,
  AiContextPurpose,
  AiContextResult,
  AiContextRole,
  AiInvocationRequest,
  AiInvocationResult,
  AiSupplementalContextSlot,
  AiSkillProjection,
  JsonValue,
} from "./types.ts";

const SUPPLEMENTAL_CONTEXT_SLOTS: readonly AiSupplementalContextSlot[] = [
  "current-workflow-action",
  "prior-attempt",
  "verification-retry",
  "implementation-completion-claim",
];

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => compareStrings(a, b))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

function digest(value: unknown): string {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function diagnosticKey(diagnostic: Diagnostic): string {
  return JSON.stringify([
    diagnostic.code,
    diagnostic.entityId ?? "",
    diagnostic.location?.artifactPath ?? "",
    diagnostic.location?.line ?? 0,
    diagnostic.message,
  ]);
}

function jsonValue(value: unknown, seen = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => jsonValue(item, seen))
    : Object.getPrototypeOf(value) === Object.prototype
      && Object.values(value as Record<string, unknown>).every((item) => jsonValue(item, seen));
  seen.delete(value);
  return valid;
}

function projectResource(file: ValidatedCanonicalSkill["files"][number]): AiSkillProjection["resources"][number] {
  try {
    return { path: file.path, encoding: "utf-8", content: new TextDecoder("utf-8", { fatal: true }).decode(file.content) };
  } catch {
    return { path: file.path, encoding: "base64", content: Buffer.from(file.content).toString("base64") };
  }
}

export function projectCanonicalSkill(skill: ValidatedCanonicalSkill): AiSkillProjection {
  return {
    id: skill.id,
    name: skill.frontmatter.name,
    description: skill.frontmatter.description,
    skillVersion: skill.manifest.skillVersion,
    workflowContractVersion: skill.manifest.workflowContractVersion,
    canonicalDigest: skill.canonicalDigest,
    bindings: [...skill.manifest.bindings],
    methodology: skill.methodology,
    resources: skill.files
      .filter((file) => file.path !== CANONICAL_SKILL_ENTRYPOINT && file.path !== LENGTHWISE_SKILL_MANIFEST)
      .map(projectResource)
      .sort((a, b) => compareStrings(a.path, b.path)),
    requiredContext: [...skill.manifest.context.required],
    optionalContext: [...skill.manifest.context.optional],
    outcomes: [...skill.manifest.outcomes],
    postChecks: [...skill.manifest.postChecks],
    escalations: [...skill.manifest.escalations],
  };
}

/**
 * Projects bounded engineering context and provider-neutral AI handoff data.
 * Workflow eligibility remains owned by WorkflowCoordinator; preparing an
 * invocation never authorizes an action or executes a provider.
 */
export class AiApplicationService {
  constructor(
    private readonly graph: ProjectGraph,
    private readonly config: ProjectConfig,
    private readonly diagnostics: Diagnostic[],
  ) {}

  buildContext(input: { targetId: string; purpose: AiContextPurpose }): AiContextResult {
    const target = this.graph.getEntity(input.targetId);
    if (!target) {
      return { ok: false, blockers: [{ code: "entity-not-found", message: `Unknown entity ${input.targetId}`, entityId: input.targetId }] };
    }
    if (["implement", "explain-readiness"].includes(input.purpose) && target.type !== "task") {
      return {
        ok: false,
        blockers: [{
          code: "ai-purpose-target-mismatch",
          message: `${input.purpose} context requires a task target`,
          entityId: target.id,
          artifactPath: target.source.artifactPath,
        }],
      };
    }

    const roles = new Map<string, Set<AiContextRole>>();
    const add = (id: string, role: AiContextRole) => {
      if (!this.graph.getEntity(id)) return;
      const current = roles.get(id) ?? new Set<AiContextRole>();
      current.add(role);
      roles.set(id, current);
    };
    const addMany = (ids: Iterable<string>, role: AiContextRole) => {
      for (const id of ids) add(id, role);
    };
    add(target.id, "target");
    add(target.id, target.type === "task" ? "task" : target.type === "feature" ? "feature" : "supporting-context");

    if (target.type === "task") this.addTaskContext(target.id, input.purpose, add, addMany);
    else if (target.type === "feature") this.addFeatureContext(target.id, input.purpose, add, addMany);
    else if (target.type === "verification") this.addVerificationContext(target.id, add, addMany);
    else {
      for (const relationship of [...this.graph.outgoingRelationships(target.id), ...this.graph.incomingRelationships(target.id)]) {
        add(relationship.from === target.id ? relationship.to : relationship.from, "supporting-context");
      }
    }

    const selectedIds = new Set(roles.keys());
    const entities = [...selectedIds]
      .sort()
      .map((id) => ({ entity: structuredClone(this.graph.getEntity(id)!), roles: [...roles.get(id)!].sort() }));
    const relationships = this.graph.relationships
      .filter((relationship) => selectedIds.has(relationship.from) && selectedIds.has(relationship.to))
      .map((relationship) => ({
        type: relationship.type,
        from: relationship.from,
        to: relationship.to,
        provenance: relationship.provenance.kind,
      }))
      .sort((a, b) => compareStrings(JSON.stringify(a), JSON.stringify(b)));
    const artifactPaths = uniqueSorted(entities.map(({ entity }) => entity.source.artifactPath));
    const relevantDiagnostics = this.diagnostics
      .filter((diagnostic) => diagnostic.entityId
        ? selectedIds.has(diagnostic.entityId)
        : Boolean(diagnostic.location?.artifactPath && artifactPaths.includes(diagnostic.location.artifactPath)))
      .sort((a, b) => compareStrings(diagnosticKey(a), diagnosticKey(b)))
      .map((diagnostic) => structuredClone(diagnostic));
    const readiness = target.type === "task" ? this.taskReadiness(target) : undefined;
    const contracts = entities
      .filter(({ entity }) => entity.type === "build-contract")
      .map(({ entity }) => {
        const staleness = contractStaleness(this.graph, entity.id);
        const taskId = this.graph.outgoingRelationships(entity.id).find((relationship) => relationship.type === "contracts")?.to;
        return {
          id: entity.id,
          ...(taskId ? { taskId } : {}),
          current: !staleness.stale,
          currentFingerprint: staleness.currentFingerprint,
          changedInputs: staleness.changedInputs,
        };
      })
      .sort((a, b) => compareStrings(a.id, b.id));
    const verifications = entities
      .filter(({ entity }) => entity.type === "verification")
      .map(({ entity }) => {
        const assessment = evidenceSatisfaction(this.graph, entity.id);
        return {
          id: entity.id,
          satisfied: assessment.satisfied,
          status: assessment.status,
          currentFingerprint: assessment.currentFingerprint,
          evidenceIds: assessment.evidence.map((item) => item.id).sort(),
          missingComplements: assessment.missingComplements,
        };
      })
      .sort((a, b) => compareStrings(a.id, b.id));
    const withoutFingerprint = {
      schemaVersion: 1 as const,
      targetId: target.id,
      purpose: input.purpose,
      project: {
        name: this.config.project.name,
        defaultRigor: this.config.policy.rigor,
        effectiveRigor: effectiveRigor(this.config, this.graph, target.id),
      },
      entities,
      relationships,
      artifactPaths,
      diagnostics: relevantDiagnostics,
      ...(readiness ? { readiness } : {}),
      contracts,
      verifications,
      selection: "purpose-bounded-deny-by-default" as const,
      excludedEntityCount: this.graph.entities.length - entities.length,
    };
    const context: AiBoundedContext = structuredClone({ ...withoutFingerprint, fingerprint: `sha256:${digest(withoutFingerprint)}` });
    return { ok: true, context };
  }

  prepareInvocation(input: AiInvocationRequest): AiInvocationResult {
    if (!input.skill.manifest.bindings.includes(input.semanticAction)) {
      return {
        ok: false,
        blockers: [{
          code: "ai-skill-binding-mismatch",
          message: `Skill ${input.skill.id} does not implement ${input.semanticAction}`,
          entityId: input.targetId,
        }],
      };
    }
    const supplemental = input.supplementalContext as Record<string, unknown> | undefined;
    for (const [slot, value] of Object.entries(supplemental ?? {})) {
      if (!(SUPPLEMENTAL_CONTEXT_SLOTS as readonly string[]).includes(slot)) {
        return { ok: false, blockers: [{ code: "ai-context-slot-not-supplemental", message: `${slot} is owned by Lengthwise project context`, entityId: input.targetId }] };
      }
      if (!jsonValue(value)) {
        return { ok: false, blockers: [{ code: "ai-context-slot-invalid", message: `${slot} must be a finite, acyclic JSON value`, entityId: input.targetId }] };
      }
    }
    const built = this.buildContext(input);
    if (!built.ok) return built;
    const inferred = this.inferContextSlots(built.context);
    const available = { ...inferred, ...structuredClone(input.supplementalContext ?? {}) };
    const requested = uniqueSorted([
      ...input.skill.manifest.context.required,
      ...input.skill.manifest.context.optional,
    ]) as SkillContextSlot[];
    const contextSlots = Object.fromEntries(requested
      .filter((slot) => available[slot] !== undefined)
      .map((slot) => [slot, available[slot]])) as Partial<Record<SkillContextSlot, unknown>>;
    const missing = input.skill.manifest.context.required.filter((slot) => contextSlots[slot] === undefined);
    if (missing.length) {
      return {
        ok: false,
        blockers: missing.map((slot) => ({
          code: "ai-context-slot-missing",
          message: `Skill ${input.skill.id} requires unavailable context slot ${slot}`,
          entityId: input.targetId,
        })),
      };
    }
    const skill = projectCanonicalSkill(input.skill);
    const identity = {
      targetId: input.targetId,
      purpose: input.purpose,
      semanticAction: input.semanticAction,
      skillDigest: skill.canonicalDigest,
      contextFingerprint: built.context.fingerprint,
      contextSlots,
    };
    return {
      ok: true,
      invocation: {
        kind: "lengthwise-ai-invocation",
        schemaVersion: 1,
        id: `ai:${digest(identity)}`,
        action: {
          targetId: input.targetId,
          purpose: input.purpose,
          semanticAction: input.semanticAction,
        },
        skill,
        context: built.context,
        contextSlots,
        expectedOutcomes: [...skill.outcomes],
        postChecks: [...skill.postChecks],
        escalationReasons: [...skill.escalations],
      },
    };
  }

  private addTaskContext(
    taskId: string,
    purpose: AiContextPurpose,
    add: (id: string, role: AiContextRole) => void,
    addMany: (ids: Iterable<string>, role: AiContextRole) => void,
  ): void {
    const context = buildContractContext(this.graph, taskId);
    addMany(context.dependencies, "dependency");
    if (purpose === "explain-readiness") return;
    addMany(context.requirements, "requirement");
    addMany(context.criteria, "acceptance-criterion");
    addMany(context.decisions, "decision");
    addMany(context.verifications, "verification");
    const contracts = this.graph.incomingRelationships(taskId)
      .filter((relationship) => relationship.type === "contracts")
      .map((relationship) => this.graph.getEntity(relationship.from))
      .filter((entity): entity is Extract<Entity, { type: "build-contract" }> => entity?.type === "build-contract" && entity.lifecycle === "accepted")
      .sort((a, b) => compareStrings(a.id, b.id));
    addMany(contracts.map((contract) => contract.id), "build-contract");
    for (const contract of contracts) {
      addMany(this.graph.outgoingRelationships(contract.id)
        .filter((relationship) => relationship.type === "includes")
        .map((relationship) => relationship.to), "supporting-context");
    }
    addMany(this.graph.entitiesOfType("feature")
      .filter((feature) => this.graph.outgoingRelationships(feature.id)
        .some((relationship) => relationship.type === "addresses" && context.requirements.includes(relationship.to)))
      .map((feature) => feature.id), "feature");
    addMany(this.graph.entitiesOfType("plan")
      .filter((plan) => this.graph.outgoingRelationships(plan.id)
        .some((relationship) => relationship.type === "contains" && relationship.to === taskId))
      .map((plan) => plan.id), "plan");
    if (purpose === "verify" || purpose === "reconcile") {
      for (const verificationId of context.verifications) {
        addMany(this.graph.incomingRelationships(verificationId)
          .filter((relationship) => relationship.type === "supports")
          .map((relationship) => relationship.from), "evidence");
      }
    }
    for (const feature of [...this.graph.entitiesOfType("feature")].filter((item) => rolesContainFeature(item.id, taskId, this.graph))) {
      add(feature.id, "feature");
      addMany(this.graph.outgoingRelationships(feature.id)
        .filter((relationship) => relationship.type === "has-question")
        .map((relationship) => relationship.to), "question");
    }
  }

  private addFeatureContext(
    featureId: string,
    purpose: AiContextPurpose,
    add: (id: string, role: AiContextRole) => void,
    addMany: (ids: Iterable<string>, role: AiContextRole) => void,
  ): void {
    const requirements = this.graph.outgoingRelationships(featureId)
      .filter((relationship) => relationship.type === "addresses")
      .map((relationship) => relationship.to);
    const criteria = requirements.flatMap((id) => this.graph.outgoingRelationships(id)
      .filter((relationship) => relationship.type === "has-acceptance-criterion")
      .map((relationship) => relationship.to));
    addMany(requirements, "requirement");
    addMany(criteria, "acceptance-criterion");
    addMany(this.graph.outgoingRelationships(featureId)
      .filter((relationship) => relationship.type === "has-question")
      .map((relationship) => relationship.to), "question");
    const governed = new Set([featureId, ...requirements, ...criteria]);
    addMany(this.graph.entitiesOfType("decision")
      .filter((decision) => decision.lifecycle === "accepted" && this.graph.outgoingRelationships(decision.id)
        .some((relationship) => relationship.type === "governs" && governed.has(relationship.to)))
      .map((decision) => decision.id), "decision");
    if (["plan", "review-build-contract", "verify", "reconcile"].includes(purpose)) {
      const tasks = this.graph.entitiesOfType("task")
        .filter((task) => this.graph.outgoingRelationships(task.id)
          .some((relationship) => relationship.type === "implements" && requirements.includes(relationship.to)));
      addMany(tasks.map((task) => task.id), "task");
      const taskIds = new Set(tasks.map((task) => task.id));
      const dependencies = uniqueSorted(tasks.flatMap((task) => this.graph.outgoingRelationships(task.id)
        .filter((relationship) => relationship.type === "depends-on")
        .map((relationship) => relationship.to)));
      addMany(dependencies, "dependency");
      for (const task of tasks) {
        const contracts = this.graph.incomingRelationships(task.id)
          .filter((relationship) => relationship.type === "contracts")
          .map((relationship) => this.graph.getEntity(relationship.from))
          .filter((entity): entity is Extract<Entity, { type: "build-contract" }> => entity?.type === "build-contract" && entity.lifecycle === "accepted");
        addMany(contracts.map((contract) => contract.id), "build-contract");
        for (const contract of contracts) {
          addMany(this.graph.outgoingRelationships(contract.id)
            .filter((relationship) => relationship.type === "includes")
            .map((relationship) => relationship.to), "supporting-context");
        }
      }
      const implementationScope = new Set([...governed, ...taskIds, ...dependencies]);
      addMany(this.graph.entitiesOfType("decision")
        .filter((decision) => decision.lifecycle === "accepted" && this.graph.outgoingRelationships(decision.id)
          .some((relationship) => relationship.type === "governs" && implementationScope.has(relationship.to)))
        .map((decision) => decision.id), "decision");
      addMany(this.graph.entitiesOfType("plan")
        .filter((plan) => this.graph.outgoingRelationships(plan.id)
          .some((relationship) => relationship.type === "contains" && taskIds.has(relationship.to)))
        .map((plan) => plan.id), "plan");
      if (purpose === "verify" || purpose === "reconcile") {
        const verifications = this.graph.entitiesOfType("verification")
          .filter((verification) => this.graph.outgoingRelationships(verification.id)
            .some((relationship) => relationship.type === "verifies" && criteria.includes(relationship.to)));
        addMany(verifications.map((verification) => verification.id), "verification");
        for (const verification of verifications) {
          addMany(this.graph.incomingRelationships(verification.id)
            .filter((relationship) => relationship.type === "supports")
            .map((relationship) => relationship.from), "evidence");
        }
      }
    }
  }

  private addVerificationContext(
    verificationId: string,
    add: (id: string, role: AiContextRole) => void,
    addMany: (ids: Iterable<string>, role: AiContextRole) => void,
  ): void {
    add(verificationId, "verification");
    const criteria = this.graph.outgoingRelationships(verificationId)
      .filter((relationship) => relationship.type === "verifies")
      .map((relationship) => relationship.to);
    addMany(criteria, "acceptance-criterion");
    const requirements = criteria.flatMap((criterionId) => this.graph.incomingRelationships(criterionId)
      .filter((relationship) => relationship.type === "has-acceptance-criterion")
      .map((relationship) => relationship.from));
    addMany(requirements, "requirement");
    addMany(this.graph.entitiesOfType("feature")
      .filter((feature) => this.graph.outgoingRelationships(feature.id)
        .some((relationship) => relationship.type === "addresses" && requirements.includes(relationship.to)))
      .map((feature) => feature.id), "feature");
    addMany(this.graph.incomingRelationships(verificationId)
      .filter((relationship) => relationship.type === "supports")
      .map((relationship) => relationship.from), "evidence");
  }

  private taskReadiness(task: Extract<Entity, { type: "task" }>): TaskReadinessView {
    const candidate = task.lifecycle === "planned";
    const blockers: ApplicationBlocker[] = taskDependencyBlockers(this.graph, task).map((dependencyId) => ({
      code: "task-dependency-incomplete",
      message: `${task.id} depends on incomplete task ${dependencyId}`,
      entityId: dependencyId,
      artifactPath: this.graph.getEntity(dependencyId)?.source.artifactPath,
    }));
    if (!candidate) blockers.unshift({
      code: "task-not-planned",
      message: `${task.id} is ${task.lifecycle}; only planned tasks are readiness candidates`,
      entityId: task.id,
      artifactPath: task.source.artifactPath,
    });
    return { task: summarizeEntity(task), candidate, ready: candidate && blockers.length === 0, blockers };
  }

  private inferContextSlots(context: AiBoundedContext): Partial<Record<SkillContextSlot, unknown>> {
    const byRole = (role: AiContextRole) => context.entities.filter((item) => item.roles.includes(role)).map((item) => item.entity);
    const slots: Partial<Record<SkillContextSlot, unknown>> = {
      "bounded-project-context": {
        fingerprint: context.fingerprint,
        project: context.project,
        entityIds: context.entities.map((item) => item.entity.id),
        relationships: context.relationships,
        readiness: context.readiness,
        contracts: context.contracts,
        verifications: context.verifications,
      },
      "authoritative-artifacts": context.artifactPaths,
    };
    const assign = (slot: SkillContextSlot, role: AiContextRole) => {
      const entities = byRole(role);
      slots[slot] = entities;
    };
    assign("feature", "feature");
    assign("task", "task");
    assign("accepted-build-contract", "build-contract");
    assign("decision-authority", "decision");
    assign("questions", "question");
    assign("plan", "plan");
    assign("verification-definitions", "verification");
    assign("evidence", "evidence");
    if (context.diagnostics.length) slots["graph-findings"] = context.diagnostics;
    return slots;
  }
}

function rolesContainFeature(featureId: string, taskId: string, graph: ProjectGraph): boolean {
  const taskRequirements = new Set(graph.outgoingRelationships(taskId)
    .filter((relationship) => relationship.type === "implements")
    .map((relationship) => relationship.to));
  return graph.outgoingRelationships(featureId)
    .some((relationship) => relationship.type === "addresses" && taskRequirements.has(relationship.to));
}
