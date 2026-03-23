export const e2eConfig = {
  port: 8199,
  testComfyDir: ".test-comfy",
  comfyRevision: "v0.18.1",
  get comfyUrl() {
    return `http://localhost:${this.port}`;
  },
  get comfyInstallDir() {
    return `${this.testComfyDir}/comfyui`;
  },
  get venvDir() {
    return `${this.testComfyDir}/venv`;
  },
  get customNodesDir() {
    return `${this.comfyInstallDir}/custom_nodes`;
  },
  timeouts: {
    comfyStartup: 120_000,
    pageLoad: 30_000,
    organize: 10_000,
  },
} as const;
