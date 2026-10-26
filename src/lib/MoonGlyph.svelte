<script lang="ts" module>
  let uid = 0;
</script>

<script lang="ts">
  import { litPath } from "./moon";

  /** progress 0 → 1 draws new moon → full moon (waxing). */
  let { progress, size = 18 }: { progress: number; size?: number } = $props();

  const id = `mg${uid++}`;
  const R = 10;
  // Start from a thin crescent rather than a dark disc so it reads at a glance.
  const d = $derived(litPath(0.1 + Math.min(1, Math.max(0, progress)) * 0.4, R));
</script>

<svg width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true">
  <defs>
    <radialGradient id={id} cx="40%" cy="35%" r="75%">
      <stop offset="0" stop-color="#fffbf1" />
      <stop offset="1" stop-color="#e9d3a2" />
    </radialGradient>
  </defs>
  <circle r={R} fill="#1d1b40" stroke="rgba(255,236,200,0.25)" stroke-width="0.8" />
  <path {d} fill="url(#{id})" />
</svg>

<style>
  svg {
    display: block;
    filter: drop-shadow(0 0 4px rgba(255, 220, 160, 0.55));
  }
</style>
