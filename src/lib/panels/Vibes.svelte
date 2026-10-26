<script lang="ts">
  import Icon, { type IconName } from "../Icon.svelte";
  import Slider from "../Slider.svelte";
  import { setTyping } from "../todos.svelte";
  import {
    EFFECTS, refreshSync, resync, setLevel, setPlace, update, vibes, type Effect,
  } from "../vibes.svelte";

  const META: Record<Effect, { label: string; icon: IconName }> = {
    rain: { label: "Rain", icon: "rain" },
    snow: { label: "Snow", icon: "snow" },
    leaves: { label: "Autumn leaves", icon: "leaf" },
    fog: { label: "Fog", icon: "fog" },
    sun: { label: "Sunlight", icon: "sun" },
    wind: { label: "Wind", icon: "wind" },
  };

  const EVERY = [5, 15, 30, 60];
  const s = $derived(vibes.settings);
  const live = $derived(vibes.live.levels);

  let place: HTMLInputElement;
  let draft = $state("");

  async function beginTyping(e: PointerEvent) {
    e.preventDefault();
    await setTyping(true);
    place.focus();
  }

  function submitPlace(e: SubmitEvent) {
    e.preventDefault();
    setPlace(draft);
    draft = "";
    place.blur();
  }

  function pct(e: Effect, v: number) {
    if (e === "wind") return v === 0 ? "Calm" : `${Math.round(Math.abs(v) * 100)}% ${v < 0 ? "←" : "→"}`;
    return v < 0.01 ? "Off" : `${Math.round(v * 100)}%`;
  }
</script>

<div class="vibes">
  <div class="head">
    <button
      class="power"
      class:on={s.on}
      aria-pressed={s.on}
      title="Weather on/off (Ctrl+Alt+W)"
      onclick={() => update((s) => (s.on = !s.on))}
    >
      <Icon name="cloud" size={15} />
    </button>
    <span class="status">{vibes.status}</span>
    <label class="toggle" title="Hand every effect to Random">
      Randomize
      <input type="checkbox" checked={s.randomize} onchange={(e) => update((s) => (s.randomize = e.currentTarget.checked))} />
      <span class="switch"></span>
    </label>
  </div>

  <div class="grid" class:dim={!s.on}>
    {#each EFFECTS as e}
      {@const auto = vibes.isRandom(e) || vibes.isSynced(e)}
      {@const v = auto ? live[e] : s.levels[e]}
      <div class="fx">
        <div class="label">
          <Icon name={META[e].icon} size={13} />
          {META[e].label}
          {#if vibes.isSynced(e)}<span class="badge" title="Following your weather"><Icon name="location" size={10} /></span>{/if}
          <span class="val">{pct(e, v)}</span>
        </div>
        <div class="ctl">
          <button class="mini" title="Off" onclick={() => setLevel(e, 0)}>×</button>
          <Slider
            label={META[e].label}
            value={v}
            min={e === "wind" ? -1 : 0}
            centered={e === "wind"}
            {auto}
            onchange={(x) => setLevel(e, x)}
          />
          <button
            class="mini shuffle"
            class:on={vibes.isRandom(e)}
            title="Random"
            aria-pressed={vibes.isRandom(e)}
            onclick={() => update((st) => (st.random[e] = !st.random[e]))}
          ><Icon name="shuffle" size={12} /></button>
        </div>
      </div>
    {/each}
  </div>

  <div class="row">
    <div class="cell">
      <span class="lbl" title="How far the weather recedes behind your windows"><Icon name="depth" size={13} /> Depth</span>
      <Slider label="Depth" value={s.depth} onchange={(x) => update((s) => (s.depth = x))} />
    </div>
    <div class="cell">
      <label class="toggle">
        Sound
        <input type="checkbox" checked={s.sound} onchange={(e) => update((s) => (s.sound = e.currentTarget.checked))} />
        <span class="switch"></span>
      </label>
      <Slider label="Sound volume" value={s.volume} onchange={(x) => update((s) => (s.volume = x))} />
    </div>
  </div>

  <div class="row">
    <form class="sync" class:on={s.sync.enabled} onsubmit={submitPlace}>
      <Icon name="location" size={13} />
      {#if s.sync.enabled && !draft}
        <span class="place" title="Sync with your weather">
          {s.sync.place}{#if vibes.syncStatus} · <em>{vibes.syncStatus}</em>{/if}
        </span>
      {/if}
      <input
        bind:this={place}
        bind:value={draft}
        class:hidden={s.sync.enabled && !draft}
        placeholder={s.sync.enabled ? "Change place…" : "Sync with your weather: city or ZIP"}
        onpointerdown={beginTyping}
        onblur={() => setTyping(false)}
        onkeydown={(e) => e.key === "Escape" && place.blur()}
        spellcheck="false"
      />
      {#if s.sync.enabled}
        {#if s.sync.paused}
          <button type="button" class="chip" onclick={resync}>Resume</button>
        {/if}
        <button
          type="button"
          class="chip"
          class:active={s.sync.invert}
          title="Rain outside brings sunshine; clear skies bring rain"
          onclick={() => {
            update((s) => (s.sync.invert = !s.sync.invert));
            refreshSync();
          }}>Invert</button>
        <button type="button" class="chip" title="Stop syncing" onclick={() => update((s) => (s.sync.enabled = false))}>×</button>
      {/if}
    </form>
    <div class="seg" role="radiogroup" aria-label="Performance">
      {#each ["Least energy", "Balanced", "Smoothest"] as q, i}
        <button class:active={s.quality === i} role="radio" aria-checked={s.quality === i} onclick={() => update((s) => (s.quality = i))}>{q}</button>
      {/each}
    </div>
  </div>

  <div class="row small">
    <label class="toggle">
      <input type="checkbox" checked={s.pauseOnBattery} onchange={(e) => update((s) => (s.pauseOnBattery = e.currentTarget.checked))} />
      <span class="switch"></span>
      Pause on battery
    </label>
    <label class="toggle">
      <input type="checkbox" checked={s.pauseMaximized} onchange={(e) => update((s) => (s.pauseMaximized = e.currentTarget.checked))} />
      <span class="switch"></span>
      Pause behind maximised apps
    </label>
    <span class="every">
      Random changes every
      <button
        class="chip"
        title="Click to change"
        onclick={() => update((s) => (s.changeEvery = EVERY[(EVERY.indexOf(s.changeEvery) + 1) % EVERY.length]))}
      >{s.changeEvery} min</button>
    </span>
  </div>
</div>

<style>
  .vibes {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 20px;
    font-size: 12.5px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 30px;
  }
  .power {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.07);
    color: var(--muted);
    cursor: pointer;
    transition: background 0.3s, color 0.3s, box-shadow 0.3s;
  }
  .power.on {
    color: #2a2140;
    background: radial-gradient(circle at 35% 30%, #fff6dd, var(--gold));
    box-shadow: 0 0 14px rgba(255, 210, 140, 0.6);
  }
  .status {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 26px;
    transition: opacity 0.3s;
  }
  .dim {
    opacity: 0.45;
  }
  .label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
  }
  .val {
    margin-left: auto;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .badge {
    display: grid;
    color: var(--lilac);
  }
  .ctl {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .mini {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
    font-size: 14px;
    cursor: pointer;
  }
  .mini:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text);
  }
  .shuffle.on {
    color: var(--lilac);
    background: rgba(196, 182, 255, 0.15);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 26px;
    min-height: 28px;
  }
  .cell {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .lbl {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--muted);
    cursor: pointer;
    white-space: nowrap;
  }
  .toggle input {
    display: none;
  }
  .switch {
    position: relative;
    width: 26px;
    height: 15px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.14);
    transition: background 0.25s;
  }
  .switch::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: #e9e4f5;
    transition: translate 0.25s cubic-bezier(0.3, 1.5, 0.5, 1);
  }
  input:checked + .switch {
    background: linear-gradient(90deg, var(--violet), #b49cff);
  }
  input:checked + .switch::after {
    translate: 11px 0;
  }

  .sync {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
    height: 28px;
    padding: 0 6px 0 11px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.05);
    box-shadow: inset 0 0 0 1px rgba(255, 236, 200, 0.08);
    color: var(--muted);
  }
  .sync.on {
    color: var(--lilac);
  }
  .place {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--text);
  }
  .place em {
    font-style: normal;
    color: var(--muted);
  }
  .sync input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    caret-color: var(--gold);
    user-select: text;
  }
  .sync input.hidden {
    flex: 0;
    width: 0;
  }
  .sync input::placeholder {
    color: rgba(232, 226, 255, 0.38);
  }
  .chip {
    height: 20px;
    padding: 0 8px;
    border: 0;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.07);
    color: var(--muted);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .chip:hover,
  .chip.active {
    color: var(--text);
    background: rgba(196, 182, 255, 0.2);
  }

  .seg {
    display: flex;
    padding: 2px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
  }
  .seg button {
    height: 22px;
    padding: 0 9px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .seg button.active {
    background: rgba(255, 255, 255, 0.12);
    color: var(--text);
  }

  .small {
    gap: 18px;
    font-size: 11.5px;
  }
  .every {
    margin-left: auto;
    color: var(--muted);
  }
  .every .chip {
    margin-left: 4px;
  }
</style>
