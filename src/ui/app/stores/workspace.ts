import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { type ResourceRef, refKey } from "../workspace/refs";
import { syncWorkspaceUrl } from "../router";

// Tab metadata lives beside the ref, not inside it (DEC-0023, DEC-0025).
// preview: single-click transient — one slot per group, reused in place.
// pinned: sorted to front, never evicted, no close button (strip honours next node).
// touched: monotonically incrementing activation order for LRU eviction.
type TabMeta = { preview?: true; pinned?: true; touched: number };

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
const TAB_CAP = 12;
const RECENTS_MAX = 5;

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
    initialSplitIndex = load<number | null>("splitIndex", null);
    initialSplitOn = load<boolean>("splitOn", false);
    // Invariant: splitOn requires a valid splitIndex. Clean up inconsistent state.
    if (initialSplitOn && initialSplitIndex === null) {
      initialSplitOn = false;
    }
    initialActive0 = load<string | null>("active0", initialTabs.length > 0 ? refKey(initialTabs[0]) : null);
    initialActive1 = load<string | null>("active1", null);
  }

  // Load focused — default 0, clamped to a non-empty group on load (M2).
  let initialFocused = load<0 | 1>("focused", 0);
  if (initialFocused === 1) {
    const g1Initial = initialSplitOn && initialSplitIndex !== null
      ? initialTabs.slice(initialSplitIndex)
      : [];
    if (g1Initial.length === 0) initialFocused = 0;
  }

  const tabs = ref<ResourceRef[]>(initialTabs);
  const splitIndex = ref<number | null>(initialSplitIndex);
  const splitOn = ref<boolean>(initialSplitOn);
  const active = ref<[string | null, string | null]>([initialActive0, initialActive1]);
  const focused = ref<0 | 1>(initialFocused);

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

  // Tab metadata (preview, pinned, touched). Migration: absent entry → all flags false, touched 0.
  const meta = ref<Record<string, TabMeta>>(load<Record<string, TabMeta>>("meta", {}));

  // Recents ring: last RECENTS_MAX closed/evicted refs, newest first.
  // Step 4 adds rendering and ensures persistence; the array is exposed here so step 4 only renders.
  const recents = ref<ResourceRef[]>(load<ResourceRef[]>("recents", []));

  // LRU touch counter — initialised above any persisted touched so new activations always win.
  let touchSeq = Object.values(meta.value).reduce(
    (max, m) => Math.max(max, m.touched ?? 0), 0
  );

  // Per-episode cap-overflow warn flag — logs once when nothing is evictable (DEC-0025 / M3).
  let _capWarnSent = false;

  function persist(): void {
    save("tabs", tabs.value);
    save("splitIndex", splitIndex.value);
    save("splitOn", splitOn.value);
    save("active0", active.value[0]);
    save("active1", active.value[1]);
    save("splitRatio", splitRatio.value);
    save("meta", meta.value);
    save("focused", focused.value);
    save("recents", recents.value);
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

  function touchTab(key: string): void {
    const existing = meta.value[key] ?? { touched: 0 };
    meta.value[key] = { ...existing, touched: ++touchSeq };
  }

  function pushRecent(ref: ResourceRef): void {
    const key = refKey(ref);
    const existing = recents.value.findIndex((r) => refKey(r) === key);
    if (existing !== -1) recents.value.splice(existing, 1);
    recents.value.unshift(ref);
    if (recents.value.length > RECENTS_MAX) recents.value = recents.value.slice(0, RECENTS_MAX);
  }

  // Evict the least-recently-activated non-pinned, non-preview tab when over cap.
  // Never evicts a visibly active tab (DEC-0025 S2).
  // Logs once per overflow episode when nothing is evictable (M3).
  function maybeEvict(): void {
    const nonPinnedCount = tabs.value.filter((t) => !meta.value[refKey(t)]?.pinned).length;
    if (nonPinnedCount <= TAB_CAP) {
      _capWarnSent = false;
      return;
    }

    const activeKeys = new Set<string>(
      [active.value[0], active.value[1]].filter((k): k is string => k !== null)
    );

    const candidates = tabs.value.filter((t) => {
      const k = refKey(t);
      return !meta.value[k]?.pinned && !meta.value[k]?.preview && !activeKeys.has(k);
    });

    if (candidates.length === 0) {
      if (!_capWarnSent) {
        console.warn("[workspace] tab cap exceeded: all tabs pinned");
        _capWarnSent = true;
      }
      return;
    }

    _capWarnSent = false;

    const victim = candidates.reduce((a, b) =>
      (meta.value[refKey(a)]?.touched ?? 0) <= (meta.value[refKey(b)]?.touched ?? 0) ? a : b
    );
    const victimKey = refKey(victim);
    pushRecent(victim);

    const victimIdx = keyIndex(victimKey);
    if (victimIdx !== -1) {
      tabs.value.splice(victimIdx, 1);
      if (splitOn.value && splitIndex.value !== null && victimIdx < splitIndex.value) {
        splitIndex.value--;
      }
      if (splitOn.value && splitIndex.value !== null) {
        if (groupTabs(0).length === 0 || groupTabs(1).length === 0) {
          splitOn.value = false;
          splitIndex.value = null;
        }
      }
    }

    delete meta.value[victimKey];
    fixupActive();
  }

  function open(ref: ResourceRef, opts: { preview?: boolean; side?: boolean; background?: boolean } = {}): void {
    const key = refKey(ref);
    const existingIdx = keyIndex(key);

    if (existingIdx !== -1) {
      // Existing tab: a non-preview open on a preview tab promotes it to permanent.
      if (!opts.preview && meta.value[key]?.preview) {
        const m = meta.value[key]!;
        const result: TabMeta = { touched: m.touched };
        if (m.pinned) result.pinned = true;
        meta.value[key] = result;
      }
      if (!opts.background) {
        const g = tabGroup(existingIdx);
        active.value[g] = key;
        focused.value = g;
        touchTab(key);
        persist();
        syncWorkspaceUrl(false);
      }
      return;
    }

    const targetGroup: 0 | 1 = opts.side ? 1 : focused.value;

    if (opts.preview) {
      // Reuse the group's existing preview slot in place — same index, same group.
      const groupT = groupTabs(targetGroup);
      const previewTab = groupT.find((t) => meta.value[refKey(t)]?.preview);
      if (previewTab) {
        const oldKey = refKey(previewTab);
        const absIdx = keyIndex(oldKey);
        delete meta.value[oldKey];
        meta.value[key] = { preview: true, touched: ++touchSeq };
        tabs.value.splice(absIdx, 1, ref);
        if (!opts.background) {
          active.value[targetGroup] = key;
          focused.value = targetGroup;
          persist();
          syncWorkspaceUrl(true);
        }
        return;
      }
      // No existing preview slot — fall through to normal insert, mark as preview.
    }

    if (opts.side && !(splitOn.value && splitIndex.value !== null)) {
      // Create a split: append to end, the new tab becomes the only item in group 1.
      tabs.value.push(ref);
      splitIndex.value = tabs.value.length - 1;
      splitOn.value = true;
      const m: TabMeta = { touched: ++touchSeq };
      if (opts.preview) m.preview = true;
      meta.value[key] = m;
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
      const m: TabMeta = { touched: ++touchSeq };
      if (opts.preview) m.preview = true;
      meta.value[key] = m;
      if (!opts.background) {
        active.value[targetGroup] = key;
        focused.value = targetGroup;
      }
    }

    maybeEvict();
    persist();
    if (!opts.background) syncWorkspaceUrl(true);
  }

  function close(key: string): void {
    const idx = keyIndex(key);
    if (idx === -1) return;

    pushRecent(tabs.value[idx]);
    tabs.value.splice(idx, 1);
    delete meta.value[key];
    _capWarnSent = false;

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

    // If no tabs remain, leave the workspace empty (Open menu is always reachable).
    if (tabs.value.length === 0) {
      active.value = [null, null];
      focused.value = 0;
      persist();
      syncWorkspaceUrl(false);
      return;
    }

    fixupActive();
    persist();
    syncWorkspaceUrl(false);
  }

  // Pinned tabs sort to the front of their group and are never evicted.
  // Pinning also clears the preview flag.
  function pin(key: string): void {
    const idx = keyIndex(key);
    if (idx === -1) return;
    const g = tabGroup(idx);
    const tabRef = tabs.value[idx];
    const m = meta.value[key] ?? { touched: 0 };
    meta.value[key] = { touched: m.touched, pinned: true };

    // Move to front of its group.
    tabs.value.splice(idx, 1);
    if (splitOn.value && splitIndex.value !== null && idx < splitIndex.value) {
      splitIndex.value--;
    }
    const groupStart = g === 0
      ? 0
      : (splitOn.value && splitIndex.value !== null ? splitIndex.value : tabs.value.length);
    tabs.value.splice(groupStart, 0, tabRef);
    if (splitOn.value && splitIndex.value !== null && groupStart < splitIndex.value) {
      splitIndex.value++;
    }

    persist();
  }

  function unpin(key: string): void {
    const m = meta.value[key];
    if (!m) return;
    const result: TabMeta = { touched: m.touched };
    if (m.preview) result.preview = true;
    meta.value[key] = result;
    persist();
  }

  // closeOthers: close all non-pinned tabs in the same group, except the target key.
  function closeOthers(key: string): void {
    const idx = keyIndex(key);
    if (idx === -1) return;
    const g = tabGroup(idx);
    const toClose = groupTabs(g)
      .filter((t) => refKey(t) !== key && !meta.value[refKey(t)]?.pinned)
      .map((t) => refKey(t));
    for (const k of toClose) {
      const tab = tabs.value.find((t) => refKey(t) === k);
      if (tab) pushRecent(tab);
      const i = keyIndex(k);
      if (i !== -1) {
        tabs.value.splice(i, 1);
        if (splitOn.value && splitIndex.value !== null && i < splitIndex.value) {
          splitIndex.value--;
        }
      }
      delete meta.value[k];
    }
    if (splitOn.value && splitIndex.value !== null) {
      if (groupTabs(0).length === 0 || groupTabs(1).length === 0) {
        splitOn.value = false;
        splitIndex.value = null;
      }
    }
    _capWarnSent = false;
    fixupActive();
    persist();
    syncWorkspaceUrl(false);
  }

  // closeToRight: close non-pinned tabs to the right of key within its group.
  function closeToRight(key: string): void {
    const idx = keyIndex(key);
    if (idx === -1) return;
    const g = tabGroup(idx);
    const groupT = groupTabs(g);
    const posInGroup = idx - (g === 0 ? 0 : group0End());
    const toClose = groupT.slice(posInGroup + 1)
      .filter((t) => !meta.value[refKey(t)]?.pinned)
      .map((t) => refKey(t));
    for (const k of toClose) {
      const tab = tabs.value.find((t) => refKey(t) === k);
      if (tab) pushRecent(tab);
      const i = keyIndex(k);
      if (i !== -1) {
        tabs.value.splice(i, 1);
        if (splitOn.value && splitIndex.value !== null && i < splitIndex.value) {
          splitIndex.value--;
        }
      }
      delete meta.value[k];
    }
    if (splitOn.value && splitIndex.value !== null) {
      if (groupTabs(0).length === 0 || groupTabs(1).length === 0) {
        splitOn.value = false;
        splitIndex.value = null;
      }
    }
    _capWarnSent = false;
    fixupActive();
    persist();
    syncWorkspaceUrl(false);
  }

  // closeAll: close all non-pinned tabs across both groups.
  function closeAll(): void {
    const toClose = tabs.value
      .filter((t) => !meta.value[refKey(t)]?.pinned)
      .map((t) => refKey(t));
    for (const k of toClose) {
      const tab = tabs.value.find((t) => refKey(t) === k);
      if (tab) pushRecent(tab);
      const i = keyIndex(k);
      if (i !== -1) {
        tabs.value.splice(i, 1);
        if (splitOn.value && splitIndex.value !== null && i < splitIndex.value) {
          splitIndex.value--;
        }
      }
      delete meta.value[k];
    }
    if (tabs.value.length === 0) {
      active.value = [null, null];
      focused.value = 0;
      splitOn.value = false;
      splitIndex.value = null;
      _capWarnSent = false;
      persist();
      syncWorkspaceUrl(false);
      return;
    }
    if (splitOn.value && splitIndex.value !== null) {
      if (groupTabs(0).length === 0 || groupTabs(1).length === 0) {
        splitOn.value = false;
        splitIndex.value = null;
      }
    }
    _capWarnSent = false;
    fixupActive();
    persist();
    syncWorkspaceUrl(false);
  }

  function move(key: string, toIndex: number): void {
    const fromIdx = keyIndex(key);
    if (fromIdx === -1) return;
    const tabRef = tabs.value[fromIdx];
    tabs.value.splice(fromIdx, 1);
    const clampedTo = Math.max(0, Math.min(tabs.value.length, toIndex));
    tabs.value.splice(clampedTo, 0, tabRef);
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

    const tabRef = tabs.value[fromIdx];
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
    tabs.value.splice(insertAt, 0, tabRef);
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

  // focus() now calls syncWorkspaceUrl — F10 fix (R11 D1-r).
  function focus(group: 0 | 1): void {
    focused.value = group;
    syncWorkspaceUrl(false);
  }

  function activate(key: string): void {
    const idx = keyIndex(key);
    if (idx === -1) return;
    const g = tabGroup(idx);
    active.value[g] = key;
    focused.value = g;
    touchTab(key);
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
    meta,
    recents,
    groupTabs,
    tabGroup,
    refKey,
    open,
    close,
    pin,
    unpin,
    closeOthers,
    closeToRight,
    closeAll,
    move,
    moveToGroup,
    toggleSplit,
    focus,
    activate,
    focusedActiveRef,
  };
});
