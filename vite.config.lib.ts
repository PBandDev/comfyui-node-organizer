import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL("./src/core.ts", import.meta.url)),
      fileName: () => "core.js",
      formats: ["es"],
    },
    outDir: "lib",
    rollupOptions: {
      external: [],
    },
  },
});
