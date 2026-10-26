<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { Spring } from "svelte/motion";
  import { blur, fade, fly } from "svelte/transition";
  import Nyx from "./Nyx.svelte";
  import Icon from "./Icon.svelte";
  import Stars from "./Stars.svelte";
  import Sparkles from "./Sparkles.svelte";
  import Equalizer from "./Equalizer.svelte";
  import BatteryGlyph from "./BatteryGlyph.svelte";
  import Player from "./panels/Player.svelte";
  import Quiet from "./panels/Quiet.svelte";
  import Mirror from "./panels/Mirror.svelte";
  import Phase from "./panels/Phase.svelte";
  import Todos from "./panels/Todos.svelte";
  import { loadTodos, todos } from "./todos.svelte";
  import { chime, clock, focus, onFocusDone } from "./focus.svelte";
  import MoonGlyph from "./MoonGlyph.svelte";
  import { artTint } from "./tint";
  import Vibes from "./panels/Vibes.svelte";
  import { loadVibes, update as updateVibes } from "./vibes.svelte";
  import { connect, isTauri, setHitRect, setVolume, sky, type Change } from "./sky.svelte";

  /** Must match the window width in tauri.conf.json / overlay.rs. */
  const STAGE_W = 760;

  type Tab = "home" | "todo" | "vibes" | "mirror" | "sky";
  type Activity = "volume" | "charging" | "unplugged" | "track" | "moonrise";
  type Mode = "idle" | "live" | "focus" | "expanded" | Activity;

  const query = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
  let pinned = $state(query.has("pin")); // stays open until unpinned (Ctrl+Alt+N)
  let jiggle = $state(false);
  let finishedTask = $state<string | null>(null);
  let tint = $state<string | null>(null);

  let expanded = $state(query.has("open"));
  let tab = $state<Tab>((query.get("tab") as Tab) ?? "home");
  let activity = $state<Activity | null>((query.get("activity") as Activity) ?? null);
  let now = $state(Date.now());
  let hoverLocal = $state(false);
  let sparkles: Sparkles;

  const hovering = $derived(isTauri ? sky.pointer : hoverLocal);
  const mode: Mode = $derived(
    expanded
      ? "expanded"
      : (activity ?? (focus.running ? "focus" : sky.media?.playing ? "live" : "idle")),
  );

  function shape(m: Mode, t: Tab) {
    switch (m) {
      case "idle":      return { w: 184, h: 32, r: 16 };
      case "live":      return { w: 256, h: 32, r: 16 };
      case "focus":     return { w: 300, h: 32, r: 16 };
      case "moonrise":  return { w: 400, h: 66, r: 26 };
      case "volume":    return { w: 340, h: 44, r: 22 };
      case "charging":  return { w: 336, h: 40, r: 20 };
      case "unplugged": return { w: 300, h: 40, r: 20 };
      case "track":     return { w: 410, h: 66, r: 26 };
      case "expanded":  return { w: 588, h: t === "mirror" ? 310 : t === "todo" ? 262 : t === "vibes" ? 330 : 188, r: 32 };
    }
  }

  // Low damping gives the pill its jelly-like overshoot as it grows and shrinks.
  const W = new Spring(184, { stiffness: 0.14, damping: 0.5 });
  const H = new Spring(32, { stiffness: 0.14, damping: 0.55 });
  const R = new Spring(16, { stiffness: 0.14, damping: 0.6 });
  const target = $derived(shape(mode, tab));

  $effect(() => {
    const { w, h, r } = target;
    W.target = w;
    H.target = h;
    R.target = r;
    setHitRect({ x: (STAGE_W - w) / 2 - 8, y: 0, w: w + 16, h: h + 10 });
  });

  function open() {
    if (expanded) return;
    expanded = true;
    activity = null;
    setTimeout(() => sparkles?.burst(STAGE_W / 2, shape("expanded", tab).h - 4, 420, 16), 160);
  }

  function close() {
    if (pinned || todos.typing) return;
    expanded = false;
    if (tab === "mirror") tab = "home"; // never leave the camera running in the background
  }

  // Hover intent: a short delay to open so passing the cursor over the top of
  // the screen doesn't trigger it, and a longer grace period before closing.
  let hoverTimer: ReturnType<typeof setTimeout>;
  $effect(() => {
    const h = hovering || todos.typing; // never fold away mid-sentence
    clearTimeout(hoverTimer);
    if (hovering && !untrack(() => expanded)) {
      jiggle = true; // a little hello as the cursor arrives
      setTimeout(() => (jiggle = false), 450);
    }
    hoverTimer = setTimeout(() => (h ? open() : close()), h ? 140 : 450);
  });

  $effect(() => {
    if (!expanded) return;
    now = Date.now();
    const t = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(t);
  });

  let activityTimer: ReturnType<typeof setTimeout>;
  function flash(kind: Activity, ms: number) {
    if (expanded) return;
    activity = kind;
    clearTimeout(activityTimer);
    activityTimer = setTimeout(() => (activity = null), ms);
  }

  function onChange(c: Change) {
    if (c.kind === "volume" && c.prev && c.next) {
      if (c.prev.level !== c.next.level || c.prev.muted !== c.next.muted) flash("volume", 1600);
    } else if (c.kind === "battery" && c.prev && c.next) {
      if (!c.prev.plugged && c.next.plugged) {
        flash("charging", 2800);
        setTimeout(() => sparkles?.burst(STAGE_W / 2, 36, 260, 12), 200);
      } else if (c.prev.plugged && !c.next.plugged) flash("unplugged", 1800);
    } else if (c.kind === "media" && c.next?.playing) {
      const p = c.prev;
      if (!p || p.title !== c.next.title || p.artist !== c.next.artist) flash("track", 3200);
    }
  }

  onFocusDone((task) => {
    finishedTask = task;
    chime();
    flash("moonrise", 9000);
    const h = expanded ? shape("expanded", tab).h : shape("moonrise", tab).h;
    setTimeout(() => sparkles?.burst(STAGE_W / 2, h - 6, expanded ? 480 : 340, 22), 120);
  });

  function onHotkey(key: string) {
    if (key === "quick-add") {
      open();
      tab = "todo";
      todos.quick = true;
    } else if (key === "weather") {
      updateVibes((s) => (s.on = !s.on));
    } else if (key === "pin") {
      pinned = !pinned;
      if (pinned) open();
      else if (!hovering) close();
    }
  }

  // Tint the panel's sky with the colours of the current artwork.
  $effect(() => {
    const art = sky.media?.artwork;
    if (!art) {
      tint = null;
      return;
    }
    artTint(art).then((t) => {
      if (sky.media?.artwork === art) tint = t;
    });
  });
  const tinted = $derived(tab === "home" && !!sky.media && !!tint);

  function tabWheel(e: WheelEvent) {
    e.stopPropagation();
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === tab);
    tab = tabs[(i + (e.deltaY > 0 ? 1 : -1) + tabs.length) % tabs.length].id;
  }

  function wheel(e: WheelEvent) {
    if (!sky.volume) return;
    e.preventDefault();
    setVolume(sky.volume.level - Math.sign(e.deltaY) * 2);
  }

  onMount(() => {
    connect(onChange, onHotkey);
    loadTodos();
    loadVibes();
  });

  const tabs: { id: Tab; icon: "home" | "todo" | "cloud" | "mirror" | "moon"; label: string }[] = [
    { id: "home", icon: "home", label: "Home" },
    { id: "todo", icon: "todo", label: "To-do" },
    { id: "vibes", icon: "cloud", label: "Vibes" },
    { id: "mirror", icon: "mirror", label: "Mirror" },
    { id: "sky", icon: "moon", label: "Tonight's moon" },
  ];

  const enter = { delay: 110, duration: 280, amount: 6 };
  const leave = { duration: 90 };
</script>

<div class="stage">
  <div
    class="shell"
    class:open={expanded}
    class:jiggle
    class:tinted
    style="width:{W.current}px;height:{Math.max(H.current, 18)}px;--r:{Math.max(R.current, 4)}px;--tint:{tint ?? "70, 60, 160"}"
    onmouseenter={() => (hoverLocal = true)}
    onmouseleave={() => (hoverLocal = false)}
    onclick={open}
    onwheel={wheel}
    role="presentation"
  >
    <div class="haze"></div>
    <span class="ear l"></span>
    <span class="ear r"></span>
    <div class="glow"></div>

    <div class="island">
      <div class="dusk"></div>
      {#if expanded}
        <div class="sky" transition:fade={{ duration: 500 }}><Stars /></div>
      {/if}
      <div class="rim"></div>
      <div class="sheen"></div>

      {#if mode === "idle"}
        <div class="content row" style="width:{target.w}px;height:{target.h}px" in:blur={enter} out:fade={leave}>
          {#if todos.remaining > 0}
            <span class="count" title="{todos.remaining} to do">✦ {todos.remaining}</span>
          {:else}
            <span class="twinkle">✦</span>
          {/if}
          <Nyx size={20} mood={hovering ? "awake" : "sleep"} />
        </div>
      {:else if mode === "live" && sky.media}
        <div class="content row" style="width:{target.w}px;height:{target.h}px" in:blur={enter} out:fade={leave}>
          {#if sky.media.artwork}
            <img class="mini-art" src={sky.media.artwork} alt="" />
          {:else}
            <Nyx size={20} mood="groove" />
          {/if}
          <Equalizer playing height={13} />
        </div>
      {:else if mode === "focus"}
        <div class="content row" style="width:{target.w}px;height:{target.h}px" in:blur={enter} out:fade={leave}>
          <MoonGlyph progress={focus.progress} size={18} />
          <span class="focus-task">{focus.task ?? "Focus"}</span>
          <span class="focus-left">{clock(focus.leftMs)}</span>
        </div>
      {:else if mode === "moonrise"}
        <div class="content row track" style="width:{target.w}px;height:{target.h}px" in:blur={enter} out:fade={leave}>
          <Nyx size={36} mood="happy" />
          <div class="track-text">
            <div class="eyebrow">Full moon</div>
            <div class="track-title">Time's up — beautifully done</div>
            {#if finishedTask}<div class="track-artist">{finishedTask}</div>{/if}
          </div>
          <MoonGlyph progress={1} size={28} />
        </div>
      {:else if mode === "volume" && sky.volume}
        {@const v = sky.volume}
        <div class="content row" style="width:{target.w}px;height:{target.h}px" in:blur={enter} out:fade={leave}>
          <span class="vol-icon">
            <Icon name="speaker" size={18} />
            {#if v.muted || v.level === 0}
              <span class="over"><Icon name="mute" size={18} /></span>
            {:else}
              <span class="over"><Icon name="wave1" size={18} /></span>
              {#if v.level > 50}<span class="over"><Icon name="wave2" size={18} /></span>{/if}
            {/if}
          </span>
          <div class="vol-bar"><div class="fill" style="width:{v.muted ? 0 : v.level}%"></div></div>
          <span class="vol-num">{v.muted ? "–" : v.level}</span>
        </div>
      {:else if (mode === "charging" || mode === "unplugged") && sky.battery}
        {@const b = sky.battery}
        <div class="content row" style="width:{target.w}px;height:{target.h}px" in:blur={enter} out:fade={leave}>
          <span class="power">
            <Nyx size={24} mood={mode === "charging" ? "happy" : "awake"} />
            {mode === "charging" ? "Charging" : "On battery"}
          </span>
          <span class="pct" class:charging={mode === "charging"}>
            {b.percent}% <BatteryGlyph percent={b.percent} charging={mode === "charging"} />
          </span>
        </div>
      {:else if mode === "track" && sky.media}
        {@const m = sky.media}
        <div class="content row track" style="width:{target.w}px;height:{target.h}px" in:blur={enter} out:fade={leave}>
          {#if m.artwork}<img class="track-art" src={m.artwork} alt="" />{/if}
          <div class="track-text">
            <div class="eyebrow">Now playing</div>
            <div class="track-title">{m.title}</div>
            <div class="track-artist">{m.artist}</div>
          </div>
          <Nyx size={30} mood="groove" />
        </div>
      {:else if mode === "expanded"}
        <div class="content panel" style="width:{target.w}px;height:{target.h}px" in:blur={enter} out:fade={leave}>
          <header>
            <nav onwheel={tabWheel}>
              {#each tabs as t}
                <button
                  class:active={tab === t.id}
                  aria-label={t.label}
                  title={t.label}
                  onclick={(e) => {
                    e.stopPropagation();
                    tab = t.id;
                  }}
                >
                  <Icon name={t.icon} size={15} />
                </button>
              {/each}
            </nav>
            <div class="mascot"><Nyx size={22} mood="wink" /></div>
            <div class="status">
              {#if focus.running && tab !== "todo"}
                <span class="focus-mini" title={focus.task ?? "Focus"}>
                  <MoonGlyph progress={focus.progress} size={13} />{clock(focus.leftMs)}
                </span>
              {/if}
              {#if sky.volume}
                <span><Icon name="speaker" size={14} />{sky.volume.muted ? "Muted" : `${sky.volume.level}%`}</span>
              {/if}
              {#if sky.battery}
                <span class:charging={sky.battery.charging}>
                  {sky.battery.percent}%
                  <BatteryGlyph percent={sky.battery.percent} charging={sky.battery.charging} />
                </span>
              {/if}
              <button
                class="pin"
                class:on={pinned}
                aria-pressed={pinned}
                title={pinned ? "Unpin (Ctrl+Alt+N)" : "Keep open (Ctrl+Alt+N)"}
                onclick={(e) => {
                  e.stopPropagation();
                  onHotkey("pin");
                }}><Icon name="pin" size={14} /></button>
            </div>
          </header>

          <div class="body">
            {#key tab}
              <div class="page" in:fly={{ y: 8, duration: 360, delay: 60 }}>
                {#if tab === "home"}
                  {#if sky.media}
                    <Player media={sky.media} {now} />
                  {:else}
                    <Quiet {now} />
                  {/if}
                {:else if tab === "todo"}
                  <Todos onSparkle={(x, y) => sparkles?.burst(x, y, 6, 9)} />
                {:else if tab === "vibes"}
                  <Vibes />
                {:else if tab === "mirror"}
                  <Mirror />
                {:else}
                  <Phase {now} />
                {/if}
              </div>
            {/key}
          </div>
        </div>
      {/if}
    </div>
  </div>

  <Sparkles bind:this={sparkles} />
</div>

<style>
  .stage {
    position: fixed;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
  .shell {
    position: absolute;
    top: 0;
    left: 50%;
    translate: -50% 0;
    transform-origin: 50% 0;
    pointer-events: auto;
    cursor: default;
    transition: scale 0.35s cubic-bezier(0.3, 1.8, 0.5, 1);
  }
  /* Squish when pressed, like something soft. */
  .shell:not(.open):active {
    scale: 0.94 0.86;
    transition-duration: 0.12s;
  }
  .shell.jiggle:not(.open) {
    animation: jiggle 0.45s cubic-bezier(0.3, 1.6, 0.5, 1);
  }
  @keyframes jiggle {
    0% { scale: 1; }
    35% { scale: 1.06 1.12; }
    65% { scale: 0.98 0.96; }
    100% { scale: 1; }
  }

  /* Concave fillets where the pill meets the top of the screen, like a real notch. */
  .ear {
    position: absolute;
    top: 0;
    width: 12px;
    height: 12px;
    pointer-events: none;
  }
  .ear.l {
    left: -12px;
    background: radial-gradient(circle at 0 100%, transparent 11.5px, var(--ink) 12px);
  }
  .ear.r {
    right: -12px;
    background: radial-gradient(circle at 100% 100%, transparent 11.5px, var(--ink) 12px);
  }

  /* Moonlight halo around the island. Opacity-only animation keeps it cheap. */
  .glow {
    position: absolute;
    inset: 0;
    border-radius: 0 0 var(--r) var(--r);
    box-shadow:
      0 0 0 1px rgba(255, 232, 196, 0.1),
      0 4px 18px rgba(255, 214, 160, 0.32),
      0 10px 44px rgba(150, 130, 255, 0.2);
    animation: breathe 5s ease-in-out infinite;
    transition: box-shadow 0.6s;
  }
  .open .glow {
    box-shadow:
      0 0 0 1px rgba(255, 232, 196, 0.16),
      0 6px 26px rgba(255, 214, 160, 0.42),
      0 18px 70px rgba(150, 130, 255, 0.32);
  }
  @keyframes breathe {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; }
  }
  .haze {
    position: absolute;
    left: 50%;
    top: 0;
    width: 118%;
    height: 116%;
    translate: -50% 0;
    background: radial-gradient(closest-side, rgba(150, 130, 255, 0.16), transparent);
    opacity: 0;
    transition: opacity 0.7s;
    pointer-events: none;
  }
  .open .haze {
    opacity: 1;
  }

  .island {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: var(--ink);
    border-radius: 0 0 var(--r) var(--r);
    color: var(--text);
  }
  .dusk {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(120% 90% at 50% 0%, rgba(var(--tint), 0.28), transparent 70%),
      radial-gradient(60% 60% at 85% 100%, rgba(255, 200, 140, 0.07), transparent 70%);
    opacity: 0;
    transition: opacity 0.6s;
  }
  .open .dusk {
    opacity: 1;
  }
  .tinted .dusk {
    background:
      radial-gradient(110% 100% at 25% 30%, rgba(var(--tint), 0.32), transparent 70%),
      radial-gradient(60% 60% at 85% 100%, rgba(255, 200, 140, 0.06), transparent 70%);
  }
  .sky {
    position: absolute;
    inset: 0;
  }

  /* A slow, rotating gleam traced around the rim while open. */
  .rim {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1px;
    background: conic-gradient(
      from var(--spin),
      transparent 0 15%,
      rgba(255, 220, 160, 0.6) 25%,
      transparent 35% 60%,
      rgba(170, 150, 255, 0.55) 72%,
      transparent 84%
    );
    mask:
      linear-gradient(#000 0 0) content-box exclude,
      linear-gradient(#000 0 0);
    opacity: 0;
    transition: opacity 0.6s;
    pointer-events: none;
  }
  .open .rim {
    opacity: 1;
    animation: spin 9s linear infinite;
  }
  @keyframes spin {
    to { --spin: 360deg; }
  }

  /* One sweep of light across the glass as it opens. */
  .sheen {
    position: absolute;
    inset: 0;
    background: linear-gradient(105deg, transparent 35%, rgba(255, 240, 215, 0.13) 50%, transparent 65%);
    translate: -100% 0;
    pointer-events: none;
  }
  .open .sheen {
    animation: sweep 1.2s cubic-bezier(0.3, 0.6, 0.3, 1) 0.12s;
  }
  @keyframes sweep {
    to { translate: 100% 0; }
  }

  .content {
    position: absolute;
    top: 0;
    left: 50%;
    translate: -50% 0;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 14px;
    box-sizing: border-box;
  }

  .twinkle {
    font-size: 10px;
    color: var(--gold);
    text-shadow: 0 0 6px rgba(255, 210, 140, 0.9);
    animation: twinkle 3.6s ease-in-out infinite;
  }
  @keyframes twinkle {
    0%, 100% { opacity: 0.25; transform: scale(0.7) rotate(0); }
    50% { opacity: 1; transform: scale(1.1) rotate(45deg); }
  }

  .count {
    font-size: 11.5px;
    color: var(--gold);
    opacity: 0.85;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 6px rgba(255, 210, 140, 0.6);
  }

  .focus-task {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 12.5px;
    color: var(--muted);
  }
  .focus-left,
  .focus-mini {
    font-size: 12.5px;
    color: var(--gold);
    font-variant-numeric: tabular-nums;
  }
  .pin {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    transition: color 0.2s, background 0.2s, rotate 0.3s;
  }
  .pin:hover {
    color: var(--text);
  }
  .pin.on {
    color: var(--gold);
    background: rgba(255, 217, 154, 0.12);
    rotate: -30deg;
  }

  .mini-art {
    width: 20px;
    height: 20px;
    border-radius: 6px;
    object-fit: cover;
    box-shadow: 0 0 10px rgba(255, 220, 170, 0.35);
  }

  .vol-icon {
    position: relative;
    display: grid;
    color: var(--text);
  }
  .vol-icon .over {
    position: absolute;
    inset: 0;
  }
  .vol-bar {
    flex: 1;
    height: 5px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.14);
  }
  .vol-bar .fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--violet), var(--gold));
    box-shadow: 0 0 10px rgba(255, 214, 160, 0.5);
    transition: width 0.25s cubic-bezier(0.3, 1.4, 0.5, 1);
  }
  .vol-num {
    width: 24px;
    text-align: right;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  .power {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    font-weight: 500;
  }
  .pct {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 13.5px;
    font-variant-numeric: tabular-nums;
  }
  .charging {
    color: var(--green);
  }

  .track {
    padding: 0 16px 0 12px;
  }
  .track-art {
    width: 44px;
    height: 44px;
    border-radius: 11px;
    object-fit: cover;
    box-shadow: 0 0 16px rgba(255, 220, 170, 0.3);
  }
  .track-text {
    flex: 1;
    min-width: 0;
  }
  .eyebrow {
    font-size: 9.5px;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: var(--lilac);
  }
  .track-title,
  .track-artist {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .track-title {
    margin-top: 2px;
    font-size: 14px;
    font-weight: 500;
  }
  .track-artist {
    font-size: 12px;
    color: var(--muted);
  }

  .panel header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 40px;
    padding: 0 16px;
  }
  nav {
    display: flex;
    gap: 4px;
  }
  nav button {
    display: grid;
    place-items: center;
    width: 30px;
    height: 26px;
    border: 0;
    border-radius: 13px;
    color: var(--muted);
    background: transparent;
    cursor: pointer;
    transition: color 0.2s, background 0.3s;
  }
  nav button:hover {
    color: var(--text);
  }
  nav button.active {
    color: var(--text);
    background: rgba(255, 255, 255, 0.1);
    box-shadow: inset 0 0 0 1px rgba(255, 236, 200, 0.08);
  }
  .mascot {
    position: absolute;
    left: 50%;
    top: 9px;
    translate: -50% 0;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 12px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .status span {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .body {
    position: relative;
  }
</style>
