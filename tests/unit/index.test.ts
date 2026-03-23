import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getCurrentGraph, getSelectedGroups } from "../../src/runtime";
import { isGroup } from "../../src/utils";
import {
  SETTING_IDS,
  SETTINGS_PREFIX,
  EXTENSION_NAME,
  REPOSITORY_URL,
  CURRENT_VERSION,
  DEFAULT_ALGORITHM_OPTIONS,
} from "../../src/settings";
import { DEFAULT_FRAMEWORK_CONFIG } from "../../src/layout/types";
import type { Position, GroupBounds } from "../../src/layout/types";
import { computeGraphBounds } from "../../src/bounds";
import type { LayoutInput, LayoutNode } from "../../src/layout/types";

describe("isGroup", () => {
  it("identifies a plain group without a type", () => {
    expect(
      isGroup({ id: 1, title: "Group", pos: [0, 0], size: [100, 100] }),
    ).toBe(true);
  });

  it("prefers the LGraphGroup constructor tag when present", () => {
    expect(
      isGroup({
        id: 1,
        title: "Runtime Group",
        pos: [0, 0],
        constructor: { name: "LGraphGroup" },
        type: "UnexpectedNodeType",
      }),
    ).toBe(true);
  });

  it("rejects a node with a string type", () => {
    expect(
      isGroup({
        id: 1,
        title: "Sampler",
        type: "KSampler",
        pos: [0, 0],
        size: [100, 100],
      }),
    ).toBe(false);
  });

  it("rejects a reroute node", () => {
    expect(
      isGroup({
        id: 1,
        title: "Reroute",
        type: "Reroute",
        pos: [0, 0],
        size: [30, 30],
      }),
    ).toBe(false);
  });

  it("treats null and undefined types as groups", () => {
    expect(
      isGroup({ id: 1, title: "Null Type", type: null, pos: [0, 0] }),
    ).toBe(true);
    expect(
      isGroup({ id: 2, title: "Undefined Type", type: undefined, pos: [0, 0] }),
    ).toBe(true);
  });

  it("rejects items without a string title", () => {
    expect(isGroup({ id: 1, pos: [0, 0] })).toBe(false);
    expect(
      isGroup({ id: 2, title: undefined, pos: [0, 0] }),
    ).toBe(false);
  });

  it("rejects an empty-string type because runtime nodes use string types", () => {
    expect(
      isGroup({ id: 1, title: "Empty Type", type: "", pos: [0, 0] }),
    ).toBe(false);
  });
});

describe("getCurrentGraph", () => {
  it("prefers canvas.getCurrentGraph when available", () => {
    const visibleGraph = { _nodes: [], _groups: [], links: new Map() };
    const fallbackCanvasGraph = { _nodes: [1], _groups: [], links: new Map() };
    const fallbackAppGraph = { _nodes: [2], _groups: [], links: new Map() };

    expect(
      getCurrentGraph({
        canvas: {
          graph: fallbackCanvasGraph,
          getCurrentGraph: () => visibleGraph,
        },
        graph: fallbackAppGraph,
      }),
    ).toBe(visibleGraph);
  });

  it("falls back to canvas.graph, then app.graph", () => {
    const canvasGraph = { _nodes: [], _groups: [], links: new Map() };
    const appGraph = { _nodes: [], _groups: [], links: new Map() };

    expect(
      getCurrentGraph({
        canvas: { graph: canvasGraph },
        graph: appGraph,
      }),
    ).toBe(canvasGraph);
    expect(
      getCurrentGraph({
        canvas: { graph: null },
        graph: appGraph,
      }),
    ).toBe(appGraph);
  });

  it("returns null when no graph is available", () => {
    expect(getCurrentGraph({ canvas: null })).toBeNull();
    expect(getCurrentGraph({})).toBeNull();
  });
});

describe("SETTING_IDS", () => {
  it("has all expected setting IDs with correct prefix", () => {
    const expectedKeys = [
      "VERSION",
      "KEYBINDINGS",
      "DEFAULT_ALGORITHM",
      "HORIZONTAL_GAP",
      "VERTICAL_GAP",
      "GROUP_PADDING",
      "DISCONNECTED_GAP",
      "FIT_TO_VIEW",
      "DEBUG_LOGGING",
    ] as const;

    for (const key of expectedKeys) {
      expect(SETTING_IDS[key]).toBeDefined();
      expect(SETTING_IDS[key]).toContain(SETTINGS_PREFIX);
    }
  });

  it("has unique IDs for all settings", () => {
    const values = Object.values(SETTING_IDS);
    expect(new Set(values).size).toBe(values.length);
  });

  it("spacing IDs map to correct FrameworkConfig defaults", () => {
    expect(DEFAULT_FRAMEWORK_CONFIG.horizontalGap).toBe(100);
    expect(DEFAULT_FRAMEWORK_CONFIG.verticalGap).toBe(40);
    expect(DEFAULT_FRAMEWORK_CONFIG.groupPadding).toBe(30);
    expect(DEFAULT_FRAMEWORK_CONFIG.disconnectedGap).toBe(150);
  });
});

describe("settings constants", () => {
  const packageVersion = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
  ) as { version: string };
  const pyproject = readFileSync(
    new URL("../../pyproject.toml", import.meta.url),
    "utf-8",
  );
  const pyprojectVersion =
    pyproject.match(/^version = "(.+)"$/m)?.[1] ?? null;
  const bumpCurrentVersion =
    pyproject.match(/^current_version = "(.+)"$/m)?.[1] ?? null;

  it("has a valid extension name", () => {
    expect(EXTENSION_NAME).toBe("comfy-node-organizer");
  });

  it("has a valid repository URL", () => {
    expect(REPOSITORY_URL).toContain("github.com");
    expect(REPOSITORY_URL).toContain("comfyui-node-organizer");
  });

  it("has a semver version string", () => {
    expect(CURRENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("keeps CURRENT_VERSION in sync with package.json", () => {
    expect(CURRENT_VERSION).toBe(packageVersion.version);
  });

  it("keeps pyproject version metadata in sync with CURRENT_VERSION", () => {
    expect(pyprojectVersion).toBe(CURRENT_VERSION);
    expect(bumpCurrentVersion).toBe(CURRENT_VERSION);
  });

  it("includes sugiyama, horizontal, and vertical algorithms", () => {
    expect(DEFAULT_ALGORITHM_OPTIONS).toContain("sugiyama");
    expect(DEFAULT_ALGORITHM_OPTIONS).toContain("horizontal");
    expect(DEFAULT_ALGORITHM_OPTIONS).toContain("vertical");
    expect(DEFAULT_ALGORITHM_OPTIONS.length).toBe(3);
  });
});

describe("createConfiguredDefaultAlgorithm", () => {
  it("passes spacing config into default algorithm factories", async () => {
    const globalScope = globalThis as typeof globalThis & {
      app?: {
        registerExtension: (extension: unknown) => void;
        extensionManager?: { setting?: { get: <T>(_id: string) => T | undefined } };
        canvas?: null;
      };
    };
    const originalApp = globalScope.app;

    globalScope.app = {
      registerExtension: () => undefined,
      extensionManager: {
        setting: {
          get: () => undefined,
        },
      },
      canvas: null,
    };

    try {
      const { createConfiguredDefaultAlgorithm } = await import("../../src/index");

      const twoNodes: LayoutNode[] = [
        { id: "a", width: 10, height: 10 },
        { id: "b", width: 10, height: 10 },
      ];
      const verticalPair: LayoutInput = {
        nodes: twoNodes,
        edges: [],
      };
      const sugiyamaInput: LayoutInput = {
        nodes: [
          { id: "left-a", width: 10, height: 10 },
          { id: "left-b", width: 10, height: 10 },
          { id: "right", width: 10, height: 10 },
        ],
        edges: [
          { source: "left-a", target: "right" },
          { source: "left-b", target: "right" },
        ],
      };

      const horizontal = createConfiguredDefaultAlgorithm("horizontal", {
        horizontalGap: 123,
      });
      expect(horizontal.layout(verticalPair).positions.get("b")?.x).toBe(133);

      const vertical = createConfiguredDefaultAlgorithm("vertical", {
        verticalGap: 77,
      });
      expect(vertical.layout(verticalPair).positions.get("b")?.y).toBe(87);

      const sugiyama = createConfiguredDefaultAlgorithm("sugiyama", {
        horizontalGap: 123,
        verticalGap: 77,
      });
      const sugiyamaPositions = sugiyama.layout(sugiyamaInput).positions;
      expect(sugiyamaPositions.get("right")?.x).toBe(133);
      expect(sugiyamaPositions.get("left-b")?.y).toBe(87);
    } finally {
      if (originalApp === undefined) {
        delete globalScope.app;
      } else {
        globalScope.app = originalApp;
      }
    }
  });
});

describe("getSelectedGroups", () => {
  it("returns only selected groups", () => {
    const selectedItems = [
      { id: 100, title: "Group A", pos: [0, 0] as [number, number] },
      { id: 1, title: "Sampler", type: "KSampler", pos: [10, 10] as [number, number] },
      { id: 101, title: "Group B", pos: [20, 20] as [number, number] },
    ];

    expect(getSelectedGroups({ graph: null, selectedItems })).toEqual([
      { id: 100, title: "Group A" },
      { id: 101, title: "Group B" },
    ]);
  });

  it("returns an empty array when nothing group-like is selected", () => {
    expect(getSelectedGroups(undefined)).toEqual([]);
    expect(getSelectedGroups({ graph: null })).toEqual([]);
    expect(
      getSelectedGroups({
        graph: null,
        selectedItems: [{ id: 1, title: "Node", type: "KSampler", pos: [0, 0] }],
      }),
    ).toEqual([]);
  });
});

describe("computeGraphBounds", () => {
  const makeNode = (id: number, x: number, y: number, w: number, h: number) =>
    ({ id, pos: [x, y], size: [w, h] });

  it("computes bounds from regular nodes", () => {
    const nodes = [makeNode(1, 0, 0, 100, 50), makeNode(2, 200, 100, 100, 50)];
    const positions = new Map<string, Position>([
      ["1", { x: 0, y: 0 }],
      ["2", { x: 200, y: 100 }],
    ]);

    const result = computeGraphBounds(nodes, undefined, undefined, positions, new Map());
    expect(result).toEqual([0, 0, 300, 150]);
  });

  it("returns null when no items have positions", () => {
    const result = computeGraphBounds([], undefined, undefined, new Map(), new Map());
    expect(result).toBeNull();
  });

  it("includes inputNode in bounds", () => {
    const nodes = [makeNode(1, 100, 50, 100, 50)];
    const inputNode = makeNode(-10, -200, 0, 50, 30);
    const positions = new Map<string, Position>([
      ["1", { x: 100, y: 50 }],
      ["-10", { x: -200, y: 0 }],
    ]);

    const result = computeGraphBounds(nodes, inputNode, undefined, positions, new Map());
    // Without inputNode: bounds would be [100, 50, 100, 50]
    // With inputNode: bounds should extend left to -200
    expect(result).toEqual([-200, 0, 400, 100]);
  });

  it("includes outputNode in bounds", () => {
    const nodes = [makeNode(1, 0, 0, 100, 50)];
    const outputNode = makeNode(-20, 500, 0, 50, 30);
    const positions = new Map<string, Position>([
      ["1", { x: 0, y: 0 }],
      ["-20", { x: 500, y: 0 }],
    ]);

    const result = computeGraphBounds(nodes, undefined, outputNode, positions, new Map());
    // Without outputNode: bounds would be [0, 0, 100, 50]
    // With outputNode: bounds should extend right to 550
    expect(result).toEqual([0, 0, 550, 50]);
  });

  it("includes both boundary nodes in subgraph scenario", () => {
    const nodes = [makeNode(1, 100, 50, 100, 50)];
    const inputNode = makeNode(-10, -200, 0, 50, 30);
    const outputNode = makeNode(-20, 500, 0, 50, 30);
    const positions = new Map<string, Position>([
      ["1", { x: 100, y: 50 }],
      ["-10", { x: -200, y: 0 }],
      ["-20", { x: 500, y: 0 }],
    ]);

    const result = computeGraphBounds(nodes, inputNode, outputNode, positions, new Map());
    expect(result).toEqual([-200, 0, 750, 100]);
  });

  it("includes group bounds", () => {
    const nodes = [makeNode(1, 50, 50, 100, 50)];
    const positions = new Map<string, Position>([["1", { x: 50, y: 50 }]]);
    const groupBounds = new Map<string, GroupBounds>([
      ["group:1", { x: 0, y: 0, width: 300, height: 200 }],
    ]);

    const result = computeGraphBounds(nodes, undefined, undefined, positions, groupBounds);
    expect(result).toEqual([0, 0, 300, 200]);
  });
});
