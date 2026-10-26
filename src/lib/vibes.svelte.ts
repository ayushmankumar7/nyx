// Vibes: the settings and the "brain" behind the desktop weather. It lives in
// the island window (which is always running), works out the effective level
// of every effect from the sliders, Random mode and weather sync, and
// broadcasts that to the full-screen weather window, which only draws.

import { call, isTauri, sky } from "./sky.svelte";

export const EFFECTS = ["rain", "snow", "leaves", "fog", "sun", "wind"] as const;
export type Effect = (typeof EFFECTS)[number];
export type Levels = Record<Effect, number>;

export type Settings = {
  on: boolean;
  levels: Levels; // 0..1, wind -1..1
  random: Record<Effect, boolean>;
  randomize: boolean;
  /** Minutes between Random changes. */
  changeEvery: number;
  depth: number;
  quality: number; // 0 least energy, 1 balanced, 2 smoothest
  sound: boolean;
  volume: number;
  pauseOnBattery: boolean;
  pauseMaximized: boolean;
  sync: { enabled: boolean; place: string; lat: number | null; lon: number | null; invert: boolean; paused: boolean };
};

/** What the renderer needs. */
export type Live = {
  levels: Levels;
  depth: number;
  quality: number;
  sound: boolean;
  volume: number;
  pauseMaximized: boolean;
  paused: boolean;
};

const zero = (): Levels => ({ rain: 0, snow: 0, leaves: 0, fog: 0, sun: 0, wind: 0 });
const flags = (v: boolean) => Object.fromEntries(EFFECTS.map((e) => [e, v])) as Record<Effect, boolean>;

export const defaults = (): Settings => ({
  on: false,
  levels: { ...zero(), rain: 0.35, wind: 0.15 },
  random: flags(false),
  randomize: false,
  changeEvery: 15,
  depth: 0.3,
  quality: 1,
  sound: false,
  volume: 0.5,
  pauseOnBattery: false,
  pauseMaximized: false,
  sync: { enabled: false, place: "", lat: null, lon: null, invert: false, paused: false },
});

/** Effects the weather sync drives (leaves are always yours). */
export const SYNCED: Effect[] = ["rain", "snow", "fog", "sun", "wind"];

class VibesState {
  settings = $state<Settings>(defaults());
  /** Current Random values, easing toward their targets. */
  randomNow = $state<Levels>(zero());
  synced = $state<Levels | null>(null);
  syncStatus = $state<string>("");

  isRandom = (e: Effect) => this.settings.randomize || this.settings.random[e];
  isSynced = (e: Effect) =>
    this.settings.sync.enabled && !this.settings.sync.paused && !!this.synced && SYNCED.includes(e);

  live = $derived.by((): Live => {
    const s = this.settings;
    const levels = zero();
    for (const e of EFFECTS)
      levels[e] = this.isSynced(e) ? this.synced![e] : this.isRandom(e) ? this.randomNow[e] : s.levels[e];
    const onBattery = !!sky.battery && !sky.battery.plugged;
    return {
      levels,
      depth: s.depth,
      quality: onBattery && s.quality > 0 ? 0 : s.quality,
      sound: s.sound,
      volume: s.volume,
      pauseMaximized: s.pauseMaximized,
      paused: !s.on || (s.pauseOnBattery && onBattery),
    };
  });

  status = $derived.by(() => {
    const l = this.live;
    if (!this.settings.on) return "Weather is off";
    if (l.paused) return "Paused on battery";
    const on = EFFECTS.filter((e) => e !== "wind" && l.levels[e] > 0.02);
    if (!on.length) return "Clear skies";
    const names: Record<Effect, string> = { rain: "Rain", snow: "snow", leaves: "leaves", fog: "fog", sun: "sunlight", wind: "wind" };
    const list = on.map((e) => names[e].toLowerCase());
    const text = list.length > 1 ? `${list.slice(0, -1).join(", ")} & ${list.at(-1)}` : list[0];
    return text[0].toUpperCase() + text.slice(1) + (on.length === 1 ? " is on" : " are on");
  });
}

export const vibes = new VibesState();

// ------------------------------------------------------------- persistence

const LOCAL = "nyx.vibes";
let loaded = false;

export async function loadVibes() {
  let saved: Partial<Settings> | null | undefined;
  if (isTauri) saved = await call<Partial<Settings>>("load_vibes");
  else
    try {
      saved = JSON.parse(localStorage.getItem(LOCAL) ?? "null");
    } catch {}
  const d = defaults();
  if (saved) vibes.settings = { ...d, ...saved, levels: { ...d.levels, ...saved.levels }, random: { ...d.random, ...saved.random }, sync: { ...d.sync, ...saved.sync } };
  vibes.randomNow = { ...vibes.settings.levels };
  loaded = true;
  startBrain();
}

let saveTimer: ReturnType<typeof setTimeout>;
function persist() {
  if (!loaded) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const s = $state.snapshot(vibes.settings);
    if (isTauri) call("save_vibes", { vibes: s });
    else
      try {
        localStorage.setItem(LOCAL, JSON.stringify(s));
      } catch {}
  }, 300);
}

/** Change settings through here so they're saved and (for sync) paused properly. */
export function update(fn: (s: Settings) => void) {
  fn(vibes.settings);
  persist();
}

/** Moving a slider takes it back from Random and pauses a sync that drives it. */
export function setLevel(e: Effect, v: number) {
  update((s) => {
    s.levels[e] = v;
    s.random[e] = false;
    if (s.randomize) {
      s.randomize = false;
      for (const k of EFFECTS) s.random[k] = k !== e;
    }
    if (s.sync.enabled && SYNCED.includes(e)) s.sync.paused = true;
  });
}

// ------------------------------------------------------------------ brain

let started = false;

function startBrain() {
  if (started) return;
  started = true;
  if (isTauri) broadcastLoop();
  randomLoop();
  syncLoop();
}

/** Push the effective state to the weather window whenever it changes. */
async function broadcastLoop() {
  const { emit, listen } = await import("@tauri-apps/api/event");
  let last = "";
  const send = (force = false) => {
    const live = $state.snapshot(vibes.live);
    const json = JSON.stringify(live);
    if (force || json !== last) emit("vibes-live", live);
    last = json;
  };
  // The weather window says hello when it (re)loads.
  listen("vibes-hello", () => send(true));
  $effect.root(() => {
    $effect(() => {
      void JSON.stringify(vibes.live);
      send();
    });
  });
}

// Random: each effect eases into a new value, holds, then changes again.
type Glide = { from: number; to: number; start: number; next: number };
const glides = new Map<Effect, Glide>();
const EASE_MS = 25_000;

function pick(e: Effect) {
  const r = Math.random();
  switch (e) {
    case "rain": return r < 0.4 ? 0 : 0.15 + Math.random() * 0.75;
    case "snow": return r < 0.65 ? 0 : 0.2 + Math.random() * 0.7;
    case "leaves": return r < 0.6 ? 0 : 0.2 + Math.random() * 0.7;
    case "fog": return r < 0.65 ? 0 : 0.2 + Math.random() * 0.6;
    case "sun": return r < 0.55 ? 0 : 0.25 + Math.random() * 0.7;
    case "wind": return (Math.random() * 2 - 1) * 0.8;
  }
}

function randomLoop() {
  setInterval(() => {
    const now = Date.now();
    const s = vibes.settings;
    if (!s.on) return;
    const next = { ...vibes.randomNow };
    let changed = false;
    for (const e of EFFECTS) {
      if (!vibes.isRandom(e)) {
        glides.delete(e);
        next[e] = s.levels[e];
        continue;
      }
      let g = glides.get(e);
      if (!g || now >= g.next) {
        const hold = s.changeEvery * 60_000 * (0.75 + Math.random() * 0.5);
        g = { from: vibes.randomNow[e], to: pick(e), start: now, next: now + EASE_MS + hold };
        glides.set(e, g);
      }
      const k = Math.min(1, (now - g.start) / EASE_MS);
      const eased = g.from + (g.to - g.from) * (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
      if (Math.abs(eased - next[e]) > 0.002) {
        next[e] = eased;
        changed = true;
      }
    }
    if (changed) vibes.randomNow = next;
  }, 500);
}

// ---------------------------------------------------------- weather sync

/** Look a place up with Open-Meteo's free geocoder (no account or key). */
export async function setPlace(name: string) {
  name = name.trim();
  if (!name) return;
  vibes.syncStatus = "Finding " + name + "…";
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=${encodeURIComponent(name)}`,
    );
    const hit = (await r.json()).results?.[0];
    if (!hit) {
      vibes.syncStatus = `Couldn't find “${name}”`;
      return;
    }
    update((s) => {
      s.sync.place = [hit.name, hit.admin1, hit.country_code].filter(Boolean).join(", ");
      s.sync.lat = hit.latitude;
      s.sync.lon = hit.longitude;
      s.sync.enabled = true;
      s.sync.paused = false;
    });
    await refreshSync();
  } catch {
    vibes.syncStatus = "Can't reach the weather service";
  }
}

let lastFetch = 0;

export async function refreshSync() {
  const { lat, lon } = vibes.settings.sync;
  if (lat == null || lon == null) return;
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        "&current=weather_code,precipitation,rain,showers,snowfall,cloud_cover,wind_speed_10m,temperature_2m,is_day",
    );
    const c = (await r.json()).current;
    lastFetch = Date.now();
    vibes.synced = mapWeather(c, vibes.settings.sync.invert);
    vibes.syncStatus = describe(c);
  } catch {
    vibes.syncStatus = "Can't reach the weather service";
  }
}

export function resync() {
  update((s) => (s.sync.paused = false));
  refreshSync();
}

function syncLoop() {
  // Checked about every half hour, only while syncing and the weather is on.
  setInterval(() => {
    const s = vibes.settings;
    if (s.on && s.sync.enabled && Date.now() - lastFetch > 30 * 60_000) refreshSync();
  }, 60_000);
  if (vibes.settings.sync.enabled) refreshSync();
}

type Current = {
  weather_code: number; precipitation: number; rain: number; showers: number; snowfall: number;
  cloud_cover: number; wind_speed_10m: number; temperature_2m: number; is_day: number;
};

/** WMO weather codes → effect levels. */
function mapWeather(c: Current, invert: boolean): Levels {
  const code = c.weather_code;
  const L = zero();
  const precip = Math.min(1, (c.rain + c.showers) / 6);
  if (code >= 51 && code <= 57) L.rain = 0.2 + precip * 0.3;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) L.rain = 0.35 + precip * 0.6 + (code % 10 === 5 || code === 82 ? 0.15 : 0);
  if (code >= 95) L.rain = 1;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) L.snow = 0.3 + Math.min(1, c.snowfall / 2) * 0.6;
  if (code === 45 || code === 48) L.fog = 0.7;
  if (code <= 2 && c.is_day) L.sun = 0.35 + (1 - c.cloud_cover / 100) * 0.6;
  L.wind = Math.min(1, c.wind_speed_10m / 45) * (Math.random() < 0.5 ? -1 : 1);
  for (const k of EFFECTS) L[k] = Math.max(-1, Math.min(1, L[k]));
  if (!invert) return L;

  // Invert: wet outside brings sunshine; a dry sky brings rain (or snow on
  // hot days); fog clears; calm turns breezy and windy goes still.
  const wet = Math.max(L.rain, L.snow);
  const I = zero();
  if (wet > 0) I.sun = 0.3 + wet * 0.7;
  else if (c.temperature_2m >= 27) I.snow = 0.3 + (1 - c.cloud_cover / 100) * 0.6;
  else I.rain = 0.25 + (1 - c.cloud_cover / 100) * 0.65;
  I.wind = (1 - Math.abs(L.wind)) * 0.8;
  return I;
}

function describe(c: Current) {
  const code = c.weather_code;
  const what =
    code >= 95 ? "Thunderstorm" : code >= 80 ? "Showers" : code >= 71 ? "Snow" : code >= 61 ? "Rain" :
    code >= 51 ? "Drizzle" : code >= 45 ? "Fog" : code >= 3 ? "Overcast" : code >= 1 ? "Partly cloudy" : "Clear";
  return `${what}, ${Math.round(c.temperature_2m)}°C`;
}
