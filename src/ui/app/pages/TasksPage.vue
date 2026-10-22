<template>
  <div id="tasks-panel" class="tasks-panel">
    <div class="tasks-view-tabs" id="tasks-view-tabs" role="tablist" aria-label="Open panel view">
      <button
        type="button"
        class="tasks-view-tab"
        :class="{ 'is-active': tasksStore.view === 'projects' }"
        data-view="projects"
        role="tab"
        :aria-selected="tasksStore.view === 'projects' ? 'true' : 'false'"
        @click="setView('projects')"
      >Projects</button>
      <button
        type="button"
        class="tasks-view-tab"
        :class="{ 'is-active': tasksStore.view === 'all' }"
        data-view="all"
        role="tab"
        :aria-selected="tasksStore.view === 'all' ? 'true' : 'false'"
        @click="setView('all')"
      >Tasks</button>
    </div>
    <div class="tasks-toolbar">
      <div class="tasks-filter-chips" id="tasks-filter-chips" role="tablist" aria-label="Filter tasks by status">
        <button type="button" class="tasks-filter-chip" :class="{ 'is-active': tasksStore.filter === 'all' }" data-filter="all" @click="tasksStore.filter = 'all'">All</button>
        <button type="button" class="tasks-filter-chip" :class="{ 'is-active': tasksStore.filter === 'open' }" data-filter="open" @click="tasksStore.filter = 'open'">Open</button>
        <button type="button" class="tasks-filter-chip" :class="{ 'is-active': tasksStore.filter === 'waiting' }" data-filter="waiting" @click="tasksStore.filter = 'waiting'">Waiting</button>
        <button type="button" class="tasks-filter-chip" :class="{ 'is-active': tasksStore.filter === 'done' }" data-filter="done" @click="tasksStore.filter = 'done'">Done</button>
        <button type="button" class="tasks-filter-chip" :class="{ 'is-active': tasksStore.filter === 'failed' }" data-filter="failed" @click="tasksStore.filter = 'failed'">Failed</button>
      </div>
      <div class="tasks-toolbar-right">
        <button id="tasks-new-btn" class="tasks-toolbar-btn" type="button" title="Create a new task" @click="nt.open()">+ New</button>
        <button id="tasks-refresh" class="tasks-toolbar-btn" type="button" title="Refresh" aria-label="Refresh" @click="refresh">↻</button>
      </div>
    </div>
    <div class="tasks-sidebar" id="tasks-sidebar">
      <TaskPickerTree />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch } from "vue";
import { useTasksStore } from "../stores/tasks";
import { useProjectsStore } from "../stores/projects";
import { useAttentionStore } from "../stores/attention";
import { useLiveStore } from "../stores/live";
import { useNewTaskStore } from "../stores/newTask";
import { tasksListSpec } from "../workspace/labels";
import TaskPickerTree from "../components/tasks/TaskPickerTree.vue";
import type { TaskRow } from "../stores/tasks";

const tasksStore = useTasksStore();
const projectsStore = useProjectsStore();
const attentionStore = useAttentionStore();
const live = useLiveStore();
const nt = useNewTaskStore();

let unwatchLive: (() => void) | null = null;

function setView(v: "projects" | "all"): void {
  tasksStore.view = v;
  if (v === "projects") projectsStore.loadList();
}

function refresh(): void {
  // Force a fresh fetch outside the live cycle (button-initiated, not SSE-triggered).
  tasksListSpec.fetch().then((data) => {
    if (Array.isArray(data)) {
      tasksStore.cache = data as TaskRow[];
      tasksStore.loaded = true;
    }
  }).catch(() => {});
  if (tasksStore.view === "projects") {
    projectsStore.invalidateList();
    projectsStore.loadList();
  }
  attentionStore.fetch();
}

onMounted(() => {
  // DEC-0030 C2: bind to the shared tasks:list key the strip already holds.
  // The /api/tasks?limit=120 window stays the same; this binding changes freshness
  // for the picker (SSE-driven rather than button-only).
  live.bind("tasks:list", tasksListSpec);

  // Mirror the live entry into the tasks store cache.
  unwatchLive = watch(
    () => (live.entry("tasks:list") as { data?: unknown } | undefined)?.data,
    (data) => {
      if (Array.isArray(data)) {
        tasksStore.cache = data as TaskRow[];
        tasksStore.loaded = true;
      }
    },
    { immediate: true }
  );

  // Keep attention tiers live.
  live.bind("attention", {
    topics: ["attention", "tasks"],
    fetch: () => attentionStore.fetch().then(() => attentionStore.tiers),
  });

  // Initial load if cache is cold.
  if (!tasksStore.loaded) {
    tasksListSpec.fetch().then((data) => {
      if (Array.isArray(data)) {
        tasksStore.cache = data as TaskRow[];
        tasksStore.loaded = true;
      }
    }).catch(() => {});
  }

  if (tasksStore.view === "projects") projectsStore.loadList();
});

onBeforeUnmount(() => {
  live.unbind("tasks:list");
  live.unbind("attention");
  unwatchLive?.();
});
</script>
