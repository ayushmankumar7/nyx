// Ambient weather over the desktop. Everything is in CSS pixels of the
// full-screen canvas. Windows arrive front-to-back from the native tracker.
//
// Two layers are drawn each frame:
//   behind — fog, sunlight and the "far" share of particles, then every app
//            window is punched out so they only show in the gaps between windows;
//   front  — near particles, water running along title bars, snow caps and
//            settled leaves, drawn over everything.

export type Win = { id: number; x: number; y: number; w: number; h: number; maximized: boolean };

export type Params = {
  rain: number; // 0..1
  snow: number;
  leaves: number;
  fog: number;
  sun: number;
  wind: number; // -1..1, positive blows right
  depth: number; // share of particles that fall behind windows
  quality: number; // 0 least energy, 1 balanced, 2 smoothest
};

type Drop = { x: number; y: number; vx: number; vy: number; len: number; a: number; behind: boolean };
type Spark = { x: number; y: number; vx: number; vy: number; life: number };
/** Water travelling along a window: first the top edge, then down a side. */
type Runner = { win: number; side: boolean; rel: number; dir: number; v: number; r: number; x: number; y: number };
type Flake = { x: number; y: number; vx: number; vy: number; r: number; ph: number; behind: boolean; melt?: boolean };
type Leaf = {
  x: number; y: number; vx: number; vy: number; rot: number; vr: number;
  s: number; c: string; ph: number; behind: boolean;
};
type Settled = { rel: number; rot: number; s: number; c: string };
type Cap = { w: number; h: Float32Array };

const CAP_COL = 5; // px per snow column
const CAP_MAX = 14;
const GRAVITY = 900;
const LEAF_COLORS = ["#d9822b", "#c4512f", "#e3a33c", "#a8432a", "#cf6a32", "#b8862f"];

export class Weather {
  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;

  private wins: Win[] = [];
  private byId = new Map<number, Win>();
  private index = new Map<number, number>();
  private lastSeen = new Map<number, { x: number; y: number; t: number }>();

  private drops: Drop[] = [];
  private sparks: Spark[] = [];
  private runners: Runner[] = [];
  private pools = new Map<string, number>();
  private flakes: Flake[] = [];
  private caps = new Map<number, Cap>();
  private leaves: Leaf[] = [];
  private settled = new Map<number, Settled[]>();

  private cursor = { x: -9999, y: -9999, vx: 0, vy: 0, t: 0 };
  private fogSprite: HTMLCanvasElement;
  private fog: { x: number; y: number; r: number; v: number; a: number }[] = [];
  private t = 0;
  private frame = 0;
  private acc = { rain: 0, snow: 0, leaves: 0 };

  params: Params = { rain: 0, snow: 0, leaves: 0, fog: 0, sun: 0, wind: 0, depth: 0.3, quality: 1 };

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.fogSprite = makeFogSprite();
    this.resize();
  }

  resize() {
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.W = innerWidth;
    this.H = innerHeight;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.fog = Array.from({ length: 9 }, () => ({
      x: Math.random() * this.W,
      y: this.H * (0.15 + Math.random() * 0.8),
      r: 260 + Math.random() * 420,
      v: 6 + Math.random() * 10,
      a: 0.5 + Math.random() * 0.5,
    }));
  }

  /** Anything worth animating right now? */
  get busy() {
    const p = this.params;
    return (
      p.rain + p.snow + p.leaves + p.fog + p.sun > 0.005 ||
      this.drops.length + this.flakes.length + this.leaves.length + this.runners.length + this.caps.size > 0
    );
  }

  // ------------------------------------------------------------------ input

  setWindows(list: Win[]) {
    const now = performance.now();
    const next = new Map(list.map((w) => [w.id, w]));
    // Windows that vanished drop whatever was resting on them.
    for (const [id, w] of this.byId) if (!next.has(id)) this.release(w, 0, 0);
    // Windows yanked around fast shake off their snow and leaves.
    for (const w of list) {
      const prev = this.lastSeen.get(w.id);
      if (prev && now > prev.t) {
        const dt = (now - prev.t) / 1000;
        const vx = (w.x - prev.x) / dt;
        const vy = (w.y - prev.y) / dt;
        if (Math.hypot(vx, vy) > 2200) this.release(w, vx * 0.25, vy * 0.25);
      }
      this.lastSeen.set(w.id, { x: w.x, y: w.y, t: now });
      const cap = this.caps.get(w.id);
      if (cap && cap.w !== w.w) this.caps.set(w.id, resample(cap, w.w));
    }
    for (const id of this.lastSeen.keys()) if (!next.has(id)) this.lastSeen.delete(id);
    this.wins = list;
    this.byId = next;
    this.index = new Map(list.map((w, i) => [w.id, i]));
  }

  setCursor(x: number, y: number) {
    const now = performance.now();
    const dt = Math.max(0.016, (now - this.cursor.t) / 1000);
    this.cursor = { x, y, vx: (x - this.cursor.x) / dt, vy: (y - this.cursor.y) / dt, t: now };
  }

  // ---------------------------------------------------------------- geometry

  /** Is (x, y) not covered by any window in front of window number `upto`? */
  private exposed(x: number, y: number, upto = this.wins.length) {
    for (let j = 0; j < upto; j++) {
      const w = this.wins[j];
      if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return false;
    }
    return true;
  }

  /** The highest exposed top edge crossed moving from y0 to y1 at x. */
  private landing(x: number, y0: number, y1: number): Win | null {
    let best: Win | null = null;
    for (let i = 0; i < this.wins.length; i++) {
      const w = this.wins[i];
      if (x < w.x || x > w.x + w.w || w.y < y0 || w.y > y1) continue;
      if ((!best || w.y < best.y) && this.exposed(x, w.y - 1, i)) best = w;
    }
    return best;
  }

  // ------------------------------------------------------------------- step

  step(dt: number) {
    this.t += dt;
    this.frame++;
    const p = this.params;
    const scale = (this.W / 1000) * [0.6, 1, 1][p.quality];

    this.acc.rain += p.rain ** 1.3 * 1100 * scale * dt;
    this.acc.snow += p.snow * 110 * scale * dt;
    this.acc.leaves += p.leaves * 7 * scale * dt;
    for (; this.acc.rain >= 1 && this.drops.length < 1600; this.acc.rain--) this.spawnDrop();
    for (; this.acc.snow >= 1 && this.flakes.length < 900; this.acc.snow--) this.spawnFlake();
    for (; this.acc.leaves >= 1 && this.leaves.length < 90; this.acc.leaves--) this.spawnLeaf();
    this.acc.rain %= 1;
    this.acc.snow %= 1;
    this.acc.leaves %= 1;

    this.stepRain(dt);
    this.stepWater(dt);
    this.stepSnow(dt);
    this.stepLeaves(dt);
    for (const f of this.fog) {
      f.x += (f.v + p.wind * 40) * dt;
      if (f.x - f.r > this.W) f.x = -f.r;
      if (f.x + f.r < 0) f.x = this.W + f.r;
    }
  }

  private spawnDrop(x = Math.random() * (this.W + 400) - 200 - this.params.wind * 300, y = -20 - Math.random() * 60) {
    const behind = Math.random() < this.params.depth;
    this.drops.push({
      x, y,
      vx: this.params.wind * 320 + (Math.random() - 0.5) * 20,
      vy: (behind ? 850 : 1050) + Math.random() * 350,
      len: behind ? 8 + Math.random() * 8 : 12 + Math.random() * 12,
      a: behind ? 0.18 + Math.random() * 0.15 : 0.3 + Math.random() * 0.25,
      behind,
    });
  }

  private stepRain(dt: number) {
    const keep: Drop[] = [];
    for (const d of this.drops) {
      const y0 = d.y;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y - d.len > this.H) continue;
      if (!d.behind) {
        const w = this.landing(d.x, y0, d.y);
        if (w) {
          this.splash(d.x, w.y);
          if (Math.random() < 0.45) this.runOnto(w, d.x);
          continue;
        }
      }
      keep.push(d);
    }
    this.drops = keep;

    this.sparks = this.sparks.filter((s) => {
      s.life -= dt;
      s.vy += GRAVITY * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      return s.life > 0;
    });
  }

  private splash(x: number, y: number) {
    if (this.sparks.length > 400) return;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++)
      this.sparks.push({ x, y: y - 1, vx: (Math.random() - 0.5) * 140, vy: -60 - Math.random() * 110, life: 0.2 + Math.random() * 0.15 });
  }

  private runOnto(w: Win, x: number) {
    if (this.runners.length > 500) return;
    const rel = x - w.x;
    const wind = this.params.wind;
    // Water heads for the nearer corner, unless the wind is pushing it.
    let dir = rel < w.w / 2 ? -1 : 1;
    if (Math.abs(wind) > 0.3 && Math.random() < 0.7) dir = Math.sign(wind);
    this.runners.push({ win: w.id, side: false, rel, dir, v: 25 + Math.random() * 55, r: 1.3 + Math.random() * 1.1, x, y: w.y });
  }

  private stepWater(dt: number) {
    const keep: Runner[] = [];
    for (const r of this.runners) {
      const w = this.byId.get(r.win);
      if (!w) {
        // Its window is gone: the water just falls.
        this.drops.push({ x: r.x, y: r.y, vx: 0, vy: 200, len: 8, a: 0.5, behind: false });
        continue;
      }
      if (!r.side) {
        r.rel += r.dir * r.v * dt;
        r.v = Math.min(r.v + 20 * dt, 120);
        this.carryLeaves(w, r);
        if (r.rel <= 0 || r.rel >= w.w) {
          const key = `${w.id}${r.rel <= 0 ? "L" : "R"}`;
          this.pools.set(key, (this.pools.get(key) ?? 0) + r.r);
          continue;
        }
        r.x = w.x + r.rel;
        r.y = w.y;
      } else {
        r.rel += r.v * dt;
        r.v = Math.min(r.v + 520 * dt, 650);
        r.x = w.x + (r.dir < 0 ? -1 : w.w + 1);
        r.y = w.y + r.rel;
        if (r.rel >= w.h) {
          // Off the bottom of the window: a free drop again, which may land
          // on another window below.
          this.drops.push({ x: r.x, y: r.y, vx: this.params.wind * 80, vy: r.v, len: 10, a: 0.55, behind: false });
          continue;
        }
      }
      keep.push(r);
    }
    this.runners = keep;

    // Corners gather water and drip it down the sides; at high intensity the
    // drips run together into small waterfalls.
    for (const [key, vol] of this.pools) {
      const w = this.byId.get(Number(key.slice(0, -1)));
      if (!w) {
        this.pools.delete(key);
        continue;
      }
      let v = vol * (1 - 0.15 * dt);
      if (v > 1.6 && this.runners.length < 600) {
        const dir = key.endsWith("L") ? -1 : 1;
        this.runners.push({ win: w.id, side: true, rel: 0, dir, v: 40, r: Math.min(2.6, v), x: 0, y: w.y });
        v -= 1.6;
      }
      if (v < 0.05) this.pools.delete(key);
      else this.pools.set(key, v);
    }
  }

  private spawnFlake() {
    const behind = Math.random() < this.params.depth;
    const r = behind ? 0.8 + Math.random() * 1.4 : 1.2 + Math.random() * 2.2;
    this.flakes.push({
      x: Math.random() * (this.W + 300) - 150 - this.params.wind * 250,
      y: -10 - Math.random() * 40,
      vx: 0,
      vy: 35 + r * 14 + Math.random() * 20,
      r,
      ph: Math.random() * Math.PI * 2,
      behind,
    });
  }

  private stepSnow(dt: number) {
    const p = this.params;
    const keep: Flake[] = [];
    for (const f of this.flakes) {
      const y0 = f.y;
      f.vx = p.wind * 90 + Math.sin(this.t * 1.3 + f.ph) * 18;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.melt) {
        f.r -= 0.6 * dt;
        if (f.r <= 0.2) continue;
      }
      if (f.y > this.H + 10) continue;
      if (!f.behind && !f.melt) {
        const w = this.landing(f.x, y0, f.y);
        if (w) {
          this.addSnow(w, f.x - w.x, f.r);
          continue;
        }
      }
      if (this.gust(f, 0.25)) f.vy = Math.max(20, f.vy);
      keep.push(f);
    }
    this.flakes = keep;

    // Snow caps: settle, slump, melt when the snow stops, and tumble off
    // wherever another window now covers them.
    const melting = p.snow < 0.02 || p.rain > p.snow;
    const checkCover = this.frame % 8 === 0;
    for (const [id, cap] of this.caps) {
      const w = this.byId.get(id);
      if (!w) {
        this.caps.delete(id);
        continue;
      }
      const idx = this.index.get(id) ?? 0;
      const h = cap.h;
      let total = 0;
      for (let i = 0; i < h.length; i++) {
        const l = i > 0 ? h[i - 1] : h[i];
        const r = i < h.length - 1 ? h[i + 1] : h[i];
        h[i] += ((l + r) / 2 - h[i]) * 1.2 * dt; // slump
        if (melting) h[i] = Math.max(0, h[i] - (p.rain > 0.05 ? 1.5 : 0.35) * dt);
        if (checkCover && h[i] > 0.3 && !this.exposed(w.x + i * CAP_COL + CAP_COL / 2, w.y - 1, idx)) {
          this.tumble(w.x + i * CAP_COL, w.y, h[i], 0, 0);
          h[i] = 0;
        }
        total += h[i];
      }
      if (total < 0.2) this.caps.delete(id);
    }
  }

  private addSnow(w: Win, rel: number, r: number) {
    let cap = this.caps.get(w.id);
    if (!cap) this.caps.set(w.id, (cap = { w: w.w, h: new Float32Array(Math.ceil(w.w / CAP_COL) + 1) }));
    const i = Math.max(0, Math.min(cap.h.length - 1, Math.floor(rel / CAP_COL)));
    const max = 4 + CAP_MAX * this.params.snow;
    // Snow doesn't pile up on the very ends of a window.
    const edge = Math.min(i, cap.h.length - 1 - i);
    const limit = Math.min(max, edge * 1.6 + 1);
    cap.h[i] = Math.min(limit, cap.h[i] + r * 0.7);
  }

  /** Snow knocked loose falls as flakes that melt on the way down. */
  private tumble(x: number, y: number, amount: number, vx: number, vy: number) {
    const n = Math.min(4, Math.ceil(amount / 2));
    for (let k = 0; k < n && this.flakes.length < 1100; k++)
      this.flakes.push({
        x: x + Math.random() * CAP_COL, y: y - Math.random() * amount,
        vx, vy: 60 + vy + Math.random() * 60, r: 1.5 + Math.random() * 1.8,
        ph: Math.random() * 6, behind: false, melt: true,
      });
  }

  private spawnLeaf() {
    const s = 7 + Math.random() * 6;
    this.leaves.push({
      x: Math.random() * (this.W + 300) - 150 - this.params.wind * 300,
      y: -20,
      vx: 0,
      vy: 45 + Math.random() * 40,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 3,
      s,
      c: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)],
      ph: Math.random() * 6,
      behind: Math.random() < this.params.depth,
    });
  }

  private stepLeaves(dt: number) {
    const p = this.params;
    const keep: Leaf[] = [];
    for (const l of this.leaves) {
      const y0 = l.y;
      const drift = p.wind * 130 + Math.sin(this.t * 1.6 + l.ph) * 40;
      l.vx += (drift - l.vx) * 1.5 * dt;
      l.vy += (55 - l.vy) * 0.8 * dt;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      l.rot += (l.vr + Math.sin(this.t * 2 + l.ph) * 1.5) * dt;
      if (l.y > this.H + 20 || l.x < -200 || l.x > this.W + 200) continue;
      this.gust(l, 0.5);
      if (!l.behind && l.vy > 0) {
        const w = this.landing(l.x, y0, l.y);
        const pile = w && (this.settled.get(w.id) ?? []);
        if (w && pile && pile.length < w.w / 14) {
          pile.push({ rel: l.x - w.x, rot: (Math.random() - 0.5) * 0.5, s: l.s, c: l.c });
          this.settled.set(w.id, pile);
          continue;
        }
      }
      keep.push(l);
    }
    this.leaves = keep;

    // Swipe the cursor through settled leaves to stir them up.
    const c = this.cursor;
    const fast = Math.hypot(c.vx, c.vy) > 700 && performance.now() - c.t < 120;
    for (const [id, pile] of this.settled) {
      const w = this.byId.get(id);
      if (!w) {
        this.settled.delete(id);
        continue;
      }
      if (!fast) continue;
      for (let i = pile.length - 1; i >= 0; i--) {
        const s = pile[i];
        if (Math.hypot(w.x + s.rel - c.x, w.y - c.y) < 60) {
          pile.splice(i, 1);
          this.fling(w.x + s.rel, w.y - 2, s, c.vx * 0.35, Math.min(-120, c.vy * 0.35));
        }
      }
    }
  }

  /** Water running along an edge carries leaves with it. */
  private carryLeaves(w: Win, r: Runner) {
    const pile = this.settled.get(w.id);
    if (!pile) return;
    for (const s of pile) if (Math.abs(s.rel - r.rel) < 4) s.rel += r.dir * 2;
  }

  private fling(x: number, y: number, s: { s: number; c: string; rot: number }, vx: number, vy: number) {
    this.leaves.push({ x, y, vx, vy, rot: s.rot, vr: (Math.random() - 0.5) * 8, s: s.s, c: s.c, ph: Math.random() * 6, behind: false });
  }

  /** A quick cursor swipe pushes nearby falling things along. */
  private gust(o: { x: number; y: number; vx: number; vy: number }, k: number) {
    const c = this.cursor;
    if (performance.now() - c.t > 120) return false;
    const speed = Math.hypot(c.vx, c.vy);
    if (speed < 600) return false;
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (d > 90) return false;
    const f = (1 - d / 90) * k;
    o.vx += c.vx * f * 0.3;
    o.vy += c.vy * f * 0.3;
    return true;
  }

  /** Drop everything resting on a window (closed, minimised or shaken). */
  private release(w: Win, vx: number, vy: number) {
    const cap = this.caps.get(w.id);
    if (cap) for (let i = 0; i < cap.h.length; i++) if (cap.h[i] > 0.3) this.tumble(w.x + i * CAP_COL, w.y, cap.h[i], vx, vy);
    this.caps.delete(w.id);
    for (const s of this.settled.get(w.id) ?? []) this.fling(w.x + s.rel, w.y, s, vx + (Math.random() - 0.5) * 80, vy - 40);
    this.settled.delete(w.id);
  }

  // ------------------------------------------------------------------- draw

  draw() {
    const { ctx, W, H, dpr } = this;
    const p = this.params;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // ---- behind: only visible in the gaps between windows
    if (p.sun > 0.005) this.drawSun(p.sun);
    if (p.fog > 0.005) this.drawFog(p.fog);
    this.strokeDrops(true);
    ctx.beginPath();
    for (const f of this.flakes) if (f.behind) dot(ctx, f.x, f.y, f.r);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fill();
    ctx.beginPath();
    for (const l of this.leaves) if (l.behind) drawLeaf(ctx, l.x, l.y, l.rot, l.s * 0.8, l.c, 0.75);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    for (const w of this.wins) ctx.roundRect(w.x, w.y, w.w, w.h, w.maximized ? 0 : 8);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    // ---- front
    if (p.sun > 0.005) this.drawSun(p.sun * 0.1);
    if (p.fog > 0.005) this.drawFog(p.fog * 0.3);
    this.strokeDrops(false);

    ctx.beginPath();
    for (const s of this.sparks) dot(ctx, s.x, s.y, 0.9);
    ctx.fillStyle = "rgba(215,228,255,0.6)";
    ctx.fill();

    this.drawWater();
    this.drawCaps();

    ctx.beginPath();
    for (const f of this.flakes) if (!f.behind) dot(ctx, f.x, f.y, f.r);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fill();

    for (const [id, pile] of this.settled) {
      const w = this.byId.get(id);
      if (w) for (const s of pile) drawLeaf(ctx, w.x + s.rel, w.y - s.s * 0.25, s.rot, s.s, s.c, 1);
    }
    for (const l of this.leaves) if (!l.behind) drawLeaf(ctx, l.x, l.y, l.rot, l.s, l.c, 1);
  }

  private strokeDrops(behind: boolean) {
    const { ctx } = this;
    ctx.beginPath();
    for (const d of this.drops) {
      if (d.behind !== behind) continue;
      const k = d.len / d.vy;
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.vx * k, d.y - d.len);
    }
    ctx.strokeStyle = behind ? "rgba(190,205,240,0.32)" : "rgba(210,224,255,0.5)";
    ctx.lineWidth = behind ? 1 : 1.3;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  private drawWater() {
    const { ctx } = this;
    ctx.beginPath();
    for (const r of this.runners) {
      const w = this.byId.get(r.win);
      if (!w) continue;
      const idx = this.index.get(r.win) ?? 0;
      if (!this.exposed(r.x, r.y - 1, idx)) continue;
      if (r.side) blob(ctx, r.x, r.y, r.r * 0.8, r.r * (1 + r.v / 220));
      else blob(ctx, r.x, r.y - r.r * 0.6, r.r * 1.3, r.r * 0.75);
    }
    for (const [key, vol] of this.pools) {
      const w = this.byId.get(Number(key.slice(0, -1)));
      if (!w) continue;
      const x = key.endsWith("L") ? w.x : w.x + w.w;
      if (!this.exposed(x, w.y - 1, this.index.get(w.id) ?? 0)) continue;
      const r = Math.min(3.4, 1 + vol);
      blob(ctx, x, w.y + r * 0.6, r, r * 1.25);
    }
    ctx.fillStyle = "rgba(205,222,255,0.72)";
    ctx.fill();
  }

  private drawCaps() {
    const { ctx } = this;
    ctx.beginPath();
    for (const [id, cap] of this.caps) {
      const w = this.byId.get(id);
      if (!w) continue;
      const h = cap.h;
      ctx.moveTo(w.x, w.y + 1);
      for (let i = 0; i < h.length; i++) {
        const x = Math.min(w.x + w.w, w.x + i * CAP_COL);
        const xm = x + CAP_COL / 2;
        ctx.quadraticCurveTo(x, w.y - h[i], Math.min(w.x + w.w, xm), w.y - (h[i] + (h[i + 1] ?? 0)) / 2);
      }
      ctx.lineTo(w.x + w.w, w.y + 1);
      ctx.closePath();
    }
    // shadowBlur over a full-screen canvas is very costly; a thin cool
    // outline gives the caps their edge instead.
    ctx.fillStyle = "rgba(250,252,255,0.96)";
    ctx.fill();
    ctx.strokeStyle = "rgba(160,178,235,0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private drawFog(level: number) {
    const { ctx } = this;
    for (const f of this.fog) {
      ctx.globalAlpha = Math.min(1, level * f.a * 0.55);
      ctx.drawImage(this.fogSprite, f.x - f.r, f.y - f.r * 0.6, f.r * 2, f.r * 1.2);
    }
    ctx.globalAlpha = 1;
  }

  private drawSun(level: number) {
    const { ctx, W, H, t } = this;
    const sx = W * (0.12 + 0.05 * Math.sin(t * 0.03));
    const sy = -H * 0.25;
    ctx.save();
    ctx.translate(sx, sy);
    for (let i = 0; i < 7; i++) {
      const a = 0.35 + i * 0.13 + Math.sin(t * 0.07 + i * 1.7) * 0.025;
      const len = H * 1.7;
      const width = 50 + ((i * 53) % 90);
      const breathe = 0.6 + 0.4 * Math.sin(t * 0.25 + i * 2.1);
      const g = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      g.addColorStop(0, `rgba(255,222,160,${0.17 * level * breathe})`);
      g.addColorStop(0.6, `rgba(255,206,140,${0.06 * level * breathe})`);
      g.addColorStop(1, "rgba(255,214,150,0)");
      ctx.fillStyle = g;
      const nx = -Math.sin(a), ny = Math.cos(a);
      ctx.beginPath();
      ctx.moveTo(nx * width * 0.1, ny * width * 0.1);
      ctx.lineTo(Math.cos(a) * len + nx * width, Math.sin(a) * len + ny * width);
      ctx.lineTo(Math.cos(a) * len - nx * width, Math.sin(a) * len - ny * width);
      ctx.lineTo(-nx * width * 0.1, -ny * width * 0.1);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** An ellipse as its own sub-path, so many can share one fill. */
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.moveTo(x + rx, y);
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function drawLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, s: number, c: string, a: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = a;
  ctx.beginPath();
  ctx.moveTo(-s, 0);
  ctx.quadraticCurveTo(-s * 0.2, -s * 0.62, s, 0);
  ctx.quadraticCurveTo(-s * 0.2, s * 0.62, -s, 0);
  ctx.fillStyle = c;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 1.15, 0);
  ctx.lineTo(s * 0.8, 0);
  ctx.strokeStyle = "rgba(70,30,10,0.45)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.restore();
}

function resample(cap: Cap, w: number): Cap {
  const n = Math.ceil(w / CAP_COL) + 1;
  const h = new Float32Array(n);
  for (let i = 0; i < n; i++) h[i] = cap.h[Math.min(cap.h.length - 1, Math.floor((i * cap.h.length) / n))];
  return { w, h };
}

function makeFogSprite() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(225,228,245,0.5)");
  grad.addColorStop(0.5, "rgba(215,218,240,0.22)");
  grad.addColorStop(1, "rgba(210,214,240,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return c;
}
