import type { ComfyApp } from "@comfyorg/comfyui-frontend-types";
import type { LGraph } from "./layout/types";
import { layoutGraph } from "./layout";

/** Context menu option */
interface ContextMenuOption {
  content: string;
  callback?: () => void;
}

/** LGraphCanvas type (available at runtime) */
interface LGraphCanvasType {
  prototype: {
    getCanvasMenuOptions: () => (ContextMenuOption | null)[];
  };
}

declare global {
  const app: ComfyApp;
  const LGraphCanvas: LGraphCanvasType;

  interface Window {
    app: ComfyApp;
  }
}

/** Setting ID for debug logging */
const SETTINGS_PREFIX = "Node Organizer";
const SETTINGS_IDS = {
  VERSION: `${SETTINGS_PREFIX}. ${SETTINGS_PREFIX}`,
  DEBUG_LOGGING: `${SETTINGS_PREFIX}.Debug Logging`,
};

app.registerExtension({
  name: "ComfyUI Node Organizer",
  settings: [
    {
      id: SETTINGS_IDS.VERSION,
      name: "Version 1.0.0",
      type: () => {
        const spanEl = document.createElement("span");
        spanEl.insertAdjacentHTML(
          "beforeend",
          `<a href="https://github.com/PBandDev/comfyui-node-organizer" target="_blank" style="padding-right: 12px;">Homepage</a>`
        );

        return spanEl;
      },
      defaultValue: undefined,
    },
    {
      id: SETTINGS_IDS.DEBUG_LOGGING,
      name: "Enable Debug Logging",
      type: "boolean",
      tooltip:
        "Show detailed debug logs in browser console during workflow organization",
      defaultValue: false,
    },
  ],
  getCanvasMenuItems(canvas) {
    return [
      null, // separator
      {
        content: "Organize Workflow",
        callback: () => {
          const graph = canvas.getCurrentGraph() as LGraph | null;
          if (!graph) {
            console.warn("[node-organizer] No active graph");
            return;
          }

          try {
            const result = layoutGraph(graph);
            console.log(
              `[node-organizer] Layout complete: ${result.nodeCount} nodes, ` +
                `${result.layerCount} layers, ${result.groupCount} groups, ` +
                `${result.executionMs.toFixed(1)}ms`
            );
          } catch (err) {
            console.error("[node-organizer] Layout failed:", err);
          }
        },
      },
      null, // separator
    ];
  },
});
