import { defineStore } from "pinia";
import { ref } from "vue";

// The typed address for everything throwable into the reading pane.
// kind:"task" is reserved for Phase 3 and is not built here.
export type ReadingRef =
  | { kind: "file"; path: string; branch?: string }
  | { kind: "report"; path: string };

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem("reading." + key);
    if (v === null) return fallback;
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try { localStorage.setItem("reading." + key, JSON.stringify(value)); } catch {}
}

export const useReadingStore = defineStore("reading", () => {
  // One-time migration: split.enabled → reading.open (spec R7).
  if (typeof localStorage !== "undefined" && localStorage.getItem("split.enabled") === "1") {
    localStorage.setItem("reading.open", "true");
    localStorage.removeItem("split.enabled");
  }

  const open = ref<boolean>(load("open", false));
  const side = ref<"left" | "right">(load("side", "right"));
  const width = ref<number>(load("width", 380));
  const stack = ref<ReadingRef[]>(load("stack", []));
  const activeIndex = ref<number>(0);
  const dragActive = ref<boolean>(false);

  function setOpen(v: boolean): void {
    open.value = v;
    save("open", v);
  }

  function toggle(): void { setOpen(!open.value); }

  function setSide(s: "left" | "right"): void {
    side.value = s;
    save("side", s);
  }

  function setWidth(w: number): void {
    width.value = w;
    save("width", w);
  }

  // Throw a ref to the pane. Activates existing if path already in stack.
  function throwRef(ref: ReadingRef): void {
    const existing = stack.value.findIndex(r => r.path === ref.path);
    if (existing !== -1) {
      activeIndex.value = existing;
    } else {
      stack.value.push(ref);
      activeIndex.value = stack.value.length - 1;
      save("stack", stack.value);
    }
    setOpen(true);
  }

  function activate(index: number): void {
    if (index >= 0 && index < stack.value.length) {
      activeIndex.value = index;
    }
  }

  function closeItem(index: number): void {
    stack.value.splice(index, 1);
    save("stack", stack.value);
    if (activeIndex.value >= stack.value.length) {
      activeIndex.value = Math.max(0, stack.value.length - 1);
    }
  }

  function setDragActive(v: boolean): void { dragActive.value = v; }

  return {
    open, side, width, stack, activeIndex, dragActive,
    setOpen, toggle, setSide, setWidth, throwRef, activate, closeItem, setDragActive,
  };
});
