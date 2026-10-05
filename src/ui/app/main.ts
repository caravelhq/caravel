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

// Unregister any previously installed service worker — Caravel no longer uses one.
// The /sw.js endpoint now serves a self-unregistering stub for clients that load
// that URL directly; this call covers clients that skip the stub and load fresh.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(regs => Promise.all(regs.map(r => r.unregister())))
    .catch(() => {});
}

createApp(App)
  .use(createPinia())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .use(router as any)
  .use(createBootstrap())
  .mount("#app");
