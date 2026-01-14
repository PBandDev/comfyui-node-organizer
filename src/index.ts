import type { ComfyApp } from "@comfyorg/comfyui-frontend-types";
import type { LGraph, LGraphGroup } from "./layout/types";
import { layoutGraph, layoutSelectedGroups } from "./layout";
import { SETTINGS_IDS } from "./consants";

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
  const app: ComfyApp & {
    canvas?: {
      selectedItems?: Set<unknown>;
    };
  };
  const LGraphCanvas: LGraphCanvasType;

  interface Window {
    app: ComfyApp;
  }
}

/**
 * Check if value is array-like (regular array or typed array like Float64Array)
 */
function isArrayLike(value: unknown): boolean {
  if (Array.isArray(value)) return true;
  if (!value || typeof value !== "object") return false;
  // Check for typed arrays (Float64Array, etc.) which have numeric length
  const obj = value as { length?: unknown };
  return typeof obj.length === "number" && obj.length >= 0;
}

/**
 * Check if an item is a group (duck typing)
 * Groups have pos/size (can be Float64Array), title, id, but no .type like nodes
 */
function isLGraphGroup(item: unknown): item is LGraphGroup {
  if (!item || typeof item !== "object") return false;
  const obj = item as Record<string, unknown>;
  return (
    isArrayLike(obj.pos) &&
    isArrayLike(obj.size) &&
    typeof obj.title === "string" &&
    typeof obj.id === "number" &&
    typeof obj.type !== "string" // Nodes have .type, groups don't
  );
}

/**
 * Get selected groups from global app.canvas.selectedItems
 * Per ComfyUI docs: use app.canvas.selectedItems for selection access
 */
function getSelectedGroups(): LGraphGroup[] {
  const groups: LGraphGroup[] = [];
  const selectedItems = app.canvas?.selectedItems;
  if (!selectedItems) return groups;

  for (const item of selectedItems) {
    if (isLGraphGroup(item)) {
      groups.push(item);
    }
  }
  return groups;
}

app.registerExtension({
  name: "ComfyUI Node Organizer",
  settings: [
    {
      id: SETTINGS_IDS.VERSION,
      name: "Version 1.3.0",
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
    const items: (ContextMenuOption | null)[] = [
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
    ];

    // Check for selected groups via app.canvas.selectedItems
    const selectedGroups = getSelectedGroups();

    if (selectedGroups.length === 1) {
      items.push({
        content: "Organize Group",
        callback: () => {
          const graph = canvas.getCurrentGraph() as LGraph | null;
          if (!graph) {
            console.warn("[node-organizer] No active graph");
            return;
          }

          try {
            const groupIds = new Set([selectedGroups[0].id]);
            const result = layoutSelectedGroups(graph, groupIds);
            console.log(
              `[node-organizer] Group organized: ${result.nodeCount} nodes, ` +
                `${result.groupCount} groups, ${result.executionMs.toFixed(1)}ms`
            );
          } catch (err) {
            console.error("[node-organizer] Group layout failed:", err);
          }
        },
      });
    } else if (selectedGroups.length > 1) {
      items.push({
        content: `Organize ${selectedGroups.length} Groups`,
        callback: () => {
          const graph = canvas.getCurrentGraph() as LGraph | null;
          if (!graph) {
            console.warn("[node-organizer] No active graph");
            return;
          }

          try {
            const groupIds = new Set(selectedGroups.map((g) => g.id));
            const result = layoutSelectedGroups(graph, groupIds);
            console.log(
              `[node-organizer] Groups organized: ${result.nodeCount} nodes, ` +
                `${result.groupCount} groups, ${result.executionMs.toFixed(1)}ms`
            );
          } catch (err) {
            console.error("[node-organizer] Groups layout failed:", err);
          }
        },
      });
    }

    items.push(null); // separator

    return items;
  },
});
