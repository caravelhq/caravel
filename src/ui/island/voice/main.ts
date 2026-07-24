import { createApp } from "vue";
import { createPinia } from "pinia";
import { createBootstrap } from "bootstrap-vue-next";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-vue-next/dist/bootstrap-vue-next.css";
import VoiceIsland from "./VoiceIsland.vue";

const pinia = createPinia();
createApp(VoiceIsland).use(pinia).use(createBootstrap()).mount("#voice-island-root");
