<script setup lang="ts">
import { useTemplateRef, watchEffect } from "vue";
import { renderMarkdown } from "../../lib/markdown";

// Encapsulates markdown-to-HTML rendering for chat messages — the DocViewer
// pattern applied to in-memory text rather than a fetched file path.
// innerHTML lives here; the five chat components have zero.

const props = defineProps<{ text: string }>();
const root = useTemplateRef<HTMLDivElement>("root");

watchEffect(() => {
  if (!root.value) return;
  root.value.innerHTML = renderMarkdown(props.text || "");
});
</script>

<template>
  <div ref="root" class="chat-md" />
</template>
