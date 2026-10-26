<script lang="ts" module>
  let uid = 0;
  export type Mood = "sleep" | "awake" | "happy" | "wink" | "groove";
</script>

<script lang="ts">
  import { onMount } from "svelte";

  let { size = 48, mood = "awake" as Mood } = $props();

  const id = `nyx${uid++}`;
  let blinking = $state(false);

  // Random, unhurried blinks while awake — the single biggest "it's alive" cue.
  onMount(() => {
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      t = setTimeout(() => {
        if (mood === "awake" || mood === "wink") {
          blinking = true;
          setTimeout(() => (blinking = false), 140);
        }
        schedule();
      }, 2400 + Math.random() * 3600);
    };
    schedule();
    return () => clearTimeout(t);
  });

  const INK = "#2a2140";
</script>

<svg
  class="nyx {mood}"
  width={size}
  height={size}
  viewBox="-50 -50 100 100"
  aria-label="Nyx the moon"
  role="img"
>
  <defs>
    <radialGradient id="{id}-fill" cx="36%" cy="30%" r="78%">
      <stop offset="0" stop-color="#fffbf2" />
      <stop offset="0.55" stop-color="#f6e9c9" />
      <stop offset="1" stop-color="#d9c08f" />
    </radialGradient>
    <radialGradient id="{id}-crater" cx="38%" cy="32%" r="70%">
      <stop offset="0" stop-color="#e2cd9f" />
      <stop offset="1" stop-color="#eddcb6" />
    </radialGradient>
  </defs>

  <g class="body">
    <circle r="44" fill="url(#{id}-fill)" />
    <g fill="url(#{id}-crater)" opacity="0.85">
      <circle cx="-21" cy="-25" r="8.5" />
      <circle cx="15" cy="-31" r="5.5" />
      <circle cx="30" cy="-10" r="6.5" />
      <circle cx="-33" cy="-2" r="3.8" />
      <circle cx="24" cy="28" r="4.2" />
      <circle cx="-4" cy="-38" r="2.6" />
    </g>

    <g fill="#f3a29a" opacity="0.5">
      <ellipse cx="-23" cy="14" rx="7" ry="4" />
      <ellipse cx="23" cy="14" rx="7" ry="4" />
    </g>

    <g stroke={INK} stroke-width="2.2" stroke-linecap="round" fill="none">
      {#if mood === "sleep"}
        <path d="M-18 4 Q-13 8 -8 4" />
        <path d="M8 4 Q13 8 18 4" />
        <path d="M-2.5 16 Q0 17.5 2.5 16" />
      {:else if mood === "happy" || mood === "groove"}
        <path d="M-18 6 Q-13 0 -8 6" />
        <path d="M8 6 Q13 0 18 6" />
        <path d="M-6 13 Q0 20 6 13" />
      {:else}
        <g class="eye" class:blink={blinking} transform="translate(-13 4)">
          <ellipse rx="4.6" ry="5.6" fill={INK} stroke="none" />
          <circle cx="1.5" cy="-2" r="1.7" fill="#fff" stroke="none" />
          <circle cx="-1.3" cy="2" r="0.8" fill="#fff" stroke="none" opacity="0.7" />
        </g>
        {#if mood === "wink"}
          <path d="M8 6 Q13 0 18 6" />
        {:else}
          <g class="eye" class:blink={blinking} transform="translate(13 4)">
            <ellipse rx="4.6" ry="5.6" fill={INK} stroke="none" />
            <circle cx="1.5" cy="-2" r="1.7" fill="#fff" stroke="none" />
            <circle cx="-1.3" cy="2" r="0.8" fill="#fff" stroke="none" opacity="0.7" />
          </g>
        {/if}
        <path d="M-5 14 Q0 19 5 14" />
      {/if}
    </g>
  </g>
</svg>

<style>
  .nyx {
    display: block;
    overflow: visible;
    filter: drop-shadow(0 0 calc(var(--glow, 6px)) rgba(255, 222, 168, 0.55));
  }
  .body {
    transform-origin: 0 0;
    animation: float 5.5s ease-in-out infinite;
  }
  .sleep .body {
    animation: breathe 4.8s ease-in-out infinite;
  }
  .groove .body {
    animation: groove 0.9s ease-in-out infinite;
  }
  .happy .body {
    animation: bounce 1.6s cubic-bezier(0.3, 1.6, 0.5, 1) infinite;
  }
  .eye {
    transition: transform 0.07s;
  }
  .eye.blink :global(*) {
    transform: scaleY(0.12);
  }
  .eye :global(*) {
    transition: transform 0.07s ease-out;
  }

  @keyframes float {
    0%, 100% { transform: translateY(0) rotate(-2deg); }
    50% { transform: translateY(-3px) rotate(2deg); }
  }
  @keyframes breathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(0.96); }
  }
  @keyframes groove {
    0%, 100% { transform: rotate(-8deg) translateY(0); }
    25% { transform: rotate(0deg) translateY(-3px); }
    50% { transform: rotate(8deg) translateY(0); }
    75% { transform: rotate(0deg) translateY(-3px); }
  }
  @keyframes bounce {
    0%, 100% { transform: translateY(0) scale(1); }
    40% { transform: translateY(-5px) scale(1.03, 0.98); }
  }
</style>
