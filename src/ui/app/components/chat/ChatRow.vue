<script setup lang="ts">
import { ref, computed } from "vue";
import type { ChatListEntry } from "../../../services/chats";

const props = defineProps<{
  chat: ChatListEntry;
  isActive: boolean;
}>();

const emit = defineEmits<{
  (e: "open", chatId: string): void;
  (e: "rename", chatId: string, name: string): void;
  (e: "resync", chatId: string): void;
}>();

const renaming = ref(false);
const renameValue = ref("");

const displayName = computed(() =>
  props.chat.name || props.chat.preview || "(empty)"
);

const displayDate = computed(() => {
  const d = new Date(props.chat.updatedAt || 0);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
});

function beginRename(): void {
  renameValue.value = props.chat.name ?? "";
  renaming.value = true;
}

function commitRename(): void {
  if (!renaming.value) return;
  renaming.value = false;
  emit("rename", props.chat.id, renameValue.value.trim());
}

function cancelRename(): void {
  renaming.value = false;
}

function handleRenameKey(ev: KeyboardEvent): void {
  if (ev.key === "Enter") { ev.preventDefault(); commitRename(); }
  else if (ev.key === "Escape") { ev.preventDefault(); cancelRename(); }
}
</script>

<template>
  <div
    class="chat-history-row"
    :class="{ 'chat-history-row-active': isActive }"
    :data-chat-id="chat.id"
  >
    <input
      v-if="renaming"
      class="chat-history-rename-input"
      type="text"
      :value="renameValue"
      :placeholder="chat.preview || 'Chat name'"
      maxlength="80"
      @input="renameValue = ($event.target as HTMLInputElement).value"
      @keydown="handleRenameKey"
      @blur="commitRename"
      autofocus
    />

    <button
      v-else
      class="chat-history-item"
      :class="{ 'chat-history-active': isActive }"
      type="button"
      :data-chat-id="chat.id"
      @click="emit('open', chat.id)"
    >
      <span class="chat-history-preview">{{ displayName }}</span>
      <span class="chat-history-meta">{{ chat.messageCount ?? 0 }} msgs · {{ displayDate }}</span>
    </button>

    <button
      v-if="!renaming"
      class="chat-history-rename-btn"
      type="button"
      :title="chat.name ? 'Rename chat' : 'Name this chat'"
      :aria-label="chat.name ? 'Rename chat' : 'Name this chat'"
      @click.stop="beginRename"
    >✏️</button>

    <button
      v-if="isActive && !renaming"
      class="chat-history-sync-btn"
      type="button"
      title="Force resync from server"
      aria-label="Force resync from server"
      @click.stop="emit('resync', chat.id)"
    >↻</button>
  </div>
</template>
