<script setup lang="ts">
// LegacyPageView — mounts legacy single-instance pages.
// Excluded from KeepAlive: these pages grab DOM by global id in onMounted
// and assume a fresh mount each time they are activated.
import { watch } from "vue";
import TasksPage from "../pages/TasksPage.vue";
import FilesPage from "../pages/FilesPage.vue";
import { useTasksStore } from "../stores/tasks";
import type { ResourceRef } from "../workspace/refs";

const props = defineProps<{ resource: ResourceRef }>();

const tasksStore = useTasksStore();

// legacy:chat is a deprecated route — existing refs, bookmarks, and /chat
// URLs still resolve to TasksPage with the Chats sub-tab active rather than
// 404ing. ChatsPage.vue is left on disk but no longer reachable from the UI.
watch(
  () => props.resource,
  (r) => {
    if (r.kind === "legacy" && r.page === "chat") {
      tasksStore.view = "chats";
    }
  },
  { immediate: true },
);
</script>

<template>
  <TasksPage v-if="resource.kind === 'legacy' && (resource.page === 'tasks' || resource.page === 'chat')" />
  <FilesPage v-else-if="resource.kind === 'legacy' && resource.page === 'files'" />
</template>
