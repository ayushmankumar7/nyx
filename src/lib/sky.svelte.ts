// Live system state for the island, fed by the Rust side over Tauri events.
// Outside Tauri (plain `npm run dev` in a browser) a small demo stands in so
// the UI can be designed without a native shell.

export type NowPlaying = {
  title: string;
  artist: string;
  album: string;
  artwork: string | null;
  playing: boolean;
  canNext: boolean;
  canPrev: boolean;
  canSeek: boolean;
  positionMs: number;
  durationMs: number;
  sampledAt: number;
  source: string;
};
export type Battery = { percent: number; charging: boolean; plugged: boolean };
export type Volume = { level: number; muted: boolean };
type Snapshot = { media: NowPlaying | null; battery: Battery | null; volume: Volume | null };

export type Change =
  | { kind: "media"; prev: NowPlaying | null; next: NowPlaying | null }
  | { kind: "battery"; prev: Battery | null; next: Battery | null }
  | { kind: "volume"; prev: Volume | null; next: Volume | null };

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

class Sky {
  media = $state<NowPlaying | null>(null);
  battery = $state<Battery | null>(null);
  volume = $state<Volume | null>(null);
  /** Cursor is over the island (reported natively, since the window is click-through). */
  pointer = $state(false);
}

export const sky = new Sky();

let onChange: (c: Change) => void = () => {};

function apply<K extends Change["kind"]>(kind: K, next: Snapshot[K]) {
  const prev = sky[kind];
  (sky as any)[kind] = next;
  onChange({ kind, prev, next } as Change);
}

export async function connect(handler: (c: Change) => void, onHotkey: (key: string) => void = () => {}) {
  onChange = handler;
  if (!isTauri) return demo(onHotkey);

  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");
  const snap = await invoke<Snapshot>("snapshot");
  sky.media = snap.media;
  sky.battery = snap.battery;
  sky.volume = snap.volume;
  await Promise.all([
    listen<NowPlaying | null>("media", (e) => apply("media", e.payload)),
    listen<Battery | null>("battery", (e) => apply("battery", e.payload)),
    listen<Volume | null>("volume", (e) => apply("volume", e.payload)),
    listen<boolean>("pointer", (e) => (sky.pointer = e.payload)),
    listen<string>("hotkey", (e) => onHotkey(e.payload)),
  ]);
}

export async function call<T = unknown>(cmd: string, args: Record<string, unknown> = {}): Promise<T | undefined> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export function mediaControl(action: "toggle" | "next" | "prev") {
  if (!isTauri) return demoControl(action);
  call("media_control", { action });
}

export function mediaSeek(positionMs: number) {
  const m = sky.media;
  if (!m) return;
  positionMs = Math.max(0, Math.min(m.durationMs || positionMs, Math.round(positionMs)));
  // Move the playhead right away; the next poll confirms it.
  sky.media = { ...m, positionMs, sampledAt: Date.now() };
  call("media_seek", { positionMs });
}

export function setVolume(level: number) {
  level = Math.max(0, Math.min(100, Math.round(level)));
  if (!isTauri) return apply("volume", { level, muted: false });
  call("set_volume", { level: level / 100 });
}

export function setHitRect(rect: { x: number; y: number; w: number; h: number }) {
  call("set_hit_rect", { rect });
}

/** "Chrome", "Spotify"… from an app id like `Spotify.exe` or `MSEdge`. */
export function sourceName(id: string) {
  const known: Record<string, string> = { chrome: "Chrome", msedge: "Edge", spotify: "Spotify", firefox: "Firefox", "308046b0af4a39cb": "Firefox", brave: "Brave", vlc: "VLC", demo: "" };
  const base = id.split(/[\\!]/).pop()!.replace(/\.exe$/i, "");
  const hit = Object.keys(known).find((k) => base.toLowerCase().includes(k));
  if (hit) return known[hit];
  if (/^[0-9a-f]{12,}$/i.test(base) || base.includes("_")) return ""; // opaque store app ids
  return base;
}

export function positionNow(m: NowPlaying, now: number) {
  const p = m.playing ? m.positionMs + (now - m.sampledAt) : m.positionMs;
  return m.durationMs ? Math.min(p, m.durationMs) : p;
}

// ---------------------------------------------------------------- demo mode

const demoArt =
  "data:image/svg+xml," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1f4a"/><stop offset="1" stop-color="#4a3f86"/></linearGradient>
  <radialGradient id="m" cx=".4" cy=".35"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#e6d3a6"/></radialGradient></defs>
  <rect width="100" height="100" fill="url(#g)"/><circle cx="50" cy="38" r="17" fill="url(#m)"/>
  <path d="M0 74 L22 62 L38 70 L58 58 L78 68 L100 60 V100 H0Z" fill="#141633"/>
  <rect x="47" y="78" width="6" height="2" fill="#f5e8c8" opacity=".6"/><rect x="45" y="84" width="10" height="1.5" fill="#f5e8c8" opacity=".35"/>
  </svg>`);

const tracks = [
  { title: "Nocturne in E-flat, Op. 9 No. 2", artist: "Frédéric Chopin", durationMs: 271000 },
  { title: "Gymnopédie No. 1", artist: "Erik Satie", durationMs: 205000 },
  { title: "Moonlight Sonata — I. Adagio", artist: "Ludwig van Beethoven", durationMs: 362000 },
];
let trackIndex = 0;

function demoTrack(i: number, playing = true): NowPlaying {
  const t = tracks[i % tracks.length];
  return { ...t, album: "Night Pieces", artwork: demoArt, playing, canNext: true, canPrev: true, canSeek: true, positionMs: 63000, sampledAt: Date.now(), source: "demo" };
}

function demoControl(action: string) {
  const m = sky.media;
  if (!m) return apply("media", demoTrack(trackIndex));
  if (action === "toggle")
    apply("media", { ...m, playing: !m.playing, positionMs: positionNow(m, Date.now()), sampledAt: Date.now() });
  else apply("media", { ...demoTrack((trackIndex += action === "next" ? 1 : tracks.length - 1)), positionMs: 0 });
}

function demo(onHotkey: (key: string) => void) {
  const q = new URLSearchParams(location.search);
  document.body.classList.add("demo");
  sky.battery = { percent: 72, charging: false, plugged: false };
  sky.volume = { level: 42, muted: false };
  if (q.get("media") !== "0") sky.media = demoTrack(0);

  // Keyboard hooks for poking at every state while designing.
  addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return; // typing a to-do
    const b = sky.battery!;
    if (e.key === "v") setVolume((sky.volume?.level ?? 0) + (e.shiftKey ? -6 : 6));
    if (e.key === "c") apply("battery", { ...b, plugged: !b.plugged, charging: !b.plugged });
    if (e.key === "t") demoControl("next");
    if (e.key === "p") demoControl("toggle");
    if (e.key === "m") apply("media", sky.media ? null : demoTrack(trackIndex));
    if (e.ctrlKey && e.altKey && e.code === "KeyT") onHotkey("quick-add");
    if (e.ctrlKey && e.altKey && e.code === "KeyN") onHotkey("pin");
  });
}
