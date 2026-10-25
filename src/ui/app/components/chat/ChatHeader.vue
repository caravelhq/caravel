<script setup lang="ts">
import { ref, computed, watch, useTemplateRef } from "vue";

const props = defineProps<{
  chatId: string;
  chatName: string;
  agentDisplayName: string;
  agentEmoji: string;
  agentDescription: string;
  isAgentLocked: boolean;
  sessionId: string;
  sessionTurnCount: number;
  pickerOpen: boolean;
  hasMessages: boolean;
}>();

const emit = defineEmits<{
  (e: "toggle-picker"): void;
  (e: "rename", name: string): void;
  (e: "delete"): void;
}>();

const nameInputRef = useTemplateRef<HTMLInputElement>("nameInputRef");
const committedName = ref(props.chatName);

// Keep committedName in sync when the prop changes (e.g. after a store update).
// We don't update the input value if the user is currently editing.
function syncNameInput(newName: string): void {
  committedName.value = newName;
  if (nameInputRef.value && document.activeElement !== nameInputRef.value) {
    nameInputRef.value.value = newName;
  }
}

// Sync when prop changes.
watch(() => props.chatName, syncNameInput);

function onNameBlur(): void {
  const input = nameInputRef.value;
  if (!input) return;
  const v = input.value.trim();
  if (v === committedName.value) return;
  committedName.value = v;
  emit("rename", v);
}

function onNameKeydown(e: KeyboardEvent): void {
  if (e.key === "Enter") {
    e.preventDefault();
    nameInputRef.value?.blur();
  }
}

function onDeleteClick(): void {
  emit("delete");
}

const chatFingerprint = computed(() => props.chatId ? props.chatId.slice(0, 8) : "");
const sessionFingerprint = computed(() => props.sessionId ? props.sessionId.slice(0, 8) : "");

const sessionBadgeText = computed(() => {
  if (!props.sessionId) return "thread " + chatFingerprint.value + " · no session yet";
  const turns = props.sessionTurnCount;
  return "thread " + chatFingerprint.value + " → " + sessionFingerprint.value + " · " + turns + " turn" + (turns === 1 ? "" : "s");
});

const sessionBadgeTitle = computed(() => {
  if (!props.sessionId) return "No Claude session has been created for this chat yet.";
  return "thread: " + props.chatId + "\nsession: " + props.sessionId + "\n(click to copy session id)";
});

const agentBadgeText = computed(() => {
  if (!props.agentDisplayName) return "";
  return (props.agentEmoji ? props.agentEmoji + " " : "") + props.agentDisplayName;
});

const agentBadgeTitle = computed(() => {
  if (!props.agentDisplayName) return "";
  return (props.agentDescription || "") + (props.isAgentLocked ? " (locked for this chat)" : " (not yet locked — send first message to confirm)");
});

function onSessionBadgeClick(): void {
  if (!props.sessionId) return;
  try { navigator.clipboard.writeText(props.sessionId); } catch {}
}
</script>

<template>
  <div class="chat-toolbar">
    <div class="chat-toolbar-left">
      <button
        class="chat-toolbar-btn"
        type="button"
        title="Chats"
        @click="emit('toggle-picker')"
      >Chats</button>
      <span
        class="chat-agent-badge"
        :hidden="!agentDisplayName"
        :data-locked="isAgentLocked ? '1' : '0'"
        :title="agentBadgeTitle"
      >{{ agentBadgeText }}</span>
      <input
        ref="nameInputRef"
        class="chat-name-input"
        type="text"
        title="Chat title"
        autocomplete="off"
        :hidden="!hasMessages"
        :value="chatName"
        :placeholder="chatName || 'Untitled chat'"
        @blur="onNameBlur"
        @keydown="onNameKeydown"
      />
    </div>

    <button
      class="chat-session-badge"
      type="button"
      :hidden="!chatId"
      :title="sessionBadgeTitle"
      @click="onSessionBadgeClick"
    >{{ sessionBadgeText }}</button>

    <button
      class="chat-toolbar-btn chat-delete-btn"
      type="button"
      title="Delete this chat"
      aria-label="Delete chat"
      @click="onDeleteClick"
    >🗑</button>
  </div>
</template>
