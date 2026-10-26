<script lang="ts">
  import { onMount } from "svelte";
  import { fly } from "svelte/transition";
  import Nyx from "../Nyx.svelte";
  import Icon from "../Icon.svelte";

  const KEY = "nyx.camera.chosen";

  let video: HTMLVideoElement;
  let stream: MediaStream | undefined;
  let error = $state("");
  let live = $state(false);
  let cameras = $state<MediaDeviceInfo[]>([]);
  let current = $state<string>(load());
  let picking = $state(false);

  function load() {
    try {
      return localStorage.getItem(KEY) ?? "";
    } catch {
      return "";
    }
  }

  function save(id: string) {
    try {
      localStorage.setItem(KEY, id);
    } catch {}
  }

  /** "Integrated Camera (04f2:b6dd)" → "Integrated Camera" */
  const label = (d: MediaDeviceInfo, i: number) =>
    d.label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "") || `Camera ${i + 1}`;

  async function refresh() {
    const all = await navigator.mediaDevices.enumerateDevices();
    cameras = all.filter((d) => d.kind === "videoinput");
  }

  async function start(id: string) {
    stop();
    live = false;
    error = "";
    const size = { width: 640, height: 480 };
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: id ? { ...size, deviceId: { exact: id } } : { ...size, facingMode: "user" },
      });
    } catch (e) {
      // A remembered camera may have been unplugged; fall back to the default.
      if (id) return start("");
      error =
        (e as DOMException)?.name === "NotAllowedError"
          ? "Camera access is blocked. Allow it in Windows privacy settings."
          : "I can't open that camera. It may be in use by another app.";
      await refresh();
      return;
    }
    video.srcObject = stream;
    current = stream.getVideoTracks()[0]?.getSettings().deviceId ?? id;
    live = true;
    await refresh(); // labels only become readable once permission is granted

    // With no choice made yet, the system default is often a virtual camera
    // (OBS, Broadcast, phone links…) showing a logo. Prefer a real one.
    if (!id && isVirtual(current)) {
      const real = cameras.find((c) => !isVirtual(c.deviceId));
      if (real) return start(real.deviceId);
    }
  }

  const VIRTUAL = /virtual|obs|broadcast|smart connect|snap camera|manycam|xsplit|droidcam|iriun|camo|epoccam|ndi/i;
  const isVirtual = (id: string) => VIRTUAL.test(cameras.find((c) => c.deviceId === id)?.label ?? "");

  function stop() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = undefined;
  }

  function choose(id: string) {
    picking = false;
    save(id); // only an explicit pick is remembered
    if (id !== current || !live) start(id);
  }

  // The camera only runs while this panel is on screen.
  onMount(() => {
    if (!navigator.mediaDevices) {
      error = "No camera available.";
      return;
    }
    start(current);
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", refresh);
      stop();
    };
  });

  const active = $derived(cameras.findIndex((c) => c.deviceId === current));
</script>

<div class="mirror">
  <div class="frame" class:live>
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} autoplay playsinline muted></video>
    {#if !live}
      <div class="veil">
        <Nyx size={54} mood={error ? "sleep" : "awake"} />
        <span>{error || "Polishing the mirror…"}</span>
      </div>
    {/if}
    <div class="vignette"></div>

    {#if cameras.length > 0}
      {#if picking}
        <ul class="menu" transition:fly={{ y: 6, duration: 220 }}>
          {#each cameras as cam, i (cam.deviceId)}
            <li>
              <button class:on={cam.deviceId === current} onclick={() => choose(cam.deviceId)}>
                <span class="mark">{cam.deviceId === current ? "✦" : ""}</span>
                {label(cam, i)}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      <button class="chip" onclick={() => (picking = !picking)} aria-expanded={picking}>
        <Icon name="camera" size={14} />
        <span class="name">{active >= 0 ? label(cameras[active], active) : "Choose camera"}</span>
        <span class="chev" class:up={picking}><Icon name="chevron" size={12} /></span>
      </button>
    {/if}
  </div>
</div>

<style>
  .mirror {
    display: grid;
    place-items: center;
    padding: 4px 18px 0;
  }
  .frame {
    position: relative;
    width: 320px;
    height: 240px;
    border-radius: 20px;
    overflow: hidden;
    background: radial-gradient(circle at 50% 40%, #23224d, #0b0b1c);
    box-shadow:
      0 0 0 1px rgba(255, 236, 200, 0.12),
      0 0 30px rgba(157, 140, 255, 0.25);
  }
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transform: scaleX(-1);
    opacity: 0;
    transition: opacity 0.6s;
  }
  .live video {
    opacity: 1;
  }
  .veil {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 0 30px 30px;
    text-align: center;
    font-size: 13px;
    color: var(--muted);
  }
  .vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(ellipse at center, transparent 60%, rgba(10, 8, 30, 0.45));
  }

  /* Frosted controls floating over the picture. */
  .chip,
  .menu {
    position: absolute;
    left: 50%;
    translate: -50% 0;
    background: rgba(12, 10, 32, 0.62);
    backdrop-filter: blur(14px) saturate(1.4);
    box-shadow:
      inset 0 0 0 1px rgba(255, 236, 200, 0.12),
      0 4px 18px rgba(0, 0, 0, 0.35);
    color: var(--text);
  }
  .chip {
    bottom: 10px;
    display: flex;
    align-items: center;
    gap: 7px;
    max-width: 260px;
    height: 28px;
    padding: 0 12px;
    border: 0;
    border-radius: 14px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.2s;
  }
  .chip:hover {
    background: rgba(30, 26, 70, 0.75);
  }
  .name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .chev {
    display: grid;
    color: var(--muted);
    transition: rotate 0.25s;
  }
  .chev.up {
    rotate: 180deg;
  }
  .menu {
    bottom: 46px;
    width: 250px;
    max-height: 150px;
    overflow-y: auto;
    margin: 0;
    padding: 6px;
    border-radius: 14px;
    list-style: none;
  }
  .menu button {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 7px 8px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
  }
  .menu button:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text);
  }
  .menu button.on {
    color: var(--text);
  }
  .mark {
    width: 12px;
    flex: none;
    color: var(--gold);
    text-shadow: 0 0 6px rgba(255, 210, 140, 0.8);
  }
</style>
