import { describe, it, expect } from "vitest";
import { parseLayoutToken, tokenToAlgorithm } from "../../src/layout/tokens";
import { createHorizontalAlgorithm } from "../../src/layout/algorithms/horizontal";
import { createVerticalAlgorithm } from "../../src/layout/algorithms/vertical";
import type { LayoutNode, LayoutInput } from "../../src/layout/types";

function node(id: string, width = 100, height = 60): LayoutNode {
  return { id, width, height };
}

function input(nodes: LayoutNode[]): LayoutInput {
  return { nodes, edges: [] };
}

// ---------------------------------------------------------------------------
// parseLayoutToken
// ---------------------------------------------------------------------------

describe("parseLayoutToken", () => {
  it("parses [HORIZONTAL] from group title", () => {
    const result = parseLayoutToken("My Group [HORIZONTAL]");
    expect(result).toEqual({ mode: "horizontal" });
  });

  it("parses [vertical] case-insensitively", () => {
    const result = parseLayoutToken("stuff [vertical] more");
    expect(result).toEqual({ mode: "vertical" });
  });

  it("parses [2ROW] as grid with 2 rows", () => {
    const result = parseLayoutToken("[2ROW]");
    expect(result).toEqual({ mode: "grid", count: 2, dimension: "row" });
  });

  it("parses [3col] case-insensitively as grid with 3 columns", () => {
    const result = parseLayoutToken("Title [3col]");
    expect(result).toEqual({ mode: "grid", count: 3, dimension: "col" });
  });

  it("treats [1ROW] as horizontal alias", () => {
    const result = parseLayoutToken("[1ROW]");
    expect(result).toEqual({ mode: "horizontal" });
  });

  it("treats [1COL] as vertical alias", () => {
    const result = parseLayoutToken("[1COL]");
    expect(result).toEqual({ mode: "vertical" });
  });

  it("returns null when no token present", () => {
    const result = parseLayoutToken("No token here");
    expect(result).toBeNull();
  });

  it("returns null for [10ROW] (only 1-9 supported)", () => {
    const result = parseLayoutToken("[10ROW]");
    expect(result).toBeNull();
  });

  it("returns null for [0ROW] (0 not valid)", () => {
    const result = parseLayoutToken("[0ROW]");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Algorithm behavior: horizontal
// ---------------------------------------------------------------------------

describe("horizontal algorithm", () => {
  it("places 3 nodes left-to-right with Y centered", () => {
    const nodes = [node("A", 100, 40), node("B", 80, 60), node("C", 120, 20)];
    const algo = createHorizontalAlgorithm(40);
    const result = algo.layout(input(nodes));

    const posA = result.positions.get("A")!;
    const posB = result.positions.get("B")!;
    const posC = result.positions.get("C")!;

    // Max height is 60 (node B)
    // A: y = 60/2 - 40/2 = 10
    // B: y = 60/2 - 60/2 = 0
    // C: y = 60/2 - 20/2 = 20
    expect(posA).toEqual({ x: 0, y: 10 });
    expect(posB).toEqual({ x: 140, y: 0 }); // 0 + 100 + 40
    expect(posC).toEqual({ x: 260, y: 20 }); // 140 + 80 + 40
  });

  it("returns empty positions for empty input", () => {
    const algo = createHorizontalAlgorithm();
    const result = algo.layout(input([]));
    expect(result.positions.size).toBe(0);
  });

  it("places single node at origin", () => {
    const algo = createHorizontalAlgorithm();
    const result = algo.layout(input([node("A", 100, 60)]));
    expect(result.positions.get("A")).toEqual({ x: 0, y: 0 });
  });
});

// ---------------------------------------------------------------------------
// Algorithm behavior: vertical
// ---------------------------------------------------------------------------

describe("vertical algorithm", () => {
  it("places 3 nodes top-to-bottom with X centered", () => {
    const nodes = [node("A", 80, 40), node("B", 120, 60), node("C", 60, 30)];
    const algo = createVerticalAlgorithm(40);
    const result = algo.layout(input(nodes));

    const posA = result.positions.get("A")!;
    const posB = result.positions.get("B")!;
    const posC = result.positions.get("C")!;

    // Max width is 120 (node B)
    // A: x = 120/2 - 80/2 = 20
    // B: x = 120/2 - 120/2 = 0
    // C: x = 120/2 - 60/2 = 30
    expect(posA).toEqual({ x: 20, y: 0 });
    expect(posB).toEqual({ x: 0, y: 80 }); // 0 + 40 + 40
    expect(posC).toEqual({ x: 30, y: 180 }); // 80 + 60 + 40
  });

  it("returns empty positions for empty input", () => {
    const algo = createVerticalAlgorithm();
    const result = algo.layout(input([]));
    expect(result.positions.size).toBe(0);
  });

  it("places single node at origin", () => {
    const algo = createVerticalAlgorithm();
    const result = algo.layout(input([node("A", 100, 60)]));
    expect(result.positions.get("A")).toEqual({ x: 0, y: 0 });
  });
});

// ---------------------------------------------------------------------------
// Algorithm behavior: grid
// ---------------------------------------------------------------------------

describe("grid algorithm via tokenToAlgorithm", () => {
  it("[2ROW] with 6 nodes: 2 rows x 3 columns", () => {
    const token = parseLayoutToken("[2ROW]")!;
    const algo = tokenToAlgorithm(token, 40);
    const nodes = [
      node("A", 100, 60), node("B", 100, 60), node("C", 100, 60),
      node("D", 100, 60), node("E", 100, 60), node("F", 100, 60),
    ];
    const result = algo.layout(input(nodes));

    expect(result.positions.size).toBe(6);

    // Row 0: A, B, C
    // Row 1: D, E, F
    const posA = result.positions.get("A")!;
    const posB = result.positions.get("B")!;
    const posD = result.positions.get("D")!;

    // Same-size nodes, gap=40: cellWidth=140, cellHeight=100
    expect(posA).toEqual({ x: 0, y: 0 });
    expect(posB).toEqual({ x: 140, y: 0 });
    expect(posD).toEqual({ x: 0, y: 100 });
  });

  it("[3COL] with 6 nodes: 2 rows x 3 columns", () => {
    const token = parseLayoutToken("[3COL]")!;
    const algo = tokenToAlgorithm(token, 40);
    const nodes = [
      node("A", 100, 60), node("B", 100, 60), node("C", 100, 60),
      node("D", 100, 60), node("E", 100, 60), node("F", 100, 60),
    ];
    const result = algo.layout(input(nodes));

    expect(result.positions.size).toBe(6);

    // Row 0: A, B, C
    // Row 1: D, E, F
    const posA = result.positions.get("A")!;
    const posD = result.positions.get("D")!;

    expect(posA).toEqual({ x: 0, y: 0 });
    expect(posD).toEqual({ x: 0, y: 100 });
  });

  it("[2ROW] with 5 nodes: row 0 has 3, row 1 has 2", () => {
    const token = parseLayoutToken("[2ROW]")!;
    const algo = tokenToAlgorithm(token, 40);
    const nodes = [
      node("A", 100, 60), node("B", 100, 60), node("C", 100, 60),
      node("D", 100, 60), node("E", 100, 60),
    ];
    const result = algo.layout(input(nodes));

    expect(result.positions.size).toBe(5);

    // cols = ceil(5/2) = 3
    // Row 0: A(0,0), B(0,1), C(0,2)
    // Row 1: D(1,0), E(1,1)
    const posC = result.positions.get("C")!;
    const posD = result.positions.get("D")!;
    const posE = result.positions.get("E")!;

    expect(posC.y).toBe(0); // row 0
    expect(posD.y).toBe(100); // row 1
    expect(posE.y).toBe(100); // row 1
    expect(posE.x).toBe(140); // col 1
  });

  it("empty input returns empty positions", () => {
    const token = parseLayoutToken("[2ROW]")!;
    const algo = tokenToAlgorithm(token, 40);
    const result = algo.layout(input([]));
    expect(result.positions.size).toBe(0);
  });

  it("single node placed at origin", () => {
    const token = parseLayoutToken("[3COL]")!;
    const algo = tokenToAlgorithm(token, 40);
    const result = algo.layout(input([node("A", 100, 60)]));
    expect(result.positions.get("A")).toEqual({ x: 0, y: 0 });
  });
});
