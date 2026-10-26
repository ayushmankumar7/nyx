<script lang="ts">
  import Nyx from "../Nyx.svelte";

  let { now }: { now: number } = $props();

  const lines = [
    "The sky is quiet. Play something and I'll dance.",
    "All is calm beneath the stars.",
    "I'm keeping watch up here.",
    "Make a wish — I'm listening.",
  ];
  const line = lines[Math.floor(Math.random() * lines.length)];
  const d = $derived(new Date(now));
</script>

<div class="quiet">
  <div class="moon"><Nyx size={92} mood="awake" /></div>
  <div class="text">
    <div class="time">{d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
    <div class="date">{d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</div>
    <div class="line">{line}</div>
  </div>
</div>

<style>
  .quiet {
    display: flex;
    align-items: center;
    gap: 26px;
    padding: 4px 28px 0;
  }
  .moon {
    --glow: 14px;
    flex: none;
  }
  .time {
    font-size: 40px;
    font-weight: 300;
    line-height: 1;
    letter-spacing: -0.5px;
  }
  .date {
    margin-top: 6px;
    font-size: 13px;
    color: var(--gold);
    letter-spacing: 0.3px;
  }
  .line {
    margin-top: 12px;
    font-size: 13px;
    color: var(--muted);
  }
</style>
