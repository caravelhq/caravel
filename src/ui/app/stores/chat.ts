import { defineStore } from "pinia";
import { ref } from "vue";

export const useChatStore = defineStore("chat", () => {
  const chatId = ref<string | null>(null);
  return { chatId };
});
