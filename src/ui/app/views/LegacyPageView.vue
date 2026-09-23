<script setup lang="ts">
// LegacyPageView — mounts the three legacy single-instance pages unchanged.
// Excluded from KeepAlive: these pages grab DOM by global id in onMounted
// and assume a fresh mount each time they are activated.
import TasksPage from "../pages/TasksPage.vue";
import ChatPage from "../pages/ChatPage.vue";
import FilesPage from "../pages/FilesPage.vue";
import type { ResourceRef } from "../workspace/refs";

const props = defineProps<{ resource: ResourceRef }>();
</script>

<template>
  <TasksPage v-if="resource.kind === 'legacy' && resource.page === 'tasks'" />
  <ChatPage v-else-if="resource.kind === 'legacy' && resource.page === 'chat'" />
  <FilesPage v-else-if="resource.kind === 'legacy' && resource.page === 'files'" />
</template>
