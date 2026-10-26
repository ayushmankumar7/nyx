<script lang="ts">
  let { playing = true, height = 16 } = $props();
</script>

<div class="eq" class:playing style="height:{height}px" aria-hidden="true">
  <i style="animation-delay:-0.2s"></i>
  <i style="animation-delay:-0.65s"></i>
  <i style="animation-delay:-0.4s"></i>
  <i style="animation-delay:-0.9s"></i>
</div>

<style>
  .eq {
    display: flex;
    align-items: flex-end;
    gap: 2.5px;
    flex: none;
  }
  i {
    width: 3px;
    height: 30%;
    border-radius: 2px;
    background: linear-gradient(to top, var(--violet), var(--lilac));
    box-shadow: 0 0 6px rgba(157, 140, 255, 0.55);
    transition: height 0.4s;
  }
  .playing i {
    animation: level 1.1s ease-in-out infinite alternate;
  }
  @keyframes level {
    0% { height: 25%; }
    30% { height: 95%; }
    55% { height: 45%; }
    80% { height: 80%; }
    100% { height: 35%; }
  }
</style>
