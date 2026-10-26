<script lang="ts">
  import { onMount } from "svelte";
  import { Weather, type Win } from "./sim";
  import { Ambience } from "./sound";
  import type { Live } from "../vibes.svelte";
  import { call, isTauri } from "../sky.svelte";

  let canvas: HTMLCanvasElement;
  let demoWins = $state<Win[]>([]);

  onMount(() => {
    const engine = new Weather(canvas);
    const sound = new Ambience();
    let live: Live | null = null;
    let wins: Win[] = [];
    let active = false;
    let raf = 0;
    let last = 0;

    const target = () => {
      const zero = { rain: 0, snow: 0, leaves: 0, fog: 0, sun: 0, wind: 0 };
      if (!live || live.paused) return zero;
      // Step aside while a maximised app is in front, if asked to.
      const front = wins.find((w) => w.h > 120);
      if (live.pauseMaximized && front?.maximized) return zero;
      return live.levels;
    };

    function setActive(on: boolean) {
      if (on === active) return;
      active = on;
      call("weather_active", { active: on });
    }

    function frame(t: number) {
      raf = 0;
      const fps = [24, 30, 60][live?.quality ?? 1];
      if (t - last >= 1000 / fps - 2) {
        const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
        last = t;
        // Ease every effect toward its target so changes drift in, not snap.
        const goal = target();
        const p = engine.params;
        const k = Math.min(1, dt * 0.6);
        for (const e of ["rain", "snow", "leaves", "fog", "sun", "wind"] as const) {
          p[e] += (goal[e] - p[e]) * k;
          if (Math.abs(p[e]) < 0.003 && goal[e] === 0) p[e] = 0;
        }
        p.depth = live?.depth ?? 0.3;
        p.quality = live?.quality ?? 1;
        engine.step(dt);
        engine.draw();
      }
      const busy = engine.busy || Object.values(target()).some((v) => Math.abs(v) > 0.003);
      setActive(busy);
      if (busy) raf = requestAnimationFrame(frame);
      else engine.draw(); // leave a clean, empty canvas
    }

    const wake = () => {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    function applyLive(l: Live) {
      live = l;
      const g = target();
      sound.set(l.sound && !l.paused, g.rain, g.snow, l.volume);
      wake();
    }

    const onResize = () => engine.resize();
    addEventListener("resize", onResize);
    const unlisten: (() => void)[] = [];

    if (isTauri) {
      (async () => {
        const { listen, emit } = await import("@tauri-apps/api/event");
        unlisten.push(await listen<Live>("vibes-live", (e) => applyLive(e.payload)));
        unlisten.push(
          await listen<{ windows: Win[] | null; cursor: [number, number] }>("scene", (e) => {
            if (e.payload.windows) {
              wins = e.payload.windows;
              engine.setWindows(wins);
            }
            engine.setCursor(...e.payload.cursor);
          }),
        );
        emit("vibes-hello");
      })();
    } else {
      // Browser preview: a few pretend windows and levels from the URL.
      const q = new URLSearchParams(location.search);
      document.body.classList.add("demo");
      demoWins = [
        { id: 1, x: innerWidth * 0.18, y: innerHeight * 0.3, w: innerWidth * 0.36, h: innerHeight * 0.42, maximized: false },
        { id: 2, x: innerWidth * 0.46, y: innerHeight * 0.48, w: innerWidth * 0.34, h: innerHeight * 0.38, maximized: false },
        { id: 3, x: innerWidth * 0.62, y: innerHeight * 0.16, w: innerWidth * 0.26, h: innerHeight * 0.22, maximized: false },
      ];
      wins = demoWins;
      engine.setWindows(wins);
      const n = (k: string, d = 0) => Number(q.get(k) ?? d);
      applyLive({
        levels: { rain: n("rain", 0.5), snow: n("snow"), leaves: n("leaves"), fog: n("fog"), sun: n("sun"), wind: n("wind", 0.2) },
        depth: n("depth", 0.3), quality: 1, sound: false, volume: 0, pauseMaximized: false, paused: false,
      });
      addEventListener("pointermove", (e) => engine.setCursor(e.clientX, e.clientY));
    }

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", onResize);
      unlisten.forEach((u) => u());
    };
  });
</script>

{#each demoWins as w (w.id)}
  <div class="fake" style="left:{w.x}px;top:{w.y}px;width:{w.w}px;height:{w.h}px"></div>
{/each}
<canvas bind:this={canvas}></canvas>

<style>
  canvas {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
  }
  .fake {
    position: fixed;
    border-radius: 8px;
    background: linear-gradient(#2b2f45 0 32px, #1b1e2e 32px);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  }
</style>
