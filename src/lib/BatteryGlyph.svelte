<script lang="ts">
  let { percent, charging = false }: { percent: number; charging?: boolean } = $props();
  const color = $derived(charging ? "var(--green)" : percent <= 20 ? "#ff7a7a" : "currentColor");
</script>

<svg width="24" height="12" viewBox="0 0 24 12" aria-hidden="true">
  <rect x="0.75" y="0.75" width="20" height="10.5" rx="3" fill="none" stroke="currentColor" stroke-opacity="0.45" stroke-width="1.2" />
  <rect x="22" y="4" width="1.6" height="4" rx="0.8" fill="currentColor" fill-opacity="0.45" />
  <rect x="2.4" y="2.4" width={Math.max(1.5, 16.7 * (percent / 100))} height="7.2" rx="1.6" fill={color} />
  {#if charging}
    <path d="M11.6 1.6 7.6 6.6h2.8l-1 3.8 4-5h-2.8z" fill="#0b0b16" />
  {/if}
</svg>
