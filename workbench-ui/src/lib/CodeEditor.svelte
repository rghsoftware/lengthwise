<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { basicSetup } from "codemirror";
  import { EditorState } from "@codemirror/state";
  import { EditorView, keymap } from "@codemirror/view";
  import { markdown } from "@codemirror/lang-markdown";
  import { yaml } from "@codemirror/lang-yaml";
  import { oneDark } from "@codemirror/theme-one-dark";

  export let value = "";
  export let language: "markdown" | "yaml" = "yaml";
  const dispatch = createEventDispatcher<{ change: string; save: void }>();
  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let applying = false;

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          language === "markdown" ? markdown() : yaml(),
          oneDark,
          EditorView.lineWrapping,
          keymap.of([{ key: "Mod-s", preventDefault: true, run: () => { dispatch("save"); return true; } }]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !applying) dispatch("change", update.state.doc.toString());
          }),
        ],
      }),
    });
  });

  $: if (view && value !== view.state.doc.toString()) {
    applying = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    applying = false;
  }

  onDestroy(() => view?.destroy());
</script>

<div class="editor" bind:this={host}></div>
<style>
  .editor { height: 100%; min-height: 24rem; overflow: auto; background: #282c34; }
  .editor :global(.cm-editor) { height: 100%; font-size: .86rem; }
</style>
