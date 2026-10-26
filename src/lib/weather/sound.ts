// Rain and snow ambience, synthesised from filtered noise so there are no
// recordings to license or ship. Rain is a bright hiss with a slow swell;
// snow is a soft, muffled hush.

export class Ambience {
  private ctx?: AudioContext;
  private rain?: GainNode;
  private snow?: GainNode;

  private start() {
    const ctx = (this.ctx = new AudioContext());
    const noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = noise.getChannelData(0);
    // Pink-ish noise (Paul Kellet's economy filter).
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.18;
    }

    const layer = (lowpass: number, highpass: number) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.playbackRate.value = 0.9 + Math.random() * 0.2;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = highpass;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = lowpass;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      // A slow swell so it never sounds like a static hiss.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07 + Math.random() * 0.05;
      const depth = ctx.createGain();
      depth.gain.value = 0.25;
      const swell = ctx.createGain();
      swell.gain.value = 0.75;
      lfo.connect(depth).connect(swell.gain);
      src.connect(hp).connect(lp).connect(swell).connect(gain).connect(ctx.destination);
      src.start();
      lfo.start();
      return gain;
    };
    this.rain = layer(5200, 500);
    this.snow = layer(650, 120);
  }

  /** Levels 0..1; volume 0..1. Pass enabled=false to fade out and sleep. */
  set(enabled: boolean, rain: number, snow: number, volume: number) {
    if (!enabled || volume <= 0 || rain + snow < 0.01) {
      if (this.ctx?.state === "running") {
        this.ramp(this.rain, 0);
        this.ramp(this.snow, 0);
        const ctx = this.ctx;
        setTimeout(() => this.rain?.gain.value === 0 && ctx.suspend(), 1500);
      }
      return;
    }
    if (!this.ctx) this.start();
    if (this.ctx!.state === "suspended") this.ctx!.resume();
    this.ramp(this.rain, volume * 0.55 * rain ** 0.7);
    // Rain drowns out the hush of snow.
    this.ramp(this.snow, volume * 0.35 * snow ** 0.8 * (1 - Math.min(1, rain * 1.5)));
  }

  private ramp(g: GainNode | undefined, v: number) {
    if (!g || !this.ctx) return;
    g.gain.cancelScheduledValues(this.ctx.currentTime);
    g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.6);
  }
}
