<script setup lang="ts">
import { ref } from "vue";
import { useKnowledgeStore } from "../../stores/knowledge";

defineProps<{
  corpusLabel?: string;
}>();

const ks = useKnowledgeStore();
const inputRef = ref<HTMLInputElement | null>(null);
const draft = ref("");

function openModal(seed?: string): void {
  ks.open(seed ?? draft.value);
}

function onKeyDown(ev: KeyboardEvent): void {
  if (ev.key === "Enter" || ev.key === "ArrowDown") {
    ev.preventDefault();
    openModal();
  }
}

defineExpose({ focus: () => inputRef.value?.focus() });
</script>

<template>
  <div
    id="search-box"
    class="srch-box"
    @click="inputRef?.focus()"
  >
    <span class="srch-box-icon" aria-hidden="true">🔍</span>
    <input
      ref="inputRef"
      v-model="draft"
      type="text"
      :placeholder="corpusLabel || 'Search knowledge…'"
      autocomplete="off"
      spellcheck="false"
      @focus="openModal(draft)"
      @keydown="onKeyDown"
      aria-label="Search knowledge base"
    />
    <span class="srch-box-hint">⌘K</span>
  </div>
</template>
