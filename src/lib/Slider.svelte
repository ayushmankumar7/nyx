<script lang="ts">
  // A glowing slider. `auto` marks a value driven by Random or weather sync:
  // the thumb shimmers and the value glides on its own.
  let {
    value,
    min = 0,
    max = 1,
    auto = false,
    centered = false,
    label,
    onchange,
  }: {
    value: number;
    min?: number;
    max?: number;
    auto?: boolean;
    centered?: boolean;
    label: string;
    onchange: (v: number) => void;
  } = $props();

  let track: HTMLDivElement;
  let dragging = $state(false);

  const pct = $derived(((value - min) / (max - min)) * 100);
  const from = $derived(centered ? Math.min(50, pct) : 0);
  const to = $derived(centered ? Math.max(50, pct) : pct);

  function at(e: PointerEvent) {
    const r = track.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    let v = min + k * (max - min);
    if (centered && Math.abs(v) < (max - min) * 0.04) v = 0; // snap to calm
    onchange(Math.round(v * 100) / 100);
  }

  function key(e: KeyboardEvent) {
    const step = (max - min) / 20;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") onchange(Math.min(max, value + step));
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") onchange(Math.max(min, value - step));
  }
</script>

<div
  class="slider"
  class:auto
  class:dragging
  bind:this={track}
  role="slider"
  tabindex="0"
  aria-label={label}
  aria-valuemin={min}
  aria-valuemax={max}
  aria-valuenow={value}
  onkeydown={key}
  onpointerdown={(e) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging = true;
    at(e);
  }}
  onpointermove={(e) => dragging && at(e)}
  onpointerup={() => (dragging = false)}
  onpointercancel={() => (dragging = false)}
>
  <div class="track">
    {#if centered}<i class="mid"></i>{/if}
    <div class="fill" style="left:{from}%;width:{to - from}%"></div>
  </div>
  <div class="thumb" style="left:{pct}%"></div>
</div>

<style>
  .slider {
    position: relative;
    flex: 1;
    height: 18px;
    cursor: pointer;
    touch-action: none;
    outline: none;
  }
  .track {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 4px;
    translate: 0 -50%;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.1);
  }
  .mid {
    position: absolute;
    left: 50%;
    top: -3px;
    width: 1px;
    height: 10px;
    background: rgba(255, 255, 255, 0.2);
  }
  .fill {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--violet), var(--gold));
    box-shadow: 0 0 8px rgba(255, 210, 150, 0.35);
  }
  .thumb {
    position: absolute;
    top: 50%;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    translate: -50% -50%;
    background: #fff8ea;
    box-shadow: 0 0 8px 1px rgba(255, 226, 168, 0.7);
    transition: scale 0.2s;
  }
  .slider:hover .thumb,
  .dragging .thumb {
    scale: 1.2;
  }
  .slider:focus-visible .thumb {
    outline: 2px solid var(--lilac);
    outline-offset: 2px;
  }
  /* Driven by Random or sync: the fill and thumb glide and shimmer. */
  .auto .fill,
  .auto .thumb {
    transition: left 1s linear, width 1s linear;
  }
  .auto .thumb {
    background: radial-gradient(circle, #fff 30%, var(--lilac));
    animation: shimmer 2.4s ease-in-out infinite;
  }
  @keyframes shimmer {
    50% { box-shadow: 0 0 14px 3px rgba(196, 182, 255, 0.85); }
  }
</style>
