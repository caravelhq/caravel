<script setup lang="ts">
// LegacyPageView — mounts legacy single-instance pages.
// Excluded from KeepAlive: these pages grab DOM by global id in onMounted
// and assume a fresh mount each time they are activated.
// Chat is now a registered resource kind (registry.ts); no chat case here.
import TasksPage from "../pages/TasksPage.vue";
import FilesPage from "../pages/FilesPage.vue";
import type { ResourceRef } from "../workspace/refs";

const props = defineProps<{ resource: ResourceRef }>();
</script>

<template>
  <TasksPage v-if="resource.kind === 'legacy' && resource.page === 'tasks'" />
  <FilesPage v-else-if="resource.kind === 'legacy' && resource.page === 'files'" />
</template>
