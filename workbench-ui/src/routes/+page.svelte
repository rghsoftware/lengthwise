<script lang="ts">
  import { onMount } from "svelte";
  import CodeEditor from "$lib/CodeEditor.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Badge from "$lib/ui/Badge.svelte";
  import Hint from "$lib/ui/Hint.svelte";
  import "../app.css";

  type Summary = { id: string; type: string; lifecycle: string; label: string; source: { artifactPath: string; line?: number } };
  type Diagnostic = { code: string; severity: string; message: string; entityId?: string; location?: { artifactPath: string; line?: number } };
  type Detail = { entity: Summary & Record<string, unknown>; label: string; authoredProperties: Record<string, unknown>; derivedState: Record<string, unknown>; relationships: Array<{ direction: string; type: string; label: string; provenance: string; counterpart: Summary | { id: string; missing: true } }> };
  type Artifact = { path: string; language: "markdown" | "yaml"; content: string; version: string };
  type Snapshot = { revision: number; repositoryValid: boolean; retainedGraph: boolean; entities: Summary[]; diagnostics: Diagnostic[]; changes: Array<Record<string, unknown> & { kind: string }> };
  type Blocker={code:string;message:string;entityId?:string;artifactPath?:string};
  type WorkflowAction={id:string;kind:string;label:string;eligible:boolean;requiredInputs:string[];expectedOutputs:string[];target:{entityId?:string;artifactPath?:string};blockers:Blocker[]};
  type Gate={gate:"specification"|"build-contract"|"verification";required:boolean;eligible:boolean;approved:boolean;fingerprint:string;blockers:Blocker[]};
  type WorkflowAssessment = { featureId:string; repositoryValid:boolean; blockingQuestions:string[]; tasks:Array<{id:string;lifecycle:string;contract?:string;contractArtifactPath?:string;contractStale?:boolean;changedInputs:Blocker[]}>;verifications:Array<{id:string;satisfied:boolean;status:string;artifactPath:string}>;gates:Record<string,Gate>;actions:WorkflowAction[];governingChanges:Array<{contractId:string;inputs:Array<{id:string;reason:string}>}>;reconciliation:{required:boolean;reasons:Blocker[]}; specificationEligible:boolean; buildContractEligible:boolean; completionEligible:boolean; fingerprint:string };
  type WorkflowRun = { id:string; featureId:string; activity:string; state:string };

  class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) { super(message); this.code = code; }
  }

  let snapshot: Snapshot | undefined;
  let entities: Summary[] = [];
  let detail: Detail | undefined;
  let artifact: Artifact | undefined;
  let editorValue = "";
  let query = "";
  let type = "feature";
  let browsingAllEntities = false;
  let navigationCollapsed = false;
  let loading = true;
  let saving = false;
  let error = "";
  let notice = "";
  let conflictPath = "";
  let editorTarget: { line: number; revision: number } | undefined;
  let workflow: WorkflowAssessment | undefined;
  let workflowRun: WorkflowRun | undefined;
  let workflowRunHistorical = false;
  let activeWorkflowRuns: WorkflowRun[] = [];
  let lifecycleOptions: string[] = [];
  let lifecycleValue = "";
  let updatingLifecycle = false;
  let gateReview: {gate:Gate;action?:WorkflowAction} | undefined;
  let preparedGateReview: {gate:Gate;action?:WorkflowAction;artifactPath?:string} | undefined;
  let handoffReview: {action:WorkflowAction;taskId:string;contractId?:string} | undefined;
  let returnReview: {action:WorkflowAction;taskId:string} | undefined;
  let returnClaim = "";
  let authorGuidance: WorkflowAction | undefined;
  let pinnedGuidance: WorkflowAction | undefined;
  let approvingGate = false;
  let recordingHandoff = false;
  let recordingReturn = false;
  let findingsOpen = false;
  $: dirty = Boolean(artifact && editorValue !== artifact.content);
  $: types = [...new Set((snapshot?.entities ?? []).map((entity) => entity.type))].sort();
  $: blockingFindings = snapshot?.diagnostics.filter((finding) => finding.severity === "error") ?? [];
  $: selectedFindings = detail ? findingsForEntity(detail.entity as Summary) : [];
  $: currentGate = workflow ? gateForActivity(workflowRun?.activity, workflow) : undefined;
  $: pendingGate = workflow ? Object.values(workflow.gates).find((gate) => gate.required && !gate.approved) : undefined;
  $: focusBlocker = workflow ? (workflowRun?.activity === "reconcile" ? workflow.reconciliation.reasons[0] : currentGate?.blockers[0]) : undefined;
  $: lifecycleRunConflict = currentGate?.blockers.find((blocker) => blocker.code === "lifecycle-run-conflict");
  $: primaryAction = workflow?.actions.find((action) => action.eligible);
  $: primaryAddressesFocus = Boolean(focusBlocker?.entityId && primaryAction?.target.entityId === focusBlocker.entityId);
  $: unsatisfiedVerifications = workflow?.verifications.filter((verification) => !verification.satisfied) ?? [];
  $: satisfiedVerificationCount = (workflow?.verifications.length ?? 0) - unsatisfiedVerifications.length;

  function gateForActivity(activity: string | undefined, assessment: WorkflowAssessment): Gate {
    if (activity === "specify" || activity === "capture") return assessment.gates.specification;
    if (activity === "plan" || activity === "implement") return assessment.gates["build-contract"];
    return assessment.gates.verification;
  }

  function gateName(gate: Gate): string {
    return gate.gate === "build-contract" ? "Build Contract approval" : `${gate.gate[0].toUpperCase()}${gate.gate.slice(1)} approval`;
  }

  function findingsForEntity(entity: Summary): Diagnostic[] {
    return snapshot?.diagnostics.filter((finding) =>
      finding.entityId === entity.id || finding.location?.artifactPath === entity.source.artifactPath
    ) ?? [];
  }

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, init);
    const body = await response.json();
    if (!response.ok || !body.ok) {
      throw new ApiError(body.error?.code ?? "request-failed", body.error?.message ?? `Request failed (${response.status})`);
    }
    return body;
  }

  async function refreshSnapshot() {
    const body = await api<{ snapshot: Snapshot }>("/api/snapshot");
    snapshot = body.snapshot;
    await Promise.all([search(), refreshActiveWorkflows()]);
  }

  async function refreshActiveWorkflows() {
    const body = await api<{ runs: WorkflowRun[] }>("/api/workflows");
    activeWorkflowRuns = body.runs;
  }

  async function search() {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (type) params.set("type", type);
    const body = await api<{ entities: Summary[] }>(`/api/entities?${params}`);
    entities = body.entities;
  }

  async function setEntityBrowser(showAll: boolean) {
    browsingAllEntities = showAll;
    query = "";
    type = showAll ? "" : "feature";
    await search();
  }

  function mayDiscard(): boolean {
    return !dirty || confirm("Discard unsaved changes to this artifact?");
  }

  async function loadArtifact(path: string, line?: number, allowDiscard = false) {
    if (!allowDiscard && !mayDiscard()) return false;
    const sourceBody = await api<{ artifact: Artifact }>(`/api/artifact?path=${encodeURIComponent(path)}`);
    artifact = sourceBody.artifact;
    editorValue = artifact.content;
    conflictPath = "";
    if (line) editorTarget = { line, revision: (editorTarget?.revision ?? 0) + 1 };
    return true;
  }

  async function selectEntity(id: string, push = true, line?: number) {
    if (detail?.entity.id === id) {
      const source = detail.entity.source as Summary["source"];
      if (artifact?.path !== source.artifactPath) {
        await loadArtifact(source.artifactPath, line ?? source.line);
      } else if (line ?? source.line) {
        editorTarget = { line:line ?? source.line!, revision: (editorTarget?.revision ?? 0) + 1 };
      }
      notice = `Opened responsible source: ${source.artifactPath}${line ?? source.line ? `:${line ?? source.line}` : ""}`;
      return;
    }
    if (!mayDiscard()) return;
    error = "";
    notice = "";
    gateReview=undefined;
    preparedGateReview=undefined;
    handoffReview=undefined;
    returnReview=undefined;
    authorGuidance=undefined;
    const body = await api<{ entity: Detail;lifecycleOptions:string[] }>(`/api/entities/${encodeURIComponent(id)}`);
    detail = body.entity;
    lifecycleOptions=body.lifecycleOptions;lifecycleValue=String(detail.entity.lifecycle);
    workflow = undefined; workflowRun = undefined;workflowRunHistorical=false;
    if (detail.entity.type === "feature") {
      const workflowBody = await api<{assessment:WorkflowAssessment;run?:WorkflowRun;runHistorical?:boolean}>(`/api/workflow/${encodeURIComponent(id)}`);
      workflow = workflowBody.assessment; workflowRun = workflowBody.run;workflowRunHistorical=Boolean(workflowBody.runHistorical);
    }
    const source = detail.entity.source as Summary["source"];
    await loadArtifact(source.artifactPath, line ?? source.line, true);
    if (push) history.pushState({ entity: id }, "", `?entity=${encodeURIComponent(id)}`);
  }

  async function startWorkflow() {
    if (!detail || detail.entity.type !== "feature") return;
    const body = await api<{run:WorkflowRun;assessment:WorkflowAssessment}>("/api/workflow", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({featureId:detail.entity.id})});
    workflowRun=body.run; workflow=body.assessment;workflowRunHistorical=false; notice=`Workflow started for ${detail.entity.id}.`;
    await refreshActiveWorkflows();
  }

  async function refreshWorkflow(){if(!detail||detail.entity.type!=="feature")return;const body=await api<{assessment:WorkflowAssessment;run?:WorkflowRun;runHistorical?:boolean}>(`/api/workflow/${encodeURIComponent(detail.entity.id)}`);workflow=body.assessment;workflowRun=body.run;workflowRunHistorical=Boolean(body.runHistorical);if(preparedGateReview&&body.assessment.gates[preparedGateReview.gate.gate]?.fingerprint!==preparedGateReview.gate.fingerprint)preparedGateReview=undefined;await refreshActiveWorkflows();}
  async function approveGate(gate:Gate):Promise<boolean>{if(!workflowRun)return false;try{await api("/api/workflow/gate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({runId:workflowRun.id,gate:gate.gate,fingerprint:gate.fingerprint})});await refreshWorkflow();notice=`${gate.gate} gate approved against the reviewed repository state.`;return true;}catch(cause){error=(cause as Error).message;return false;}}
  async function openWorkflowTarget(action:WorkflowAction){if(action.target.entityId&&snapshot?.entities.some(e=>e.id===action.target.entityId))await selectEntity(action.target.entityId);else if(action.target.artifactPath&&await loadArtifact(action.target.artifactPath)){notice=`Opened responsible source: ${action.target.artifactPath}`;}}
  function hasNavigableTarget(action:WorkflowAction):boolean{return Boolean(action.target.entityId&&snapshot?.entities.some(entity=>entity.id===action.target.entityId));}
  function targetHref(action:WorkflowAction):string{return `?entity=${encodeURIComponent(action.target.entityId??"")}`;}
  async function followActionTarget(event:MouseEvent,action:WorkflowAction){event.preventDefault();if(action.target.entityId)await selectEntity(action.target.entityId);}
  function actionDisplayLabel(action:WorkflowAction):string{const suffix=action.target.entityId?` for ${action.target.entityId}`:"";return suffix&&action.label.endsWith(suffix)?action.label.slice(0,-suffix.length):action.label;}
  function authoringInstruction(action:WorkflowAction):string{if(action.id.startsWith("record-evidence:"))return `Add or update an Evidence entity in ${action.target.artifactPath??"the responsible artifact"}. It must support ${action.target.entityId}, describe the observed result and outcome, cite its source, and state why it applies to the current verification context.`;if(action.id.startsWith("author-contract:"))return `Create or update the Build Contract in ${action.target.artifactPath??"the responsible artifact"} from the current accepted specification, task dependencies, verification obligations, and decision-authority metadata.`;return `Update ${action.target.artifactPath??action.target.entityId??"the responsible artifact"} so the current repository satisfies this workflow action.`;}
  function gateForAction(action:WorkflowAction):Gate|undefined{if(action.id==="review-specification")return workflow?.gates.specification;if(action.id==="review-build-contract")return workflow?.gates["build-contract"];if(action.id==="review-verification")return workflow?.gates.verification;}
  function actionVerb(action:WorkflowAction,prepared?:typeof preparedGateReview):string{const gate=gateForAction(action);return gate?(prepared?.gate.fingerprint===gate.fingerprint?"Continue":"Review"):action.kind==="handoff"?"Hand off":action.kind==="implementation-return"?"Record return":action.id==="complete-feature"?"Complete":action.kind==="author"?"Guide":"Open";}
  function beginGateReview(gate:Gate,action?:WorkflowAction){gateReview={gate,action};}
  async function prepareGateReview(gate:Gate,action?:WorkflowAction){if(preparedGateReview?.gate.fingerprint===gate.fingerprint&&(!preparedGateReview.artifactPath||artifact?.path===preparedGateReview.artifactPath)){beginGateReview(gate,action);return;}const artifactPath=action?.target.artifactPath;if(artifactPath&&!await loadArtifact(artifactPath))return;preparedGateReview={gate,action,artifactPath};gateReview=undefined;notice=artifactPath?`Reviewing ${artifactPath}. Use Continue when you are ready to make the approval decision.`:"Review the current context, then use Continue when you are ready to make the approval decision.";}
  async function confirmGateApproval(){if(!gateReview||approvingGate)return;approvingGate=true;const approved=await approveGate(gateReview.gate);if(approved){gateReview=undefined;preparedGateReview=undefined;}approvingGate=false;}
  function beginHandoff(action:WorkflowAction){const taskId=action.id.slice("handoff:".length);handoffReview={action,taskId,contractId:action.target.entityId};}
  async function confirmHandoff(){if(!handoffReview||!workflowRun||recordingHandoff)return;recordingHandoff=true;error="";try{await api("/api/workflow/action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({runId:workflowRun.id,action:"handoff",taskId:handoffReview.taskId,idempotencyKey:crypto.randomUUID()})});const taskId=handoffReview.taskId;handoffReview=undefined;await refreshWorkflow();notice=`${taskId} is recorded as handed off. Lengthwise is now waiting for its implementation return.`;}catch(cause){error=(cause as Error).message;}finally{recordingHandoff=false;}}
  function beginReturn(action:WorkflowAction){returnClaim="";returnReview={action,taskId:action.id.slice("return:".length)};}
  async function confirmReturn(){if(!returnReview||!workflowRun||recordingReturn||!returnClaim.trim())return;recordingReturn=true;error="";try{await api("/api/workflow/action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({runId:workflowRun.id,action:"return",taskId:returnReview.taskId,claim:returnClaim.trim(),idempotencyKey:crypto.randomUUID()})});const taskId=returnReview.taskId;returnReview=undefined;returnClaim="";await refreshWorkflow();notice=`Implementation return recorded for ${taskId}.`;}catch(cause){error=(cause as Error).message;}finally{recordingReturn=false;}}
  function approvalDestination(gate:Gate):string{return gate.gate==="specification"?"planning":gate.gate==="build-contract"?"implementation":"reconciliation";}
  async function performWorkflowAction(action:WorkflowAction){const gate=gateForAction(action);if(gate){await prepareGateReview(gate,action);return;}if(action.kind==="handoff"){beginHandoff(action);return;}if(action.kind==="implementation-return"){beginReturn(action);return;}if(action.id==="reopen-feature"){lifecycleValue="active";await updateLifecycle();return;}if(action.id==="cancel-stale-run"&&workflowRun){await api("/api/workflow/action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({runId:workflowRun.id,action:"cancel",reason:"Feature remains authoritatively complete"})});await refreshWorkflow();notice=`${workflow?.featureId??"Feature"} remains complete; the stale workflow run was closed.`;return;}if(action.id==="complete-feature"&&workflowRun){if(detail?.entity.lifecycle!=="complete"){lifecycleValue="complete";await updateLifecycle();}else{await api("/api/workflow/action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({runId:workflowRun.id,action:"complete"})});await refreshWorkflow();}notice=`${workflow?.featureId??"Feature"} workflow completed.`;return;}if(action.kind==="author"){authorGuidance=action;return;}await openWorkflowTarget(action);}
  async function openGuidedEditor(){if(!authorGuidance)return;const action=authorGuidance;pinnedGuidance=action;authorGuidance=undefined;await openWorkflowTarget(action);notice=`Opened ${action.target.entityId??action.target.artifactPath??"the responsible artifact"}. The guidance is pinned above the editor; save when the action is complete.`;}

  async function updateLifecycle(){if(!detail||updatingLifecycle||lifecycleValue===detail.entity.lifecycle)return;if(dirty){error="Save or discard the current editor changes before changing lifecycle.";return;}const source=detail.entity.source as Summary["source"];if(artifact?.path!==source.artifactPath&&!await loadArtifact(source.artifactPath,source.line))return;if(!artifact)return;updatingLifecycle=true;error="";try{const body=await api<{artifact:Artifact;snapshot:Snapshot;entity:Detail}>(`/api/entities/${encodeURIComponent(detail.entity.id)}/lifecycle`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({lifecycle:lifecycleValue,expectedVersion:artifact.version})});artifact=body.artifact;editorValue=body.artifact.content;snapshot=body.snapshot;detail=body.entity;notice=`${detail.entity.id} lifecycle changed to ${lifecycleValue}.`;await search();if(detail.entity.type==="feature")await refreshWorkflow();}catch(cause){error=(cause as Error).message;lifecycleValue=String(detail.entity.lifecycle);}finally{updatingLifecycle=false;}}

  async function save() {
    if (!artifact || !dirty || saving) return;
    saving = true;
    error = "";
    conflictPath = "";
    notice = "Saving artifact and rebuilding the Project Graph…";
    try {
      const body = await api<{ artifact: Artifact; snapshot: Snapshot }>("/api/artifact", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: artifact.path, content: editorValue, expectedVersion: artifact.version }),
      });
      artifact = body.artifact;
      editorValue = artifact.content;
      snapshot = body.snapshot;
      notice = snapshot.retainedGraph
        ? "Saved, but the repository cannot currently produce a Project Graph. Navigation is using the last successfully built graph."
        : snapshot.repositoryValid
          ? "Saved. Project Graph rebuilt and checks passed."
          : "Saved. Project Graph rebuilt, but checks found blocking findings.";
      await search();
      if (detail) {
        const currentId = detail.entity.id;
        const current = await fetch(`/api/entities/${encodeURIComponent(currentId)}`);
        if (current.ok) {const currentBody=await current.json();detail=currentBody.entity;lifecycleOptions=currentBody.lifecycleOptions;lifecycleValue=String(detail?.entity.lifecycle??"");}
        if(detail?.entity.type==="feature")await refreshWorkflow();
      }
    } catch (cause) {
      error = (cause as Error).message;
      if (cause instanceof ApiError && cause.code === "conflict") conflictPath = artifact.path;
      notice = "";
    } finally {
      saving = false;
    }
  }

  async function reloadConflict() {
    if (!conflictPath || !confirm(`Replace the unsaved editor buffer with the current repository version of ${conflictPath}?`)) return;
    try {
      await loadArtifact(conflictPath, undefined, true);
      error = "";
      notice = `Reloaded the current repository version of ${conflictPath}.`;
    } catch (cause) {
      error = (cause as Error).message;
    }
  }

  async function openFinding(finding: Diagnostic) {
    try {
      if (finding.entityId) {
        await selectEntity(finding.entityId, true, finding.location?.line);
      } else if (finding.location && await loadArtifact(finding.location.artifactPath, finding.location.line)) {
        notice = `Opened responsible source: ${finding.location.artifactPath}${finding.location.line ? `:${finding.location.line}` : ""}`;
      }
    } catch (cause) {
      error = (cause as Error).message;
    }
  }

  onMount(async () => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    const popState = () => {
      const id = new URL(location.href).searchParams.get("entity");
      if (id) selectEntity(id, false);
    };
    addEventListener("beforeunload", beforeUnload);
    addEventListener("popstate", popState);
    try {
      await refreshSnapshot();
      const id = new URL(location.href).searchParams.get("entity");
      if (id) await selectEntity(id, false);
    } catch (cause) {
      error = (cause as Error).message;
    } finally {
      loading = false;
    }
    return () => { removeEventListener("beforeunload", beforeUnload); removeEventListener("popstate", popState); };
  });
</script>

<svelte:head><title>Lengthwise Workbench</title></svelte:head>

<header>
  <div><strong>Lengthwise</strong><span>Minimal Workbench</span></div>
  <div class="state">
    {#if dirty}<Badge tone="warning">Unsaved</Badge>{:else}<Badge tone="good">Saved</Badge>{/if}
    {#if snapshot?.retainedGraph}<Hint text="The saved repository is invalid. Navigation remains anchored to the most recent successful graph."><Badge tone="danger">Last successful graph</Badge></Hint>{/if}
    {#if snapshot && !snapshot.repositoryValid && !snapshot.retainedGraph}<Hint text="The current Project Graph was rebuilt, but blocking checks failed."><Badge tone="danger">Checks failing</Badge></Hint>{/if}
    {#if snapshot?.diagnostics.length}<Button variant="danger" on:click={() => findingsOpen = !findingsOpen}>{blockingFindings.length} blocking · {snapshot.diagnostics.length} findings</Button>{/if}
    <Button variant="primary" disabled={!dirty || saving} on:click={save}>{saving ? "Saving…" : "Save"}</Button>
  </div>
</header>

{#if error}<div class="banner error" role="alert"><span>{error}</span>{#if conflictPath}<Button on:click={reloadConflict}>Reload repository version</Button>{/if}</div>{/if}
{#if notice}<div class:warning={!snapshot?.repositoryValid} class="banner" role="status">{notice}</div>{/if}
{#if activeWorkflowRuns.length}
  <section class="active-workflows" aria-label="Active workflows">
    <strong>{activeWorkflowRuns.length === 1 ? "Active workflow" : "Active workflows"}</strong>
    <div>
      {#each activeWorkflowRuns as run}
        <button class:current={detail?.entity.id === run.featureId} on:click={() => selectEntity(run.featureId)}>
          <span>{run.featureId}</span><span>{run.activity}</span><Badge tone={run.state === "interrupted" ? "warning" : "good"}>{run.state}</Badge>
        </button>
      {/each}
    </div>
  </section>
{/if}

<main class:navigation-collapsed={navigationCollapsed}>
  <aside class:collapsed={navigationCollapsed} aria-label="Entity navigation">
    {#if navigationCollapsed}
      <button class="navigation-expand" aria-label="Expand navigation" title="Expand navigation" on:click={() => navigationCollapsed=false}>›</button>
    {:else}
    <div class="navigation-head">
      <div><span class="eyebrow">Navigation</span><strong>{browsingAllEntities ? "Engineering entities" : "Features"}</strong></div>
      <div class="navigation-actions"><Button variant="ghost" on:click={() => setEntityBrowser(!browsingAllEntities)}>{browsingAllEntities ? "Show features" : "Browse all"}</Button><button class="navigation-collapse" aria-label="Collapse navigation" title="Collapse navigation" on:click={() => navigationCollapsed=true}>‹</button></div>
    </div>
    <div class="search">
      <input aria-label={browsingAllEntities ? "Search entities" : "Search features"} placeholder={browsingAllEntities ? "Find an entity" : "Find a feature"} bind:value={query} on:input={search} />
      {#if browsingAllEntities}<select aria-label="Filter by entity type" bind:value={type} on:change={search}>
          <option value="">All types</option>
          {#each types as entityType}<option value={entityType}>{entityType}</option>{/each}
        </select>{/if}
    </div>
    {#if loading}<p class="empty">Loading engineering model…</p>
    {:else if entities.length === 0}<p class="empty">No entities match this search.</p>
    {:else}
      <nav>{#each entities as entity}
        <button class:active={detail?.entity.id === entity.id} class:has-finding={findingsForEntity(entity).length > 0} on:click={() => selectEntity(entity.id)}>
          <span><strong>{entity.id}{#if findingsForEntity(entity).length}<span class="finding-dot" aria-label="Has findings">!</span>{/if}</strong><small>{entity.label}</small></span>
          <span class="meta">{entity.type}<br />{entity.lifecycle}</span>
        </button>
      {/each}</nav>
    {/if}
    {/if}
  </aside>

  <section class="inspector" aria-label="Entity inspection">
    {#if !detail}<div class="empty hero"><h1>Inspect the Project Graph</h1><p>Select an entity to see authored properties, derived state, relationships, and source.</p></div>
    {:else}
      {#if selectedFindings.length}
        <div class="entity-findings" role="alert">
          <strong>{selectedFindings.length} finding{selectedFindings.length === 1 ? "" : "s"} affect this entity or artifact</strong>
          {#each selectedFindings as finding}<button on:click={() => openFinding(finding)}><code>{finding.code}</code><span>{finding.message}</span></button>{/each}
        </div>
      {/if}
      <div class="section-head"><div><p class="eyebrow">{detail.entity.type}</p><h1>{detail.entity.id}</h1><p>{detail.label}</p></div><div class="lifecycle-control"><label for="entity-lifecycle">Lifecycle</label><select id="entity-lifecycle" bind:value={lifecycleValue}>{#each lifecycleOptions as option}<option value={option}>{option}</option>{/each}</select><Button disabled={dirty||updatingLifecycle||lifecycleValue===detail.entity.lifecycle} on:click={updateLifecycle}>{updatingLifecycle?"Saving…":"Apply"}</Button></div></div>
      <dl>
        <dt>Source</dt><dd>{(detail.entity.source as Summary["source"]).artifactPath}:{(detail.entity.source as Summary["source"]).line ?? "?"}</dd>
        {#each Object.entries(detail.derivedState) as [key, value]}<dt>{key}</dt><dd>{JSON.stringify(value)}</dd>{/each}
      </dl>
      {#if workflow}
        <h2>Feature workflow</h2>
        <div class="workflow-card">
          <div class="workflow-heading"><div><span class="eyebrow">Current activity</span><strong>{workflowRun ? `${workflowRunHistorical ? "Historical " : ""}${workflowRun.activity}` : "No workflow run"}</strong></div><Badge tone={workflowRunHistorical ? "neutral" : focusBlocker ? "warning" : workflowRun ? "good" : "neutral"}>{workflowRun?.state ?? "idle"}</Badge></div>
          {#if !workflowRun || workflowRunHistorical}<Button on:click={startWorkflow}>Start workflow</Button>{/if}
          {#if !primaryAddressesFocus}<section class:ready={!focusBlocker} class="workflow-focus">
            <span class="eyebrow">{focusBlocker ? "Needs attention" : "Ready to progress"}</span>
            <strong>{focusBlocker?.message ?? (currentGate?.approved ? `${gateName(currentGate)} is complete.` : currentGate?.eligible ? `${gateName(currentGate)} is ready for review.` : "No blocker for the current activity.")}</strong>
            {#if focusBlocker?.entityId}<button class="context-link" on:click={() => selectEntity(focusBlocker!.entityId!)}>Edit {focusBlocker.entityId} →</button>{/if}
          </section>{/if}
          {#if lifecycleRunConflict}<div class="workflow-fact"><span>Decision needed</span><strong>Continue work or keep the Feature complete</strong><small>The lifecycle and workflow run must agree.</small></div>
            <div class="resolution-actions">{#each workflow.actions as action}<button on:click={() => performWorkflowAction(action)}><strong>{action.label}</strong><small>{action.expectedOutputs[0]}</small></button>{/each}</div>
          {:else if pendingGate}<div class="workflow-fact"><span>Pending human decision</span><strong>{gateName(pendingGate)}</strong><small>{pendingGate.eligible ? "Ready now" : "Available after the current issue is resolved"}</small></div>{/if}
          {#if primaryAction && !lifecycleRunConflict}
            <div class="primary-action"><span class="eyebrow">{primaryAddressesFocus?"Needs attention · Next action":"Next action"}</span><div class="workflow-action-box primary"><button class="workflow-action-command" on:click={() => performWorkflowAction(primaryAction!)}><strong>{actionDisplayLabel(primaryAction)}</strong><b>{actionVerb(primaryAction,preparedGateReview)} →</b></button>{#if hasNavigableTarget(primaryAction)}<a class="workflow-action-target" href={targetHref(primaryAction)} on:click={(event) => followActionTarget(event,primaryAction!)}>{primaryAction.target.entityId} →</a>{:else}<small class="workflow-action-target-text">{primaryAction.target.artifactPath ?? primaryAction.kind}</small>{/if}</div></div>
          {/if}
          <details class="workflow-details">
            <summary>Workflow details <span>{satisfiedVerificationCount}/{workflow.verifications.length} verifications satisfied</span></summary>
            {#if workflowRun}<h3>Gates</h3>{#each Object.values(workflow.gates) as gate}<div class="workflow-row"><div><strong>{gate.gate}</strong><small>{gate.approved ? "Approved" : gate.eligible ? "Ready for review" : "Waiting"}</small></div>{#if !gate.approved && gate.eligible && !workflowRunHistorical}{@const action=workflow.actions.find(candidate=>gateForAction(candidate)?.gate===gate.gate)}<Button on:click={() => prepareGateReview(gate,action)}>{preparedGateReview?.gate.fingerprint===gate.fingerprint?"Continue":"Review"}</Button>{/if}</div>{/each}{/if}
            {#if unsatisfiedVerifications.length}<h3>Verification needing attention</h3>{#each unsatisfiedVerifications as verification}<button class="workflow-link" on:click={() => selectEntity(verification.id)}><strong>{verification.id}</strong><span>{verification.status}</span></button>{/each}{/if}
            {#if workflow.governingChanges.length}<h3>Governing changes</h3>{#each workflow.governingChanges as change}<p><strong>{change.contractId}</strong>: {change.inputs.map(i=>`${i.id} ${i.reason}`).join(", ")}</p>{/each}{/if}
            {#if workflow.actions.filter(action => action.eligible && action.id !== primaryAction?.id).length}<h3>Other available actions</h3>{#each workflow.actions.filter(action => action.eligible && action.id !== primaryAction?.id) as action}<div class="workflow-action-box secondary"><button class="workflow-action-command" on:click={() => performWorkflowAction(action)}><strong>{actionDisplayLabel(action)}</strong><b>{actionVerb(action,preparedGateReview)} →</b></button>{#if hasNavigableTarget(action)}<a class="workflow-action-target" href={targetHref(action)} on:click={(event) => followActionTarget(event,action)}>{action.target.entityId} →</a>{:else}<small class="workflow-action-target-text">{action.target.artifactPath ?? action.kind}</small>{/if}</div>{/each}{/if}
          </details>
        </div>
      {/if}
      <h2>Relationships</h2>
      {#if detail.relationships.length === 0}<p class="empty">No connected relationships.</p>{/if}
      <div class="relationships">{#each detail.relationships as relationship}
        <button disabled={'missing' in relationship.counterpart} on:click={() => selectEntity(relationship.counterpart.id)}>
          <span>{relationship.direction === "outgoing" ? "→" : "←"} {relationship.label}</span>
          <strong>{relationship.counterpart.id}</strong><small>{relationship.provenance}</small>
        </button>
      {/each}</div>
      <details class="authored-metadata">
        <summary>Authored metadata</summary>
        <pre>{JSON.stringify(detail.authoredProperties, null, 2)}</pre>
      </details>
    {/if}
  </section>

  <section class:has-pinned-guidance={Boolean(pinnedGuidance)} class="source" aria-label="Authoritative artifact editor">
    {#if artifact}
      <div class="source-head"><div><p class="eyebrow">Authoritative artifact</p><strong>{artifact.path}</strong></div><Badge tone={dirty ? "warning" : "neutral"}>{dirty ? "Modified" : artifact.language}</Badge></div>
      {#if pinnedGuidance}<aside class="pinned-guidance" aria-label="Pinned action guidance"><div class="pinned-guidance-head"><div><span class="eyebrow">Pinned guidance</span><strong>{actionDisplayLabel(pinnedGuidance)}</strong></div><button aria-label="Dismiss pinned guidance" title="Dismiss guidance" on:click={() => pinnedGuidance=undefined}>×</button></div><p>{authoringInstruction(pinnedGuidance)}</p><details><summary>Required inputs and completion</summary><div><strong>Include</strong><ul>{#each pinnedGuidance.requiredInputs as input}<li>{input}</li>{/each}</ul><strong>Done when</strong><ul>{#each pinnedGuidance.expectedOutputs as output}<li>{output}</li>{/each}</ul></div></details></aside>{/if}
      <CodeEditor bind:value={editorValue} language={artifact.language} targetLine={editorTarget} on:change={(event) => editorValue = event.detail} on:save={save} />
    {:else}<div class="empty hero"><p>Select an entity to open its authoritative artifact.</p></div>{/if}
  </section>
</main>

{#if gateReview}
  <div class="modal-backdrop">
    <div class="gate-review" role="dialog" aria-modal="true" aria-labelledby="gate-review-title">
      <div class="gate-review-head"><div><p class="eyebrow">Human approval</p><h2 id="gate-review-title">Review {gateName(gateReview.gate)}</h2></div><Button variant="ghost" on:click={() => gateReview=undefined}>Close</Button></div>
      <p>This approval records your judgment against the current repository state and advances the workflow to <strong>{approvalDestination(gateReview.gate)}</strong>. Later governing changes will invalidate it.</p>
      {#if gateReview.action}<h3>Review these inputs</h3><ul>{#each gateReview.action.requiredInputs as input}<li>{input}</li>{/each}</ul>{/if}
      {#if gateReview.gate.gate==="build-contract"&&workflow}<div class="review-summary"><strong>{workflow.tasks.length} Build Contracts</strong><span>{workflow.tasks.filter(task=>task.contract&&!task.contractStale).length} current · {workflow.tasks.filter(task=>!task.contract||task.contractStale).length} requiring changes</span></div>{/if}
      <div class="review-summary"><strong>Deterministic prerequisites</strong><span>{gateReview.gate.eligible?"Satisfied":"Not satisfied"}</span></div>
      <div class="gate-review-actions"><Button on:click={() => gateReview=undefined}>Not yet</Button><Button variant="primary" disabled={!gateReview.gate.eligible||approvingGate} on:click={confirmGateApproval}>{approvingGate?"Approving…":`Approve and continue to ${approvalDestination(gateReview.gate)}`}</Button></div>
    </div>
  </div>
{/if}

{#if handoffReview}
  <div class="modal-backdrop">
    <div class="gate-review" role="dialog" aria-modal="true" aria-labelledby="handoff-review-title">
      <div class="gate-review-head"><div><p class="eyebrow">Implementation handoff</p><h2 id="handoff-review-title">Hand off {handoffReview.taskId}</h2></div><Button variant="ghost" on:click={() => handoffReview=undefined}>Close</Button></div>
      <p>This records that implementation is starting outside Lengthwise using <strong>{handoffReview.contractId}</strong>. Lengthwise does not send the contract anywhere; it will mark the workflow as waiting until an implementation return is recorded.</p>
      <div class="review-summary"><strong>Task</strong><span>{handoffReview.taskId}</span></div>
      <div class="review-summary"><strong>Build Contract</strong><span>{handoffReview.contractId}</span></div>
      <div class="gate-review-actions"><Button on:click={() => handoffReview=undefined}>Not yet</Button><Button variant="primary" disabled={recordingHandoff} on:click={confirmHandoff}>{recordingHandoff?"Recording…":"Record handoff"}</Button></div>
    </div>
  </div>
{/if}

{#if returnReview}
  <div class="modal-backdrop">
    <div class="gate-review" role="dialog" aria-modal="true" aria-labelledby="return-review-title">
      <div class="gate-review-head"><div><p class="eyebrow">Implementation return</p><h2 id="return-review-title">Record return for {returnReview.taskId}</h2></div><Button variant="ghost" on:click={() => returnReview=undefined}>Close</Button></div>
      <p>Summarize what the implementer returned. This resolves the task's implementation wait and preserves the claim for reconciliation and verification.</p>
      <label for="implementation-return-claim"><strong>Implementation result</strong></label>
      <textarea id="implementation-return-claim" bind:value={returnClaim} rows="5" placeholder="What was implemented, changed, or left unresolved?"></textarea>
      <div class="gate-review-actions"><Button on:click={() => returnReview=undefined}>Not yet</Button><Button variant="primary" disabled={recordingReturn||!returnClaim.trim()} on:click={confirmReturn}>{recordingReturn?"Recording…":"Record return"}</Button></div>
    </div>
  </div>
{/if}

{#if authorGuidance}
  <div class="modal-backdrop">
    <div class="gate-review" role="dialog" aria-modal="true" aria-labelledby="author-guidance-title">
      <div class="gate-review-head"><div><p class="eyebrow">Action guidance</p><h2 id="author-guidance-title">{actionDisplayLabel(authorGuidance)}</h2></div><Button variant="ghost" on:click={() => authorGuidance=undefined}>Close</Button></div>
      <p>{authoringInstruction(authorGuidance)}</p>
      <h3>Include</h3><ul>{#each authorGuidance.requiredInputs as input}<li>{input}</li>{/each}</ul>
      <h3>Done when</h3><ul>{#each authorGuidance.expectedOutputs as output}<li>{output}</li>{/each}</ul>
      {#if hasNavigableTarget(authorGuidance)}<a class="guidance-target" href={targetHref(authorGuidance)} on:click={(event) => followActionTarget(event,authorGuidance!)}>{authorGuidance.target.entityId} →</a>{/if}
      <div class="gate-review-actions"><Button on:click={() => authorGuidance=undefined}>Not yet</Button><Button variant="primary" on:click={openGuidedEditor}>Open editor</Button></div>
    </div>
  </div>
{/if}

{#if snapshot && findingsOpen && (snapshot.diagnostics.length > 0 || snapshot.changes.length > 0)}
  <footer class="findings-drawer">
    <div class="drawer-head"><strong>Validation results</strong><Button on:click={() => findingsOpen = false}>Close</Button></div>
    <section><h2>Findings <Badge tone={snapshot.diagnostics.length ? "danger" : "good"}>{snapshot.diagnostics.length}</Badge></h2>
      {#each snapshot.diagnostics as finding}<button class="finding" on:click={() => openFinding(finding)}><strong>{finding.code}</strong><span>{finding.message}</span><small>{finding.entityId ?? finding.location?.artifactPath ?? "project"}</small></button>{/each}
    </section>
    <section><h2>Changes since previous successful graph <Badge>{snapshot.changes.length}</Badge></h2>
      {#each snapshot.changes as change}<div class="change"><strong>{change.kind}</strong><code>{JSON.stringify(change)}</code></div>{/each}
    </section>
  </footer>
{/if}
