<script setup lang="ts">
defineProps<{ label: string; meta?: string }>();
</script>

<template>
  <div class="setting-item">
    <div class="setting-main">
      <div class="settings-label">{{ label }}</div>
      <div v-if="meta !== undefined" class="settings-meta">{{ meta }}</div>
      <slot name="extra" />
    </div>
    <slot />
  </div>
</template>
