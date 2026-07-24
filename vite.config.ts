import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue()],
  define: {
    // Replace process.env.NODE_ENV so the browser bundle doesn't throw
    // ReferenceError when Vue/Pinia/BVN check it at runtime.
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "src/ui/island-dist",
    lib: {
      entry: resolve(__dirname, "src/ui/island/voice/main.ts"),
      name: "VoiceIsland",
      fileName: "voice-island",
      formats: ["es"],
    },
    rollupOptions: {
      // Vue and Pinia are bundled in — no external deps to worry about
    },
    minify: false,  // readable output for debugging during dev
    emptyOutDir: true,
  },
});
