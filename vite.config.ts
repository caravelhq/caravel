import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "src/ui/app-dist",
    rollupOptions: {
      input: resolve(__dirname, "src/ui/app/main.ts"),
      output: {
        entryFileNames: "app.js",
        assetFileNames: (info) =>
          info.name?.endsWith(".css") ? "app.css" : "[name].[ext]",
      },
    },
    minify: false,
    emptyOutDir: true,
  },
});
