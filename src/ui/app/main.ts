import { createApp } from "vue";
import { createPinia } from "pinia";
import { createBootstrap } from "bootstrap-vue-next";
import { router } from "./router/index";
import App from "./App.vue";
import "./components/voice/voice-mode.css";
import { pageStyles } from "../page/styles";

// Inject the full Caravel stylesheet (global layout, tab-nav, chat, dock, etc.).
// This runs before mount so all CSS classes are available when Vue renders.
const _gs = document.createElement("style");
_gs.textContent = pageStyles;
document.head.insertBefore(_gs, document.head.firstChild);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

createApp(App)
  .use(createPinia())
  .use(router)
  .use(createBootstrap())
  .mount("#app");
