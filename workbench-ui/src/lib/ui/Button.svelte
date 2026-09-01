<script lang="ts">
  export let type: "button" | "submit" = "button";
  export let variant: "primary" | "secondary" | "ghost" | "danger" = "secondary";
  export let disabled = false;
  export let title: string | undefined = undefined;
  const base = "inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:pointer-events-none disabled:opacity-45";
  const variants = {
    primary: "border-blue-500 bg-blue-500 text-white hover:bg-blue-400",
    secondary: "border-gray-700 bg-gray-800 text-gray-100 hover:border-gray-600 hover:bg-gray-700",
    ghost: "border-transparent bg-transparent text-gray-300 hover:bg-gray-800 hover:text-white",
    danger: "border-red-900/70 bg-red-950/40 text-red-300 hover:bg-red-950/70",
  };
  $: classes = `${base} ${variants[variant]}`;
</script>

<button {type} {disabled} {title} class={classes} on:click>
  <slot />
</button>
