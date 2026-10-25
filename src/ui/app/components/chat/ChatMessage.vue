<script setup lang="ts">
import { computed } from "vue";
import ChatMarkdown from "./ChatMarkdown.vue";
import type { ChatMessage as ChatMessageData } from "../../../services/chats";

const props = defineProps<{
  msg: ChatMessageData;
}>();

const emit = defineEmits<{
  (e: "speak", text: string): void;
  (e: "stop"): void;
}>();

const isUser = computed(() => props.msg.role === "user");
const state = computed(() => props.msg.state || (isUser.value ? "sent" : "done"));
const isActive = computed(() =>
  state.value === "thinking" || state.value === "streaming" || state.value === "background"
);
const isStreaming = computed(() => state.value === "streaming");
const isError = computed(() => state.value === "error");
const isPending = computed(() => isUser.value && state.value === "pending");
const isFinished = computed(() => !isActive.value && !!props.msg.text);

function msgClass(): string {
  let cls = "chat-msg " + (isUser.value ? "chat-msg-user" : "chat-msg-assistant");
  if (isStreaming.value) cls += " chat-msg-streaming";
  if (isError.value) cls += " chat-msg-error";
  if (isPending.value) cls += " chat-msg-user-pending";
  return cls;
}

function metaLabel(): string {
  if (state.value === "thinking") return "thinking…";
  if (state.value === "background") return "⚙ working in background…";
  return "";
}
</script>

<template>
  <div :class="msgClass()" :data-active="isActive ? '1' : '0'">
    <div class="chat-msg-role">
      <span class="chat-msg-role-label">{{ isUser ? "You" : "Claude" }}</span>
      <span v-if="isPending" class="chat-msg-pill">queued</span>
    </div>
    <ChatMarkdown class="chat-msg-text" :text="msg.text || ''" />
    <div v-if="isActive && metaLabel()" class="chat-msg-meta" :class="state === 'thinking' ? 'chat-msg-thinking' : 'chat-msg-background'">
      <span class="chat-msg-meta-label">{{ metaLabel() }}</span>
      <button
        type="button"
        class="chat-msg-stop-inline"
        title="Stop this response"
        aria-label="Stop this response"
        @click="emit('stop')"
      >stop</button>
    </div>
    <button
      v-if="!isUser && isFinished"
      type="button"
      class="chat-msg-speak"
      title="Read aloud"
      aria-label="Read aloud"
      @click="emit('speak', msg.text)"
    ><i class="fa-solid fa-volume-high"></i></button>
  </div>
</template>
