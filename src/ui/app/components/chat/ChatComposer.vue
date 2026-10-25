<script setup lang="ts">
import { ref, watch, useTemplateRef } from "vue";

const props = defineProps<{
  chatId: string;
  draft: string;
  hasMessages: boolean;
  agentPicked: boolean;
  hasActiveWork: boolean;
  isAgentLocked: boolean;
}>();

const emit = defineEmits<{
  (e: "send", text: string): void;
  (e: "interrupt"): void;
  (e: "cancel"): void;
  (e: "pin"): void;
  (e: "update:draft", text: string): void;
}>();

const textareaRef = useTemplateRef<HTMLTextAreaElement>("textareaRef");
const newTitleRef = useTemplateRef<HTMLInputElement>("newTitleRef");

// Local draft mirrors the store; the store is authoritative on chatId change.
const localDraft = ref(props.draft);

// When chatId changes, load the draft for the new chat (slot reuse).
watch(() => props.chatId, () => {
  localDraft.value = props.draft;
  if (textareaRef.value) textareaRef.value.value = props.draft;
});

// When the store draft changes externally, apply it unless the user is currently typing.
watch(() => props.draft, (d) => {
  if (document.activeElement !== textareaRef.value) {
    localDraft.value = d;
    if (textareaRef.value) textareaRef.value.value = d;
  }
});

function autoResize(): void {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

function onInput(): void {
  const el = textareaRef.value;
  if (!el) return;
  localDraft.value = el.value;
  emit("update:draft", el.value);
  autoResize();
  // Pin on type — converting a preview tab to a permanent tab.
  if (!props.isAgentLocked) emit("pin");
  else emit("pin");
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    onSend();
  }
}

function onSend(): void {
  const text = localDraft.value.trim();
  if (!text || !props.agentPicked) return;
  localDraft.value = "";
  emit("update:draft", "");
  if (textareaRef.value) {
    textareaRef.value.value = "";
    autoResize();
  }
  emit("send", text);
}

function onInterrupt(): void {
  emit("interrupt");
}

function onCancel(): void {
  emit("cancel");
}

function newTitleValue(): string {
  return newTitleRef.value?.value.trim() ?? "";
}

defineExpose({ focus: () => textareaRef.value?.focus(), newTitleValue });
</script>

<template>
  <form class="chat-form" @submit.prevent="onSend">
    <!-- New chat title input — shown when no messages yet. -->
    <input
      v-if="!hasMessages"
      ref="newTitleRef"
      class="chat-new-title-input"
      type="text"
      placeholder="Chat title (optional)"
      autocomplete="off"
    />

    <div class="chat-input-row">
      <textarea
        ref="textareaRef"
        class="chat-input"
        rows="1"
        placeholder="Message…"
        autocomplete="off"
        :value="localDraft"
        @input="onInput"
        @keydown="onKeydown"
      />
      <div class="chat-actions">
        <button
          v-if="hasActiveWork"
          type="button"
          class="chat-interrupt"
          title="Interrupt"
          aria-label="Interrupt"
          @click="onInterrupt"
        >✋</button>
        <button
          v-if="hasActiveWork"
          type="button"
          class="chat-cancel"
          title="Cancel"
          aria-label="Cancel"
          @click="onCancel"
        >Cancel</button>
        <button
          type="submit"
          class="chat-send"
          title="Send"
          aria-label="Send"
          :disabled="!localDraft.trim() || !agentPicked"
        >↑</button>
      </div>
    </div>
  </form>
</template>
