import { defineConfig } from "vite";
import path from "node:path";

// Plugin to insert the ComfyUI custom import at the beginning of the file
const insertComfyUICustomImport = () => {
  return {
    name: "insert-comfyui-custom-import",
    transform(code: string) {
      return `import { app } from "/scripts/app.js";\n${code}`;
    },
  };
};

export default defineConfig(() => ({
  plugins: [insertComfyUICustomImport()],
  build: {
    emptyOutDir: true,
    rollupOptions: {
      // Don't bundle ComfyUI scripts - they will be loaded from the ComfyUI server
      external: ["/scripts/app.js", "/scripts/api.js"],
      input: {
        index: path.resolve(__dirname, "src/index.ts"),
      },
      output: {
        // Output to the dist/example_ext directory
        dir: "dist",
        entryFileNames: "[name].js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
}));
