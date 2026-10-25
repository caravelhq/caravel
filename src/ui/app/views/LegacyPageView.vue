<script setup lang="ts">
// LegacyPageView — mounts legacy single-instance pages.
// Excluded from KeepAlive: these pages grab DOM by global id in onMounted
// and assume a fresh mount each time they are activated.
import TasksPage from "../pages/TasksPage.vue";
import FilesPage from "../pages/FilesPage.vue";
import ChatsPage from "../pages/ChatsPage.vue";
import type { ResourceRef } from "../workspace/refs";

const props = defineProps<{ resource: ResourceRef }>();
</script>

<template>
  <TasksPage v-if="resource.kind === 'legacy' && resource.page === 'tasks'" />
  <FilesPage v-else-if="resource.kind === 'legacy' && resource.page === 'files'" />
  <ChatsPage v-else-if="resource.kind === 'legacy' && resource.page === 'chat'" />
</template>
