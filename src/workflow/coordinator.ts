import { mkdir, realpath, unlink } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { buildProjectGraph } from "../graph/build.ts";
import {
  evaluateProject,
  type ProjectEvaluation,
} from "../application/project-evaluation.ts";
import { taskDependencyBlockers } from "../graph/readiness.ts";
import { effectiveRigor } from "../checks/rigor.ts";
import type { Diagnostic } from "../diagnostics.ts";
import {
  WorkflowStateStore,
  type WorkflowActivity,
  type WorkflowEvent,
  type WorkflowRun,
} from "./state-store.ts";
import {
  buildContractContext,
  contractStaleness,
  evidenceSatisfaction,
} from "./projections.ts";
import type { ProjectGraph } from "../graph/project-graph.ts";
import { AiApplicationService } from "../ai/application-service.ts";
import type {
  AiContextPurpose,
  AiInvocationResult,
  AiSupplementalContextSlot,
  JsonValue,
} from "../ai/types.ts";
import {
  BUNDLED_SKILLS_DIRECTORY,
  type StandardSkillId,
} from "../skills/constants.ts";
import { loadCanonicalSkillRegistry } from "../skills/load.ts";
import type { SemanticActionBinding } from "../skills/types.ts";

export type WorkflowGate = "specification" | "build-contract" | "verification";
export interface WorkflowBlocker {
  code: string;
  message: string;
  entityId?: string;
  artifactPath?: string;
}
export interface WorkflowAiAction {
  skillId: StandardSkillId;
  semanticAction: SemanticActionBinding;
  contextPurpose: AiContextPurpose;
  targetId: string;
}
export interface WorkflowAction {
  id: string;
  kind: string;
  label: string;
  eligible: boolean;
  requiredInputs: string[];
  expectedOutputs: string[];
  target: { entityId?: string; entityType?: string; artifactPath?: string };
  subject?: { entityId: string; entityType?: string };
  gate?: WorkflowGate;
  blockers: WorkflowBlocker[];
  ai?: WorkflowAiAction;
}
export interface GateAssessment {
  gate: WorkflowGate;
  required: boolean;
  eligible: boolean;
  approved: boolean;
  fingerprint: string;
  blockers: WorkflowBlocker[];
}
export type CompletionClaimState =
  | "addressed"
  | "needs-verification"
  | "not-addressed";
export interface ImplementationCheckResult {
  name: string;
  outcome: "passed" | "failed" | "inconclusive" | "not-run";
  result: string;
  command?: string;
}
export interface ExternalVerificationRequirement {
  description: string;
  verificationId?: string;
}
export interface ImplementationCompletionClaimInput {
  taskId?: string;
  acceptedBuildContract?: { id: string; fingerprint: string };
  implementationAttemptId?: string;
  summary?: string;
  claims?: {
    requirements?: Array<{ id: string; state: CompletionClaimState }>;
    acceptanceCriteria?: Array<{ id: string; state: CompletionClaimState }>;
    lockedDecisions?: Array<{
      id: string;
      state: "respected" | "conflict" | "needs-verification";
    }>;
  };
  knownGaps?: string[];
  changedFiles?: string[];
  checks?: ImplementationCheckResult[];
  externalVerifications?: ExternalVerificationRequirement[];
}
export interface ImplementationCompletionClaim {
  taskId: string;
  acceptedBuildContract: { id: string; fingerprint: string };
  implementationAttemptId: string;
  summary?: string;
  claims: {
    requirements: Array<{ id: string; state: CompletionClaimState }>;
    acceptanceCriteria: Array<{ id: string; state: CompletionClaimState }>;
    lockedDecisions: Array<{
      id: string;
      state: "respected" | "conflict" | "needs-verification";
    }>;
  };
  knownGaps: string[];
  changedFiles: string[];
  checks: ImplementationCheckResult[];
  externalVerifications: ExternalVerificationRequirement[];
}
function recordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringList(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}
function onlyFields(value: Record<string, unknown>, fields: readonly string[]) {
  return Object.keys(value).every((field) => fields.includes(field));
}
function claimEntries(value: unknown, states: readonly string[]): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every(
        (item) =>
          recordValue(item) &&
          onlyFields(item, ["id", "state"]) &&
          typeof item.id === "string" &&
          states.includes(String(item.state)),
      ))
  );
}
export function isImplementationCompletionClaim(
  value: unknown,
): value is ImplementationCompletionClaimInput {
  if (
    !recordValue(value) ||
    !onlyFields(value, [
      "taskId",
      "acceptedBuildContract",
      "implementationAttemptId",
      "summary",
      "claims",
      "knownGaps",
      "changedFiles",
      "checks",
      "externalVerifications",
    ]) ||
    !(value.taskId === undefined || typeof value.taskId === "string") ||
    !(
      value.acceptedBuildContract === undefined ||
      (recordValue(value.acceptedBuildContract) &&
        onlyFields(value.acceptedBuildContract, ["id", "fingerprint"]) &&
        typeof value.acceptedBuildContract.id === "string" &&
        typeof value.acceptedBuildContract.fingerprint === "string")
    ) ||
    !(
      value.implementationAttemptId === undefined ||
      typeof value.implementationAttemptId === "string"
    ) ||
    !(value.summary === undefined || typeof value.summary === "string") ||
    !stringList(value.knownGaps) ||
    !stringList(value.changedFiles) ||
    !(
      value.checks === undefined ||
      (Array.isArray(value.checks) &&
        value.checks.every(
          (check) =>
            recordValue(check) &&
            onlyFields(check, ["name", "outcome", "result", "command"]) &&
            typeof check.name === "string" &&
            ["passed", "failed", "inconclusive", "not-run"].includes(
              String(check.outcome),
            ) &&
            typeof check.result === "string" &&
            (check.command === undefined || typeof check.command === "string"),
        ))
    ) ||
    !(
      value.externalVerifications === undefined ||
      (Array.isArray(value.externalVerifications) &&
        value.externalVerifications.every(
          (requirement) =>
            recordValue(requirement) &&
            onlyFields(requirement, ["description", "verificationId"]) &&
            typeof requirement.description === "string" &&
            (requirement.verificationId === undefined ||
              typeof requirement.verificationId === "string"),
        ))
    )
  )
    return false;
  if (value.claims === undefined) return true;
  if (
    !recordValue(value.claims) ||
    !onlyFields(value.claims, [
      "requirements",
      "acceptanceCriteria",
      "lockedDecisions",
    ])
  )
    return false;
  return (
    claimEntries(value.claims.requirements, [
      "addressed",
      "needs-verification",
      "not-addressed",
    ]) &&
    claimEntries(value.claims.acceptanceCriteria, [
      "addressed",
      "needs-verification",
      "not-addressed",
    ]) &&
    claimEntries(value.claims.lockedDecisions, [
      "respected",
      "conflict",
      "needs-verification",
    ])
  );
}
interface CompletionClaimIdentity {
  taskId: string;
  contractId: string;
  contractFingerprint: string;
  implementationAttemptId: string;
}
function normalizeCompletionClaim(
  claim: ImplementationCompletionClaimInput | string,
  identity: CompletionClaimIdentity,
  enforceSubmittedIdentity = true,
): ImplementationCompletionClaim {
  const input: ImplementationCompletionClaimInput =
    typeof claim === "string" ? { summary: claim } : claim;
  if (!isImplementationCompletionClaim(input))
    throw new Error("Implementation return claim has an invalid structure");
  if (
    enforceSubmittedIdentity &&
    input.taskId &&
    input.taskId !== identity.taskId
  )
    throw new Error(
      `Implementation claim task ${input.taskId} does not match ${identity.taskId}`,
    );
  if (
    enforceSubmittedIdentity &&
    input.acceptedBuildContract &&
    (input.acceptedBuildContract.id !== identity.contractId ||
      input.acceptedBuildContract.fingerprint !== identity.contractFingerprint)
  )
    throw new Error(
      "Implementation claim references a stale or different Build Contract",
    );
  if (
    enforceSubmittedIdentity &&
    input.implementationAttemptId &&
    input.implementationAttemptId !== identity.implementationAttemptId
  )
    throw new Error(
      "Implementation claim references a different implementation attempt",
    );
  return structuredClone({
    taskId: identity.taskId,
    acceptedBuildContract: {
      id: identity.contractId,
      fingerprint: identity.contractFingerprint,
    },
    implementationAttemptId: identity.implementationAttemptId,
    ...(input.summary === undefined ? {} : { summary: input.summary }),
    claims: {
      requirements: input.claims?.requirements ?? [],
      acceptanceCriteria: input.claims?.acceptanceCriteria ?? [],
      lockedDecisions: input.claims?.lockedDecisions ?? [],
    },
    knownGaps: input.knownGaps ?? [],
    changedFiles: input.changedFiles ?? [],
    checks: input.checks ?? [],
    externalVerifications: input.externalVerifications ?? [],
  });
}
export interface ImplementationRetryContext {
  taskId: string;
  implementationAttemptId: string;
  failedVerifications: string[];
  affectedAcceptanceCriteria: string[];
  affectedRequirements: string[];
  blockingFindings: string[];
  knownGaps: string[];
  contractId?: string;
  contractFingerprint?: string;
  contractCurrent: boolean;
  nextEligibleAction: "implementation-handoff";
}
export interface ImplementationAttemptAssessment {
  id: string;
  taskId: string;
  attempt: number;
  contractId?: string;
  contractFingerprint?: string;
  returned: boolean;
  claim?: ImplementationCompletionClaim;
  retryContext?: ImplementationRetryContext;
}
export interface WorkflowAssessment {
  featureId: string;
  graphAvailable: boolean;
  buildValid: boolean;
  repositoryValid: boolean;
  diagnostics: Diagnostic[];
  featureDiagnostics: Diagnostic[];
  blockingQuestions: string[];
  tasks: Array<{
    id: string;
    lifecycle: string;
    artifactPath: string;
    contract?: string;
    contractArtifactPath?: string;
    contractStale?: boolean;
    changedInputs: Array<{ id: string; reason: string }>;
    blockedBy: string[];
    handoffEligible: boolean;
    contractFingerprint?: string;
  }>;
  verifications: Array<{
    id: string;
    artifactPath: string;
    satisfied: boolean;
    status: string;
    evidenceIds: string[];
    failingEvidenceIds: string[];
    missingComplements: string[];
  }>;
  gates: Record<WorkflowGate, GateAssessment>;
  actions: WorkflowAction[];
  governingChanges: Array<{
    contractId: string;
    inputs: Array<{ id: string; reason: string }>;
  }>;
  implementation: {
    attempts: ImplementationAttemptAssessment[];
    pendingReturns: Array<{
      taskId: string;
      implementationAttemptId: string;
      claim: ImplementationCompletionClaim;
      verificationIds?: string[];
    }>;
    retryContexts: ImplementationRetryContext[];
  };
  reconciliation: {
    required: boolean;
    reasons: WorkflowBlocker[];
    baselineFingerprint?: string;
  };
  currentGate?: WorkflowGate;
  pendingGate?: WorkflowGate;
  primaryActionId?: string;
  specificationEligible: boolean;
  buildContractEligible: boolean;
  completionEligible: boolean;
  fingerprint: string;
}
export interface FeatureWorkflowView {
  assessment: WorkflowAssessment;
  run?: WorkflowRun;
  runHistorical: boolean;
  history: WorkflowRun[];
  events: WorkflowEvent[];
  attempts: import("./state-store.ts").WorkflowAttempt[];
}
export interface WorkflowCoordinatorOptions {
  /** Deployment location of the single canonical bundled skill registry. */
  canonicalSkillRoot?: string;
}
export type WorkflowReconciliationRoute =
  | Exclude<WorkflowActivity, "capture" | "complete">
  | "complete";
export type WorkflowCommand =
  | { kind: "handoff"; runId: string; taskId: string; idempotencyKey: string }
  | {
      kind: "return-implementation";
      runId: string;
      taskId: string;
      claim: ImplementationCompletionClaimInput | string;
      idempotencyKey: string;
    }
  | {
      kind: "evaluate-implementation-return";
      runId: string;
      taskId: string;
      outcome: "retry-implementation" | "reconcile" | "satisfactory";
      failedVerifications?: string[];
      blockingFindings?: string[];
      knownGaps?: string[];
      reason?: string;
      idempotencyKey: string;
    }
  | { kind: "interrupt"; runId: string; reason: string }
  | { kind: "resume"; runId: string }
  | { kind: "retry"; runId: string; attemptId: string }
  | { kind: "cancel"; runId: string; reason: string }
  | {
      kind: "reconcile";
      runId: string;
      route: WorkflowReconciliationRoute;
      reason: string;
      targetId?: string;
    }
  | { kind: "complete"; runId: string };

function blocker(
  code: string,
  message: string,
  entityId?: string,
  artifactPath?: string,
): WorkflowBlocker {
  return {
    code,
    message,
    ...(entityId ? { entityId } : {}),
    ...(artifactPath ? { artifactPath } : {}),
  };
}
function fingerprint(value: unknown): string {
  return Bun.hash(JSON.stringify(value)).toString(16);
}
function gateSemanticFingerprint(
  entity: import("../domain/entities.ts").Entity | undefined,
) {
  if (!entity) return "missing";
  const { source: _source, lifecycle: _lifecycle, ...semantic } = entity;
  return fingerprint(semantic);
}
function isWithin(root: string, target: string) {
  const child = relative(root, target);
  return (
    child !== "" &&
    child !== ".." &&
    !child.startsWith(`..${sep}`) &&
    !isAbsolute(child)
  );
}
function eventPayload<T>(event: WorkflowEvent): T {
  return event.payload as T;
}
function jsonProjection(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
function gateForActivity(
  activity: WorkflowActivity | undefined,
): WorkflowGate | undefined {
  if (activity === "capture" || activity === "specify") return "specification";
  if (activity === "plan" || activity === "implement") return "build-contract";
  if (activity === "verify") return "verification";
  return undefined;
}
function implementationProjection(
  events: WorkflowEvent[],
): WorkflowAssessment["implementation"] {
  const routeKinds = new Set([
    "verification-returned-to-implementation",
    "verification-reconciliation-required",
    "implementation-verification-satisfactory",
  ]);
  const attempts: ImplementationAttemptAssessment[] = [];
  const pending = new Map<
    string,
    {
      taskId: string;
      implementationAttemptId: string;
      claim: ImplementationCompletionClaim;
    }
  >();
  const retries: ImplementationRetryContext[] = [];
  for (const event of events) {
    if (event.kind === "implementation-handed-off") {
      const value = eventPayload<{
        taskId: string;
        contractId?: string;
        contractFingerprint?: string;
        implementationAttemptId?: string;
        attemptNumber?: number;
        retryContext?: ImplementationRetryContext;
      }>(event);
      const id = value.implementationAttemptId ?? event.id;
      attempts.push({
        id,
        taskId: value.taskId,
        attempt:
          value.attemptNumber ??
          attempts.filter((item) => item.taskId === value.taskId).length + 1,
        contractId: value.contractId,
        contractFingerprint: value.contractFingerprint,
        returned: false,
        retryContext: value.retryContext,
      });
      continue;
    }
    if (event.kind === "implementation-returned") {
      const value = eventPayload<{
        taskId: string;
        implementationAttemptId?: string;
        claim: ImplementationCompletionClaimInput | string;
      }>(event);
      const target = value.implementationAttemptId
        ? attempts.find((item) => item.id === value.implementationAttemptId)
        : [...attempts]
            .reverse()
            .find((item) => item.taskId === value.taskId && !item.returned);
      const implementationAttemptId =
        value.implementationAttemptId ?? target?.id ?? event.id;
      const submittedClaim = isImplementationCompletionClaim(value.claim)
        ? value.claim
        : typeof value.claim === "string"
          ? value.claim
          : { summary: "Legacy implementation return" };
      const submittedContract =
        typeof submittedClaim === "string"
          ? undefined
          : submittedClaim.acceptedBuildContract;
      const claim = normalizeCompletionClaim(
        submittedClaim,
        {
          taskId: value.taskId,
          contractId:
            target?.contractId ?? submittedContract?.id ?? "legacy-unrecorded",
          contractFingerprint:
            target?.contractFingerprint ??
            submittedContract?.fingerprint ??
            "legacy-unrecorded",
          implementationAttemptId,
        },
        false,
      );
      if (target) {
        target.returned = true;
        target.claim = claim;
      }
      pending.set(implementationAttemptId, {
        taskId: value.taskId,
        implementationAttemptId,
        claim,
      });
      continue;
    }
    if (routeKinds.has(event.kind)) {
      const value = eventPayload<{ implementationAttemptId?: string }>(event);
      if (value.implementationAttemptId)
        pending.delete(value.implementationAttemptId);
      if (event.kind === "verification-returned-to-implementation")
        retries.push(eventPayload<ImplementationRetryContext>(event));
      continue;
    }
  }
  const consumed = new Set(
    attempts.flatMap((item) =>
      item.retryContext ? [item.retryContext.implementationAttemptId] : [],
    ),
  );
  return {
    attempts,
    pendingReturns: [...pending.values()],
    retryContexts: retries.filter(
      (context) => !consumed.has(context.implementationAttemptId),
    ),
  };
}
function affectedObligations(
  graph: ProjectGraph,
  taskId: string,
  verificationIds: string[],
) {
  const taskRequirements = new Set(
    graph
      .outgoingRelationships(taskId)
      .filter((r) => r.type === "implements")
      .map((r) => r.to),
  );
  const acceptanceCriteria = [
    ...new Set(
      verificationIds.flatMap((id) =>
        graph
          .outgoingRelationships(id)
          .filter((r) => r.type === "verifies")
          .map((r) => r.to),
      ),
    ),
  ]
    .filter((id) =>
      graph
        .incomingRelationships(id)
        .some(
          (r) =>
            r.type === "has-acceptance-criterion" &&
            taskRequirements.has(r.from),
        ),
    )
    .sort();
  const requirements = [
    ...new Set(
      acceptanceCriteria.flatMap((id) =>
        graph
          .incomingRelationships(id)
          .filter(
            (r) =>
              r.type === "has-acceptance-criterion" &&
              taskRequirements.has(r.from),
          )
          .map((r) => r.from),
      ),
    ),
  ].sort();
  return { acceptanceCriteria, requirements };
}

export function requiredVerificationsForFeature(
  graph: ProjectGraph,
  featureId: string,
): string[] {
  const requirements = graph
    .outgoingRelationships(featureId)
    .filter((r) => r.type === "addresses")
    .map((r) => r.to);
  const criteria = new Set(
    requirements.flatMap((id) =>
      graph
        .outgoingRelationships(id)
        .filter((r) => r.type === "has-acceptance-criterion")
        .map((r) => r.to),
    ),
  );
  return graph
    .entitiesOfType("verification")
    .filter(
      (v) =>
        v.required &&
        graph
          .outgoingRelationships(v.id)
          .some((r) => r.type === "verifies" && criteria.has(r.to)),
    )
    .map((v) => v.id)
    .sort();
}

export class WorkflowCoordinator {
  #state: WorkflowStateStore;
  #canonicalSkillRoot: string;
  #repoRoot: string;
  private constructor(
    repoRoot: string,
    state: WorkflowStateStore,
    canonicalSkillRoot: string,
  ) {
    this.#repoRoot = repoRoot;
    this.#state = state;
    this.#canonicalSkillRoot = canonicalSkillRoot;
    Object.preventExtensions(this);
  }
  static async open(
    repoRoot: string,
    options: WorkflowCoordinatorOptions = {},
  ) {
    const absoluteRoot = resolve(repoRoot);
    await mkdir(`${absoluteRoot}/.lengthwise`, { recursive: true });
    return new WorkflowCoordinator(
      absoluteRoot,
      new WorkflowStateStore(`${absoluteRoot}/.lengthwise/state.db`),
      resolve(
        options.canonicalSkillRoot ??
          resolve(import.meta.dir, "..", "..", BUNDLED_SKILLS_DIRECTORY),
      ),
    );
  }

  get repoRoot(): string {
    return this.#repoRoot;
  }

  getActiveRun(featureId: string): WorkflowRun | undefined {
    return this.#state.active(featureId);
  }
  getLatestRun(featureId: string): WorkflowRun | undefined {
    return this.#state.latest(featureId);
  }
  getRun(runId: string): WorkflowRun | undefined {
    return this.#state.get(runId);
  }
  listActiveRuns(): WorkflowRun[] {
    return this.#state.activeRuns();
  }
  async inspectFeature(featureId: string): Promise<FeatureWorkflowView> {
    const activeRun = this.#state.active(featureId);
    const run = activeRun ?? this.#state.latest(featureId);
    return {
      assessment: await this.assess(featureId),
      run,
      runHistorical: Boolean(run && !activeRun),
      history: this.#state.history(featureId),
      events: run ? this.#state.events(run.id) : [],
      attempts: run ? this.#state.attempts(run.id) : [],
    };
  }
  async perform(command: WorkflowCommand): Promise<unknown> {
    switch (command.kind) {
      case "handoff":
        return this.handoff(
          command.runId,
          command.taskId,
          command.idempotencyKey,
        );
      case "return-implementation":
        return this.returnImplementation(
          command.runId,
          command.taskId,
          command.claim,
          command.idempotencyKey,
        );
      case "evaluate-implementation-return":
        return this.evaluateImplementationReturn(command.runId, {
          taskId: command.taskId,
          outcome: command.outcome,
          failedVerifications: command.failedVerifications,
          blockingFindings: command.blockingFindings,
          knownGaps: command.knownGaps,
          reason: command.reason,
          idempotencyKey: command.idempotencyKey,
        });
      case "interrupt":
        return this.interrupt(command.runId, command.reason);
      case "resume":
        return this.resume(command.runId);
      case "retry":
        return this.retry(command.runId, command.attemptId);
      case "cancel":
        return this.cancel(command.runId, command.reason);
      case "reconcile":
        return this.reconcile(
          command.runId,
          command.route,
          command.reason,
          command.targetId,
        );
      case "complete":
        return this.complete(command.runId);
      default:
        throw new Error(
          `Unsupported workflow command ${JSON.stringify((command as { kind?: unknown }).kind)}`,
        );
    }
  }

  async prepareAiInvocation(
    runId: string,
    actionId: string,
  ): Promise<AiInvocationResult> {
    const run = this.requireRun(runId);
    const evaluated = await evaluateProject(this.repoRoot);
    if (
      !evaluated.graphAvailable ||
      evaluated.buildDiagnostics.some(
        (diagnostic) => diagnostic.severity === "error",
      )
    )
      return {
        ok: false,
        blockers: [
          blocker(
            "repository-invalid",
            "Repair repository artifacts before preparing an AI action",
            run.featureId,
          ),
        ],
      };
    const assessment = await this.assessEvaluated(run.featureId, evaluated);
    const action = assessment.actions.find(
      (candidate) => candidate.id === actionId,
    );
    if (!action)
      return {
        ok: false,
        blockers: [
          blocker(
            "workflow-action-not-found",
            `Workflow action ${actionId} is not current for ${run.featureId}`,
            run.featureId,
          ),
        ],
      };
    if (!action.eligible)
      return {
        ok: false,
        blockers: action.blockers.length
          ? action.blockers
          : [
              blocker(
                "workflow-action-ineligible",
                `${actionId} is not eligible`,
                action.target.entityId,
              ),
            ],
      };
    if (!action.ai)
      return {
        ok: false,
        blockers: [
          blocker(
            "workflow-action-not-ai",
            `${actionId} has no AI skill projection`,
            action.target.entityId,
          ),
        ],
      };
    const loaded = await loadCanonicalSkillRegistry(this.#canonicalSkillRoot);
    if (!loaded.ok)
      return {
        ok: false,
        blockers: loaded.diagnostics.map((diagnostic) =>
          blocker(
            diagnostic.code,
            diagnostic.message,
            action.ai!.targetId,
            diagnostic.packagePath,
          ),
        ),
      };
    return this.#state.immediateTransaction(() => {
      const currentRun = this.#state.get(runId);
      if (
        !currentRun ||
        currentRun.featureId !== run.featureId ||
        ["cancelled", "complete"].includes(currentRun.state)
      )
        return {
          ok: false as const,
          blockers: [
            blocker(
              "workflow-action-stale",
              `${actionId} is no longer current for workflow run ${runId}`,
              run.featureId,
            ),
          ],
        };
      const currentAssessment = this.assessEvaluated(
        currentRun.featureId,
        evaluated,
      );
      const currentAction = currentAssessment.actions.find(
        (candidate) => candidate.id === actionId,
      );
      if (!currentAction?.eligible || !currentAction.ai)
        return {
          ok: false as const,
          blockers: currentAction?.blockers.length
            ? currentAction.blockers
            : [
                blocker(
                  "workflow-action-stale",
                  `${actionId} is no longer an eligible AI action`,
                  currentAction?.target.entityId ?? currentRun.featureId,
                ),
              ],
        };
      const skill = loaded.registry.skills.get(currentAction.ai.skillId);
      if (
        !skill ||
        !skill.manifest.bindings.includes(currentAction.ai.semanticAction)
      )
        return {
          ok: false as const,
          blockers: [
            blocker(
              "workflow-skill-mismatch",
              `${currentAction.ai.skillId} does not own ${currentAction.ai.semanticAction}`,
              currentAction.ai.targetId,
            ),
          ],
        };
      const workflowEvents = this.#state.events(runId);
      const lastReconciliation = workflowEvents.findLastIndex(
        (event) => event.kind === "reconciliation-complete",
      );
      const reconciliationRoutes =
        currentAction.ai.semanticAction === "reconcile-feature"
          ? workflowEvents
              .slice(lastReconciliation + 1)
              .filter(
                (event) =>
                  event.kind === "verification-reconciliation-required",
              )
              .map((event) =>
                eventPayload<{
                  taskId?: string;
                  implementationAttemptId?: string;
                  reason: string;
                  failedVerifications?: string[];
                  blockingFindings?: string[];
                }>(event),
              )
          : [];
      const reconciliationAttemptIds = new Set(
        reconciliationRoutes
          .map((route) => route.implementationAttemptId)
          .filter((id): id is string => Boolean(id)),
      );
      const reconciliationAttempts =
        currentAssessment.implementation.attempts.filter((attempt) =>
          reconciliationAttemptIds.has(attempt.id),
        );
      const pendingReturn =
        currentAssessment.implementation.pendingReturns.find(
          (item) => item.taskId === currentAction.ai!.targetId,
        );
      const currentAttempt = [...currentAssessment.implementation.attempts]
        .reverse()
        .find(
          (attempt) =>
            (currentAction.ai!.semanticAction === "reconcile-feature"
              ? reconciliationAttemptIds.has(attempt.id)
              : attempt.taskId === currentAction.ai!.targetId) &&
            (currentAction.ai!.semanticAction === "implementation-attempt"
              ? !attempt.returned
              : currentAction.ai!.semanticAction === "reconcile-feature"
                ? true
                : attempt.id === pendingReturn?.implementationAttemptId),
        );
      if (
        currentAction.ai.semanticAction === "implementation-attempt" &&
        !currentAttempt
      )
        return {
          ok: false as const,
          blockers: [
            blocker(
              "workflow-attempt-missing",
              `${actionId} has no authoritative implementation attempt`,
              currentAction.ai.targetId,
            ),
          ],
        };
      const supplemental: Partial<
        Record<AiSupplementalContextSlot, JsonValue>
      > = {
        "current-workflow-action": jsonProjection({
          runId,
          featureId: currentRun.featureId,
          actionId,
          assessmentFingerprint: currentAssessment.fingerprint,
          semanticAction: currentAction.ai.semanticAction,
          targetId: currentAction.ai.targetId,
          blockers: currentAction.blockers,
          ...(reconciliationRoutes.length ? { reconciliationRoutes } : {}),
          ...(reconciliationAttempts.length
            ? {
                implementationAttemptIds: reconciliationAttempts.map(
                  (attempt) => attempt.id,
                ),
              }
            : currentAttempt
              ? { implementationAttemptId: currentAttempt.id }
              : {}),
        }),
      };
      const retry =
        currentAttempt?.retryContext ??
        currentAssessment.implementation.retryContexts.find(
          (context) => context.taskId === currentAction.ai!.targetId,
        );
      const prior = retry
        ? currentAssessment.implementation.attempts.find(
            (attempt) => attempt.id === retry.implementationAttemptId,
          )
        : (currentAttempt ??
          [...currentAssessment.implementation.attempts]
            .reverse()
            .find((attempt) => attempt.taskId === currentAction.ai!.targetId));
      if (currentAction.ai.semanticAction === "reconcile-feature") {
        if (reconciliationAttempts.length)
          supplemental["prior-attempt"] = jsonProjection(
            reconciliationAttempts,
          );
        const reconciliationRetries = reconciliationAttempts
          .map((attempt) => attempt.retryContext)
          .filter((context) => context !== undefined);
        if (reconciliationRetries.length)
          supplemental["verification-retry"] = jsonProjection(
            reconciliationRetries,
          );
        const reconciliationClaims = reconciliationAttempts
          .map((attempt) => attempt.claim)
          .filter((claim) => claim !== undefined);
        if (reconciliationClaims.length)
          supplemental["implementation-completion-claim"] =
            jsonProjection(reconciliationClaims);
      } else {
        if (prior) supplemental["prior-attempt"] = jsonProjection(prior);
        if (retry) supplemental["verification-retry"] = jsonProjection(retry);
        const completionClaim = pendingReturn?.claim ?? currentAttempt?.claim;
        if (completionClaim)
          supplemental["implementation-completion-claim"] =
            jsonProjection(completionClaim);
      }
      return new AiApplicationService(
        evaluated.graph,
        evaluated.config,
        evaluated.diagnostics,
      ).prepareInvocation({
        targetId: currentAction.ai.targetId,
        purpose: currentAction.ai.contextPurpose,
        semanticAction: currentAction.ai.semanticAction,
        skill,
        supplementalContext: supplemental,
      });
    });
  }

  async start(featureId: string): Promise<WorkflowRun> {
    const assessment = await this.assess(featureId);
    if (!assessment.buildValid)
      throw new Error("Repository cannot currently build");
    const built = await buildProjectGraph(this.repoRoot);
    const feature = built.ok ? built.graph.getEntity(featureId) : undefined;
    if (!feature || feature.type !== "feature")
      throw new Error(`Unknown feature ${featureId}`);
    if (feature.lifecycle === "complete")
      throw new Error(
        `Feature ${featureId} is complete; reopen it to active before starting another workflow run`,
      );
    const run = this.#state.start(featureId, "specify");
    this.#state.recordBaseline(run.id, assessment.fingerprint, assessment);
    return run;
  }
  async startFromIdea(input: {
    idea: string;
    title: string;
    destination: string;
    featureId?: string;
    significance?: "S" | "M" | "L" | "XL";
  }) {
    if (!input.idea.trim() || !input.title.trim())
      throw new Error("Idea and title are required");
    const built = await evaluateProject(this.repoRoot);
    if (
      !built.graphAvailable ||
      built.buildDiagnostics.some(
        (diagnostic) => diagnostic.severity === "error",
      )
    )
      throw new Error("Repository cannot currently build");
    const path = input.destination;
    if (
      isAbsolute(path) ||
      (!path.endsWith(".yaml") &&
        !path.endsWith(".yml") &&
        !path.endsWith(".md"))
    )
      throw new Error(
        "Feature destination must be a relative YAML or Markdown artifact path",
      );
    const root = await realpath(this.repoRoot);
    const lexicalTarget = resolve(root, path);
    if (!isWithin(root, lexicalTarget))
      throw new Error("Feature destination escapes the selected project");
    const included = built.config.artifacts.include.some((pattern) =>
      new Bun.Glob(pattern).match(path),
    );
    const excluded = built.config.artifacts.exclude?.some((pattern) =>
      new Bun.Glob(pattern).match(path),
    );
    if (!included || excluded)
      throw new Error(
        `Feature destination is outside configured artifact scope: ${path}`,
      );
    if (await Bun.file(lexicalTarget).exists())
      throw new Error(`Feature destination already exists: ${path}`);
    const featureId =
      input.featureId?.trim() ||
      `F-${fingerprint({ idea: input.idea, title: input.title }).slice(0, 8).toUpperCase()}`;
    if (built.graph.getEntity(featureId))
      throw new Error(`Entity ${featureId} already exists`);
    const lexicalParent = dirname(lexicalTarget);
    let existingParent = lexicalParent;
    let canonicalExisting: string;
    for (;;) {
      try {
        canonicalExisting = await realpath(existingParent);
        break;
      } catch {
        const parent = dirname(existingParent);
        if (parent === existingParent)
          throw new Error(
            "Feature destination has no accessible repository parent",
          );
        existingParent = parent;
      }
    }
    if (canonicalExisting !== root && !isWithin(root, canonicalExisting))
      throw new Error(
        "Feature destination resolves outside the selected project",
      );
    await mkdir(lexicalParent, { recursive: true });
    const canonicalParent = await realpath(lexicalParent);
    if (canonicalParent !== root && !isWithin(root, canonicalParent))
      throw new Error(
        "Feature destination resolves outside the selected project",
      );
    const target = resolve(canonicalParent, basename(lexicalTarget));
    if (!isWithin(root, target))
      throw new Error(
        "Feature destination resolves outside the selected project",
      );
    const content = path.endsWith(".md")
      ? `---\nlengthwise: 1\nid: ${JSON.stringify(featureId)}\ntype: feature\ntitle: ${JSON.stringify(input.title)}\nlifecycle: draft\nsignificance: ${input.significance ?? "M"}\n---\n\n${input.idea.trim()}\n`
      : `lengthwise: 1\nentities:\n  - id: ${JSON.stringify(featureId)}\n    type: feature\n    title: ${JSON.stringify(input.title)}\n    lifecycle: draft\n    significance: ${input.significance ?? "M"}\n    body: ${JSON.stringify(input.idea.trim())}\n`;
    await Bun.write(target, content);
    const rebuilt = await evaluateProject(this.repoRoot);
    if (
      !rebuilt.graphAvailable ||
      rebuilt.buildDiagnostics.some(
        (diagnostic) => diagnostic.severity === "error",
      ) ||
      !rebuilt.graph.getEntity(featureId)
    ) {
      try {
        await unlink(target);
      } catch {}
      throw new Error(
        `Created Feature artifact did not produce a valid Feature and was removed: ${rebuilt.diagnostics.map((d) => d.message).join("; ")}`,
      );
    }
    const captured = this.#state.start(featureId, "capture");
    const assessment = await this.assess(featureId);
    this.#state.event(
      captured.id,
      "feature-captured",
      { artifactPath: path, idea: input.idea },
      assessment.fingerprint,
      `${captured.id}:capture`,
    );
    this.#state.recordBaseline(captured.id, assessment.fingerprint, assessment);
    const run = this.#state.update(captured.id, "specify", "running");
    return {
      run,
      assessment: await this.assess(featureId),
      artifactPath: path,
    };
  }

  async assess(featureId: string): Promise<WorkflowAssessment> {
    return this.assessEvaluated(
      featureId,
      await evaluateProject(this.repoRoot),
    );
  }

  private assessEvaluated(
    featureId: string,
    evaluated: ProjectEvaluation,
  ): WorkflowAssessment {
    const emptyGates = () =>
      Object.fromEntries(
        (
          ["specification", "build-contract", "verification"] as WorkflowGate[]
        ).map((g) => [
          g,
          {
            gate: g,
            required: false,
            eligible: false,
            approved: false,
            fingerprint: "invalid",
            blockers: [
              blocker(
                "repository-invalid",
                "Repository cannot currently build",
              ),
            ],
          },
        ]),
      ) as Record<WorkflowGate, GateAssessment>;
    if (
      !evaluated.graphAvailable ||
      evaluated.buildDiagnostics.some(
        (diagnostic) => diagnostic.severity === "error",
      )
    )
      return {
        featureId,
        graphAvailable: evaluated.graphAvailable,
        buildValid: false,
        repositoryValid: false,
        diagnostics: evaluated.buildDiagnostics,
        featureDiagnostics: evaluated.buildDiagnostics,
        blockingQuestions: [],
        tasks: [],
        verifications: [],
        gates: emptyGates(),
        actions: [],
        governingChanges: [],
        implementation: { attempts: [], pendingReturns: [], retryContexts: [] },
        reconciliation: {
          required: true,
          reasons: [
            blocker(
              "repository-invalid",
              "Repair repository artifacts before progression",
            ),
          ],
        },
        specificationEligible: false,
        buildContractEligible: false,
        completionEligible: false,
        fingerprint: "invalid",
      };
    const feature = evaluated.graph.getEntity(featureId);
    if (!feature || feature.type !== "feature")
      throw new Error(`Unknown feature ${featureId}`);
    const graph = evaluated.graph;
    const diagnostics = [
      ...evaluated.buildDiagnostics,
      ...evaluated.checkDiagnostics,
    ];
    const requirements = graph
      .outgoingRelationships(featureId)
      .filter((r) => r.type === "addresses")
      .map((r) => r.to);
    const criteria = requirements.flatMap((id) =>
      graph
        .outgoingRelationships(id)
        .filter((r) => r.type === "has-acceptance-criterion")
        .map((r) => r.to),
    );
    const taskEntities = graph
      .entitiesOfType("task")
      .filter((t) =>
        graph
          .outgoingRelationships(t.id)
          .some((r) => r.type === "implements" && requirements.includes(r.to)),
      );
    const requiredVerifications = requiredVerificationsForFeature(
      graph,
      featureId,
    );
    const scope = new Set([
      featureId,
      ...requirements,
      ...criteria,
      ...taskEntities.map((t) => t.id),
      ...requiredVerifications,
    ]);
    const questions = graph
      .outgoingRelationships(featureId)
      .filter((r) => r.type === "has-question")
      .map((r) => graph.getEntity(r.to))
      .filter((q) => q?.type === "question");
    questions.forEach((q) => scope.add(q!.id));
    for (const id of [...scope]) {
      for (const r of [
        ...graph.incomingRelationships(id),
        ...graph.outgoingRelationships(id),
      ])
        if (
          ["contains", "governs", "contracts", "includes", "supports"].includes(
            r.type,
          )
        ) {
          scope.add(r.from);
          scope.add(r.to);
        }
    }
    const scopedArtifacts = new Set(
      [...scope]
        .map((id) => graph.getEntity(id)?.source.artifactPath)
        .filter(Boolean),
    );
    const featureDiagnostics = diagnostics.filter((d) =>
      d.entityId
        ? scope.has(d.entityId)
        : Boolean(
            d.location?.artifactPath &&
              scopedArtifacts.has(d.location.artifactPath),
          ),
    );
    const blockingQuestions = questions
      .filter(
        (q) => q!.type === "question" && q!.lifecycle === "open" && q!.blocking,
      )
      .map((q) => q!.id);
    const tasks = taskEntities.map((t) => {
      const contract = graph
        .incomingRelationships(t.id)
        .filter((r) => r.type === "contracts")
        .map((r) => graph.getEntity(r.from))
        .find(
          (e) => e?.type === "build-contract" && e.lifecycle === "accepted",
        );
      const stale =
        contract?.type === "build-contract"
          ? contractStaleness(graph, contract.id)
          : undefined;
      const blockedBy = taskDependencyBlockers(graph, t);
      return {
        id: t.id,
        lifecycle: t.lifecycle,
        artifactPath: t.source.artifactPath,
        contract: contract?.id,
        contractArtifactPath: contract?.source.artifactPath,
        contractFingerprint:
          contract?.type === "build-contract"
            ? contract.fingerprint
            : undefined,
        contractStale: stale?.stale,
        changedInputs: stale?.changedInputs ?? [],
        blockedBy,
        handoffEligible: Boolean(
          contract &&
            !stale?.stale &&
            t.lifecycle === "planned" &&
            blockedBy.length === 0,
        ),
      };
    });
    const verifications = requiredVerifications.map((id) => {
      const v = graph.getEntity(id)!;
      const s = evidenceSatisfaction(graph, id);
      return {
        id,
        artifactPath: v.source.artifactPath,
        satisfied: s.satisfied,
        status: s.status,
        evidenceIds: s.evidence.map((e) => e.id),
        failingEvidenceIds: s.assessments
          .filter((assessment) => assessment.status === "failing")
          .map((assessment) => assessment.evidenceId),
        missingComplements: s.missingComplements,
      };
    });
    const rigor = effectiveRigor(evaluated.config, graph, featureId);
    const run = this.#state.active(featureId) ?? this.#state.latest(featureId);
    const specificationDiagnostics = featureDiagnostics.filter(
      (d) =>
        ![
          "completeness/missing-implementation",
          "completeness/missing-verification",
          "graph/task-dependency-cycle",
        ].includes(d.code),
    );
    const common: WorkflowBlocker[] = [
      ...specificationDiagnostics
        .filter((d) => d.severity === "error")
        .map((d) =>
          blocker(d.code, d.message, d.entityId, d.location?.artifactPath),
        ),
      ...blockingQuestions.map((id) =>
        blocker(
          "blocking-question",
          `Resolve blocking Question ${id} and propagate its answer`,
          id,
          graph.getEntity(id)?.source.artifactPath,
        ),
      ),
    ];
    if (
      run &&
      !["cancelled", "complete"].includes(run.state) &&
      !["verify", "reconcile", "complete"].includes(run.activity) &&
      feature.lifecycle === "complete"
    )
      common.unshift(
        blocker(
          "lifecycle-run-conflict",
          `${featureId} is complete but has an active ${run.activity} workflow run`,
          featureId,
          feature.source.artifactPath,
        ),
      );
    for (const q of questions.filter(
      (q) =>
        q!.type === "question" &&
        q!.lifecycle === "answered" &&
        !graph
          .outgoingRelationships(q!.id)
          .some((r) => r.type === "resolved-by"),
    ))
      common.push(
        blocker(
          "answer-not-propagated",
          `${q!.id} is answered but has no resolved-by link to updated governing context`,
          q!.id,
          q!.source.artifactPath,
        ),
      );
    if (requirements.length === 0)
      common.push(
        blocker(
          "missing-requirements",
          "Feature addresses no Requirement or NFR",
          featureId,
          feature.source.artifactPath,
        ),
      );
    const specificationScope = new Set([
      featureId,
      ...requirements,
      ...criteria,
    ]);
    const specificationDecisions = graph
      .entitiesOfType("decision")
      .filter((d) =>
        graph
          .outgoingRelationships(d.id)
          .some((r) => r.type === "governs" && specificationScope.has(r.to)),
      )
      .map((d) => d.id)
      .sort();
    const specificationInputs = [
      featureId,
      ...requirements.sort(),
      ...criteria.sort(),
      ...specificationDecisions,
    ].map((id) => [id, gateSemanticFingerprint(graph.getEntity(id))]);
    const specFp = fingerprint({
      featureId,
      inputs: specificationInputs,
      blockers: common,
    });
    const specApproved = Boolean(
      run &&
        this.#state.hasFreshEvent(run.id, "specification-approved", specFp),
    );
    const planBlockers = [
      ...common,
      ...featureDiagnostics
        .filter(
          (d) =>
            d.severity === "error" && !specificationDiagnostics.includes(d),
        )
        .map((d) =>
          blocker(d.code, d.message, d.entityId, d.location?.artifactPath),
        ),
    ];
    const plans = graph
      .entitiesOfType("plan")
      .filter((p) =>
        graph
          .outgoingRelationships(p.id)
          .some(
            (r) =>
              r.type === "contains" && taskEntities.some((t) => t.id === r.to),
          ),
      );
    if (
      rigor.taskPlan === "required" &&
      (tasks.length === 0 || plans.length === 0)
    )
      planBlockers.push(
        blocker(
          "missing-task-plan",
          "Effective rigor requires a Plan containing the Feature's implementation tasks",
          featureId,
          feature.source.artifactPath,
        ),
      );
    for (const t of tasks) {
      if (!t.contract)
        planBlockers.push(
          blocker(
            "missing-contract",
            `${t.id} needs an accepted BuildContract`,
            t.id,
            t.artifactPath,
          ),
        );
      else if (t.contractStale)
        planBlockers.push(
          blocker(
            "stale-contract",
            `${t.contract} is stale: ${t.changedInputs.map((i) => i.id).join(", ")}`,
            t.contract,
            graph.getEntity(t.contract)?.source.artifactPath,
          ),
        );
    }
    const contractFp = fingerprint({
      specFp,
      tasks: tasks.map((t) => ({
        id: t.id,
        contract: t.contract,
        contractFingerprint: t.contract
          ? gateSemanticFingerprint(graph.getEntity(t.contract))
          : undefined,
        stale: t.contractStale,
        changed: t.changedInputs,
      })),
    });
    const contractApproved = Boolean(
      run &&
        this.#state.hasFreshEvent(
          run.id,
          "build-contract-approved",
          contractFp,
        ),
    );
    const events = run ? this.#state.events(run.id) : [];
    const implementation = implementationProjection(events);
    for (const returned of implementation.pendingReturns)
      returned.verificationIds = buildContractContext(
        graph,
        returned.taskId,
      ).verifications;
    const activeImplementationWaits = run
      ? this.#state
          .waiting(run.id, "implementation")
          .flatMap((wait) => (wait.targetId ? [wait.targetId] : []))
      : [];
    const implementationBlockers = [
      ...activeImplementationWaits.map((taskId) =>
        blocker(
          "implementation-return-pending",
          `${taskId} has an outstanding implementation handoff`,
          taskId,
        ),
      ),
      ...implementation.pendingReturns.map((value) =>
        blocker(
          "implementation-return-pending-verification",
          `${value.taskId} implementation completion claim has not been evaluated by verification`,
          value.taskId,
        ),
      ),
      ...implementation.retryContexts.map((value) =>
        blocker(
          "implementation-retry-pending",
          `${value.taskId} has unsatisfied implementation obligations awaiting another attempt`,
          value.taskId,
        ),
      ),
    ];
    const verificationBlockers = verifications
      .filter((v) => !v.satisfied)
      .map((v) =>
        blocker(
          `evidence-${v.status}`,
          `${v.id} evidence is ${v.status}${v.missingComplements.length ? `; missing ${v.missingComplements.join(", ")}` : ""}`,
          v.id,
          v.artifactPath,
        ),
      );
    const verificationFp = fingerprint({
      contractFp,
      verifications,
      implementation: {
        waits: activeImplementationWaits,
        pendingReturns: implementation.pendingReturns.map(
          (item) => item.implementationAttemptId,
        ),
        retries: implementation.retryContexts.map(
          (item) => item.implementationAttemptId,
        ),
      },
    });
    const verificationApproved = Boolean(
      run &&
        this.#state.hasFreshEvent(
          run.id,
          "verification-approved",
          verificationFp,
        ),
    );
    const requiredGates = new Set(
      rigor.humanApproval.map((g) =>
        g === "buildContract" ? "build-contract" : g,
      ) as WorkflowGate[],
    );
    const gates: Record<WorkflowGate, GateAssessment> = {
      specification: {
        gate: "specification",
        required: requiredGates.has("specification"),
        eligible: common.length === 0,
        approved: specApproved,
        fingerprint: specFp,
        blockers: common,
      },
      "build-contract": {
        gate: "build-contract",
        required: requiredGates.has("build-contract"),
        eligible:
          planBlockers.length === 0 &&
          (!requiredGates.has("specification") || specApproved),
        approved: contractApproved,
        fingerprint: contractFp,
        blockers: [
          ...planBlockers,
          ...(!specApproved && requiredGates.has("specification")
            ? [
                blocker(
                  "gate-order",
                  "Approve the current specification gate first",
                ),
              ]
            : []),
        ],
      },
      verification: {
        gate: "verification",
        required: requiredGates.has("verification"),
        eligible:
          verificationBlockers.length === 0 &&
          implementationBlockers.length === 0 &&
          tasks.every((t) => graph.getEntity(t.id)?.lifecycle === "done") &&
          (!requiredGates.has("build-contract") || contractApproved),
        approved: verificationApproved,
        fingerprint: verificationFp,
        blockers: [
          ...verificationBlockers,
          ...implementationBlockers,
          ...tasks
            .filter((t) => graph.getEntity(t.id)?.lifecycle !== "done")
            .map((t) =>
              blocker(
                "task-not-done",
                `${t.id} lifecycle is not done`,
                t.id,
                t.artifactPath,
              ),
            ),
          ...(!contractApproved && requiredGates.has("build-contract")
            ? [
                blocker(
                  "gate-order",
                  "Approve the current Build Contract gate first",
                ),
              ]
            : []),
        ],
      },
    };
    const lastReconciledIndex = events.findLastIndex(
      (e) => e.kind === "reconciliation-complete",
    );
    for (const task of tasks) {
      const retry = implementation.retryContexts.find(
        (context) => context.taskId === task.id,
      );
      if (
        retry &&
        task.contract &&
        !task.contractStale &&
        task.blockedBy.length === 0
      )
        task.handoffEligible = true;
    }
    const explicitReconciliation = events
      .slice(lastReconciledIndex + 1)
      .filter((e) => e.kind === "verification-reconciliation-required")
      .map((e) => {
        const value = eventPayload<{ taskId?: string; reason: string }>(e);
        return blocker(
          "governing-context-conflict",
          value.reason,
          value.taskId,
        );
      });
    const reconciliationReasons = [
      ...tasks
        .filter((t) => t.contractStale)
        .map((t) =>
          blocker(
            "contract-diverged",
            `${t.contract} no longer matches governing inputs`,
            t.contract,
          ),
        ),
      ...explicitReconciliation,
    ];
    const completionBlockers = [
      ...common,
      ...planBlockers.filter((b) => !common.includes(b)),
      ...verificationBlockers,
      ...tasks
        .filter((t) => graph.getEntity(t.id)?.lifecycle !== "done")
        .map((t) =>
          blocker(
            "task-not-done",
            `${t.id} lifecycle is not done`,
            t.id,
            t.artifactPath,
          ),
        ),
      ...implementationBlockers,
      ...reconciliationReasons,
    ];
    for (const gate of Object.values(gates))
      if (gate.required && !gate.approved)
        completionBlockers.push(
          blocker(
            "approval-missing",
            `Current ${gate.gate} approval is required`,
          ),
        );
    const completionEligible = completionBlockers.length === 0;
    const overall = fingerprint({
      featureId,
      specFp,
      contractFp,
      verificationFp,
      completionEligible,
    });
    const actions = this.actionsFor({
      featureId,
      featurePath: feature.source.artifactPath,
      featureLifecycle: feature.lifecycle,
      tasks,
      verifications,
      gates,
      completionEligible,
      reconciliationReasons,
      implementation,
      run,
    });
    const currentGate = gateForActivity(run?.activity);
    const pendingGate = (
      ["specification", "build-contract", "verification"] as WorkflowGate[]
    ).find((gate) => gates[gate].required && !gates[gate].approved);
    const primaryActionId = actions.find((action) => action.eligible)?.id;
    return {
      featureId,
      graphAvailable: true,
      buildValid: true,
      repositoryValid: evaluated.repositoryValid,
      diagnostics,
      featureDiagnostics,
      blockingQuestions,
      tasks,
      verifications,
      gates,
      actions,
      governingChanges: tasks
        .filter((t) => t.changedInputs.length)
        .map((t) => ({ contractId: t.contract!, inputs: t.changedInputs })),
      implementation,
      reconciliation: {
        required: reconciliationReasons.length > 0,
        reasons: reconciliationReasons,
        baselineFingerprint: run
          ? this.#state.latestBaseline(run.id)?.fingerprint
          : undefined,
      },
      ...(currentGate ? { currentGate } : {}),
      ...(pendingGate ? { pendingGate } : {}),
      ...(primaryActionId ? { primaryActionId } : {}),
      specificationEligible: gates.specification.eligible,
      buildContractEligible: gates["build-contract"].eligible,
      completionEligible,
      fingerprint: overall,
    };
  }

  private actionsFor(input: {
    featureId: string;
    featurePath: string;
    featureLifecycle: string;
    tasks: WorkflowAssessment["tasks"];
    verifications: WorkflowAssessment["verifications"];
    gates: WorkflowAssessment["gates"];
    completionEligible: boolean;
    reconciliationReasons: WorkflowBlocker[];
    implementation: WorkflowAssessment["implementation"];
    run?: WorkflowRun;
  }): WorkflowAction[] {
    const actions: WorkflowAction[] = [];
    const add = (action: WorkflowAction) => actions.push(action);
    if (input.run?.state === "cancelled" || input.run?.state === "complete")
      return actions;
    if (
      input.run &&
      !["cancelled", "complete"].includes(input.run.state) &&
      input.run.activity !== "complete" &&
      input.featureLifecycle === "complete" &&
      !(
        ["verify", "reconcile"].includes(input.run.activity) &&
        input.completionEligible
      )
    )
      return [
        {
          id: "reopen-feature",
          kind: "author",
          label: `Reopen ${input.featureId} and continue`,
          eligible: true,
          requiredInputs: [
            "Human decision that additional Feature work is intended",
          ],
          expectedOutputs: [
            "Feature lifecycle active",
            "Existing workflow run retained",
          ],
          target: {
            entityId: input.featureId,
            artifactPath: input.featurePath,
          },
          blockers: [],
        },
        {
          id: "cancel-stale-run",
          kind: "cancel",
          label: `Keep ${input.featureId} complete and close the run`,
          eligible: true,
          requiredInputs: ["Human decision that the Feature remains complete"],
          expectedOutputs: ["Workflow run cancelled and retained in history"],
          target: {
            entityId: input.featureId,
            artifactPath: input.featurePath,
          },
          blockers: [],
        },
      ];
    const specificationBlocker = input.gates.specification.blockers[0];
    if (
      !input.gates.specification.approved &&
      !input.gates.specification.eligible &&
      specificationBlocker
    ) {
      const label =
        specificationBlocker.code === "missing-requirements"
          ? `Add a Requirement or NFR to ${input.featureId}`
          : specificationBlocker.code.includes("relationship")
            ? `Repair ${specificationBlocker.entityId ?? input.featureId}'s relationship`
            : `Resolve ${specificationBlocker.entityId ?? "the specification blocker"}`;
      add({
        id: "repair-specification",
        kind: "author",
        label,
        eligible: true,
        requiredInputs: [specificationBlocker.message],
        expectedOutputs: [
          "The blocking condition is resolved in the authoritative artifact",
        ],
        target: {
          entityId: specificationBlocker.entityId ?? input.featureId,
          artifactPath: specificationBlocker.artifactPath ?? input.featurePath,
        },
        blockers: [],
      });
    }
    if (!input.gates.specification.approved)
      add({
        id: "review-specification",
        kind: "gate-review",
        label: "Review and approve the specification",
        eligible: input.gates.specification.eligible,
        requiredInputs: [
          "Current Feature, requirements, criteria, decisions, Questions, and findings",
        ],
        expectedOutputs: [
          "Reviewed authoritative lifecycle saves",
          "Specification gate event",
        ],
        target: { entityId: input.featureId, artifactPath: input.featurePath },
        blockers: input.gates.specification.blockers,
      });
    if (
      input.gates.specification.approved &&
      !input.gates["build-contract"].approved
    )
      for (const task of input.tasks.filter(
        (task) => !task.contract || task.contractStale,
      ))
        add({
          id: `author-contract:${task.id}`,
          kind: "author",
          label: task.contract
            ? `Refresh ${task.contract}`
            : `Author BuildContract for ${task.id}`,
          eligible: true,
          requiredInputs: [
            "Accepted specification",
            "Task DAG",
            "Verification topology",
            "Accepted decision-authority metadata",
          ],
          expectedOutputs: ["Accepted machine-readable BuildContract"],
          target: {
            entityId: task.contract ?? task.id,
            entityType: "build-contract",
            artifactPath: task.contract
              ? undefined
              : task.artifactPath.replace(/[^/]+$/, "contracts.yaml"),
          },
          blockers: [],
        });
    if (
      input.gates["build-contract"].eligible &&
      !input.gates["build-contract"].approved
    ) {
      const reviewTarget = input.tasks.find(
        (task) => task.contract && task.contractArtifactPath,
      );
      add({
        id: "review-build-contract",
        kind: "gate-review",
        label: "Review and approve Build Contracts",
        eligible: true,
        requiredInputs: [
          "Current accepted BuildContracts and governing changes",
        ],
        expectedOutputs: ["Build Contract gate event"],
        target: {
          entityId: reviewTarget?.contract ?? input.featureId,
          artifactPath: reviewTarget?.contractArtifactPath ?? input.featurePath,
        },
        blockers: [],
      });
    }
    if (
      input.run?.activity === "implement" &&
      (input.gates["build-contract"].approved ||
        !input.gates["build-contract"].required)
    ) {
      const waiting = new Set(
        this.#state
          .waiting(input.run.id, "implementation")
          .map((wait) => wait.targetId),
      );
      for (const task of input.tasks.filter(
        (task) =>
          !waiting.has(task.id) &&
          (task.lifecycle !== "done" ||
            input.implementation.retryContexts.some(
              (context) => context.taskId === task.id,
            )),
      )) {
        const retry = input.implementation.retryContexts.find(
          (context) => context.taskId === task.id,
        );
        const dependencyBlockers = task.blockedBy.map((dependencyId) =>
          blocker(
            "task-dependency-incomplete",
            `${task.id} depends on incomplete task ${dependencyId}`,
            dependencyId,
            task.artifactPath,
          ),
        );
        add({
          id: `handoff:${task.id}`,
          kind: "handoff",
          label: retry
            ? `Retry implementation for ${task.id}`
            : `Hand off ${task.id} for implementation`,
          eligible: task.handoffEligible,
          requiredInputs: retry
            ? [
                `Current accepted BuildContract ${retry.contractId ?? task.contract ?? ""}`.trim(),
                `Failed verification: ${retry.failedVerifications.join(", ")}`,
                `Affected acceptance criteria: ${retry.affectedAcceptanceCriteria.join(", ") || "not derivable"}`,
                `Affected requirements: ${retry.affectedRequirements.join(", ") || "not derivable"}`,
                ...retry.blockingFindings,
                ...retry.knownGaps,
              ]
            : [`Current accepted BuildContract ${task.contract ?? ""}`.trim()],
          expectedOutputs: [
            "Recorded implementation handoff",
            "Workflow waits for an implementation return",
          ],
          target: {
            entityId: task.contract ?? task.id,
            artifactPath: task.contractArtifactPath ?? task.artifactPath,
          },
          blockers: !task.contract
            ? [
                blocker(
                  "missing-contract",
                  `${task.id} needs an accepted BuildContract`,
                  task.id,
                  task.artifactPath,
                ),
              ]
            : task.contractStale
              ? [
                  blocker(
                    "stale-contract",
                    "Refresh the BuildContract before handoff",
                    task.contract,
                  ),
                ]
              : dependencyBlockers.length
                ? dependencyBlockers
                : !retry && task.lifecycle !== "planned"
                  ? [
                      blocker(
                        "task-not-planned",
                        `${task.id} must be planned before handoff`,
                        task.id,
                        task.artifactPath,
                      ),
                    ]
                  : [],
        });
      }
      for (const task of input.tasks.filter((task) => waiting.has(task.id)))
        add({
          id: `return:${task.id}`,
          kind: "implementation-return",
          label: `Record implementation return for ${task.id}`,
          eligible: true,
          requiredInputs: [
            "Structured implementer completion claim",
            "Known gaps and changed files",
          ],
          expectedOutputs: [
            "Recorded implementation return claim",
            "The task enters verification coordination",
          ],
          target: { entityId: task.id, artifactPath: task.artifactPath },
          blockers: [],
        });
    }
    for (const returned of input.implementation.pendingReturns)
      add({
        id: `review-return:${returned.taskId}`,
        kind: "verification-route",
        label: `Evaluate implementation return for ${returned.taskId}`,
        eligible: input.run?.activity === "verify",
        requiredInputs: [
          "Implementation completion claim",
          "Current required verification and Evidence",
          "Classify omissions separately from governing-context conflicts",
        ],
        expectedOutputs: [
          "Retry implementation, enter reconciliation, or record satisfactory verification",
        ],
        target: {
          entityId: returned.taskId,
          artifactPath: input.tasks.find((task) => task.id === returned.taskId)
            ?.artifactPath,
        },
        blockers: [],
      });
    for (const verification of input.verifications.filter((v) => !v.satisfied))
      add({
        id: `record-evidence:${verification.id}`,
        kind: "author",
        label: `Record applicable Evidence for ${verification.id}`,
        eligible: true,
        requiredInputs: [
          "Observed result and pass/fail outcome",
          "Evidence source or provenance",
          "Applicability to the current verification context fingerprint or revision",
          "Any complementary Evidence required by the Verification",
        ],
        expectedOutputs: [
          `Recorded Evidence entity with a supports relationship to ${verification.id}`,
          "Evidence that is current, applicable, and sufficient for the Verification",
        ],
        target: {
          entityId: verification.id,
          entityType: "evidence",
          artifactPath: verification.artifactPath,
        },
        blockers: [],
      });
    if (input.reconciliationReasons.length)
      add({
        id: "reconcile",
        kind: "reconcile",
        label:
          "Reconcile implementation, contracts, Evidence, and governing artifacts",
        eligible: true,
        requiredInputs: [
          "Implementation return claims",
          "Current artifacts and checks",
          "Evidence applicability",
          "Governing changes",
        ],
        expectedOutputs: [
          "Updated authoritative artifacts or a converged reconciliation baseline",
        ],
        target: { entityId: input.featureId, artifactPath: input.featurePath },
        blockers: input.reconciliationReasons,
      });
    if (
      input.gates.verification.required &&
      input.gates.verification.eligible &&
      !input.gates.verification.approved
    ) {
      add({
        id: "review-verification",
        kind: "gate-review",
        label: "Review final verification evidence",
        eligible: true,
        requiredInputs: [
          "Current applicable Evidence and reconciliation result",
        ],
        expectedOutputs: ["Verification gate event"],
        target: {
          entityId: input.featureId,
          artifactPath: input.featurePath,
        },
        blockers: [],
      });
    }
    add({
      id: "complete-feature",
      kind: "author",
      label: "Save Feature lifecycle as complete",
      eligible: input.completionEligible,
      requiredInputs: [
        "All deterministic completion obligations and required approvals",
      ],
      expectedOutputs: [
        "Feature lifecycle complete in its authoritative artifact",
        "Terminal workflow run",
      ],
      target: { entityId: input.featureId, artifactPath: input.featurePath },
      blockers: input.completionEligible
        ? []
        : [
            blocker(
              "completion-ineligible",
              "Resolve the listed workflow blockers first",
            ),
          ],
    });
    for (const action of actions) {
      if (action.id.startsWith("handoff:")) {
        const targetId = action.id.slice("handoff:".length);
        action.subject = { entityId: targetId, entityType: "task" };
      } else if (action.id.startsWith("return:")) {
        const targetId = action.id.slice("return:".length);
        action.subject = { entityId: targetId, entityType: "task" };
        action.ai = {
          skillId: "implement-build-contract",
          semanticAction: "implementation-attempt",
          contextPurpose: "implement",
          targetId,
        };
      } else if (action.id.startsWith("review-return:")) {
        const targetId = action.id.slice("review-return:".length);
        action.subject = { entityId: targetId, entityType: "task" };
        action.ai = {
          skillId: "review-implementation",
          semanticAction: "review-implementation",
          contextPurpose: "verify",
          targetId,
        };
      } else if (action.id.startsWith("author-contract:")) {
        const targetId = action.id.slice("author-contract:".length);
        action.subject = { entityId: targetId, entityType: "task" };
      } else if (action.id.startsWith("record-evidence:")) {
        const targetId = action.id.slice("record-evidence:".length);
        action.subject = { entityId: targetId, entityType: "verification" };
      } else if (action.id === "repair-specification") {
        const clarification = [
          "blocking-question",
          "answer-not-propagated",
        ].includes(specificationBlocker?.code ?? "");
        action.ai = clarification
          ? {
              skillId: "clarify-feature",
              semanticAction: "clarify-feature",
              contextPurpose: "clarify",
              targetId: input.featureId,
            }
          : {
              skillId: "specify-feature",
              semanticAction: "specify-feature",
              contextPurpose: "specify",
              targetId: input.featureId,
            };
      } else if (action.id === "review-specification") {
        action.gate = "specification";
        action.ai = {
          skillId: "review-specification",
          semanticAction: "review-specification",
          contextPurpose: "specify",
          targetId: input.featureId,
        };
      } else if (action.id === "review-build-contract") {
        action.gate = "build-contract";
        action.ai = {
          skillId: "review-build-readiness",
          semanticAction: "review-build-readiness",
          contextPurpose: "review-build-contract",
          targetId: input.featureId,
        };
      } else if (action.id === "review-verification") {
        action.gate = "verification";
        action.ai = {
          skillId: "review-verification",
          semanticAction: "review-verification",
          contextPurpose: "verify",
          targetId: input.featureId,
        };
      } else if (action.id === "reconcile")
        action.ai = {
          skillId: "reconcile-feature",
          semanticAction: "reconcile-feature",
          contextPurpose: "reconcile",
          targetId: input.featureId,
        };
    }
    return actions;
  }

  private implementationSettled(
    assessment: WorkflowAssessment,
    runId: string,
  ): boolean {
    return (
      assessment.tasks.every((task) => task.lifecycle === "done") &&
      assessment.implementation.pendingReturns.length === 0 &&
      assessment.implementation.retryContexts.length === 0 &&
      this.#state.waiting(runId, "implementation").length === 0
    );
  }

  async approve(
    runId: string,
    gate: WorkflowGate,
    reviewedFingerprint: string,
    lifecycleEffects: Array<{
      entityId: string;
      from: string;
      to: string;
    }> = [],
  ) {
    let run = this.requireRun(runId);
    let assessment = await this.assess(run.featureId);
    let implementationSettled = this.implementationSettled(assessment, runId);
    if (
      gate === "verification" &&
      run.activity === "implement" &&
      implementationSettled
    ) {
      run = this.#state.update(runId, "verify", "running");
      assessment = await this.assess(run.featureId);
      implementationSettled = this.implementationSettled(assessment, runId);
    }
    const current = assessment.gates[gate];
    if (current.approved) {
      if (
        gate === "build-contract" &&
        run.activity === "implement" &&
        implementationSettled
      )
        return this.#state.update(runId, "verify", "running");
      return run;
    }
    const allowed: Record<WorkflowGate, WorkflowActivity[]> = {
      specification: ["specify", "reconcile"],
      "build-contract": ["plan", "reconcile"],
      verification: ["verify", "reconcile"],
    };
    if (!allowed[gate].includes(run.activity))
      throw new Error(
        `Cannot approve ${gate} gate during ${run.activity} activity`,
      );
    if (current.fingerprint !== reviewedFingerprint)
      throw new Error(
        `Reviewed ${gate} context is stale; reload the current gate assessment`,
      );
    if (!current.eligible)
      throw new Error(
        `${gate} gate is ineligible: ${current.blockers.map((b) => b.message).join("; ")}`,
      );
    const built = await buildProjectGraph(this.repoRoot);
    if (!built.ok) throw new Error("Repository cannot currently build");
    for (const effect of lifecycleEffects) {
      const entity = built.graph.getEntity(effect.entityId);
      if (!entity)
        throw new Error(
          `Reviewed lifecycle effect references unknown entity ${effect.entityId}`,
        );
      if (entity.lifecycle !== effect.to)
        throw new Error(
          `Apply and save reviewed lifecycle effect ${effect.entityId}: ${effect.from} -> ${effect.to} before approval`,
        );
    }
    const order: Record<WorkflowGate, WorkflowActivity> = {
      specification: "plan",
      "build-contract": implementationSettled ? "verify" : "implement",
      verification: "reconcile",
    };
    return this.#state.immediateTransaction(() => {
      this.#state.event(
        runId,
        `${gate}-approved`,
        { lifecycleEffects },
        reviewedFingerprint,
        `${runId}:${gate}:${reviewedFingerprint}`,
      );
      return this.#state.update(runId, order[gate], "running");
    });
  }
  async handoff(runId: string, taskId: string, idempotencyKey: string) {
    const run = this.requireRun(runId);
    const prior = this.#state.attemptByKey(
      runId,
      `handoff:${taskId}`,
      idempotencyKey,
    );
    if (prior) return prior;
    if (run.activity !== "implement")
      throw new Error(
        `Cannot hand off implementation during ${run.activity} activity`,
      );
    const a = await this.assess(run.featureId);
    const task = a.tasks.find((t) => t.id === taskId);
    if (
      !task?.handoffEligible ||
      (a.gates["build-contract"].required &&
        !a.gates["build-contract"].approved)
    )
      throw new Error(`${taskId} is not eligible for handoff`);
    const retryContext = a.implementation.retryContexts.find(
      (context) => context.taskId === taskId,
    );
    return this.#state.immediateTransaction(() => {
      const replay = this.#state.attemptByKey(
        runId,
        `handoff:${taskId}`,
        idempotencyKey,
      );
      if (replay) return replay;
      const current = this.requireRun(runId);
      if (current.activity !== "implement")
        throw new Error(
          `Cannot hand off implementation during ${current.activity} activity`,
        );
      if (
        this.#state
          .waiting(runId, "implementation")
          .some((wait) => wait.targetId === taskId)
      )
        throw new Error(
          `${taskId} already has an outstanding implementation handoff`,
        );
      const attempt = this.#state.beginAttempt(
        runId,
        `handoff:${taskId}`,
        idempotencyKey,
        a.fingerprint,
      );
      const implementationAttemptId = crypto.randomUUID();
      const attemptNumber =
        this.#state
          .events(runId)
          .filter(
            (event) =>
              event.kind === "implementation-handed-off" &&
              eventPayload<{ taskId?: string }>(event).taskId === taskId,
          ).length + 1;
      this.#state.event(
        runId,
        "implementation-handed-off",
        {
          taskId,
          contractId: task.contract,
          contractFingerprint: task.contractFingerprint,
          implementationAttemptId,
          attemptNumber,
          ...(retryContext ? { retryContext } : {}),
        },
        a.fingerprint,
        `${runId}:handoff:${taskId}:${idempotencyKey}`,
      );
      this.#state.wait(runId, "implementation", taskId);
      this.#state.update(runId, "implement", "waiting-implementation");
      return this.#state.finishAttempt(attempt.id, "succeeded", {
        taskId,
        contractId: task.contract,
        contractFingerprint: task.contractFingerprint,
        implementationAttemptId,
        attemptNumber,
        retryContext,
      });
    });
  }
  async returnImplementation(
    runId: string,
    taskId: string,
    claim: ImplementationCompletionClaimInput | string,
    idempotencyKey: string,
  ) {
    const run = this.requireRun(runId);
    const prior = this.#state.attemptByKey(
      runId,
      `implementation-return:${taskId}`,
      idempotencyKey,
    );
    if (prior) return prior;
    const submittedClaim: ImplementationCompletionClaimInput =
      typeof claim === "string" ? { summary: claim } : claim;
    if (!isImplementationCompletionClaim(submittedClaim))
      throw new Error("Implementation return claim has an invalid structure");
    if (
      !submittedClaim.summary?.trim() &&
      !(submittedClaim.claims?.requirements?.length ?? 0) &&
      !(submittedClaim.claims?.acceptanceCriteria?.length ?? 0) &&
      !(submittedClaim.claims?.lockedDecisions?.length ?? 0) &&
      !submittedClaim.knownGaps?.length &&
      !submittedClaim.changedFiles?.length &&
      !submittedClaim.checks?.length &&
      !submittedClaim.externalVerifications?.length
    )
      throw new Error("Implementation return requires a completion claim");
    const a = await this.assess(run.featureId);
    return this.#state.immediateTransaction(() => {
      const replay = this.#state.attemptByKey(
        runId,
        `implementation-return:${taskId}`,
        idempotencyKey,
      );
      if (replay) return replay;
      this.requireRun(runId);
      const events = this.#state.events(runId);
      const returnedAttemptIds = new Set(
        events
          .filter((candidate) => candidate.kind === "implementation-returned")
          .map(
            (candidate) =>
              eventPayload<{ implementationAttemptId?: string }>(candidate)
                .implementationAttemptId,
          )
          .filter(Boolean),
      );
      const handoff = [...events]
        .reverse()
        .find(
          (event) =>
            event.kind === "implementation-handed-off" &&
            eventPayload<{ taskId?: string }>(event).taskId === taskId &&
            !returnedAttemptIds.has(
              eventPayload<{ implementationAttemptId?: string }>(event)
                .implementationAttemptId ?? event.id,
            ),
        );
      if (
        !handoff ||
        !this.#state
          .waiting(runId, "implementation")
          .some((wait) => wait.targetId === taskId)
      )
        throw new Error(`${taskId} has no outstanding implementation handoff`);
      const attempt = this.#state.beginAttempt(
        runId,
        `implementation-return:${taskId}`,
        idempotencyKey,
        a.fingerprint,
      );
      const implementationAttemptId =
        eventPayload<{ implementationAttemptId?: string }>(handoff)
          .implementationAttemptId ?? handoff.id;
      const handoffIdentity = eventPayload<{
        contractId?: string;
        contractFingerprint?: string;
      }>(handoff);
      const task = a.tasks.find((candidate) => candidate.id === taskId);
      const normalized = normalizeCompletionClaim(submittedClaim, {
        taskId,
        contractId:
          handoffIdentity.contractId ?? task?.contract ?? "legacy-unrecorded",
        contractFingerprint:
          handoffIdentity.contractFingerprint ??
          task?.contractFingerprint ??
          "legacy-unrecorded",
        implementationAttemptId,
      });
      this.#state.event(
        runId,
        "implementation-returned",
        { taskId, implementationAttemptId, claim: normalized },
        a.fingerprint,
        `${runId}:return:${taskId}:${idempotencyKey}`,
      );
      this.#state.resolveWaits(runId, "implementation", taskId);
      const remaining = this.#state.waiting(runId, "implementation");
      this.#state.update(
        runId,
        remaining.length ? "implement" : "verify",
        remaining.length ? "waiting-implementation" : "running",
      );
      return this.#state.finishAttempt(attempt.id, "succeeded", {
        taskId,
        implementationAttemptId,
        claim: normalized,
        remaining: remaining.map((wait) => wait.targetId),
      });
    });
  }
  async evaluateImplementationReturn(
    runId: string,
    input: {
      taskId: string;
      outcome: "retry-implementation" | "reconcile" | "satisfactory";
      failedVerifications?: string[];
      blockingFindings?: string[];
      knownGaps?: string[];
      reason?: string;
      idempotencyKey: string;
    },
  ) {
    const run = this.requireRun(runId);
    const statePending = implementationProjection(
      this.#state.events(runId),
    ).pendingReturns.find((value) => value.taskId === input.taskId);
    const prior = statePending
      ? this.#state.attemptByKey(
          runId,
          `evaluate-return:${statePending.implementationAttemptId}`,
          input.idempotencyKey,
        )
      : [...this.#state.attempts(runId)]
          .reverse()
          .find(
            (item) =>
              item.idempotencyKey === input.idempotencyKey &&
              item.actionId.startsWith("evaluate-return:") &&
              recordValue(item.result) &&
              item.result.taskId === input.taskId,
          );
    if (prior) return prior;
    if (run.activity !== "verify")
      throw new Error(
        `Cannot evaluate an implementation return during ${run.activity} activity`,
      );
    const evaluated = await evaluateProject(this.repoRoot);
    if (!evaluated.graphAvailable)
      throw new Error("Repository cannot currently build");
    const a = await this.assessEvaluated(run.featureId, evaluated);
    const returned = a.implementation.pendingReturns.find(
      (value) => value.taskId === input.taskId,
    );
    if (!returned)
      throw new Error(
        `${input.taskId} has no implementation return awaiting verification`,
      );
    const task = a.tasks.find((value) => value.id === input.taskId);
    if (!task) throw new Error(`Unknown workflow task ${input.taskId}`);
    const evaluationActionId = `evaluate-return:${returned.implementationAttemptId}`;
    const commitEvaluation = (
      eventKind: string,
      eventId: string,
      result: unknown,
      nextActivity?: WorkflowActivity,
    ) =>
      this.#state.immediateTransaction(() => {
        const replay = this.#state.attemptByKey(
          runId,
          evaluationActionId,
          input.idempotencyKey,
        );
        if (replay) return replay;
        const currentRun = this.requireRun(runId);
        if (currentRun.activity !== "verify")
          throw new Error(
            `Cannot evaluate an implementation return during ${currentRun.activity} activity`,
          );
        const stillPending = implementationProjection(
          this.#state.events(runId),
        ).pendingReturns.some(
          (item) =>
            item.implementationAttemptId === returned.implementationAttemptId,
        );
        if (!stillPending)
          throw new Error(
            `${input.taskId} has no implementation return awaiting verification`,
          );
        const attempt = this.#state.beginAttempt(
          runId,
          evaluationActionId,
          input.idempotencyKey,
          a.fingerprint,
        );
        this.#state.event(runId, eventKind, result, a.fingerprint, eventId);
        if (nextActivity) this.#state.update(runId, nextActivity, "running");
        return this.#state.finishAttempt(attempt.id, "succeeded", result);
      });
    if (input.outcome === "retry-implementation") {
      if (task.contractStale)
        throw new Error(
          `${task.contract} is stale; route governing-context changes to reconciliation`,
        );
      const contractContext = buildContractContext(
        evaluated.graph,
        input.taskId,
      );
      const relevant = new Set(contractContext.verifications);
      const failed = [
        ...new Set(
          input.failedVerifications ??
            a.verifications
              .filter((value) => relevant.has(value.id) && !value.satisfied)
              .map((value) => value.id),
        ),
      ].sort();
      if (!failed.length)
        throw new Error(
          "Retry routing requires at least one unsatisfied verification obligation",
        );
      if (failed.some((id) => !relevant.has(id)))
        throw new Error(
          "Retry routing includes a verification outside the task's accepted Build Contract",
        );
      if (
        failed.some(
          (id) => a.verifications.find((value) => value.id === id)?.satisfied,
        )
      )
        throw new Error(
          "Retry routing cannot classify a satisfactory verification as failed",
        );
      const blockingFindings = (input.blockingFindings ?? []).filter(
        (finding) => finding.trim().length > 0,
      );
      const contractRequirements = new Set(contractContext.requirements);
      const contractCriteria = new Set(contractContext.criteria);
      const claimEstablishesDefect =
        (returned.claim.claims?.requirements ?? []).some(
          (claim) =>
            contractRequirements.has(claim.id) &&
            claim.state === "not-addressed",
        ) ||
        (returned.claim.claims?.acceptanceCriteria ?? []).some(
          (claim) =>
            contractCriteria.has(claim.id) && claim.state === "not-addressed",
        ) ||
        returned.claim.checks.some((check) => check.outcome === "failed");
      const evidenceEstablishesDefect = failed.some(
        (id) =>
          a.verifications.find((verification) => verification.id === id)
            ?.failingEvidenceIds.length,
      );
      if (
        blockingFindings.length === 0 &&
        !claimEstablishesDefect &&
        !evidenceEstablishesDefect
      )
        throw new Error(
          "Retry routing requires a demonstrated implementation defect; missing Evidence alone remains pending verification",
        );
      const affected = affectedObligations(
        evaluated.graph,
        input.taskId,
        failed,
      );
      const retryContext: ImplementationRetryContext = {
        taskId: input.taskId,
        implementationAttemptId: returned.implementationAttemptId,
        failedVerifications: failed,
        affectedAcceptanceCriteria: affected.acceptanceCriteria,
        affectedRequirements: affected.requirements,
        blockingFindings,
        knownGaps: [
          ...new Set([
            ...(returned.claim.knownGaps ?? []),
            ...(input.knownGaps ?? []),
          ]),
        ],
        contractId: task.contract,
        contractFingerprint: task.contractFingerprint,
        contractCurrent: true,
        nextEligibleAction: "implementation-handoff",
      };
      return commitEvaluation(
        "verification-returned-to-implementation",
        `${runId}:verification-retry:${returned.implementationAttemptId}:${input.idempotencyKey}`,
        retryContext,
        "implement",
      );
    }
    if (input.outcome === "reconcile") {
      if (!input.reason?.trim())
        throw new Error(
          "Reconciliation routing requires the governing-context conflict",
        );
      const result = {
        taskId: input.taskId,
        implementationAttemptId: returned.implementationAttemptId,
        reason: input.reason,
        failedVerifications: input.failedVerifications ?? [],
        blockingFindings: input.blockingFindings ?? [],
      };
      return commitEvaluation(
        "verification-reconciliation-required",
        `${runId}:verification-reconcile:${returned.implementationAttemptId}:${input.idempotencyKey}`,
        result,
        "reconcile",
      );
    }
    if (task.contractStale)
      throw new Error(
        `${task.contract} is stale; route governing-context changes to reconciliation`,
      );
    const context = buildContractContext(evaluated.graph, input.taskId);
    const unsatisfied = a.verifications.filter(
      (value) => context.verifications.includes(value.id) && !value.satisfied,
    );
    const pendingExternalVerifications =
      returned.claim.externalVerifications.filter((requirement) => {
        if (!requirement.verificationId) return true;
        if (!context.verifications.includes(requirement.verificationId))
          return true;
        const verification = evaluated.graph.getEntity(
          requirement.verificationId,
        );
        return (
          verification?.type !== "verification" ||
          !evidenceSatisfaction(evaluated.graph, requirement.verificationId)
            .satisfied
        );
      });
    if (
      task.lifecycle !== "done" ||
      unsatisfied.length ||
      pendingExternalVerifications.length
    )
      throw new Error(
        `Verification is not satisfactory for ${input.taskId}: ${[...(task.lifecycle !== "done" ? ["task lifecycle is not done"] : []), ...unsatisfied.map((value) => `${value.id} is ${value.status}`), ...pendingExternalVerifications.map((requirement) => `external verification pending: ${requirement.verificationId ?? requirement.description}`)].join("; ")}`,
      );
    const result = {
      taskId: input.taskId,
      implementationAttemptId: returned.implementationAttemptId,
      verified: context.verifications,
    };
    return commitEvaluation(
      "implementation-verification-satisfactory",
      `${runId}:verification-satisfactory:${returned.implementationAttemptId}:${input.idempotencyKey}`,
      result,
    );
  }
  interrupt(runId: string, reason: string) {
    const run = this.requireRun(runId);
    for (const attempt of this.#state
      .attempts(runId)
      .filter((a) => a.state === "running"))
      this.#state.finishAttempt(attempt.id, "interrupted", { reason });
    this.#state.event(runId, "run-interrupted", { reason });
    return this.#state.update(runId, run.activity, "interrupted");
  }
  async resume(runId: string) {
    const run = this.requireRun(runId);
    const a = await this.assess(run.featureId);
    const interrupted = this.#state
      .attempts(runId)
      .filter((x) => x.state === "interrupted");
    const classifications = interrupted.map((x) => ({
      attemptId: x.id,
      classification:
        x.repositoryFingerprint === a.fingerprint
          ? "no-write-observed"
          : "repository-changed-reconciliation-required",
    }));
    if (
      classifications.some((x) => x.classification.includes("reconciliation"))
    )
      this.#state.update(runId, "reconcile", "running");
    else this.#state.update(runId, run.activity, "running");
    this.#state.event(runId, "run-resumed", { classifications }, a.fingerprint);
    return {
      run: this.#state.get(runId)!,
      assessment: await this.assess(run.featureId),
      classifications,
    };
  }
  async retry(runId: string, attemptId: string) {
    const run = this.requireRun(runId);
    const attempt = this.#state.attempts(runId).find((a) => a.id === attemptId);
    if (!attempt)
      throw new Error(`Unknown attempt ${attemptId} for run ${runId}`);
    if (attempt.state === "succeeded") return attempt;
    const assessment = await this.assess(run.featureId);
    if (attempt.repositoryFingerprint !== assessment.fingerprint) {
      this.#state.update(runId, "reconcile", "running");
      throw new Error(
        "Repository changed since the interrupted action; reconcile before retrying",
      );
    }
    const retried = this.#state.retryAttempt(attemptId, assessment.fingerprint);
    this.#state.event(
      runId,
      "action-retried",
      { attemptId, actionId: attempt.actionId },
      assessment.fingerprint,
      `${runId}:retry:${attemptId}:${assessment.fingerprint}`,
    );
    return retried;
  }
  cancel(runId: string, reason: string) {
    const run = this.requireRun(runId);
    this.#state.event(runId, "run-cancelled", { reason });
    return this.#state.update(runId, run.activity, "cancelled");
  }
  async reconcile(
    runId: string,
    route: WorkflowReconciliationRoute,
    reason: string,
    targetId?: string,
  ) {
    if (
      ![
        "specify",
        "plan",
        "implement",
        "verify",
        "reconcile",
        "complete",
      ].includes(route)
    )
      throw new Error(
        `Unsupported reconciliation route ${JSON.stringify(route)}`,
      );
    const run = this.requireRun(runId);
    const a = await this.assess(run.featureId);
    const unresolved = a.reconciliation.reasons.filter(
      (item) => item.code !== "governing-context-conflict",
    );
    const implementationPending = [
      ...a.implementation.pendingReturns.map((item) => item.taskId),
      ...a.implementation.retryContexts.map((item) => item.taskId),
      ...this.#state
        .waiting(runId, "implementation")
        .flatMap((item) => (item.targetId ? [item.targetId] : [])),
    ];
    if (
      route === "complete" &&
      (unresolved.length || implementationPending.length)
    )
      throw new Error(
        `Reconciliation has not converged: ${[
          ...unresolved.map((item) => item.message),
          ...[...new Set(implementationPending)].map(
            (taskId) => `${taskId} has pending implementation coordination`,
          ),
        ].join("; ")}`,
      );
    if (run.activity !== "reconcile")
      this.#state.update(runId, "reconcile", "running");
    this.#state.event(
      runId,
      route === "complete"
        ? "reconciliation-complete"
        : "reconciliation-directed",
      { route, reason, targetId },
      a.fingerprint,
    );
    if (route === "complete")
      this.#state.recordBaseline(runId, a.fingerprint, a);
    return this.#state.update(
      runId,
      route === "complete" ? "complete" : route,
      "running",
    );
  }
  async complete(runId: string) {
    let run = this.requireRun(runId);
    let a = await this.assess(run.featureId);
    if (run.activity === "implement" && this.implementationSettled(a, runId)) {
      run = this.#state.update(runId, "verify", "running");
      a = await this.assess(run.featureId);
    }
    if (!a.completionEligible)
      throw new Error("Feature completion is not eligible");
    const built = await buildProjectGraph(this.repoRoot);
    if (
      !built.ok ||
      built.graph.getEntity(run.featureId)?.lifecycle !== "complete"
    )
      throw new Error(
        "Save the Feature lifecycle as complete in its authoritative artifact before completing the run",
      );
    this.#state.event(
      runId,
      "workflow-completed",
      {},
      a.fingerprint,
      `${runId}:complete:${a.fingerprint}`,
    );
    return this.#state.update(runId, "complete", "complete");
  }
  private requireRun(runId: string) {
    const run = this.#state.get(runId);
    if (!run) throw new Error(`Unknown workflow run ${runId}`);
    if (["cancelled", "complete"].includes(run.state))
      throw new Error(`Workflow run ${runId} is terminal`);
    return run;
  }
  close() {
    this.#state.close();
  }
}
