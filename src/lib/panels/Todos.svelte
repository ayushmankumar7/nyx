<script lang="ts">
  import { flip } from "svelte/animate";
  import { fly, fade } from "svelte/transition";
  import { tick } from "svelte";
  import Nyx from "../Nyx.svelte";
  import MoonGlyph from "../MoonGlyph.svelte";
  import { PRESETS, clock, focus, startFocus, stopFocus } from "../focus.svelte";
  import { addTodo, clearDone, removeTodo, setTyping, todos, toggleTodo } from "../todos.svelte";

  let { onSparkle }: { onSparkle?: (x: number, y: number) => void } = $props();

  let input: HTMLInputElement;
  let draft = $state("");

  const ordered = $derived([
    ...todos.items.filter((t) => !t.done),
    ...todos.items.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)),
  ]);
  const doneCount = $derived(todos.items.length - todos.remaining);

  // The island window can't receive keys until it's made focusable, so ask
  // for focus first and only then focus the field.
  async function beginTyping(e: PointerEvent) {
    if (todos.typing) return;
    e.preventDefault();
    await setTyping(true);
    input.focus();
  }

  // Quick-add hotkey: jump straight into the field.
  $effect(() => {
    if (!todos.quick || todos.typing) return;
    tick().then(async () => {
      await setTyping(true);
      input?.focus();
    });
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    addTodo(draft);
    draft = "";
    if (todos.quick) input.blur(); // quick-add: save and get out of the way
  }

  function blurred() {
    todos.quick = false;
    setTyping(false);
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === "Escape") input.blur();
  }

  function check(e: MouseEvent, id: string, wasDone: boolean) {
    toggleTodo(id);
    if (!wasDone) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onSparkle?.(r.left + r.width / 2, r.top + r.height / 2);
    }
  }
</script>

<div class="todos">
  <form onsubmit={submit} class:focused={todos.typing}>
    <span class="star">✦</span>
    <input
      bind:this={input}
      bind:value={draft}
      onpointerdown={beginTyping}
      onblur={blurred}
      onkeydown={keydown}
      placeholder="What should the moon remember?"
      maxlength="140"
      spellcheck="false"
    />
    {#if draft.trim()}
      <button class="add" type="submit" transition:fade={{ duration: 120 }}>Add ↵</button>
    {/if}
  </form>

  {#if focus.running}
    <div class="focus" transition:fly={{ y: -6, duration: 260 }}>
      <MoonGlyph progress={focus.progress} size={20} />
      <span class="what">{focus.task ?? "Focusing"}</span>
      <span class="left">{clock(focus.leftMs)}</span>
      <button class="stop" onclick={stopFocus} aria-label="Stop focus" title="Stop">■</button>
    </div>
  {/if}

  {#if ordered.length === 0}
    <div class="empty" in:fade>
      <Nyx size={40} mood="sleep" />
      <span>Nothing to do. Rest under the stars.</span>
    </div>
  {:else}
    <ul>
      {#each ordered as t (t.id)}
        <li
          class:done={t.done}
          animate:flip={{ duration: 380 }}
          in:fly={{ y: -8, duration: 300 }}
          out:fly={{ x: 24, duration: 220 }}
        >
          <button
            class="check"
            aria-label={t.done ? "Mark not done" : "Mark done"}
            onclick={(e) => check(e, t.id, t.done)}
          >
            {#if t.done}<span class="tick" in:fade={{ duration: 200 }}>✦</span>{/if}
          </button>
          <span class="text" title={t.text}>{t.text}</span>
          {#if !t.done}
            <button
              class="play"
              aria-label="Focus on this for 25 minutes"
              title="Focus on this for 25 min"
              onclick={() => startFocus(25, t.text)}>▶</button>
          {/if}
          <button class="remove" aria-label="Delete" onclick={() => removeTodo(t.id)}>×</button>
        </li>
      {/each}
    </ul>
  {/if}

  <footer>
    <span>
      {#if todos.remaining === 0 && todos.items.length}All done — the moon is proud of you.
      {:else}{todos.remaining} left{/if}
    </span>
    <span class="actions">
      {#if !focus.running}
        <span class="presets" title="Start a focus session">
          <MoonGlyph progress={0.6} size={12} />
          {#each PRESETS as m}
            <button onclick={() => startFocus(m)}>{m}m</button>
          {/each}
        </span>
      {/if}
      {#if doneCount > 0}
        <button class="clear" onclick={clearDone}>Clear {doneCount} done</button>
      {/if}
    </span>
  </footer>
</div>

<style>
  .todos {
    display: flex;
    flex-direction: column;
    height: 212px;
    padding: 2px 22px 0;
  }
  form {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 38px;
    padding: 0 6px 0 14px;
    border-radius: 19px;
    background: rgba(255, 255, 255, 0.05);
    box-shadow: inset 0 0 0 1px rgba(255, 236, 200, 0.08);
    transition: background 0.3s, box-shadow 0.3s;
  }
  form.focused {
    background: rgba(255, 255, 255, 0.08);
    box-shadow:
      inset 0 0 0 1px rgba(255, 217, 154, 0.35),
      0 0 18px rgba(255, 210, 150, 0.15);
  }
  .star {
    font-size: 11px;
    color: var(--gold);
    text-shadow: 0 0 6px rgba(255, 210, 140, 0.8);
  }
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 14px;
    caret-color: var(--gold);
    user-select: text;
  }
  input::placeholder {
    color: rgba(232, 226, 255, 0.38);
  }
  .add {
    height: 26px;
    padding: 0 12px;
    border: 0;
    border-radius: 13px;
    background: linear-gradient(90deg, var(--violet), #b49cff);
    color: #fff;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  ul {
    flex: 1;
    min-height: 0;
    margin: 8px 0 0;
    padding: 0 4px 0 0;
    list-style: none;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
  }
  li {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 34px;
    padding: 0 6px 0 10px;
    border-radius: 10px;
    transition: background 0.2s;
  }
  li:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  .check {
    display: grid;
    place-items: center;
    flex: none;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1.5px solid rgba(232, 226, 255, 0.4);
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
    transition: border-color 0.2s, background 0.3s, box-shadow 0.3s;
  }
  .check:hover {
    border-color: var(--gold);
  }
  .done .check {
    border-color: transparent;
    background: radial-gradient(circle at 35% 30%, #fff6dd, var(--gold));
    box-shadow: 0 0 10px rgba(255, 210, 140, 0.6);
  }
  .tick {
    font-size: 10px;
    line-height: 1;
    color: #3a2a10;
  }
  .text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 14px;
    transition: color 0.3s, opacity 0.3s;
  }
  .done .text {
    color: var(--muted);
    opacity: 0.6;
    text-decoration: line-through;
    text-decoration-color: rgba(255, 217, 154, 0.5);
  }
  .play {
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--gold);
    font-size: 9px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s, background 0.2s;
  }
  li:hover .play {
    opacity: 0.8;
  }
  .play:hover {
    opacity: 1;
    background: rgba(255, 217, 154, 0.12);
  }
  .remove {
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s, background 0.2s;
  }
  li:hover .remove {
    opacity: 1;
  }
  .remove:hover {
    background: rgba(255, 120, 120, 0.15);
    color: #ffb3b3;
  }

  .empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    font-size: 13px;
    color: var(--muted);
  }

  footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 30px;
    padding: 0 10px;
    font-size: 11.5px;
    color: var(--muted);
  }
  .focus {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 32px;
    margin-top: 8px;
    padding: 0 6px 0 12px;
    border-radius: 16px;
    background: linear-gradient(90deg, rgba(143, 125, 255, 0.16), rgba(255, 217, 154, 0.1));
    box-shadow: inset 0 0 0 1px rgba(255, 236, 200, 0.1);
    font-size: 13px;
  }
  .what {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .left {
    color: var(--gold);
    font-variant-numeric: tabular-nums;
  }
  .stop {
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
    font-size: 9px;
    cursor: pointer;
  }
  .stop:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text);
  }
  .actions,
  .presets {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .actions {
    gap: 14px;
  }
  .presets button {
    padding: 2px 7px;
    border: 0;
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.06);
    color: var(--muted);
    font: inherit;
    cursor: pointer;
  }
  .presets button:hover {
    background: rgba(255, 217, 154, 0.15);
    color: var(--gold);
  }
  .clear {
    border: 0;
    background: transparent;
    color: var(--lilac);
    font: inherit;
    cursor: pointer;
  }
  .clear:hover {
    color: var(--text);
  }
</style>
