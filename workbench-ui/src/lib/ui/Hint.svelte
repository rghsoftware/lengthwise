<script lang="ts">
  import { Portal, Tooltip } from "@ark-ui/svelte";
  export let text: string;
</script>

<Tooltip.Root openDelay={250} closeDelay={50}>
  <Tooltip.Trigger class="inline-flex cursor-help items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
    <slot />
  </Tooltip.Trigger>
  <Portal>
    <Tooltip.Positioner>
      <Tooltip.Content class="z-50 max-w-72 rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-100 shadow-xl data-[state=open]:animate-fade-in">
        {text}
      </Tooltip.Content>
    </Tooltip.Positioner>
  </Portal>
</Tooltip.Root>
