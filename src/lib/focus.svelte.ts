// Focus timer. The moon waxes from new to full over the session, so the
// collapsed pill doubles as a progress indicator.

export const PRESETS = [15, 25, 50];

class Focus {
  /** Unix ms when the session ends; 0 when idle. */
  endsAt = $state(0);
  durationMs = $state(0);
  task = $state<string | null>(null);
  now = $state(Date.now());

  running = $derived(this.endsAt > 0);
  leftMs = $derived(Math.max(0, this.endsAt - this.now));
  /** 0 → 1 over the session. */
  progress = $derived(this.durationMs ? 1 - this.leftMs / this.durationMs : 0);
}

export const focus = new Focus();

let ticker: ReturnType<typeof setInterval> | undefined;
let onDone: (task: string | null) => void = () => {};

export function onFocusDone(fn: (task: string | null) => void) {
  onDone = fn;
}

export function startFocus(minutes: number, task: string | null = null) {
  focus.durationMs = minutes * 60_000;
  focus.now = Date.now();
  focus.endsAt = focus.now + focus.durationMs;
  focus.task = task;
  clearInterval(ticker);
  // One tick a second is all the countdown needs.
  ticker = setInterval(() => {
    focus.now = Date.now();
    if (focus.now >= focus.endsAt) {
      const task = focus.task;
      stopFocus();
      onDone(task);
    }
  }, 1000);
}

export function stopFocus() {
  clearInterval(ticker);
  ticker = undefined;
  focus.endsAt = 0;
  focus.durationMs = 0;
  focus.task = null;
}

export function clock(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A soft three-note chime, synthesised so there's no audio file to ship. */
export function chime() {
  try {
    const ctx = new AudioContext();
    [1046.5, 1318.5, 1568].forEach((f, i) => {
      const t = ctx.currentTime + i * 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.7);
    });
    setTimeout(() => ctx.close(), 2600);
  } catch {}
}
