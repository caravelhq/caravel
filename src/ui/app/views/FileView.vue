<script setup lang="ts">
import DocViewer from "../components/doc/DocViewer.vue";
import type { ResourceRef } from "../workspace/refs";

const props = defineProps<{ resource: ResourceRef }>();
</script>

<template>
  <!-- WAL-138: wrapped so document tabs carry the same panel frame as chat/open. -->
  <div class="file-view-root">
    <DocViewer
      v-if="resource.kind === 'file'"
      :path="resource.path"
      :branch="resource.branch"
      kind="file"
    />
  </div>
</template>

<style scoped>
/* WAL-138: document tabs get the same panel frame as chat/open. */
.file-view-root { background: var(--panel, #0f1e33); border: 1px solid rgba(255,255,255,0.133); }
</style>
