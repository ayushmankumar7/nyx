<script lang="ts">
  // A faint, slowly twinkling night sky painted inside the panel, with the
  // occasional shooting star.
  let { count = 34, shooting = true } = $props();

  // Deterministic scatter so the sky doesn't reshuffle on every render.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const stars = Array.from({ length: count }, () => ({
    x: rand() * 100,
    y: rand() * 100,
    s: rand() < 0.15 ? 2 : 1,
    o: 0.25 + rand() * 0.55,
    d: rand() * 6,
    t: 2.5 + rand() * 4,
  }));
</script>

<div class="stars" aria-hidden="true">
  {#each stars as s}
    <i
      style="left:{s.x}%;top:{s.y}%;width:{s.s}px;height:{s.s}px;--o:{s.o};animation-delay:-{s.d}s;animation-duration:{s.t}s"
    ></i>
  {/each}
  {#if shooting}<b></b>{/if}
</div>

<style>
  .stars {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }
  i {
    position: absolute;
    border-radius: 50%;
    background: #fff8ec;
    opacity: var(--o);
    animation: twinkle ease-in-out infinite;
  }
  @keyframes twinkle {
    0%, 100% { opacity: var(--o); transform: scale(1); }
    50% { opacity: calc(var(--o) * 0.25); transform: scale(0.6); }
  }
  b {
    position: absolute;
    top: 18%;
    left: 70%;
    width: 70px;
    height: 1px;
    background: linear-gradient(90deg, rgba(255, 240, 210, 0.9), transparent);
    transform: rotate(160deg);
    opacity: 0;
    animation: shoot 9s ease-in 2.5s infinite;
  }
  @keyframes shoot {
    0% { opacity: 0; translate: 0 0; }
    2% { opacity: 1; }
    9% { opacity: 0; translate: -220px 75px; }
    100% { opacity: 0; translate: -220px 75px; }
  }
</style>
