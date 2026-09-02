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
  type WorkflowAssessment = { featureId:string; repositoryValid:boolean; blockingQuestions:string[]; tasks:Array<{id:string;contract?:string;contractStale?:boolean;changedInputs:Blocker[]}>;verifications:Array<{id:string;satisfied:boolean;status:string;artifactPath:string}>;gates:Record<string,Gate>;actions:WorkflowAction[];governingChanges:Array<{contractId:string;inputs:Array<{id:string;reason:string}>}>;reconciliation:{required:boolean;reasons:Blocker[]}; specificationEligible:boolean; buildContractEligible:boolean; completionEligible:boolean; fingerprint:string };
  type WorkflowRun = { id:string; activity:string; state:string };

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
  let type = "";
  let loading = true;
  let saving = false;
  let error = "";
  let notice = "";
  let conflictPath = "";
  let editorTarget: { line: number; revision: number } | undefined;
  let workflow: WorkflowAssessment | undefined;
  let workflowRun: WorkflowRun | undefined;
  let workflowRunHistorical = false;
  let findingsOpen = true;
  $: dirty = Boolean(artifact && editorValue !== artifact.content);
  $: types = [...new Set((snapshot?.entities ?? []).map((entity) => entity.type))].sort();
  $: blockingFindings = snapshot?.diagnostics.filter((finding) => finding.severity === "error") ?? [];
  $: selectedFindings = detail ? findingsForEntity(detail.entity as Summary) : [];

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
    await search();
  }

  async function search() {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (type) params.set("type", type);
    const body = await api<{ entities: Summary[] }>(`/api/entities?${params}`);
    entities = body.entities;
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
      } else if (line) {
        editorTarget = { line, revision: (editorTarget?.revision ?? 0) + 1 };
      }
      return;
    }
    if (!mayDiscard()) return;
    error = "";
    notice = "";
    const body = await api<{ entity: Detail }>(`/api/entities/${encodeURIComponent(id)}`);
    detail = body.entity;
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
  }

  async function refreshWorkflow(){if(!detail||detail.entity.type!=="feature")return;const body=await api<{assessment:WorkflowAssessment;run?:WorkflowRun;runHistorical?:boolean}>(`/api/workflow/${encodeURIComponent(detail.entity.id)}`);workflow=body.assessment;workflowRun=body.run;workflowRunHistorical=Boolean(body.runHistorical);}
  async function approveGate(gate:Gate){if(!workflowRun)return;try{await api("/api/workflow/gate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({runId:workflowRun.id,gate:gate.gate,fingerprint:gate.fingerprint})});await refreshWorkflow();notice=`${gate.gate} gate approved against the reviewed repository state.`;}catch(cause){error=(cause as Error).message;}}
  async function openWorkflowTarget(action:WorkflowAction){if(action.target.entityId&&snapshot?.entities.some(e=>e.id===action.target.entityId))await selectEntity(action.target.entityId);else if(action.target.artifactPath)await loadArtifact(action.target.artifactPath);}

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
      if (snapshot.diagnostics.length) findingsOpen = true;
      notice = snapshot.retainedGraph
        ? "Saved, but the repository cannot currently produce a Project Graph. Navigation is using the last successfully built graph."
        : snapshot.repositoryValid
          ? "Saved. Project Graph rebuilt and checks passed."
          : "Saved. Project Graph rebuilt, but checks found blocking findings.";
      await search();
      if (detail) {
        const currentId = detail.entity.id;
        const current = await fetch(`/api/entities/${encodeURIComponent(currentId)}`);
        if (current.ok) detail = (await current.json()).entity;
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

<main>
  <aside aria-label="Entity navigation">
    <div class="search">
      <input aria-label="Search entities" placeholder="Search ID or authored text" bind:value={query} on:input={search} />
      <select aria-label="Filter by entity type" bind:value={type} on:change={search}>
        <option value="">All types</option>
        {#each types as entityType}<option value={entityType}>{entityType}</option>{/each}
      </select>
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
      <div class="section-head"><div><p class="eyebrow">{detail.entity.type}</p><h1>{detail.entity.id}</h1><p>{detail.label}</p></div><Badge>{detail.entity.lifecycle}</Badge></div>
      <dl>
        <dt>Source</dt><dd>{(detail.entity.source as Summary["source"]).artifactPath}:{(detail.entity.source as Summary["source"]).line ?? "?"}</dd>
        {#each Object.entries(detail.derivedState) as [key, value]}<dt>{key}</dt><dd>{JSON.stringify(value)}</dd>{/each}
      </dl>
      {#if workflow}
        <h2>Feature workflow</h2>
        <div class="workflow-card">
          <div><strong>{workflowRun ? `${workflowRunHistorical ? "Historical " : ""}${workflowRun.activity}` : "No workflow run"}</strong><Badge tone={workflowRunHistorical ? "neutral" : workflowRun ? "good" : "neutral"}>{workflowRun?.state ?? "idle"}</Badge></div>
          <p>Specification {workflow.specificationEligible ? "eligible" : "blocked"} · Contract {workflow.buildContractEligible ? "eligible" : "blocked"} · Completion {workflow.completionEligible ? "eligible" : "blocked"}</p>
          {#if workflow.blockingQuestions.length}<p>Blocking questions: {workflow.blockingQuestions.join(", ")}</p>{/if}
          {#if workflow.tasks.some(task => !task.contract || task.contractStale)}<p>{workflow.tasks.filter(task => !task.contract || task.contractStale).length} task contract(s) missing or stale.</p>{/if}
          {#if !workflowRun || workflowRunHistorical}<Button on:click={startWorkflow}>Start workflow</Button>{/if}
          {#if workflowRun}
            <h3>Pending gates</h3>
            {#each Object.values(workflow.gates) as gate}
              <div class="workflow-row"><button on:click={() => gate.blockers[0]?.entityId && selectEntity(gate.blockers[0].entityId)}><strong>{gate.gate}</strong><small>{gate.approved ? "approved for current fingerprint" : gate.eligible ? "ready for review" : gate.blockers.map(b=>b.message).join(" · ")}</small></button>{#if !gate.approved && !workflowRunHistorical}<Button disabled={!gate.eligible} on:click={() => approveGate(gate)}>Approve</Button>{/if}</div>
            {/each}
          {/if}
          <h3>Verification obligations</h3>
          {#each workflow.verifications as verification}<button class="workflow-link" on:click={() => selectEntity(verification.id)}><strong>{verification.id}</strong><span>{verification.status}</span></button>{/each}
          {#if workflow.governingChanges.length}<h3>Governing changes</h3>{#each workflow.governingChanges as change}<p><strong>{change.contractId}</strong>: {change.inputs.map(i=>`${i.id} ${i.reason}`).join(", ")}</p>{/each}{/if}
          <h3>Next engineering actions</h3>
          {#each workflow.actions as action}<button class="workflow-link" disabled={!action.eligible} on:click={() => openWorkflowTarget(action)}><strong>{action.label}</strong><span>{action.target.entityId ?? action.target.artifactPath ?? action.kind}</span><small>{action.eligible ? `Produces: ${action.expectedOutputs.join("; ")}` : action.blockers.map(b=>b.message).join(" · ")}</small></button>{/each}
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

  <section class="source" aria-label="Authoritative artifact editor">
    {#if artifact}
      <div class="source-head"><div><p class="eyebrow">Authoritative artifact</p><strong>{artifact.path}</strong></div><Badge tone={dirty ? "warning" : "neutral"}>{dirty ? "Modified" : artifact.language}</Badge></div>
      <CodeEditor bind:value={editorValue} language={artifact.language} targetLine={editorTarget} on:change={(event) => editorValue = event.detail} on:save={save} />
    {:else}<div class="empty hero"><p>Select an entity to open its authoritative artifact.</p></div>{/if}
  </section>
</main>

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
