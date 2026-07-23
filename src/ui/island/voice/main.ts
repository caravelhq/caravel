import { createApp } from "vue";
import { createPinia } from "pinia";
import VoiceIsland from "./VoiceIsland.vue";

const pinia = createPinia();
createApp(VoiceIsland).use(pinia).mount("#voice-island-root");
