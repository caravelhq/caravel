import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import { writeFileSync } from "fs";

export default defineConfig({
  plugins: [
    vue(),
    {
      name: "build-manifest",
      writeBundle(_, bundle) {
        let jsFile = "app.js";
        let cssFile = "app.css";
        for (const fileName of Object.keys(bundle)) {
          if (/^app\.[A-Za-z0-9_-]+\.js$/.test(fileName)) jsFile = fileName;
          if (/^app\.[A-Za-z0-9_-]+\.css$/.test(fileName)) cssFile = fileName;
        }
        const m = jsFile.match(/app\.([A-Za-z0-9_-]+)\.js/);
        const buildId = m?.[1] ?? "dev";
        writeFileSync(
          resolve(__dirname, "src/ui/app-dist/build-manifest.json"),
          JSON.stringify({ js: jsFile, css: cssFile, buildId }, null, 2)
        );
      },
    },
  ],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "src/ui/app-dist",
    rollupOptions: {
      input: resolve(__dirname, "src/ui/app/main.ts"),
      output: {
        entryFileNames: "app.[hash].js",
        assetFileNames: (info) =>
          info.name?.endsWith(".css") ? "app.[hash].css" : "[name].[ext]",
      },
    },
    minify: false,
    emptyOutDir: true,
  },
});
