<script lang="ts">
  // Little four-pointed stars that burst out of the island on magical moments.
  type P = { id: number; x: number; y: number; dx: number; dy: number; s: number; r: number; c: string; d: number };
  let particles = $state<P[]>([]);
  let next = 0;
  const colors = ["#ffe2a8", "#fff6e4", "#c9bbff", "#ffd28a"];

  export function burst(x: number, y: number, spread: number, count = 12) {
    const born = Array.from({ length: count }, (_, i): P => {
      const a = Math.PI * (0.1 + 0.8 * Math.random()); // mostly downward, away from the screen edge
      const v = 26 + Math.random() * 46;
      return {
        id: next++,
        x: x + (Math.random() - 0.5) * spread,
        y,
        dx: Math.cos(a) * v * (i % 2 ? 1 : -1),
        dy: Math.sin(a) * v,
        s: 5 + Math.random() * 7,
        r: (Math.random() - 0.5) * 220,
        c: colors[i % colors.length],
        d: Math.random() * 120,
      };
    });
    particles = [...particles, ...born];
    const ids = new Set(born.map((p) => p.id));
    setTimeout(() => (particles = particles.filter((p) => !ids.has(p.id))), 1500);
  }
</script>

<div class="sparkles" aria-hidden="true">
  {#each particles as p (p.id)}
    <svg
      viewBox="-10 -10 20 20"
      width={p.s}
      height={p.s}
      style="left:{p.x}px;top:{p.y}px;--dx:{p.dx}px;--dy:{p.dy}px;--r:{p.r}deg;animation-delay:{p.d}ms;color:{p.c}"
    >
      <path d="M0 -10 C1 -2 2 -1 10 0 C2 1 1 2 0 10 C-1 2 -2 1 -10 0 C-2 -1 -1 -2 0 -10Z" fill="currentColor" />
    </svg>
  {/each}
</div>

<style>
  .sparkles {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  svg {
    position: absolute;
    translate: -50% -50%;
    opacity: 0;
    filter: drop-shadow(0 0 3px currentColor);
    animation: fly 1.2s cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
  }
  @keyframes fly {
    0% { opacity: 0; transform: translate(0, 0) scale(0.2) rotate(0); }
    15% { opacity: 1; }
    100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(1) rotate(var(--r)); }
  }
</style>
