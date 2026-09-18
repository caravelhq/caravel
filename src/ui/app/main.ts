import { createApp } from "vue";
import { createPinia } from "pinia";
import { createBootstrap } from "bootstrap-vue-next";
import { router } from "./router/index";
import App from "./App.vue";
import "./components/voice/voice-mode.css";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

createApp(App)
  .use(createPinia())
  .use(router)
  .use(createBootstrap())
  .mount("#app");
