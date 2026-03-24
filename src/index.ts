/**
 * ComfyUI Node Organizer — extension entry point.
 *
 * Registers commands, keybindings, settings, and context menu items
 * that wire the pure layout framework into ComfyUI's runtime.
 */

import type { ComfyApp } from "@comfyorg/comfyui-frontend-types";
import {
  createLayoutAlgorithm,
  type LayoutAlgorithmName,
} from "./layout/algorithm-factory";
import {
  SETTING_IDS,
  EXTENSION_NAME,
  SETTINGS_PREFIX,
  REPOSITORY_URL,
  CURRENT_VERSION,
  DEFAULT_ALGORITHM_OPTIONS,
} from "./settings";
import type { DefaultAlgorithmName } from "./settings";
import { debugLog } from "./debug";
import {
  extractLayoutInput,
  extractGroupLayoutInput,
  applyLayoutOutput,
  anchorSelectedGroupLayoutResult,
} from "./adapter";
import type { GraphLike } from "./adapter";
import { layoutWithGroups } from "./layout/framework";
import type { LayoutAlgorithm, FrameworkConfig } from "./layout/types";
import { computeGraphBounds } from "./bounds";
import { DEFAULT_FRAMEWORK_CONFIG } from "./layout/types";
import { isGroup } from "./utils";
import { getCurrentGraph, getSelectedGroups, type AppLike } from "./runtime";

// Declare the global app variable injected by ComfyUI's runtime loader
declare global {
  const app: ComfyApp;
}

const DEFAULT_ALGORITHM_NAME: DefaultAlgorithmName = "sugiyama";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDefaultAlgorithmName(): DefaultAlgorithmName {
  const raw = (app.extensionManager?.setting?.get?.<string>(
    SETTING_IDS.DEFAULT_ALGORITHM,
  ) ?? DEFAULT_ALGORITHM_NAME) as string;

  return DEFAULT_ALGORITHM_OPTIONS.includes(raw as DefaultAlgorithmName)
    ? (raw as DefaultAlgorithmName)
    : DEFAULT_ALGORITHM_NAME;
}

export function createConfiguredDefaultAlgorithm(
  algorithmName: DefaultAlgorithmName,
  config: Partial<FrameworkConfig>,
): LayoutAlgorithm {
  return createLayoutAlgorithm(algorithmName as LayoutAlgorithmName, {
    horizontalGap:
      config.horizontalGap ?? DEFAULT_FRAMEWORK_CONFIG.horizontalGap,
    verticalGap:
      config.verticalGap ?? DEFAULT_FRAMEWORK_CONFIG.verticalGap,
  });
}

function getDefaultAlgorithm(config: Partial<FrameworkConfig>): LayoutAlgorithm {
  return createConfiguredDefaultAlgorithm(getDefaultAlgorithmName(), config);
}

function getFrameworkConfig(): Partial<FrameworkConfig> {
  const get = app.extensionManager?.setting?.get;
  if (!get) return {};
  return {
    horizontalGap:
      get<number | undefined>(SETTING_IDS.HORIZONTAL_GAP as never) ??
      DEFAULT_FRAMEWORK_CONFIG.horizontalGap,
    verticalGap:
      get<number | undefined>(SETTING_IDS.VERTICAL_GAP as never) ??
      DEFAULT_FRAMEWORK_CONFIG.verticalGap,
    groupPadding:
      get<number | undefined>(SETTING_IDS.GROUP_PADDING as never) ??
      DEFAULT_FRAMEWORK_CONFIG.groupPadding,
    disconnectedGap:
      get<number | undefined>(SETTING_IDS.DISCONNECTED_GAP as never) ??
      DEFAULT_FRAMEWORK_CONFIG.disconnectedGap,
  };
}

function getFitToView(): boolean {
  return (
    app.extensionManager?.setting?.get?.<boolean>(
      SETTING_IDS.FIT_TO_VIEW as never,
    ) ?? false
  );
}

// ---------------------------------------------------------------------------
// Core actions
// ---------------------------------------------------------------------------

/** Organize every node in the current graph. */
function executeOrganization(mode: "workflow" | "groups"): void {
  const graph = getCurrentGraph(app as AppLike<GraphLike>);
  if (!graph) {
    console.warn("[node-organizer] No active graph");
    return;
  }

  const config = getFrameworkConfig();
  const algorithm = getDefaultAlgorithm(config);

  const start = performance.now();
  debugLog(`Starting ${mode} organization with ${algorithm.name}...`);

  try {
    const selectedGroupIds =
      mode === "groups"
        ? new Set(getSelectedGroups(app.canvas).map((group) => group.id))
        : null;
    const input =
      mode === "workflow"
        ? extractLayoutInput(graph)
        : extractGroupLayoutInput(graph, selectedGroupIds ?? new Set<number>());
    const { nodes, edges, groups } = input;
    const rawResult = layoutWithGroups(nodes, edges, groups, algorithm, config);
    const result =
      mode === "groups" && selectedGroupIds
        ? anchorSelectedGroupLayoutResult(
            graph,
            groups,
            selectedGroupIds,
            rawResult,
          )
        : rawResult;
    applyLayoutOutput(graph, result);

    const elapsed = (performance.now() - start).toFixed(1);
    debugLog(
      `Organized ${nodes.length} nodes in ${elapsed}ms with ${algorithm.name}`,
    );

    if (mode === "workflow" && getFitToView()) {
      const bounds = computeGraphBounds(
        graph._nodes,
        graph.inputNode,
        graph.outputNode,
        result.positions,
        result.groupBounds,
      );

      if (bounds) {
        // Defer by one frame: applyLayoutOutput calls setDirtyCanvas, but the
        // canvas needs one animation frame to process the dirty flag.
        requestAnimationFrame(() => {
          const canvas = app.canvas as {
            animateToBounds?: (
              bounds: readonly [number, number, number, number],
              opts?: { zoom?: number },
            ) => void;
          } | null;
          canvas?.animateToBounds?.(bounds, { zoom: 0.9 });
        });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[node-organizer] ${mode} layout failed: ${message}`);
  }
}

/** Organize the full workflow. */
function organizeWorkflow(): void {
  executeOrganization("workflow");
}

/** Organize nodes within currently selected groups. */
function organizeSelectedGroups(): void {
  const selectedGroups = getSelectedGroups(app.canvas);
  if (selectedGroups.length === 0) {
    console.warn("[node-organizer] No groups selected");
    return;
  }
  executeOrganization("groups");
}

/** Context-aware organize: selected groups if any, otherwise full workflow. */
function organizeContextAware(): void {
  const selectedGroups = getSelectedGroups(app.canvas);
  if (selectedGroups.length > 0) {
    executeOrganization("groups");
  } else {
    executeOrganization("workflow");
  }
}

// ---------------------------------------------------------------------------
// Extension registration
// ---------------------------------------------------------------------------

app.registerExtension({
  name: EXTENSION_NAME,

  settings: [
    // --- About (sortOrder 50 — highest = first in ComfyUI's descending sort) ---
    {
      id: SETTING_IDS.VERSION as never,
      name: `Version ${CURRENT_VERSION}`,
      category: [SETTINGS_PREFIX, "About", "Version"],
      sortOrder: 50,
      type: (() => {
        const span = document.createElement("span");
        const link = document.createElement("a");
        link.href = REPOSITORY_URL;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.style.paddingRight = "12px";
        link.textContent = "Homepage";
        span.appendChild(link);
        return span;
      }) as never,
      defaultValue: undefined as never,
    },
    // --- Layout (sortOrder 40–44) ---
    {
      id: SETTING_IDS.DEFAULT_ALGORITHM as never,
      name: "Default Layout Algorithm",
      category: [SETTINGS_PREFIX, "Layout", "Algorithm"],
      sortOrder: 44,
      type: "combo",
      tooltip:
        "Default algorithm for organize commands when a group title token does not override it",
      options: DEFAULT_ALGORITHM_OPTIONS.map((value) => ({
        text: value[0].toUpperCase() + value.slice(1),
        value,
      })),
      defaultValue: DEFAULT_ALGORITHM_NAME,
    },
    {
      id: SETTING_IDS.HORIZONTAL_GAP as never,
      name: "Horizontal Gap",
      category: [SETTINGS_PREFIX, "Layout", "Horizontal Gap"],
      sortOrder: 43,
      type: "slider",
      tooltip: `Space between nodes left-to-right in pixels. Default: ${DEFAULT_FRAMEWORK_CONFIG.horizontalGap}`,
      attrs: { min: 20, max: 300, step: 10 },
      defaultValue: DEFAULT_FRAMEWORK_CONFIG.horizontalGap,
    },
    {
      id: SETTING_IDS.VERTICAL_GAP as never,
      name: "Vertical Gap",
      category: [SETTINGS_PREFIX, "Layout", "Vertical Gap"],
      sortOrder: 42,
      type: "slider",
      tooltip: `Space between nodes top-to-bottom in pixels. Default: ${DEFAULT_FRAMEWORK_CONFIG.verticalGap}`,
      attrs: { min: 10, max: 150, step: 10 },
      defaultValue: DEFAULT_FRAMEWORK_CONFIG.verticalGap,
    },
    {
      id: SETTING_IDS.GROUP_PADDING as never,
      name: "Group Padding",
      category: [SETTINGS_PREFIX, "Layout", "Group Padding"],
      sortOrder: 41,
      type: "slider",
      tooltip: `Inner padding of group boxes in pixels. Default: ${DEFAULT_FRAMEWORK_CONFIG.groupPadding}`,
      attrs: { min: 10, max: 100, step: 5 },
      defaultValue: DEFAULT_FRAMEWORK_CONFIG.groupPadding,
    },
    {
      id: SETTING_IDS.DISCONNECTED_GAP as never,
      name: "Disconnected Node Gap",
      category: [SETTINGS_PREFIX, "Layout", "Disconnected Gap"],
      sortOrder: 40,
      type: "slider",
      tooltip: `Gap between disconnected nodes (e.g. notes) and the main graph in pixels. Default: ${DEFAULT_FRAMEWORK_CONFIG.disconnectedGap}`,
      attrs: { min: 50, max: 400, step: 10 },
      defaultValue: DEFAULT_FRAMEWORK_CONFIG.disconnectedGap,
    },
    // --- Behavior (sortOrder 30) ---
    {
      id: SETTING_IDS.FIT_TO_VIEW as never,
      name: "Fit to View After Organize",
      category: [SETTINGS_PREFIX, "Behavior", "Fit to View"],
      sortOrder: 30,
      type: "boolean",
      tooltip:
        "Automatically zoom to fit the graph after organizing the full workflow. Does not apply to selected-group organize.",
      defaultValue: false,
    },
    // --- Keybindings (sortOrder 20) ---
    {
      id: SETTING_IDS.KEYBINDINGS as never,
      name: "Keyboard Shortcuts",
      category: [SETTINGS_PREFIX, "Keybindings", "Info"],
      sortOrder: 20,
      type: (() => {
        const span = document.createElement("span");
        span.style.color = "var(--p-text-muted-color, #999)";
        span.textContent =
          "Default: Shift+O (Organize Workflow). Edit shortcuts in Settings > Keybinding.";
        return span;
      }) as never,
      defaultValue: undefined as never,
    },
    // --- Advanced (sortOrder 10 — lowest = last in ComfyUI's descending sort) ---
    {
      id: SETTING_IDS.DEBUG_LOGGING as never,
      name: "Enable Debug Logging",
      category: [SETTINGS_PREFIX, "Advanced", "Debug Logging"],
      sortOrder: 10,
      type: "boolean",
      tooltip:
        "Show detailed debug logs in browser console during organization",
      defaultValue: false,
    },
  ],

  commands: [
    {
      id: "node-organizer.organize",
      function: organizeContextAware,
      label: "Organize",
      icon: "pi pi-sitemap",
      tooltip:
        "Organize selected groups if any are selected, otherwise organize the full workflow",
    },
    {
      id: "node-organizer.organize-workflow",
      function: organizeWorkflow,
      label: "Organize Workflow",
      icon: "pi pi-sitemap",
      tooltip: "Organize all nodes in the current view",
    },
    {
      id: "node-organizer.organize-groups",
      function: organizeSelectedGroups,
      label: "Organize Group",
      icon: "pi pi-objects-column",
      tooltip: "Organize nodes within selected groups",
    },
  ],

  keybindings: [
    {
      commandId: "node-organizer.organize",
      combo: { key: "o", shift: true },
    },
  ],

  menuCommands: [
    {
      path: ["Extensions", "Node Organizer"],
      commands: [
        "node-organizer.organize-workflow",
        "node-organizer.organize-groups",
      ],
    },
  ],

  actionBarButtons: [
    {
      label: "Organize",
      icon: "pi pi-sitemap",
      tooltip: "Organize the current workflow",
      onClick: organizeWorkflow,
    },
  ],

  getCanvasMenuItems() {
    const items: Array<{
      content: string;
      callback: () => void;
    } | null> = [
      null, // separator
      {
        content: "Organize Workflow",
        callback: organizeWorkflow,
      },
    ];

    const selectedGroups = getSelectedGroups(app.canvas);
    if (selectedGroups.length === 1) {
      items.push({
        content: "Organize Group",
        callback: organizeSelectedGroups,
      });
    } else if (selectedGroups.length > 1) {
      items.push({
        content: `Organize ${selectedGroups.length} Groups`,
        callback: organizeSelectedGroups,
      });
    }

    items.push(null); // separator
    return items;
  },

  getSelectionToolboxCommands(selectedItem) {
    if (isGroup(selectedItem)) {
      return ["node-organizer.organize-groups"];
    }
    return [];
  },
});
