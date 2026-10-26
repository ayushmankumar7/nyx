// To-do list state. Saved through Rust to a JSON file in the app data folder;
// the browser preview falls back to localStorage.

import { call, isTauri } from "./sky.svelte";

export type Todo = { id: string; text: string; done: boolean; createdAt: number; doneAt?: number };

class Todos {
  items = $state<Todo[]>([]);
  /** An input in the island has keyboard focus, so keep the panel open. */
  typing = $state(false);
  /** Opened by the quick-add hotkey: focus the field now, close once saved. */
  quick = $state(false);
  remaining = $derived(this.items.filter((t) => !t.done).length);
}

export const todos = new Todos();

const LOCAL = "nyx.todos";

export async function loadTodos() {
  let items: Todo[] | undefined;
  if (isTauri) items = await call<Todo[]>("load_todos");
  else {
    try {
      items = JSON.parse(localStorage.getItem(LOCAL) ?? "null") ?? demoItems();
    } catch {
      items = demoItems();
    }
  }
  todos.items = Array.isArray(items) ? items : [];
}

let saveTimer: ReturnType<typeof setTimeout>;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const items = $state.snapshot(todos.items);
    if (isTauri) call("save_todos", { todos: items });
    else
      try {
        localStorage.setItem(LOCAL, JSON.stringify(items));
      } catch {}
  }, 250);
}

export function addTodo(text: string) {
  text = text.trim();
  if (!text) return;
  todos.items = [{ id: crypto.randomUUID(), text, done: false, createdAt: Date.now() }, ...todos.items];
  persist();
}

export function toggleTodo(id: string) {
  todos.items = todos.items.map((t) =>
    t.id === id ? { ...t, done: !t.done, doneAt: t.done ? undefined : Date.now() } : t,
  );
  persist();
}

export function removeTodo(id: string) {
  todos.items = todos.items.filter((t) => t.id !== id);
  persist();
}

export function clearDone() {
  todos.items = todos.items.filter((t) => !t.done);
  persist();
}

export function setTyping(on: boolean) {
  if (todos.typing === on) return;
  todos.typing = on;
  return call("set_typing", { typing: on });
}

function demoItems(): Todo[] {
  const now = Date.now();
  return [
    { id: "1", text: "Reply to Mia about dinner by the river", done: false, createdAt: now },
    { id: "2", text: "Ship the moon phase panel", done: false, createdAt: now },
    { id: "3", text: "Water the night-blooming jasmine", done: true, createdAt: now, doneAt: now },
  ];
}
