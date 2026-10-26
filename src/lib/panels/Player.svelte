<script lang="ts">
  import Icon from "../Icon.svelte";
  import Nyx from "../Nyx.svelte";
  import Equalizer from "../Equalizer.svelte";
  import { mediaControl, mediaSeek, positionNow, sourceName, type NowPlaying } from "../sky.svelte";

  let { media, now }: { media: NowPlaying; now: number } = $props();

  const source = $derived(sourceName(media.source));
  const unsupported = $derived(`${source || "This player"} isn't offering this right now`);

  let dragging = $state<number | null>(null); // fraction while scrubbing
  const pos = $derived(
    dragging !== null ? dragging * media.durationMs : positionNow(media, now),
  );
  const pct = $derived(media.durationMs ? (pos / media.durationMs) * 100 : 0);

  function fraction(e: PointerEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  }

  function scrubStart(e: PointerEvent) {
    if (!media.canSeek) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging = fraction(e);
  }

  function scrubEnd(e: PointerEvent) {
    if (dragging === null) return;
    mediaSeek(fraction(e) * media.durationMs);
    dragging = null;
  }

  function clock(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
</script>

<div class="player">
  <div class="art">
    {#if media.artwork}
      <img class="reflection" src={media.artwork} alt="" />
      <img class="cover" src={media.artwork} alt="" />
    {:else}
      <div class="cover blank"><Nyx size={44} mood="groove" /></div>
    {/if}
  </div>

  <div class="meta">
    <div class="head">
      <div class="titles">
        <div class="title" title={media.title}>{media.title}</div>
        <div class="artist">
          {media.artist || media.album || "Unknown artist"}
          {#if source}<span class="via">· {source}</span>{/if}
        </div>
      </div>
      <Equalizer playing={media.playing} />
    </div>

    {#if media.durationMs > 0}
      <div
        class="scrub"
        class:seekable={media.canSeek}
        class:dragging={dragging !== null}
        title={media.canSeek ? "Seek" : undefined}
        role="presentation"
        onpointerdown={scrubStart}
        onpointermove={(e) => dragging !== null && (dragging = fraction(e))}
        onpointerup={scrubEnd}
        onpointercancel={() => (dragging = null)}
      >
        <div class="bar"><div class="fill" style="width:{pct}%"></div></div>
      </div>
      <div class="times"><span>{clock(pos)}</span><span>-{clock(media.durationMs - pos)}</span></div>
    {:else}
      <div class="spacer"></div>
    {/if}

    <div class="controls">
      <button
        aria-label="Previous"
        title={media.canPrev ? "Previous" : unsupported}
        disabled={!media.canPrev}
        onclick={() => mediaControl("prev")}><Icon name="prev" size={20} /></button>
      <button class="main" aria-label={media.playing ? "Pause" : "Play"} onclick={() => mediaControl("toggle")}>
        <Icon name={media.playing ? "pause" : "play"} size={24} />
      </button>
      <button
        aria-label="Next"
        title={media.canNext ? "Next" : unsupported}
        disabled={!media.canNext}
        onclick={() => mediaControl("next")}><Icon name="next" size={20} /></button>
    </div>
  </div>
</div>

<style>
  .player {
    display: grid;
    grid-template-columns: 112px 1fr;
    gap: 20px;
    align-items: center;
    padding: 6px 22px 0 18px;
  }
  .art {
    position: relative;
    width: 112px;
    height: 112px;
  }
  .cover {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 16px;
    object-fit: cover;
    box-shadow: 0 0 0 1px rgba(255, 240, 220, 0.08);
  }
  .blank {
    display: grid;
    place-items: center;
    background: radial-gradient(circle at 50% 35%, #2b2a5c, #12122a);
  }
  /* The artwork's own colours bleed out behind it like moonlight on water. */
  .reflection {
    position: absolute;
    inset: 6px;
    width: calc(100% - 12px);
    height: calc(100% - 12px);
    border-radius: 16px;
    filter: blur(18px) saturate(1.6);
    opacity: 0.7;
    transform: translateY(8px) scale(1.05);
    animation: tide 6s ease-in-out infinite;
  }
  @keyframes tide {
    0%, 100% { opacity: 0.55; transform: translateY(8px) scale(1.02); }
    50% { opacity: 0.8; transform: translateY(10px) scale(1.1); }
  }
  .meta {
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .titles {
    flex: 1;
    min-width: 0;
  }
  .title {
    font-size: 16.5px;
    font-weight: 500;
    letter-spacing: 0.1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .artist {
    margin-top: 2px;
    font-size: 13px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .scrub {
    margin-top: 8px;
    padding: 6px 0;
  }
  .scrub.seekable {
    cursor: pointer;
  }
  .scrub.seekable:hover .bar,
  .scrub.dragging .bar {
    height: 6px;
  }
  .scrub.dragging .fill {
    transition: none;
  }
  .bar {
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.12);
    transition: height 0.2s;
  }
  .fill {
    position: relative;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--violet), var(--gold));
    box-shadow: 0 0 10px rgba(255, 210, 150, 0.45);
    transition: width 0.5s linear;
  }
  .fill::after {
    content: "";
    position: absolute;
    right: -4px;
    top: 50%;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    translate: 0 -50%;
    background: #fff8ea;
    box-shadow: 0 0 8px 2px rgba(255, 226, 168, 0.8);
  }
  .times {
    display: flex;
    justify-content: space-between;
    margin-top: 0;
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .spacer {
    height: 26px;
  }
  .controls {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 22px;
    margin-top: 4px;
  }
  button {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 50%;
    color: var(--text);
    background: transparent;
    cursor: pointer;
    transition: background 0.2s, transform 0.2s cubic-bezier(0.3, 1.8, 0.5, 1);
  }
  button:hover:enabled {
    background: rgba(255, 255, 255, 0.08);
    transform: scale(1.08);
  }
  button:active:enabled {
    transform: scale(0.9);
  }
  button:disabled {
    opacity: 0.28;
    cursor: default;
  }
  .via {
    color: rgba(232, 226, 255, 0.38);
  }
  .main {
    width: 42px;
    height: 42px;
  }
</style>
