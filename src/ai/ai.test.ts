import { afterEach, expect, test } from "bun:test";
import type { ValidatedCanonicalSkill } from "../skills/types.ts";
import {
  createFixtureRepo,
  removeFixtureRepo,
} from "../test-support/fixture-repo.ts";
import { LengthwiseApplication } from "../application/project-service.ts";
import { evaluateProject } from "../application/project-evaluation.ts";
import { AiApplicationService } from "./application-service.ts";
import { buildProjectGraph } from "../graph/build.ts";
import { renderContractArtifact } from "../workflow/contracts.ts";
import { WorkflowCoordinator } from "../workflow/coordinator.ts";
import { canonicalSkillDigest } from "../skills/digest.ts";
import { verificationContextFingerprint } from "../workflow/projections.ts";
import { WorkflowStateStore } from "../workflow/state-store.ts";

const roots: string[] = [];
afterEach(async () => {
  while (roots.length) await removeFixtureRepo(roots.pop()!);
});

const CONFIG = `
lengthwise: 1
project: { name: AI Boundary Fixture }
artifacts:
  include: ["engineering/**/*.yaml"]
policy: { rigor: standard }
rigor:
  light: { requirements: required, acceptanceCriteria: required, implementationTraceability: basic, verificationCoverage: required, taskPlan: as-needed, materialDecisions: recorded, humanApproval: [specification] }
  standard: { requirements: required, acceptanceCriteria: required, implementationTraceability: required, verificationCoverage: required, taskPlan: required, materialDecisions: recorded, humanApproval: [specification, buildContract] }
  strict: { requirements: required, acceptanceCriteria: required, implementationTraceability: required, verificationCoverage: required, taskPlan: required, materialDecisions: recorded, independentReview: generally-required, humanApproval: [specification, buildContract, verification] }
`;

const MODEL = `
lengthwise: 1
entities:
  - { id: F-AI, type: feature, title: AI boundary, lifecycle: active, significance: M, relationships: [{ type: addresses, to: REQ-AI }, { type: has-question, to: Q-AI }] }
  - { id: REQ-AI, type: requirement, title: Bounded context, statement: AI receives relevant context., lifecycle: accepted, relationships: [{ type: has-acceptance-criterion, to: AC-AI-01 }] }
  - { id: AC-AI-01, type: acceptance-criterion, statement: Unrelated entities are excluded., lifecycle: accepted }
  - { id: VER-AI, type: verification, title: Context verification, method: automated-test, required: true, lifecycle: defined, relationships: [{ type: verifies, to: AC-AI-01 }] }
  - { id: TASK-DEP, type: task, title: Complete dependency, lifecycle: done }
  - { id: TASK-AI, type: task, title: Implement bounded context, lifecycle: planned, relationships: [{ type: implements, to: REQ-AI }, { type: depends-on, to: TASK-DEP }] }
  - { id: PLAN-AI, type: plan, title: AI plan, lifecycle: accepted, relationships: [{ type: contains, to: TASK-AI }] }
  - { id: DR-AI, type: decision, title: Provider neutrality, decision: Do not execute models., authority: LOCKED, lifecycle: accepted, relationships: [{ type: governs, to: TASK-AI }] }
  - { id: Q-AI, type: question, prompt: Is provider execution in scope?, blocking: false, resolution: No., lifecycle: answered, relationships: [{ type: concerns, to: TASK-AI }, { type: resolved-by, to: DR-AI }] }
  - { id: BC-TASK-AI, type: build-contract, title: TASK-AI contract, lifecycle: accepted, fingerprint: historical, locked: [DR-AI], bounded: [REQ-AI, AC-AI-01], delegated: [TASK-AI], relationships: [{ type: contracts, to: TASK-AI }, { type: includes, to: DR-AI }] }
  - { id: DOC-UNRELATED, type: document, title: Unrelated branch, lifecycle: accepted }
`;

const encoder = new TextEncoder();
const skillFiles = [
  { path: "SKILL.md", content: encoder.encode("methodology") },
  { path: "lengthwise.yaml", content: encoder.encode("manifest") },
  { path: "references/binary.dat", content: new Uint8Array([0xff]) },
  { path: "references/claim.md", content: encoder.encode("claim reference") },
];
const skill = {
  id: "implement-build-contract",
  root: "/canonical/implement-build-contract",
  frontmatter: {
    name: "implement-build-contract",
    description: "Implement one accepted Build Contract.",
  },
  methodology:
    "Respect locked decisions and return a structured completion claim.",
  manifest: {
    schemaVersion: 1,
    skillVersion: 1,
    workflowContractVersion: 1,
    bindings: ["implementation-attempt"],
    context: {
      required: [
        "current-workflow-action",
        "task",
        "accepted-build-contract",
        "bounded-project-context",
      ],
      optional: [
        "feature",
        "decision-authority",
        "plan",
        "verification-definitions",
      ],
    },
    outcomes: ["implementation-completion-claim"],
    postChecks: ["project-graph", "readiness"],
    escalations: ["locked-decision-conflict", "stale-build-contract"],
  },
  files: skillFiles,
  canonicalDigest: canonicalSkillDigest(skillFiles),
} as ValidatedCanonicalSkill;

async function services() {
  const root = await createFixtureRepo({
    ".lengthwise/project.yaml": CONFIG,
    "engineering/model.yaml": MODEL,
  });
  roots.push(root);
  const opened = await LengthwiseApplication.open(root);
  if (!opened.ok) throw new Error("AI fixture did not open");
  const evaluated = await evaluateProject(root);
  if (!evaluated.graphAvailable)
    throw new Error("AI fixture graph is unavailable");
  return {
    application: opened.application,
    ai: new AiApplicationService(
      evaluated.graph,
      evaluated.config,
      evaluated.diagnostics,
    ),
  };
}

test("AI context is purpose-bounded, deterministic, and sourced from the same project semantics", async () => {
  const { application: app } = await services();
  const first = app.buildAiContext({
    targetId: "TASK-AI",
    purpose: "implement",
  });
  const second = app.buildAiContext({
    targetId: "TASK-AI",
    purpose: "implement",
  });
  expect(first.ok && second.ok).toBe(true);
  if (!first.ok || !second.ok) return;

  const ids = first.context.entities.map((item) => item.entity.id);
  expect(ids).toEqual(
    expect.arrayContaining([
      "F-AI",
      "REQ-AI",
      "AC-AI-01",
      "VER-AI",
      "TASK-DEP",
      "TASK-AI",
      "PLAN-AI",
      "DR-AI",
      "Q-AI",
      "BC-TASK-AI",
    ]),
  );
  expect(ids).not.toContain("DOC-UNRELATED");
  expect(first.context.selection).toBe("purpose-bounded-deny-by-default");
  expect(first.context.readiness).toMatchObject({ ready: true, blockers: [] });
  expect(first.context.contracts).toEqual([
    expect.objectContaining({ id: "BC-TASK-AI", current: false }),
  ]);
  expect(first.context.fingerprint).toBe(second.context.fingerprint);

  const readiness = app.buildAiContext({
    targetId: "TASK-AI",
    purpose: "explain-readiness",
  });
  expect(readiness.ok).toBe(true);
  if (readiness.ok)
    expect(readiness.context.entities.map((item) => item.entity.id)).toEqual([
      "TASK-AI",
      "TASK-DEP",
    ]);

  const reconciliation = app.buildAiContext({
    targetId: "F-AI",
    purpose: "reconcile",
  });
  expect(reconciliation.ok).toBe(true);
  if (reconciliation.ok) {
    expect(
      reconciliation.context.entities.find(
        (item) => item.entity.id === "TASK-DEP",
      )?.roles,
    ).toContain("dependency");
    expect(reconciliation.context.contracts).toEqual([
      expect.objectContaining({ id: "BC-TASK-AI" }),
    ]);
  }
});

test("AI invocation is a provider-neutral projection and never fabricates required runtime context", async () => {
  const { ai } = await services();
  const workflowContext = {
    "current-workflow-action": {
      runId: "RUN-1",
      actionId: "handoff:TASK-AI",
      fingerprint: "current",
    },
  } as const;
  const first = ai.prepareInvocation({
    targetId: "TASK-AI",
    purpose: "implement",
    semanticAction: "implementation-attempt",
    skill,
    supplementalContext: workflowContext,
  });
  const second = ai.prepareInvocation({
    targetId: "TASK-AI",
    purpose: "implement",
    semanticAction: "implementation-attempt",
    skill,
    supplementalContext: workflowContext,
  });
  expect(first.ok && second.ok).toBe(true);
  if (!first.ok || !second.ok) return;
  expect(first.invocation.id).toBe(second.invocation.id);
  expect(first.invocation.kind).toBe("lengthwise-ai-invocation");
  expect(first.invocation.skill.resources).toEqual([
    { path: "references/binary.dat", encoding: "base64", content: "/w==" },
    {
      path: "references/claim.md",
      encoding: "utf-8",
      content: "claim reference",
    },
  ]);
  expect(first.invocation.contextSlots.task).toEqual([
    expect.objectContaining({ id: "TASK-AI" }),
  ]);
  expect(first.invocation).not.toHaveProperty("provider");
  expect(JSON.parse(JSON.stringify(first.invocation))).toEqual(
    first.invocation,
  );

  const runtimeSkill = {
    ...skill,
    manifest: {
      ...skill.manifest,
      context: {
        required: [...skill.manifest.context.required, "prior-attempt"],
        optional: [],
      },
    },
  } as ValidatedCanonicalSkill;
  const missing = ai.prepareInvocation({
    targetId: "TASK-AI",
    purpose: "implement",
    semanticAction: "implementation-attempt",
    skill: runtimeSkill,
    supplementalContext: workflowContext,
  });
  expect(missing).toEqual({
    ok: false,
    blockers: [
      expect.objectContaining({
        code: "ai-context-slot-missing",
        message: expect.stringContaining("prior-attempt"),
      }),
    ],
  });
  expect(
    ai.prepareInvocation({
      targetId: "TASK-AI",
      purpose: "implement",
      semanticAction: "implementation-attempt",
      skill: runtimeSkill,
      supplementalContext: {
        ...workflowContext,
        "prior-attempt": { id: "ATTEMPT-1", outcome: "retry" },
      },
    }).ok,
  ).toBe(true);

  const forged = ai.prepareInvocation({
    targetId: "TASK-AI",
    purpose: "implement",
    semanticAction: "implementation-attempt",
    skill,
    supplementalContext: { task: [{ id: "TASK-FORGED" }] } as never,
  });
  expect(forged).toEqual({
    ok: false,
    blockers: [
      expect.objectContaining({ code: "ai-context-slot-not-supplemental" }),
    ],
  });

  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  expect(
    ai.prepareInvocation({
      targetId: "TASK-AI",
      purpose: "implement",
      semanticAction: "implementation-attempt",
      skill,
      supplementalContext: { "current-workflow-action": cyclic } as never,
    }),
  ).toEqual({
    ok: false,
    blockers: [expect.objectContaining({ code: "ai-context-slot-invalid" })],
  });
});

test("workflow prepares AI handoff only from the current eligible action", async () => {
  const model = MODEL.split("\n")
    .filter((line) => !line.includes("BC-TASK-AI"))
    .join("\n");
  const root = await createFixtureRepo({
    ".lengthwise/project.yaml": CONFIG,
    "engineering/model.yaml": model,
  });
  roots.push(root);
  const built = await buildProjectGraph(root);
  if (!built.ok) throw new Error("workflow AI fixture did not build");
  await Bun.write(
    `${root}/engineering/contracts.yaml`,
    renderContractArtifact(built.graph, ["TASK-AI"]),
  );

  const workflow = await WorkflowCoordinator.open(root);
  const run = await workflow.start("F-AI");
  let assessment = await workflow.assess("F-AI");
  await workflow.approve(
    run.id,
    "specification",
    assessment.gates.specification.fingerprint,
  );
  assessment = await workflow.assess("F-AI");
  await workflow.approve(
    run.id,
    "build-contract",
    assessment.gates["build-contract"].fingerprint,
  );
  assessment = await workflow.assess("F-AI");
  expect(
    assessment.actions.find((action) => action.id === "handoff:TASK-AI")?.ai,
  ).toBeUndefined();

  const handedOff = await workflow.handoff(run.id, "TASK-AI", "handoff");
  assessment = await workflow.assess("F-AI");
  expect(
    assessment.actions.find((action) => action.id === "return:TASK-AI")?.ai,
  ).toEqual({
    skillId: "implement-build-contract",
    semanticAction: "implementation-attempt",
    contextPurpose: "implement",
    targetId: "TASK-AI",
  });

  const prepared = await workflow.prepareAiInvocation(run.id, "return:TASK-AI");
  expect(prepared.ok).toBe(true);
  if (prepared.ok) {
    expect(prepared.invocation.contextSlots["current-workflow-action"]).toEqual(
      expect.objectContaining({
        runId: run.id,
        actionId: "return:TASK-AI",
        targetId: "TASK-AI",
        implementationAttemptId: (
          handedOff.result as { implementationAttemptId: string }
        ).implementationAttemptId,
      }),
    );
    expect(prepared.invocation.contextSlots["prior-attempt"]).toEqual(
      expect.objectContaining({
        id: (handedOff.result as { implementationAttemptId: string })
          .implementationAttemptId,
        returned: false,
      }),
    );
  }

  await workflow.returnImplementation(
    run.id,
    "TASK-AI",
    {
      summary: "Implemented with one known defect",
      changedFiles: ["src/first-attempt.ts"],
    },
    "return",
  );
  const reviewPrepared = await workflow.prepareAiInvocation(
    run.id,
    "review-return:TASK-AI",
  );
  expect(reviewPrepared.ok).toBe(true);
  if (reviewPrepared.ok) {
    expect(
      reviewPrepared.invocation.contextSlots["current-workflow-action"],
    ).toEqual(
      expect.objectContaining({
        implementationAttemptId: (
          handedOff.result as { implementationAttemptId: string }
        ).implementationAttemptId,
      }),
    );
    expect(
      reviewPrepared.invocation.contextSlots["implementation-completion-claim"],
    ).toEqual(
      expect.objectContaining({
        taskId: "TASK-AI",
        changedFiles: ["src/first-attempt.ts"],
      }),
    );
    expect(reviewPrepared.invocation.contextSlots.evidence).toEqual([]);
  }
  await workflow.evaluateImplementationReturn(run.id, {
    taskId: "TASK-AI",
    outcome: "retry-implementation",
    failedVerifications: ["VER-AI"],
    blockingFindings: ["Required behavior is absent"],
    idempotencyKey: "retry-route",
  });
  const retried = await workflow.handoff(run.id, "TASK-AI", "retry-handoff");
  const retryPrepared = await workflow.prepareAiInvocation(
    run.id,
    "return:TASK-AI",
  );
  expect(retryPrepared.ok).toBe(true);
  if (retryPrepared.ok) {
    expect(
      retryPrepared.invocation.contextSlots["current-workflow-action"],
    ).toEqual(
      expect.objectContaining({
        implementationAttemptId: (
          retried.result as { implementationAttemptId: string }
        ).implementationAttemptId,
      }),
    );
    expect(retryPrepared.invocation.contextSlots["prior-attempt"]).toEqual(
      expect.objectContaining({
        id: (handedOff.result as { implementationAttemptId: string })
          .implementationAttemptId,
        claim: expect.objectContaining({
          changedFiles: ["src/first-attempt.ts"],
        }),
      }),
    );
    expect(retryPrepared.invocation.contextSlots["verification-retry"]).toEqual(
      expect.objectContaining({
        implementationAttemptId: (
          handedOff.result as { implementationAttemptId: string }
        ).implementationAttemptId,
      }),
    );
  }
  await workflow.returnImplementation(
    run.id,
    "TASK-AI",
    { summary: "Retry returned" },
    "retry-return",
  );
  expect(await workflow.prepareAiInvocation(run.id, "return:TASK-AI")).toEqual({
    ok: false,
    blockers: [
      expect.objectContaining({
        code: "workflow-action-not-found",
        entityId: "F-AI",
      }),
    ],
  });
  workflow.close();
});

test("blocking Questions select clarification methodology with Question context", async () => {
  const model = MODEL.replace(
    "blocking: false, resolution: No., lifecycle: answered, relationships: [{ type: concerns, to: TASK-AI }, { type: resolved-by, to: DR-AI }]",
    "blocking: true, lifecycle: open, relationships: [{ type: concerns, to: TASK-AI }]",
  );
  const root = await createFixtureRepo({
    ".lengthwise/project.yaml": CONFIG,
    "engineering/model.yaml": model,
  });
  roots.push(root);
  const workflow = await WorkflowCoordinator.open(root);
  const run = await workflow.start("F-AI");
  const assessment = await workflow.assess("F-AI");
  expect(
    assessment.actions.find((action) => action.id === "repair-specification")
      ?.ai,
  ).toEqual({
    skillId: "clarify-feature",
    semanticAction: "clarify-feature",
    contextPurpose: "clarify",
    targetId: "F-AI",
  });
  const prepared = await workflow.prepareAiInvocation(
    run.id,
    "repair-specification",
  );
  expect(prepared.ok).toBe(true);
  if (prepared.ok) {
    expect(prepared.invocation.skill.id).toBe("clarify-feature");
    expect(prepared.invocation.contextSlots.questions).toEqual([
      expect.objectContaining({ id: "Q-AI" }),
    ]);
  }
  workflow.close();
});

test("reconciliation invocation retains the triggering route and completion claim", async () => {
  const model = MODEL.split("\n")
    .filter((line) => !line.includes("BC-TASK-AI"))
    .join("\n");
  const root = await createFixtureRepo({
    ".lengthwise/project.yaml": CONFIG,
    "engineering/model.yaml": model,
  });
  roots.push(root);
  const built = await buildProjectGraph(root);
  if (!built.ok) throw new Error("reconciliation AI fixture did not build");
  await Bun.write(
    `${root}/engineering/contracts.yaml`,
    renderContractArtifact(built.graph, ["TASK-AI"]),
  );
  const workflow = await WorkflowCoordinator.open(root);
  const run = await workflow.start("F-AI");
  let assessment = await workflow.assess("F-AI");
  await workflow.approve(
    run.id,
    "specification",
    assessment.gates.specification.fingerprint,
  );
  assessment = await workflow.assess("F-AI");
  await workflow.approve(
    run.id,
    "build-contract",
    assessment.gates["build-contract"].fingerprint,
  );
  const handedOff = await workflow.handoff(run.id, "TASK-AI", "handoff");
  await workflow.returnImplementation(
    run.id,
    "TASK-AI",
    {
      summary: "The contract conflicts with discovered platform behavior",
      changedFiles: ["src/platform.ts"],
    },
    "return",
  );
  await workflow.evaluateImplementationReturn(run.id, {
    taskId: "TASK-AI",
    outcome: "reconcile",
    reason: "The accepted criterion conflicts with the platform constraint",
    idempotencyKey: "reconcile-route",
  });
  const prepared = await workflow.prepareAiInvocation(run.id, "reconcile");
  expect(prepared.ok).toBe(true);
  if (prepared.ok) {
    const attemptId = (handedOff.result as { implementationAttemptId: string })
      .implementationAttemptId;
    expect(prepared.invocation.contextSlots["current-workflow-action"]).toEqual(
      expect.objectContaining({
        blockers: [
          expect.objectContaining({
            code: "governing-context-conflict",
            message:
              "The accepted criterion conflicts with the platform constraint",
          }),
        ],
        reconciliationRoutes: [
          expect.objectContaining({
            taskId: "TASK-AI",
            implementationAttemptId: attemptId,
            reason:
              "The accepted criterion conflicts with the platform constraint",
          }),
        ],
      }),
    );
    expect(prepared.invocation.contextSlots["prior-attempt"]).toEqual([
      expect.objectContaining({
        id: attemptId,
        taskId: "TASK-AI",
        returned: true,
      }),
    ]);
    expect(
      prepared.invocation.contextSlots["implementation-completion-claim"],
    ).toEqual([
      expect.objectContaining({
        taskId: "TASK-AI",
        changedFiles: ["src/platform.ts"],
      }),
    ]);
  }
  workflow.close();
});

test("feature reconciliation aggregates every active operational return conflict", async () => {
  const model = MODEL.split("\n")
    .filter((line) => !line.includes("BC-TASK-AI"))
    .join("\n")
    .replace(
      "  - { id: PLAN-AI, type: plan, title: AI plan, lifecycle: accepted, relationships: [{ type: contains, to: TASK-AI }] }",
      "  - { id: TASK-AI-02, type: task, title: Implement second branch, lifecycle: planned, relationships: [{ type: implements, to: REQ-AI }] }\n  - { id: PLAN-AI, type: plan, title: AI plan, lifecycle: accepted, relationships: [{ type: contains, to: TASK-AI }, { type: contains, to: TASK-AI-02 }] }",
    );
  const root = await createFixtureRepo({
    ".lengthwise/project.yaml": CONFIG,
    "engineering/model.yaml": model,
  });
  roots.push(root);
  const built = await buildProjectGraph(root);
  if (!built.ok)
    throw new Error("multi-return reconciliation fixture did not build");
  await Bun.write(
    `${root}/engineering/contracts.yaml`,
    renderContractArtifact(built.graph, ["TASK-AI", "TASK-AI-02"]),
  );
  const workflow = await WorkflowCoordinator.open(root);
  const run = await workflow.start("F-AI");
  let assessment = await workflow.assess("F-AI");
  await workflow.approve(
    run.id,
    "specification",
    assessment.gates.specification.fingerprint,
  );
  assessment = await workflow.assess("F-AI");
  await workflow.approve(
    run.id,
    "build-contract",
    assessment.gates["build-contract"].fingerprint,
  );
  const first = await workflow.handoff(run.id, "TASK-AI", "handoff-one");
  const second = await workflow.handoff(run.id, "TASK-AI-02", "handoff-two");
  await workflow.returnImplementation(
    run.id,
    "TASK-AI",
    { summary: "First conflict", changedFiles: ["src/one.ts"] },
    "return-one",
  );
  await workflow.returnImplementation(
    run.id,
    "TASK-AI-02",
    { summary: "Second conflict", changedFiles: ["src/two.ts"] },
    "return-two",
  );
  const firstAttemptId = (first.result as { implementationAttemptId: string })
    .implementationAttemptId;
  const secondAttemptId = (second.result as { implementationAttemptId: string })
    .implementationAttemptId;
  const state = new WorkflowStateStore(`${root}/.lengthwise/state.db`);
  state.event(run.id, "verification-reconciliation-required", {
    taskId: "TASK-AI",
    implementationAttemptId: firstAttemptId,
    reason: "First governing conflict",
  });
  state.event(run.id, "verification-reconciliation-required", {
    taskId: "TASK-AI-02",
    implementationAttemptId: secondAttemptId,
    reason: "Second governing conflict",
  });
  state.update(run.id, "reconcile", "running");
  state.close();
  const prepared = await workflow.prepareAiInvocation(run.id, "reconcile");
  expect(prepared.ok).toBe(true);
  if (prepared.ok) {
    const action = prepared.invocation.contextSlots[
      "current-workflow-action"
    ] as {
      reconciliationRoutes: Array<{ taskId: string }>;
    };
    expect(action.reconciliationRoutes.map((route) => route.taskId)).toEqual([
      "TASK-AI",
      "TASK-AI-02",
    ]);
    expect(
      (
        prepared.invocation.contextSlots["prior-attempt"] as Array<{
          id: string;
        }>
      ).map((attempt) => attempt.id),
    ).toEqual([firstAttemptId, secondAttemptId]);
    expect(
      (
        prepared.invocation.contextSlots[
          "implementation-completion-claim"
        ] as Array<{ taskId: string }>
      ).map((claim) => claim.taskId),
    ).toEqual(["TASK-AI", "TASK-AI-02"]);
  }
  workflow.close();
});

test("final verification invocation covers every required Verification branch", async () => {
  const model = MODEL.split("\n")
    .filter((line) => !line.includes("BC-TASK-AI"))
    .join("\n")
    .replace(
      "relationships: [{ type: has-acceptance-criterion, to: AC-AI-01 }]",
      "relationships: [{ type: has-acceptance-criterion, to: AC-AI-01 }, { type: has-acceptance-criterion, to: AC-AI-02 }]",
    )
    .replace(
      "  - { id: AC-AI-01, type: acceptance-criterion, statement: Unrelated entities are excluded., lifecycle: accepted }",
      "  - { id: AC-AI-01, type: acceptance-criterion, statement: Unrelated entities are excluded., lifecycle: accepted }\n  - { id: AC-AI-02, type: acceptance-criterion, statement: All verification branches are reviewed., lifecycle: accepted }",
    )
    .replace(
      "  - { id: VER-AI, type: verification, title: Context verification, method: automated-test, required: true, lifecycle: defined, relationships: [{ type: verifies, to: AC-AI-01 }] }",
      "  - { id: VER-AI, type: verification, title: Context verification, method: automated-test, required: true, lifecycle: defined, relationships: [{ type: verifies, to: AC-AI-01 }] }\n  - { id: VER-AI-02, type: verification, title: Branch verification, method: review, required: true, lifecycle: defined, relationships: [{ type: verifies, to: AC-AI-02 }] }",
    )
    .replace(
      "TASK-AI, type: task, title: Implement bounded context, lifecycle: planned",
      "TASK-AI, type: task, title: Implement bounded context, lifecycle: done",
    );
  const root = await createFixtureRepo({
    ".lengthwise/project.yaml": CONFIG.replace(
      "policy: { rigor: standard }",
      "policy: { rigor: strict }",
    ),
    "engineering/model.yaml": model,
  });
  roots.push(root);
  let built = await buildProjectGraph(root);
  if (!built.ok) throw new Error("verification AI fixture did not build");
  await Bun.write(
    `${root}/engineering/contracts.yaml`,
    renderContractArtifact(built.graph, ["TASK-AI"]),
  );
  built = await buildProjectGraph(root);
  if (!built.ok)
    throw new Error("verification AI contract fixture did not build");
  const firstFingerprint = verificationContextFingerprint(
    built.graph,
    "VER-AI",
  );
  const secondFingerprint = verificationContextFingerprint(
    built.graph,
    "VER-AI-02",
  );
  await Bun.write(
    `${root}/engineering/evidence.yaml`,
    `lengthwise: 1
entities:
  - { id: E-AI-01, type: evidence, title: Context result, lifecycle: recorded, outcome: passed, result: Passed, applicability: current, contextFingerprint: ${firstFingerprint}, relationships: [{ type: supports, to: VER-AI }] }
  - { id: E-AI-02, type: evidence, title: Branch result, lifecycle: recorded, outcome: passed, result: Passed, applicability: current, contextFingerprint: ${secondFingerprint}, relationships: [{ type: supports, to: VER-AI-02 }] }
`,
  );
  const workflow = await WorkflowCoordinator.open(root);
  const run = await workflow.start("F-AI");
  let assessment = await workflow.assess("F-AI");
  await workflow.approve(
    run.id,
    "specification",
    assessment.gates.specification.fingerprint,
  );
  assessment = await workflow.assess("F-AI");
  await workflow.approve(
    run.id,
    "build-contract",
    assessment.gates["build-contract"].fingerprint,
  );
  assessment = await workflow.assess("F-AI");
  expect(
    assessment.actions.find((action) => action.id === "review-verification")
      ?.target.entityId,
  ).toBe("F-AI");
  const prepared = await workflow.prepareAiInvocation(
    run.id,
    "review-verification",
  );
  expect(prepared.ok).toBe(true);
  if (prepared.ok) {
    expect(
      (
        prepared.invocation.contextSlots["verification-definitions"] as Array<{
          id: string;
        }>
      ).map((item) => item.id),
    ).toEqual(["VER-AI", "VER-AI-02"]);
    expect(
      (prepared.invocation.contextSlots.evidence as Array<{ id: string }>).map(
        (item) => item.id,
      ),
    ).toEqual(["E-AI-01", "E-AI-02"]);
  }
  workflow.close();
});
