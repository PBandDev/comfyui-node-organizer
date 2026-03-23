import { describe, it, expect } from "vitest";
import {
  layoutWithGroups,
  buildGroupHierarchy,
  splitDisconnected,
  placeDisconnected,
  translatePositions,
} from "../../src/layout/framework";
import type {
  LayoutNode,
  LayoutEdge,
  LayoutGroup,
  LayoutAlgorithm,
  LayoutInput,
  LayoutOutput,
  Position,
  FrameworkConfig,
} from "../../src/layout/types";
import { DEFAULT_FRAMEWORK_CONFIG } from "../../src/layout/types";

// ---------------------------------------------------------------------------
// Mock algorithm: places nodes in a horizontal line
// ---------------------------------------------------------------------------

const mockAlgorithm: LayoutAlgorithm = {
  name: "mock-horizontal-line",
  layout(input: LayoutInput): LayoutOutput {
    const positions = new Map<string, Position>();
    // Determine max width for spacing
    let maxWidth = 0;
    for (const n of input.nodes) {
      if (n.width > maxWidth) maxWidth = n.width;
    }
    const gap = 50;

    // Sort nodes by ID for determinism
    const sorted = [...input.nodes].sort((a, b) =>
      a.id.localeCompare(b.id, undefined, { numeric: true }),
    );

    let x = 0;
    for (const n of sorted) {
      positions.set(n.id, { x, y: 0 });
      x += n.width + gap;
    }

    return { positions };
  },
};

// ---------------------------------------------------------------------------
// Helper to create nodes
// ---------------------------------------------------------------------------

function node(id: string, width = 100, height = 60): LayoutNode {
  return { id, width, height };
}

function edge(source: string, target: string): LayoutEdge {
  return { source, target };
}

// ---------------------------------------------------------------------------
// Tests: layoutWithGroups
// ---------------------------------------------------------------------------

describe("layoutWithGroups", () => {
  it("places a single node", () => {
    const nodes = [node("A")];
    const result = layoutWithGroups(nodes, [], [], mockAlgorithm);

    expect(result.positions.size).toBe(1);
    const pos = result.positions.get("A");
    expect(pos).toBeDefined();
    expect(Number.isFinite(pos!.x)).toBe(true);
    expect(Number.isFinite(pos!.y)).toBe(true);
  });

  it("lays out a simple chain A->B->C", () => {
    const nodes = [node("A"), node("B"), node("C")];
    const edges = [edge("A", "B"), edge("B", "C")];
    const result = layoutWithGroups(nodes, edges, [], mockAlgorithm);

    expect(result.positions.size).toBe(3);
    // All should have finite coordinates
    for (const [, pos] of result.positions) {
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    }
  });

  it("places disconnected nodes left of DAG", () => {
    const nodes = [node("A"), node("B"), node("C"), node("D")];
    const edges = [edge("A", "B")]; // C and D are disconnected
    const result = layoutWithGroups(nodes, edges, [], mockAlgorithm);

    expect(result.positions.size).toBe(4);

    const posA = result.positions.get("A")!;
    const posC = result.positions.get("C")!;
    const posD = result.positions.get("D")!;

    // Disconnected nodes should be left of connected ones
    expect(posC.x).toBeLessThan(posA.x);
    expect(posD.x).toBeLessThan(posA.x);

    // Disconnected nodes should be stacked vertically
    expect(posD.y).toBeGreaterThan(posC.y);
  });

  it("lays out a group containing 3 nodes with correct bounds", () => {
    const nodes = [node("A"), node("B"), node("C")];
    const edges = [edge("A", "B")];
    const groups: LayoutGroup[] = [
      {
        id: "g1",
        title: "Group 1",
        memberIds: ["A", "B", "C"],
        childGroupIds: [],
      },
    ];

    const result = layoutWithGroups(nodes, edges, groups, mockAlgorithm);

    // All nodes should be positioned
    expect(result.positions.size).toBe(3);

    // Group bounds should exist and contain all members
    const bounds = result.groupBounds.get("g1");
    expect(bounds).toBeDefined();
    expect(bounds!.width).toBeGreaterThan(0);
    expect(bounds!.height).toBeGreaterThan(0);

    // All members should be inside group bounds
    for (const mId of ["A", "B", "C"]) {
      const pos = result.positions.get(mId)!;
      expect(pos.x).toBeGreaterThanOrEqual(bounds!.x);
      expect(pos.y).toBeGreaterThanOrEqual(bounds!.y);
      const n = nodes.find((nd) => nd.id === mId)!;
      expect(pos.x + n.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
      expect(pos.y + n.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
    }
  });

  it("handles nested groups (inner laid out first, then as rectangle in outer)", () => {
    const nodes = [node("A"), node("B"), node("C"), node("D")];
    const edges = [edge("A", "B")];
    const groups: LayoutGroup[] = [
      {
        id: "inner",
        title: "Inner",
        memberIds: ["A", "B"],
        childGroupIds: [],
      },
      {
        id: "outer",
        title: "Outer",
        memberIds: ["C"],
        childGroupIds: ["inner"],
      },
    ];

    const result = layoutWithGroups(nodes, edges, groups, mockAlgorithm);

    // All 4 nodes positioned (D is ungrouped, at root)
    expect(result.positions.size).toBe(4);

    // Both groups should have bounds
    expect(result.groupBounds.has("inner")).toBe(true);
    expect(result.groupBounds.has("outer")).toBe(true);

    const innerBounds = result.groupBounds.get("inner")!;
    const outerBounds = result.groupBounds.get("outer")!;

    // Inner group should be contained within outer group
    expect(innerBounds.x).toBeGreaterThanOrEqual(outerBounds.x);
    expect(innerBounds.y).toBeGreaterThanOrEqual(outerBounds.y);
    expect(innerBounds.x + innerBounds.width).toBeLessThanOrEqual(
      outerBounds.x + outerBounds.width,
    );
    expect(innerBounds.y + innerBounds.height).toBeLessThanOrEqual(
      outerBounds.y + outerBounds.height,
    );
  });

  it("handles mixed grouped and ungrouped nodes", () => {
    const nodes = [node("A"), node("B"), node("C")];
    const edges = [edge("A", "C")]; // A is grouped, C is ungrouped, edge between them
    const groups: LayoutGroup[] = [
      {
        id: "g1",
        title: "Group 1",
        memberIds: ["A", "B"],
        childGroupIds: [],
      },
    ];

    const result = layoutWithGroups(nodes, edges, groups, mockAlgorithm);

    // All nodes positioned
    expect(result.positions.size).toBe(3);
    expect(result.groupBounds.size).toBe(1);

    // Ungrouped node C should be positioned
    expect(result.positions.has("C")).toBe(true);
  });

  it("returns empty maps for empty input", () => {
    const result = layoutWithGroups([], [], [], mockAlgorithm);
    expect(result.positions.size).toBe(0);
    expect(result.groupBounds.size).toBe(0);
  });

  it("produces idempotent results", () => {
    const nodes = [node("A"), node("B"), node("C"), node("D")];
    const edges = [edge("A", "B"), edge("B", "C")];
    const groups: LayoutGroup[] = [
      {
        id: "g1",
        title: "Group 1",
        memberIds: ["A", "B"],
        childGroupIds: [],
      },
    ];

    const result1 = layoutWithGroups(nodes, edges, groups, mockAlgorithm);
    const result2 = layoutWithGroups(nodes, edges, groups, mockAlgorithm);

    // Positions should be identical
    expect(result1.positions.size).toBe(result2.positions.size);
    for (const [id, pos1] of result1.positions) {
      const pos2 = result2.positions.get(id);
      expect(pos2).toBeDefined();
      expect(pos1.x).toBe(pos2!.x);
      expect(pos1.y).toBe(pos2!.y);
    }

    // Group bounds should be identical
    expect(result1.groupBounds.size).toBe(result2.groupBounds.size);
    for (const [id, b1] of result1.groupBounds) {
      const b2 = result2.groupBounds.get(id);
      expect(b2).toBeDefined();
      expect(b1.x).toBe(b2!.x);
      expect(b1.y).toBe(b2!.y);
      expect(b1.width).toBe(b2!.width);
      expect(b1.height).toBe(b2!.height);
    }
  });

  it("handles a group with only disconnected nodes", () => {
    const nodes = [node("A"), node("B"), node("C")];
    const groups: LayoutGroup[] = [
      {
        id: "g1",
        title: "Disconnected Group",
        memberIds: ["A", "B", "C"],
        childGroupIds: [],
      },
    ];

    const result = layoutWithGroups(nodes, [], groups, mockAlgorithm);

    expect(result.positions.size).toBe(3);
    expect(result.groupBounds.has("g1")).toBe(true);

    // All nodes should have finite positions
    for (const [, pos] of result.positions) {
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    }
  });

  it("handles multiple top-level groups", () => {
    const nodes = [node("A"), node("B"), node("C"), node("D")];
    const edges = [edge("A", "C")]; // Cross-group edge
    const groups: LayoutGroup[] = [
      {
        id: "g1",
        title: "Group 1",
        memberIds: ["A", "B"],
        childGroupIds: [],
      },
      {
        id: "g2",
        title: "Group 2",
        memberIds: ["C", "D"],
        childGroupIds: [],
      },
    ];

    const result = layoutWithGroups(nodes, edges, groups, mockAlgorithm);

    // All nodes positioned
    expect(result.positions.size).toBe(4);
    // Both groups have bounds
    expect(result.groupBounds.size).toBe(2);
    expect(result.groupBounds.has("g1")).toBe(true);
    expect(result.groupBounds.has("g2")).toBe(true);
  });

  it("uses group title tokens to override the default algorithm", () => {
    const nodes = [node("A", 100, 60), node("B", 100, 60)];
    const groups: LayoutGroup[] = [
      {
        id: "g1",
        title: "Horizontal",
        memberIds: ["A", "B"],
        childGroupIds: [],
        token: { mode: "horizontal" },
      },
    ];

    const result = layoutWithGroups(nodes, [], groups, mockAlgorithm);
    const posA = result.positions.get("A")!;
    const posB = result.positions.get("B")!;

    expect(posA.y).toBe(posB.y);
    expect(posB.x).toBeGreaterThan(posA.x);
  });

  it("accepts partial config overrides", () => {
    const nodes = [node("A"), node("B")];
    const edges = [edge("A", "B")];
    const customConfig: Partial<FrameworkConfig> = {
      groupPadding: 50,
    };

    const result = layoutWithGroups(
      nodes,
      edges,
      [],
      mockAlgorithm,
      customConfig,
    );
    expect(result.positions.size).toBe(2);
  });

  it("uses custom horizontalGap when provided", () => {
    // With a wider gap, the disconnected node should be farther from the DAG
    const nodes = [node("A"), node("B"), node("Disc")];
    const edges = [edge("A", "B")]; // Disc is disconnected
    const groups: LayoutGroup[] = [];

    const defaultResult = layoutWithGroups(
      nodes,
      edges,
      groups,
      mockAlgorithm,
    );
    const customResult = layoutWithGroups(
      nodes,
      edges,
      groups,
      mockAlgorithm,
      { disconnectedGap: 500 },
    );

    const defaultDiscX = defaultResult.positions.get("Disc")!.x;
    const customDiscX = customResult.positions.get("Disc")!.x;

    // Larger disconnectedGap should push the disconnected node further left
    expect(customDiscX).toBeLessThan(defaultDiscX);
  });

  it("uses custom groupPadding for group bounds", () => {
    const nodes = [node("A")];
    const groups: LayoutGroup[] = [
      { id: "g1", title: "G1", memberIds: ["A"], childGroupIds: [] },
    ];

    const smallPad = layoutWithGroups(
      nodes,
      [],
      groups,
      mockAlgorithm,
      { groupPadding: 10 },
    );
    const largePad = layoutWithGroups(
      nodes,
      [],
      groups,
      mockAlgorithm,
      { groupPadding: 80 },
    );

    const smallBounds = smallPad.groupBounds.get("g1")!;
    const largeBounds = largePad.groupBounds.get("g1")!;

    // Larger padding should produce larger group bounds
    expect(largeBounds.width).toBeGreaterThan(smallBounds.width);
    expect(largeBounds.height).toBeGreaterThan(smallBounds.height);
  });

  it("uses custom verticalGap for disconnected node spacing", () => {
    const nodes = [node("Disc1"), node("Disc2")];
    // No edges — both disconnected, stacked vertically

    const tightResult = layoutWithGroups(
      nodes,
      [],
      [],
      mockAlgorithm,
      { verticalGap: 10 },
    );
    const looseResult = layoutWithGroups(
      nodes,
      [],
      [],
      mockAlgorithm,
      { verticalGap: 100 },
    );

    const tightGap =
      tightResult.positions.get("Disc2")!.y -
      tightResult.positions.get("Disc1")!.y;
    const looseGap =
      looseResult.positions.get("Disc2")!.y -
      looseResult.positions.get("Disc1")!.y;

    expect(looseGap).toBeGreaterThan(tightGap);
  });
});

// ---------------------------------------------------------------------------
// Tests: buildGroupHierarchy
// ---------------------------------------------------------------------------

describe("buildGroupHierarchy", () => {
  it("returns empty for no groups", () => {
    const { processingOrder, parentMap } = buildGroupHierarchy([]);
    expect(processingOrder).toHaveLength(0);
    expect(parentMap.size).toBe(0);
  });

  it("returns leaf groups first, then parents", () => {
    const groups: LayoutGroup[] = [
      {
        id: "parent",
        title: "Parent",
        memberIds: [],
        childGroupIds: ["child"],
      },
      {
        id: "child",
        title: "Child",
        memberIds: ["A"],
        childGroupIds: [],
      },
    ];

    const { processingOrder, parentMap } = buildGroupHierarchy(groups);

    expect(processingOrder).toHaveLength(2);
    expect(processingOrder[0].id).toBe("child");
    expect(processingOrder[1].id).toBe("parent");
    expect(parentMap.get("child")).toBe("parent");
  });

  it("handles flat groups (no nesting)", () => {
    const groups: LayoutGroup[] = [
      { id: "a", title: "A", memberIds: ["1"], childGroupIds: [] },
      { id: "b", title: "B", memberIds: ["2"], childGroupIds: [] },
    ];

    const { processingOrder } = buildGroupHierarchy(groups);
    // Both are leaves, order is deterministic (queue order)
    expect(processingOrder).toHaveLength(2);
  });

  it("handles deep nesting (3 levels)", () => {
    const groups: LayoutGroup[] = [
      {
        id: "root",
        title: "Root",
        memberIds: [],
        childGroupIds: ["mid"],
      },
      {
        id: "mid",
        title: "Mid",
        memberIds: [],
        childGroupIds: ["leaf"],
      },
      {
        id: "leaf",
        title: "Leaf",
        memberIds: ["A"],
        childGroupIds: [],
      },
    ];

    const { processingOrder } = buildGroupHierarchy(groups);
    expect(processingOrder.map((g) => g.id)).toEqual(["leaf", "mid", "root"]);
  });
});

// ---------------------------------------------------------------------------
// Tests: splitDisconnected
// ---------------------------------------------------------------------------

describe("splitDisconnected", () => {
  it("splits nodes with and without edges", () => {
    const nodes = [node("A"), node("B"), node("C")];
    const edges = [edge("A", "B")];
    const result = splitDisconnected(nodes, edges);

    expect(result.connected.map((n) => n.id)).toEqual(["A", "B"]);
    expect(result.disconnected.map((n) => n.id)).toEqual(["C"]);
    expect(result.connectedEdges).toHaveLength(1);
  });

  it("returns all as disconnected when no edges", () => {
    const nodes = [node("A"), node("B")];
    const result = splitDisconnected(nodes, []);
    expect(result.connected).toHaveLength(0);
    expect(result.disconnected).toHaveLength(2);
  });

  it("returns all as connected when all have edges", () => {
    const nodes = [node("A"), node("B")];
    const edges = [edge("A", "B")];
    const result = splitDisconnected(nodes, edges);
    expect(result.connected).toHaveLength(2);
    expect(result.disconnected).toHaveLength(0);
  });

  it("ignores edges referencing unknown nodes", () => {
    const nodes = [node("A")];
    const edges = [edge("A", "Z")]; // Z doesn't exist
    const result = splitDisconnected(nodes, edges);
    expect(result.connected).toHaveLength(0);
    expect(result.disconnected).toHaveLength(1);
  });

  it("keeps constrained boundary nodes out of disconnected placement", () => {
    const nodes: LayoutNode[] = [
      { id: "in", width: 100, height: 60, layerConstraint: "first" },
      { id: "out", width: 100, height: 60, layerConstraint: "last" },
    ];
    const result = splitDisconnected(nodes, []);

    expect(result.connected.map((n) => n.id)).toEqual(["in", "out"]);
    expect(result.disconnected).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: placeDisconnected
// ---------------------------------------------------------------------------

describe("placeDisconnected", () => {
  it("places nodes in vertical stack left of DAG", () => {
    const nodes = [node("A", 100, 60), node("B", 80, 40)];
    const dagBounds = { minX: 200, minY: 50, maxX: 500, maxY: 300 };
    const positions = placeDisconnected(
      nodes,
      dagBounds,
      DEFAULT_FRAMEWORK_CONFIG,
    );

    expect(positions.size).toBe(2);

    const posA = positions.get("A")!;
    const posB = positions.get("B")!;

    // Should be left of DAG
    expect(posA.x + 100).toBeLessThan(dagBounds.minX);
    // B should be below A
    expect(posB.y).toBeGreaterThan(posA.y);
  });

  it("places at origin when no DAG", () => {
    const nodes = [node("A")];
    const positions = placeDisconnected(
      nodes,
      null,
      DEFAULT_FRAMEWORK_CONFIG,
    );
    expect(positions.size).toBe(1);
    expect(Number.isFinite(positions.get("A")!.x)).toBe(true);
  });

  it("returns empty map for empty input", () => {
    const positions = placeDisconnected([], null, DEFAULT_FRAMEWORK_CONFIG);
    expect(positions.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: translatePositions
// ---------------------------------------------------------------------------

describe("translatePositions", () => {
  it("offsets all positions by dx/dy", () => {
    const positions = new Map<string, Position>([
      ["A", { x: 10, y: 20 }],
      ["B", { x: 30, y: 40 }],
    ]);

    const result = translatePositions(positions, 100, 200);

    expect(result.get("A")).toEqual({ x: 110, y: 220 });
    expect(result.get("B")).toEqual({ x: 130, y: 240 });
  });

  it("returns empty map for empty input", () => {
    const result = translatePositions(new Map(), 10, 20);
    expect(result.size).toBe(0);
  });

  it("does not mutate original map", () => {
    const original = new Map<string, Position>([["A", { x: 5, y: 10 }]]);
    translatePositions(original, 100, 200);
    expect(original.get("A")).toEqual({ x: 5, y: 10 });
  });
});
