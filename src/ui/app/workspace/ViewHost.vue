<script setup lang="ts">
import { computed, type Component } from "vue";
import { getViewComponent } from "./registry";
import { type ResourceRef, refKey } from "./refs";
import LegacyPageView from "../views/LegacyPageView.vue";

// ViewHost renders the active tab for one group.
// KeepAlive is used for all views except legacy views, which grab DOM by id
// in onMounted and must remount fresh each time.

const props = defineProps<{
  activeRef: ResourceRef | null;
}>();

const viewComponent = computed((): Component | null => {
  if (!props.activeRef) return null;
  return getViewComponent(props.activeRef.kind);
});

const isLegacy = computed(() => props.activeRef?.kind === "legacy");
const cacheKey = computed(() => (props.activeRef ? refKey(props.activeRef) : ""));
</script>

<template>
  <div class="view-host">
    <template v-if="activeRef && viewComponent">
      <!-- Legacy views are excluded from KeepAlive (DOM-id mounts assume fresh mount). -->
      <component
        v-if="isLegacy"
        :is="viewComponent"
        :resource="activeRef"
      />
      <!-- All other views are kept alive by refKey to avoid reload on tab switch. -->
      <KeepAlive v-else :max="8">
        <component
          :is="viewComponent"
          :key="cacheKey"
          :resource="activeRef"
        />
      </KeepAlive>
    </template>
    <div v-else class="view-host-empty" />
  </div>
</template>

<style scoped>
.view-host {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
.view-host-empty {
  flex: 1;
}
</style>
