<script lang="ts">
  import { litPath, phase } from "../moon";

  let { now }: { now: number } = $props();

  const p = $derived(phase(now));
  const days = $derived(Math.round(p.daysToFull));
  const R = 40;
</script>

<div class="phase">
  <svg class="moon" width="104" height="104" viewBox="-52 -52 104 104" aria-hidden="true">
    <defs>
      <radialGradient id="ph-lit" cx="40%" cy="35%" r="75%">
        <stop offset="0" stop-color="#fffbf1" />
        <stop offset="0.6" stop-color="#f3e4c0" />
        <stop offset="1" stop-color="#d6bd8b" />
      </radialGradient>
      <clipPath id="ph-clip"><path d={litPath(p.fraction, R)} /></clipPath>
    </defs>
    <circle r={R + 10} fill="rgba(255,220,160,0.06)" />
    <circle r={R} fill="#191838" stroke="rgba(255,240,220,0.08)" />
    <g clip-path="url(#ph-clip)">
      <circle r={R} fill="url(#ph-lit)" />
      <g fill="#e3cd9e" opacity="0.7">
        <circle cx="-14" cy="-16" r="7" />
        <circle cx="12" cy="-20" r="4" />
        <circle cx="18" cy="6" r="6" />
        <circle cx="-20" cy="10" r="3.5" />
        <circle cx="4" cy="22" r="4.5" />
      </g>
    </g>
  </svg>

  <div class="text">
    <div class="label">Tonight's moon</div>
    <div class="name">{p.name}</div>
    <div class="facts">
      <span>{Math.round(p.illumination * 100)}% illuminated</span>
      <span class="dot">✦</span>
      <span>{days === 0 ? "Full tonight" : `Full in ${days} ${days === 1 ? "day" : "days"}`}</span>
    </div>
  </div>
</div>

<style>
  .phase {
    display: flex;
    align-items: center;
    gap: 26px;
    padding: 4px 28px 0;
  }
  .moon {
    flex: none;
    filter: drop-shadow(0 0 16px rgba(255, 220, 160, 0.4));
    animation: drift 8s ease-in-out infinite;
  }
  @keyframes drift {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
  }
  .label {
    font-size: 11px;
    letter-spacing: 1.6px;
    text-transform: uppercase;
    color: var(--lilac);
  }
  .name {
    margin-top: 6px;
    font-size: 28px;
    font-weight: 300;
  }
  .facts {
    display: flex;
    gap: 8px;
    margin-top: 10px;
    font-size: 13px;
    color: var(--muted);
  }
  .dot {
    color: var(--gold);
  }
</style>
