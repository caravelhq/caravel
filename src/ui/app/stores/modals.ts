import { defineStore } from "pinia";
import { ref } from "vue";

export const useModalsStore = defineStore("modals", () => ({ topId: ref<string | null>(null) }));
