import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { type ResourceRef, refKey } from "../workspace/refs";
import { syncWorkspaceUrl } from "../router";

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem("workspace." + key);
    if (v === null) return fallback;
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try { localStorage.setItem("workspace." + key, JSON.stringify(value)); } catch {}
}

function migrateFromReading(): {
  tabs: ResourceRef[];
  active1: string | null;
  splitOn: boolean;
} {
  // One-time migration from the Phase 2 reading pane store.
  try {
    type OldRef = { kind: "file" | "report"; path: string; branch?: string };
    const rawStack = localStorage.getItem("reading.stack");
    if (!rawStack) return { tabs: [], active1: null, splitOn: false };
    const stack = JSON.parse(rawStack) as OldRef[];
    const openVal = localStorage.getItem("reading.open");
    const wasOpen = openVal === "true";
    const tabs: ResourceRef[] = stack.map((r) => {
      if (r.kind === "file") return { kind: "file", path: r.path, branch: r.branch } as ResourceRef;
      // report: derive taskId from path (last segment without .md)
      const base = r.path.split("/").pop()?.replace(/\.md$/, "") ?? r.path;
      return { kind: "report", taskId: base, path: r.path } as ResourceRef;
    });
    const active1 = wasOpen && tabs.length > 0 ? refKey(tabs[tabs.length - 1]) : null;
    // Clean up old keys
    ["open", "side", "width", "stack"].forEach((k) => {
      localStorage.removeItem("reading." + k);
    });
    localStorage.removeItem("split.enabled");
    return { tabs, active1, splitOn: wasOpen && tabs.length > 0 };
  } catch {
    return { tabs: [], active1: null, splitOn: false };
  }
}

const DASHBOARD_REF: ResourceRef = { kind: "dashboard" };

export const useWorkspaceStore = defineStore("workspace", () => {
  // Perform migration from reading.* if workspace.* hasn't been written yet.
  const hasWorkspaceData = localStorage.getItem("workspace.tabs") !== null;
  let initialTabs: ResourceRef[];
  let initialSplitIndex: number | null;
  let initialSplitOn: boolean;
  let initialActive0: string | null;
  let initialActive1: string | null;

  if (!hasWorkspaceData) {
    const migrated = migrateFromReading();
    if (migrated.tabs.length > 0) {
      // If the reading pane was open, put the migrated tabs on the right.
      const mainTab = DASHBOARD_REF;
      initialTabs = [mainTab, ...migrated.tabs];
      if (migrated.splitOn) {
        initialSplitIndex = 1;
        initialSplitOn = true;
        initialActive0 = refKey(mainTab);
        initialActive1 = migrated.active1;
      } else {
        initialSplitIndex = null;
        initialSplitOn = false;
        initialActive0 = refKey(mainTab);
        initialActive1 = null;
      }
    } else {
      initialTabs = [DASHBOARD_REF];
      initialSplitIndex = null;
      initialSplitOn = false;
      initialActive0 = "dashboard";
      initialActive1 = null;
    }
  } else {
    initialTabs = load<ResourceRef[]>("tabs", [DASHBOARD_REF]);
    if (initialTabs.length === 0) initialTabs = [DASHBOARD_REF];
    initialSplitIndex = load<number | null>("splitIndex", null);
    initialSplitOn = load<boolean>("splitOn", false);
    // Invariant: splitOn requires a valid splitIndex. Clean up inconsistent state.
    if (initialSplitOn && initialSplitIndex === null) {
      initialSplitOn = false;
    }
    initialActive0 = load<string | null>("active0", refKey(initialTabs[0]));
    initialActive1 = load<string | null>("active1", null);
  }

  const tabs = ref<ResourceRef[]>(initialTabs);
  const splitIndex = ref<number | null>(initialSplitIndex);
  const splitOn = ref<boolean>(initialSplitOn);
  const active = ref<[string | null, string | null]>([initialActive0, initialActive1]);
  const focused = ref<0 | 1>(0);

  // Group 0: tabs[0..splitIndex) — group 1: tabs[splitIndex..end)
  // When split is not on, all tabs belong to group 0.
  function group0End(): number {
    return splitOn.value && splitIndex.value !== null ? splitIndex.value : tabs.value.length;
  }

  function tabGroup(idx: number): 0 | 1 {
    if (!splitOn.value || splitIndex.value === null) return 0;
    return idx >= splitIndex.value ? 1 : 0;
  }

  function groupTabs(g: 0 | 1): ResourceRef[] {
    const end = group0End();
    return g === 0 ? tabs.value.slice(0, end) : tabs.value.slice(end);
  }

  function keyIndex(key: string): number {
    return tabs.value.findIndex((t) => refKey(t) === key);
  }

  const splitRatio = ref<number>(
    Math.min(0.75, Math.max(0.25, load<number>("splitRatio", 0.5)))
  );

  function persist(): void {
    save("tabs", tabs.value);
    save("splitIndex", splitIndex.value);
    save("splitOn", splitOn.value);
    save("active0", active.value[0]);
    save("active1", active.value[1]);
    save("splitRatio", splitRatio.value);
  }

  // Ensure active keys are valid; fix up if a tab was closed.
  function fixupActive(): void {
    const g0 = groupTabs(0);
    const g1 = groupTabs(1);
    if (g0.length > 0 && (active.value[0] === null || !g0.find((t) => refKey(t) === active.value[0]))) {
      active.value[0] = refKey(g0[g0.length - 1]);
    } else if (g0.length === 0) {
      active.value[0] = null;
    }
    if (g1.length > 0 && (active.value[1] === null || !g1.find((t) => refKey(t) === active.value[1]))) {
      active.value[1] = refKey(g1[g1.length - 1]);
    } else if (g1.length === 0) {
      active.value[1] = null;
    }
  }

  function open(ref: ResourceRef, opts: { side?: boolean; background?: boolean } = {}): void {
    const key = refKey(ref);
    const existingIdx = keyIndex(key);

    if (existingIdx !== -1) {
      // Already present — focus it (unless background).
      if (!opts.background) {
        const g = tabGroup(existingIdx);
        active.value[g] = key;
        focused.value = g;
        persist();
        syncWorkspaceUrl(false);
      }
      return;
    }

    const targetGroup: 0 | 1 = opts.side ? 1 : focused.value;

    if (opts.side && !(splitOn.value && splitIndex.value !== null)) {
      // Create a split: append to end, the new tab becomes the only item in group 1.
      tabs.value.push(ref);
      splitIndex.value = tabs.value.length - 1;
      splitOn.value = true;
      if (!opts.background) {
        active.value[1] = key;
        focused.value = 1;
      }
    } else {
      // Insert after the active tab of the target group, or at the end of the group.
      const activeKey = active.value[targetGroup];
      let insertIdx: number;
      if (activeKey !== null) {
        const activeTabIdx = keyIndex(activeKey);
        insertIdx = activeTabIdx !== -1 ? activeTabIdx + 1 : group0End();
      } else {
        insertIdx = targetGroup === 0 ? group0End() : tabs.value.length;
      }
      // Clamp to group boundaries.
      const groupEnd = targetGroup === 0 ? group0End() : tabs.value.length;
      const groupStart = targetGroup === 0 ? 0 : group0End();
      insertIdx = Math.max(groupStart, Math.min(groupEnd, insertIdx));

      tabs.value.splice(insertIdx, 0, ref);
      // Adjust splitIndex if we inserted before it.
      if (splitOn.value && splitIndex.value !== null && insertIdx <= splitIndex.value) {
        splitIndex.value++;
      }
      if (!opts.background) {
        active.value[targetGroup] = key;
        focused.value = targetGroup;
      }
    }
    persist();
    if (!opts.background) syncWorkspaceUrl(true);
  }

  function close(key: string): void {
    const idx = keyIndex(key);
    if (idx === -1) return;

    tabs.value.splice(idx, 1);

    // Adjust splitIndex after removal.
    if (splitOn.value && splitIndex.value !== null) {
      if (idx < splitIndex.value) {
        splitIndex.value--;
      }
      // If a group is now empty, turn off split.
      const g0 = groupTabs(0);
      const g1 = groupTabs(1);
      if (g0.length === 0 || g1.length === 0) {
        splitOn.value = false;
        splitIndex.value = null;
      }
    }

    // If no tabs remain, open the dashboard.
    if (tabs.value.length === 0) {
      tabs.value.push(DASHBOARD_REF);
      active.value = [refKey(DASHBOARD_REF), null];
      focused.value = 0;
      persist();
      return;
    }

    fixupActive();
    persist();
    syncWorkspaceUrl(false);
  }

  function move(key: string, toIndex: number): void {
    const fromIdx = keyIndex(key);
    if (fromIdx === -1) return;
    const ref = tabs.value[fromIdx];
    tabs.value.splice(fromIdx, 1);
    const clampedTo = Math.max(0, Math.min(tabs.value.length, toIndex));
    tabs.value.splice(clampedTo, 0, ref);
    // Adjust splitIndex
    if (splitOn.value && splitIndex.value !== null) {
      // Recalculate: if the element moved across the split boundary, adjust.
      // Simple approach: recompute splitIndex to keep the same split content.
      // If the split had index S, after removing fromIdx and inserting at clampedTo:
      let s = splitIndex.value;
      if (fromIdx < s) s--; // removal shifted S left
      if (clampedTo <= s) s++; // insertion shifted S right
      // Clamp: group 1 must not be empty (at least 1 tab)
      splitIndex.value = Math.max(1, Math.min(tabs.value.length - 1, s));
    }
    persist();
  }

  function moveToGroup(key: string, targetGroup: 0 | 1): void {
    const fromIdx = keyIndex(key);
    if (fromIdx === -1) return;
    if (tabGroup(fromIdx) === targetGroup) return;

    const ref = tabs.value[fromIdx];
    tabs.value.splice(fromIdx, 1);
    if (splitIndex.value !== null && fromIdx < splitIndex.value) {
      splitIndex.value--;
    }

    // If a group became empty, collapse split before inserting
    if (splitOn.value && splitIndex.value !== null) {
      const g1Start = splitIndex.value;
      if (g1Start <= 0 || g1Start >= tabs.value.length) {
        splitOn.value = false;
        splitIndex.value = null;
      }
    }

    const insertAt = targetGroup === 0
      ? 0
      : (splitOn.value && splitIndex.value !== null ? splitIndex.value : tabs.value.length);
    tabs.value.splice(insertAt, 0, ref);
    if (splitOn.value && splitIndex.value !== null && insertAt <= splitIndex.value) {
      splitIndex.value++;
    }

    fixupActive();
    persist();
    syncWorkspaceUrl(false);
  }

  function toggleSplit(): void {
    if (splitOn.value) {
      splitOn.value = false;
      splitIndex.value = null;
    } else {
      if (tabs.value.length >= 2) {
        if (splitIndex.value === null) splitIndex.value = 1;
        splitOn.value = true;
        fixupActive();
      }
    }
    persist();
    syncWorkspaceUrl(false);
  }

  function focus(group: 0 | 1): void {
    focused.value = group;
  }

  function activate(key: string): void {
    const idx = keyIndex(key);
    if (idx === -1) return;
    const g = tabGroup(idx);
    active.value[g] = key;
    focused.value = g;
    persist();
    syncWorkspaceUrl(false);
  }

  // Computed: the active ref for the focused group (for URL sync).
  const focusedActiveRef = computed((): ResourceRef | null => {
    const key = active.value[focused.value];
    if (!key) return null;
    return tabs.value.find((t) => refKey(t) === key) ?? null;
  });

  return {
    tabs,
    splitIndex,
    splitOn,
    splitRatio,
    active,
    focused,
    groupTabs,
    tabGroup,
    refKey,
    open,
    close,
    move,
    moveToGroup,
    toggleSplit,
    focus,
    activate,
    focusedActiveRef,
  };
});
