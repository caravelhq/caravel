<script setup lang="ts">
import DocViewer from "../components/doc/DocViewer.vue";
import type { ResourceRef } from "../workspace/refs";

const props = defineProps<{ resource: ResourceRef }>();
</script>

<template>
  <DocViewer
    v-if="resource.kind === 'file'"
    :path="resource.path"
    :branch="resource.branch"
    kind="file"
  />
</template>
