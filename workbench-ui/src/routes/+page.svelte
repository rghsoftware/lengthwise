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
  $: dirty = Boolean(artifact && editorValue !== artifact.content);
  $: types = [...new Set((snapshot?.entities ?? []).map((entity) => entity.type))].sort();

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, init);
    const body = await response.json();
    if (!response.ok || !body.ok) throw new Error(body.error?.message ?? body.error?.code ?? `Request failed (${response.status})`);
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

  async function selectEntity(id: string, push = true) {
    if (detail?.entity.id === id) return;
    if (!mayDiscard()) return;
    error = "";
    notice = "";
    const body = await api<{ entity: Detail }>(`/api/entities/${encodeURIComponent(id)}`);
    detail = body.entity;
    const source = detail.entity.source as Summary["source"];
    const sourceBody = await api<{ artifact: Artifact }>(`/api/artifact?path=${encodeURIComponent(source.artifactPath)}`);
    artifact = sourceBody.artifact;
    editorValue = artifact.content;
    if (push) history.pushState({ entity: id }, "", `?entity=${encodeURIComponent(id)}`);
  }

  async function save() {
    if (!artifact || !dirty || saving) return;
    saving = true;
    error = "";
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
      notice = snapshot.repositoryValid
        ? "Saved. Project Graph rebuilt and checks completed."
        : "Saved, but the repository cannot currently produce a valid Project Graph. Navigation is using the last successful graph.";
      await search();
      if (detail) {
        const currentId = detail.entity.id;
        const current = await fetch(`/api/entities/${encodeURIComponent(currentId)}`);
        if (current.ok) detail = (await current.json()).entity;
      }
    } catch (cause) {
      error = (cause as Error).message;
      notice = "";
    } finally {
      saving = false;
    }
  }

  function openFinding(finding: Diagnostic) {
    if (finding.entityId) selectEntity(finding.entityId);
    else if (finding.location) notice = `Responsible source: ${finding.location.artifactPath}${finding.location.line ? `:${finding.location.line}` : ""}`;
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
    <Button variant="primary" disabled={!dirty || saving} on:click={save}>{saving ? "Saving…" : "Save"}</Button>
  </div>
</header>

{#if error}<div class="banner error" role="alert">{error}</div>{/if}
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
        <button class:active={detail?.entity.id === entity.id} on:click={() => selectEntity(entity.id)}>
          <span><strong>{entity.id}</strong><small>{entity.label}</small></span>
          <span class="meta">{entity.type}<br />{entity.lifecycle}</span>
        </button>
      {/each}</nav>
    {/if}
  </aside>

  <section class="inspector" aria-label="Entity inspection">
    {#if !detail}<div class="empty hero"><h1>Inspect the Project Graph</h1><p>Select an entity to see authored properties, derived state, relationships, and source.</p></div>
    {:else}
      <div class="section-head"><div><p class="eyebrow">{detail.entity.type}</p><h1>{detail.entity.id}</h1><p>{detail.label}</p></div><Badge>{detail.entity.lifecycle}</Badge></div>
      <dl>
        <dt>Source</dt><dd>{(detail.entity.source as Summary["source"]).artifactPath}:{(detail.entity.source as Summary["source"]).line ?? "?"}</dd>
        {#each Object.entries(detail.derivedState) as [key, value]}<dt>{key}</dt><dd>{JSON.stringify(value)}</dd>{/each}
      </dl>
      <h2>Authored properties</h2>
      <pre>{JSON.stringify(detail.authoredProperties, null, 2)}</pre>
      <h2>Relationships</h2>
      {#if detail.relationships.length === 0}<p class="empty">No connected relationships.</p>{/if}
      <div class="relationships">{#each detail.relationships as relationship}
        <button disabled={'missing' in relationship.counterpart} on:click={() => selectEntity(relationship.counterpart.id)}>
          <span>{relationship.direction === "outgoing" ? "→" : "←"} {relationship.label}</span>
          <strong>{relationship.counterpart.id}</strong><small>{relationship.provenance}</small>
        </button>
      {/each}</div>
    {/if}
  </section>

  <section class="source" aria-label="Authoritative artifact editor">
    {#if artifact}
      <div class="source-head"><div><p class="eyebrow">Authoritative artifact</p><strong>{artifact.path}</strong></div><Badge tone={dirty ? "warning" : "neutral"}>{dirty ? "Modified" : artifact.language}</Badge></div>
      <CodeEditor bind:value={editorValue} language={artifact.language} on:change={(event) => editorValue = event.detail} on:save={save} />
    {:else}<div class="empty hero"><p>Select an entity to open its authoritative artifact.</p></div>{/if}
  </section>
</main>

{#if snapshot && (snapshot.diagnostics.length > 0 || snapshot.changes.length > 0)}
  <footer>
    <section><h2>Findings <Badge tone={snapshot.diagnostics.length ? "danger" : "good"}>{snapshot.diagnostics.length}</Badge></h2>
      {#each snapshot.diagnostics as finding}<button class="finding" on:click={() => openFinding(finding)}><strong>{finding.code}</strong><span>{finding.message}</span><small>{finding.entityId ?? finding.location?.artifactPath ?? "project"}</small></button>{/each}
    </section>
    <section><h2>Changes since previous successful graph <Badge>{snapshot.changes.length}</Badge></h2>
      {#each snapshot.changes as change}<div class="change"><strong>{change.kind}</strong><code>{JSON.stringify(change)}</code></div>{/each}
    </section>
  </footer>
{/if}
