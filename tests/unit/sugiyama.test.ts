import { describe, it, expect } from "vitest";
import { createSugiyamaAlgorithm } from "../../src/layout/algorithms/sugiyama";
import { breakCycles } from "../../src/layout/algorithms/sugiyama/cycle-break";
import { assignLayers } from "../../src/layout/algorithms/sugiyama/layer-assign";
import { minimizeCrossings } from "../../src/layout/algorithms/sugiyama/crossing-minimize";
import { assignCoordinates } from "../../src/layout/algorithms/sugiyama/coordinate-assign";
import type { LayoutNode, LayoutEdge, Position } from "../../src/layout/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function node(id: string, width = 200, height = 100): LayoutNode {
  return { id, width, height };
}

function edge(source: string, target: string): LayoutEdge {
  return { source, target };
}

function nodeMap(nodes: LayoutNode[]): ReadonlyMap<string, LayoutNode> {
  const m = new Map<string, LayoutNode>();
  for (const n of nodes) m.set(n.id, n);
  return m;
}

/** Check that no two positioned nodes overlap (AABB collision). */
function assertNoOverlaps(
  positions: ReadonlyMap<string, Position>,
  nodes: LayoutNode[],
): void {
  const nMap = nodeMap(nodes);
  const entries = [...positions.entries()];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [idA, posA] = entries[i];
      const [idB, posB] = entries[j];
      const nA = nMap.get(idA)!;
      const nB = nMap.get(idB)!;

      const overlapX =
        posA.x < posB.x + nB.width && posA.x + nA.width > posB.x;
      const overlapY =
        posA.y < posB.y + nB.height && posA.y + nA.height > posB.y;

      expect(
        overlapX && overlapY,
        `Nodes ${idA} and ${idB} overlap`,
      ).toBe(false);
    }
  }
}

/** Check all coordinates are finite (no NaN/Infinity). */
function assertFiniteCoordinates(
  positions: ReadonlyMap<string, Position>,
): void {
  for (const [id, pos] of positions) {
    expect(Number.isFinite(pos.x), `${id}.x is not finite: ${pos.x}`).toBe(
      true,
    );
    expect(Number.isFinite(pos.y), `${id}.y is not finite: ${pos.y}`).toBe(
      true,
    );
  }
}

// ---------------------------------------------------------------------------
// breakCycles
// ---------------------------------------------------------------------------

describe("breakCycles", () => {
  it("returns edges unchanged when no cycles exist", () => {
    const nodes = [node("A"), node("B"), node("C")];
    const edges = [edge("A", "B"), edge("B", "C")];
    const result = breakCycles(nodes, edges);

    expect(result.reversedEdges.size).toBe(0);
    expect(result.edges).toHaveLength(2);
  });

  it("breaks a simple 2-node cycle", () => {
    const nodes = [node("A"), node("B")];
    const edges = [edge("A", "B"), edge("B", "A")];
    const result = breakCycles(nodes, edges);

    // One edge should be reversed
    expect(result.reversedEdges.size).toBe(1);
    expect(result.edges).toHaveLength(2);

    // Result should be acyclic: verify by running layer assignment (which requires DAG)
    const layers = assignLayers(nodes, result.edges);
    expect(layers.size).toBe(2);
  });

  it("breaks a 3-node cycle A->B->C->A", () => {
    const nodes = [node("A"), node("B"), node("C")];
    const edges = [edge("A", "B"), edge("B", "C"), edge("C", "A")];
    const result = breakCycles(nodes, edges);

    // At least one edge reversed
    expect(result.reversedEdges.size).toBeGreaterThanOrEqual(1);

    // Result must be acyclic: all nodes should get valid layers
    const layers = assignLayers(nodes, result.edges);
    expect(layers.size).toBe(3);

    // Verify topological ordering: for every edge, source layer < target layer
    for (const e of result.edges) {
      expect(layers.get(e.source)!).toBeLessThan(layers.get(e.target)!);
    }
  });

  it("handles empty input", () => {
    const result = breakCycles([], []);
    expect(result.edges).toHaveLength(0);
    expect(result.reversedEdges.size).toBe(0);
  });

  it("handles nodes with no edges", () => {
    const nodes = [node("A"), node("B")];
    const result = breakCycles(nodes, []);
    expect(result.edges).toHaveLength(0);
    expect(result.reversedEdges.size).toBe(0);
  });

  it("handles self-loop (edge to same node)", () => {
    const nodes = [node("A"), node("B")];
    // Self-loop on A plus a normal edge
    const edges = [edge("A", "A"), edge("A", "B")];
    const result = breakCycles(nodes, edges);

    // Self-loop might be reversed or kept — algorithm should handle it
    // Just ensure no crash and result is valid
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// assignLayers
// ---------------------------------------------------------------------------

describe("assignLayers", () => {
  it("assigns single node to layer 0", () => {
    const nodes = [node("A")];
    const layers = assignLayers(nodes, []);
    expect(layers.get("A")).toBe(0);
  });

  it("assigns linear chain A->B->C to consecutive layers", () => {
    const nodes = [node("A"), node("B"), node("C")];
    const edges = [edge("A", "B"), edge("B", "C")];
    const layers = assignLayers(nodes, edges);

    expect(layers.get("A")).toBe(0);
    expect(layers.get("B")).toBe(1);
    expect(layers.get("C")).toBe(2);
  });

  it("assigns diamond A->B, A->C, B->D, C->D correctly", () => {
    const nodes = [node("A"), node("B"), node("C"), node("D")];
    const edges = [
      edge("A", "B"),
      edge("A", "C"),
      edge("B", "D"),
      edge("C", "D"),
    ];
    const layers = assignLayers(nodes, edges);

    expect(layers.get("A")).toBe(0);
    expect(layers.get("B")).toBe(1);
    expect(layers.get("C")).toBe(1);
    expect(layers.get("D")).toBe(2);
  });

  it("uses longest path (not shortest)", () => {
    // A->B->C->D and A->D
    // D should be at layer 3 (longest path), not layer 1 (shortest)
    const nodes = [node("A"), node("B"), node("C"), node("D")];
    const edges = [
      edge("A", "B"),
      edge("B", "C"),
      edge("C", "D"),
      edge("A", "D"),
    ];
    const layers = assignLayers(nodes, edges);

    expect(layers.get("A")).toBe(0);
    expect(layers.get("D")).toBe(3); // longest path: A->B->C->D
  });

  it("handles multiple sources", () => {
    // A->C, B->C
    const nodes = [node("A"), node("B"), node("C")];
    const edges = [edge("A", "C"), edge("B", "C")];
    const layers = assignLayers(nodes, edges);

    expect(layers.get("A")).toBe(0);
    expect(layers.get("B")).toBe(0);
    expect(layers.get("C")).toBe(1);
  });

  it("handles empty input", () => {
    const layers = assignLayers([], []);
    expect(layers.size).toBe(0);
  });

  it("handles disconnected nodes", () => {
    const nodes = [node("A"), node("B")];
    const layers = assignLayers(nodes, []);
    expect(layers.get("A")).toBe(0);
    expect(layers.get("B")).toBe(0);
  });

  it("preserves monotonic increase along edges", () => {
    const nodes = [node("A"), node("B"), node("C"), node("D"), node("E")];
    const edges = [
      edge("A", "B"),
      edge("A", "C"),
      edge("B", "D"),
      edge("C", "D"),
      edge("D", "E"),
    ];
    const layers = assignLayers(nodes, edges);

    for (const e of edges) {
      expect(layers.get(e.source)!).toBeLessThan(layers.get(e.target)!);
    }
  });

  it("forces first and last constrained nodes to graph edges", () => {
    const nodes: LayoutNode[] = [
      { id: "in", width: 120, height: 40, layerConstraint: "first" },
      node("mid"),
      { id: "out", width: 120, height: 40, layerConstraint: "last" },
    ];
    const edges = [edge("in", "mid"), edge("mid", "out")];
    const layers = assignLayers(nodes, edges);

    expect(layers.get("in")).toBe(0);
    expect(layers.get("out")).toBeGreaterThan(layers.get("mid")!);
  });

  it("separates disconnected constrained boundary nodes into distinct layers", () => {
    const nodes: LayoutNode[] = [
      { id: "in", width: 120, height: 40, layerConstraint: "first" },
      { id: "out", width: 120, height: 40, layerConstraint: "last" },
    ];
    const layers = assignLayers(nodes, []);

    expect(layers.get("in")).toBe(0);
    expect(layers.get("out")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// minimizeCrossings
// ---------------------------------------------------------------------------

describe("minimizeCrossings", () => {
  it("returns single layer unchanged", () => {
    const layers = [["A", "B", "C"]];
    const result = minimizeCrossings(layers, [], new Map());
    expect(result).toEqual([["A", "B", "C"]]);
  });

  it("returns empty layers unchanged", () => {
    const result = minimizeCrossings([], [], new Map());
    expect(result).toEqual([]);
  });

  it("reduces crossings in a simple case", () => {
    // Layer 0: [A, B], Layer 1: [C, D]
    // Edges: A->D, B->C (these cross if A is before B and C is before D)
    const nodes = [node("A"), node("B"), node("C"), node("D")];
    const layers = [["A", "B"], ["C", "D"]];
    const edges = [edge("A", "D"), edge("B", "C")];

    const result = minimizeCrossings(layers, edges, nodeMap(nodes));

    // After minimization, should reorder to eliminate crossing
    // Either layer 0 becomes [B, A] or layer 1 becomes [D, C]
    // Verify no crossings remain
    const l0Pos = new Map<string, number>();
    const l1Pos = new Map<string, number>();
    for (let i = 0; i < result[0].length; i++) l0Pos.set(result[0][i], i);
    for (let i = 0; i < result[1].length; i++) l1Pos.set(result[1][i], i);

    // Edge A->D and B->C should not cross
    const aPosTop = l0Pos.get("A")!;
    const bPosTop = l0Pos.get("B")!;
    const cPosBot = l1Pos.get("C")!;
    const dPosBot = l1Pos.get("D")!;

    // Crossing means (A before B but D after C) or (A after B but D before C)
    const crosses =
      (aPosTop < bPosTop && dPosBot > cPosBot) ||
      (aPosTop > bPosTop && dPosBot < cPosBot);
    expect(crosses).toBe(false);
  });

  it("preserves order when no crossings exist", () => {
    // A->C, B->D (no crossing since A<B and C<D)
    const nodes = [node("A"), node("B"), node("C"), node("D")];
    const layers = [["A", "B"], ["C", "D"]];
    const edges = [edge("A", "C"), edge("B", "D")];

    const result = minimizeCrossings(layers, edges, nodeMap(nodes));

    // Order should remain [A, B] and [C, D]
    expect(result[0]).toEqual(["A", "B"]);
    expect(result[1]).toEqual(["C", "D"]);
  });
});

// ---------------------------------------------------------------------------
// assignCoordinates
// ---------------------------------------------------------------------------

describe("assignCoordinates", () => {
  it("assigns single node at origin", () => {
    const nodes = [node("A", 200, 100)];
    const nMap = nodeMap(nodes);
    const result = assignCoordinates([["A"]], nMap, {
      horizontalGap: 100,
      verticalGap: 40,
    });

    expect(result.get("A")).toEqual({ x: 0, y: 0 });
  });

  it("stacks nodes vertically within a layer", () => {
    const nodes = [node("A", 200, 100), node("B", 200, 80)];
    const nMap = nodeMap(nodes);
    const result = assignCoordinates([["A", "B"]], nMap, {
      horizontalGap: 100,
      verticalGap: 40,
    });

    const posA = result.get("A")!;
    const posB = result.get("B")!;

    // Same X
    expect(posA.x).toBe(posB.x);
    // B below A with gap
    expect(posB.y).toBe(posA.y + 100 + 40); // A.height + gap
  });

  it("places layers left to right with horizontal gap", () => {
    const nodes = [node("A", 200, 100), node("B", 150, 80)];
    const nMap = nodeMap(nodes);
    const result = assignCoordinates([["A"], ["B"]], nMap, {
      horizontalGap: 100,
      verticalGap: 40,
    });

    const posA = result.get("A")!;
    const posB = result.get("B")!;

    expect(posA.x).toBe(0);
    expect(posB.x).toBe(200 + 100); // A.width + gap
  });

  it("returns empty map for empty layers", () => {
    const result = assignCoordinates([], new Map(), {
      horizontalGap: 100,
      verticalGap: 40,
    });
    expect(result.size).toBe(0);
  });

  it("centers shorter layers vertically", () => {
    // Layer 0: two nodes (taller), Layer 1: one node (shorter)
    const nodes = [
      node("A", 200, 100),
      node("B", 200, 100),
      node("C", 200, 100),
    ];
    const nMap = nodeMap(nodes);
    const result = assignCoordinates([["A", "B"], ["C"]], nMap, {
      horizontalGap: 100,
      verticalGap: 40,
    });

    const posA = result.get("A")!;
    const posC = result.get("C")!;

    // Layer 0 total height: 100 + 40 + 100 = 240
    // Layer 1 total height: 100
    // Layer 1 y offset: (240 - 100) / 2 = 70
    expect(posA.y).toBe(0);
    expect(posC.y).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// Full Sugiyama algorithm (integration)
// ---------------------------------------------------------------------------

describe("createSugiyamaAlgorithm", () => {
  const sugiyama = createSugiyamaAlgorithm();

  it("handles single node", () => {
    const result = sugiyama.layout({
      nodes: [node("A")],
      edges: [],
    });

    expect(result.positions.size).toBe(1);
    expect(result.positions.get("A")).toEqual({ x: 0, y: 0 });
  });

  it("lays out linear chain A->B->C left to right", () => {
    const nodes = [node("A"), node("B"), node("C")];
    const edges = [edge("A", "B"), edge("B", "C")];
    const result = sugiyama.layout({ nodes, edges });

    expect(result.positions.size).toBe(3);
    const posA = result.positions.get("A")!;
    const posB = result.positions.get("B")!;
    const posC = result.positions.get("C")!;

    // X should increase left to right
    expect(posA.x).toBeLessThan(posB.x);
    expect(posB.x).toBeLessThan(posC.x);

    assertFiniteCoordinates(result.positions);
    assertNoOverlaps(result.positions, nodes);
  });

  it("lays out diamond graph correctly", () => {
    const nodes = [node("A"), node("B"), node("C"), node("D")];
    const edges = [
      edge("A", "B"),
      edge("A", "C"),
      edge("B", "D"),
      edge("C", "D"),
    ];
    const result = sugiyama.layout({ nodes, edges });

    expect(result.positions.size).toBe(4);

    const posA = result.positions.get("A")!;
    const posB = result.positions.get("B")!;
    const posC = result.positions.get("C")!;
    const posD = result.positions.get("D")!;

    // A at layer 0, B and C at layer 1, D at layer 2
    expect(posA.x).toBeLessThan(posB.x);
    expect(posA.x).toBeLessThan(posC.x);
    expect(posB.x).toBe(posC.x); // same layer
    expect(posB.x).toBeLessThan(posD.x);

    // B and C should be at different Y positions
    expect(posB.y).not.toBe(posC.y);

    assertFiniteCoordinates(result.positions);
    assertNoOverlaps(result.positions, nodes);
  });

  it("handles cycle A->B->C->A", () => {
    const nodes = [node("A"), node("B"), node("C")];
    const edges = [edge("A", "B"), edge("B", "C"), edge("C", "A")];
    const result = sugiyama.layout({ nodes, edges });

    // All nodes should be positioned
    expect(result.positions.size).toBe(3);
    assertFiniteCoordinates(result.positions);
    assertNoOverlaps(result.positions, nodes);
  });

  it("handles wide graph (many nodes in one layer)", () => {
    const nodes = [
      node("root"),
      node("A"),
      node("B"),
      node("C"),
      node("D"),
      node("E"),
    ];
    const edges = [
      edge("root", "A"),
      edge("root", "B"),
      edge("root", "C"),
      edge("root", "D"),
      edge("root", "E"),
    ];
    const result = sugiyama.layout({ nodes, edges });

    expect(result.positions.size).toBe(6);

    // All child nodes should have same X (same layer)
    const childPositions = ["A", "B", "C", "D", "E"].map(
      (id) => result.positions.get(id)!,
    );
    const childX = childPositions[0].x;
    for (const pos of childPositions) {
      expect(pos.x).toBe(childX);
    }

    // Root should be at a smaller X
    expect(result.positions.get("root")!.x).toBeLessThan(childX);

    assertFiniteCoordinates(result.positions);
    assertNoOverlaps(result.positions, nodes);
  });

  it("handles empty input", () => {
    const result = sugiyama.layout({ nodes: [], edges: [] });
    expect(result.positions.size).toBe(0);
  });

  it("is idempotent (same input produces same output)", () => {
    const nodes = [node("A"), node("B"), node("C"), node("D")];
    const edges = [
      edge("A", "B"),
      edge("A", "C"),
      edge("B", "D"),
      edge("C", "D"),
    ];

    const result1 = sugiyama.layout({ nodes, edges });
    const result2 = sugiyama.layout({ nodes, edges });

    for (const n of nodes) {
      const pos1 = result1.positions.get(n.id)!;
      const pos2 = result2.positions.get(n.id)!;
      expect(pos1.x).toBe(pos2.x);
      expect(pos1.y).toBe(pos2.y);
    }
  });

  it("respects custom gap configuration", () => {
    const custom = createSugiyamaAlgorithm({
      horizontalGap: 200,
      verticalGap: 80,
    });

    const nodes = [node("A", 100, 50), node("B", 100, 50)];
    const edges = [edge("A", "B")];
    const result = custom.layout({ nodes, edges });

    const posA = result.positions.get("A")!;
    const posB = result.positions.get("B")!;

    // Horizontal gap should be respected: B.x = A.x + A.width + gap
    expect(posB.x - posA.x).toBe(100 + 200);
  });

  it("handles complex multi-layer graph", () => {
    // S -> A, S -> B
    // A -> C, A -> D
    // B -> D, B -> E
    // C -> F, D -> F, E -> F
    const nodes = [
      node("S"),
      node("A"),
      node("B"),
      node("C"),
      node("D"),
      node("E"),
      node("F"),
    ];
    const edges = [
      edge("S", "A"),
      edge("S", "B"),
      edge("A", "C"),
      edge("A", "D"),
      edge("B", "D"),
      edge("B", "E"),
      edge("C", "F"),
      edge("D", "F"),
      edge("E", "F"),
    ];
    const result = sugiyama.layout({ nodes, edges });

    expect(result.positions.size).toBe(7);
    assertFiniteCoordinates(result.positions);
    assertNoOverlaps(result.positions, nodes);

    // S should be leftmost, F should be rightmost
    const posS = result.positions.get("S")!;
    const posF = result.positions.get("F")!;
    expect(posS.x).toBeLessThan(posF.x);

    // Layer ordering should hold for all edges
    for (const e of edges) {
      const srcX = result.positions.get(e.source)!.x;
      const tgtX = result.positions.get(e.target)!.x;
      expect(srcX).toBeLessThan(tgtX);
    }
  });

  it("produces positions for all nodes even in complex cycles", () => {
    // A->B->C->D->A plus A->C (multiple cycles)
    const nodes = [node("A"), node("B"), node("C"), node("D")];
    const edges = [
      edge("A", "B"),
      edge("B", "C"),
      edge("C", "D"),
      edge("D", "A"),
      edge("A", "C"),
    ];
    const result = sugiyama.layout({ nodes, edges });

    expect(result.positions.size).toBe(4);
    assertFiniteCoordinates(result.positions);
    assertNoOverlaps(result.positions, nodes);
  });

  it("has name 'sugiyama'", () => {
    expect(sugiyama.name).toBe("sugiyama");
  });

  it("handles nodes with varying sizes", () => {
    const nodes = [
      node("tiny", 50, 30),
      node("medium", 200, 100),
      node("large", 400, 200),
    ];
    const edges = [edge("tiny", "medium"), edge("medium", "large")];
    const result = sugiyama.layout({ nodes, edges });

    expect(result.positions.size).toBe(3);
    assertFiniteCoordinates(result.positions);
    assertNoOverlaps(result.positions, nodes);

    // X should increase
    const positions = nodes.map((n) => result.positions.get(n.id)!);
    expect(positions[0].x).toBeLessThan(positions[1].x);
    expect(positions[1].x).toBeLessThan(positions[2].x);
  });

  it("handles parallel paths of different lengths", () => {
    // A -> B -> C -> D  (long path)
    // A -> D            (short path)
    const nodes = [node("A"), node("B"), node("C"), node("D")];
    const edges = [
      edge("A", "B"),
      edge("B", "C"),
      edge("C", "D"),
      edge("A", "D"),
    ];
    const result = sugiyama.layout({ nodes, edges });

    // D should be at layer 3 (longest path), not layer 1
    const posA = result.positions.get("A")!;
    const posB = result.positions.get("B")!;
    const posC = result.positions.get("C")!;
    const posD = result.positions.get("D")!;

    expect(posA.x).toBeLessThan(posB.x);
    expect(posB.x).toBeLessThan(posC.x);
    expect(posC.x).toBeLessThan(posD.x);

    assertNoOverlaps(result.positions, nodes);
  });
});
