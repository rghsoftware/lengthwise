<script lang="ts">
  export let tone: "neutral" | "good" | "warning" | "danger" = "neutral";
  const tones = {
    neutral: "border-gray-700 bg-gray-800 text-gray-300",
    good: "border-emerald-900/80 bg-emerald-950/50 text-emerald-300",
    warning: "border-amber-900/80 bg-amber-950/50 text-amber-300",
    danger: "border-red-900/80 bg-red-950/50 text-red-300",
  };
  $: classes = `inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`;
</script>
<span class={classes}><slot /></span>
