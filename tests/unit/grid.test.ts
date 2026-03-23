import { describe, it, expect } from "vitest";
import { createGridAlgorithm } from "../../src/layout/algorithms/grid";
import type { LayoutNode, LayoutInput } from "../../src/layout/types";

function node(id: string, width = 100, height = 60): LayoutNode {
  return { id, width, height };
}

function input(nodes: LayoutNode[]): LayoutInput {
  return { nodes, edges: [] };
}

// ---------------------------------------------------------------------------
// Grid layout: row-based
// ---------------------------------------------------------------------------

describe("grid layout (row-based)", () => {
  it("[2ROW] with 4 nodes produces 2x2 grid", () => {
    const algo = createGridAlgorithm({ rows: 2, gap: 40 });
    const nodes = [node("A"), node("B"), node("C"), node("D")];
    const result = algo.layout(input(nodes));

    // cols = ceil(4/2) = 2
    // Row 0: A(0,0), B(0,1)
    // Row 1: C(1,0), D(1,1)
    const posA = result.positions.get("A")!;
    const posB = result.positions.get("B")!;
    const posC = result.positions.get("C")!;
    const posD = result.positions.get("D")!;

    // cellWidth = 100+40 = 140, cellHeight = 60+40 = 100
    expect(posA).toEqual({ x: 0, y: 0 });
    expect(posB).toEqual({ x: 140, y: 0 });
    expect(posC).toEqual({ x: 0, y: 100 });
    expect(posD).toEqual({ x: 140, y: 100 });
  });

  it("[2ROW] with 1 node places at origin", () => {
    const algo = createGridAlgorithm({ rows: 2, gap: 40 });
    const result = algo.layout(input([node("A")]));

    expect(result.positions.get("A")).toEqual({ x: 0, y: 0 });
  });

  it("[3ROW] with 7 nodes distributes correctly", () => {
    const algo = createGridAlgorithm({ rows: 3, gap: 20 });
    const nodes = Array.from({ length: 7 }, (_, i) => node(`N${i}`, 80, 50));
    const result = algo.layout(input(nodes));

    // cols = ceil(7/3) = 3
    // Row 0: N0, N1, N2
    // Row 1: N3, N4, N5
    // Row 2: N6
    expect(result.positions.size).toBe(7);

    const posN0 = result.positions.get("N0")!;
    const posN3 = result.positions.get("N3")!;
    const posN6 = result.positions.get("N6")!;

    // cellWidth = 80+20 = 100, cellHeight = 50+20 = 70
    expect(posN0).toEqual({ x: 0, y: 0 });
    expect(posN3).toEqual({ x: 0, y: 70 });
    expect(posN6).toEqual({ x: 0, y: 140 });
  });
});

// ---------------------------------------------------------------------------
// Grid layout: column-based
// ---------------------------------------------------------------------------

describe("grid layout (column-based)", () => {
  it("[3COL] with 9 nodes produces 3x3 grid", () => {
    const algo = createGridAlgorithm({ columns: 3, gap: 40 });
    const nodes = Array.from({ length: 9 }, (_, i) => node(`N${i}`));
    const result = algo.layout(input(nodes));

    // rows = ceil(9/3) = 3
    // Row 0: N0, N1, N2
    // Row 1: N3, N4, N5
    // Row 2: N6, N7, N8
    expect(result.positions.size).toBe(9);

    const posN0 = result.positions.get("N0")!;
    const posN4 = result.positions.get("N4")!;
    const posN8 = result.positions.get("N8")!;

    expect(posN0).toEqual({ x: 0, y: 0 });
    expect(posN4).toEqual({ x: 140, y: 100 }); // (row=1, col=1)
    expect(posN8).toEqual({ x: 280, y: 200 }); // (row=2, col=2)
  });

  it("[2COL] with 5 nodes: 3 rows x 2 columns", () => {
    const algo = createGridAlgorithm({ columns: 2, gap: 40 });
    const nodes = Array.from({ length: 5 }, (_, i) => node(`N${i}`));
    const result = algo.layout(input(nodes));

    // rows = ceil(5/2) = 3
    // Row 0: N0, N1
    // Row 1: N2, N3
    // Row 2: N4
    expect(result.positions.size).toBe(5);

    const posN4 = result.positions.get("N4")!;
    expect(posN4).toEqual({ x: 0, y: 200 }); // (row=2, col=0)
  });
});

// ---------------------------------------------------------------------------
// Grid layout: mixed node sizes
// ---------------------------------------------------------------------------

describe("grid layout with different node sizes", () => {
  it("uses max dimensions for uniform cell sizing", () => {
    const algo = createGridAlgorithm({ columns: 2, gap: 20 });
    const nodes = [
      node("small", 60, 30),
      node("wide", 150, 30),
      node("tall", 60, 100),
      node("big", 150, 100),
    ];
    const result = algo.layout(input(nodes));

    // maxWidth = 150, maxHeight = 100
    // cellWidth = 150+20 = 170, cellHeight = 100+20 = 120

    const posSmall = result.positions.get("small")!;
    const posWide = result.positions.get("wide")!;
    const posTall = result.positions.get("tall")!;
    const posBig = result.positions.get("big")!;

    // "small" at (0,0): centered in cell → x = (150-60)/2 = 45, y = (100-30)/2 = 35
    expect(posSmall).toEqual({ x: 45, y: 35 });

    // "wide" at (0,1): x = 170 + (150-150)/2 = 170, y = (100-30)/2 = 35
    expect(posWide).toEqual({ x: 170, y: 35 });

    // "tall" at (1,0): x = (150-60)/2 = 45, y = 120 + (100-100)/2 = 120
    expect(posTall).toEqual({ x: 45, y: 120 });

    // "big" at (1,1): x = 170 + 0 = 170, y = 120 + 0 = 120
    expect(posBig).toEqual({ x: 170, y: 120 });
  });
});

// ---------------------------------------------------------------------------
// Grid layout: determinism
// ---------------------------------------------------------------------------

describe("grid layout determinism", () => {
  it("produces identical output for identical input", () => {
    const algo = createGridAlgorithm({ rows: 2, gap: 40 });
    const nodes = [node("A"), node("B"), node("C"), node("D"), node("E")];

    const result1 = algo.layout(input(nodes));
    const result2 = algo.layout(input(nodes));

    expect(result1.positions.size).toBe(result2.positions.size);
    for (const [id, pos1] of result1.positions) {
      const pos2 = result2.positions.get(id)!;
      expect(pos1.x).toBe(pos2.x);
      expect(pos1.y).toBe(pos2.y);
    }
  });
});

// ---------------------------------------------------------------------------
// Grid layout: default (no rows/columns specified)
// ---------------------------------------------------------------------------

describe("grid layout default (sqrt columns)", () => {
  it("uses sqrt(n) columns when neither rows nor columns given", () => {
    const algo = createGridAlgorithm({ gap: 40 });
    const nodes = Array.from({ length: 9 }, (_, i) => node(`N${i}`));
    const result = algo.layout(input(nodes));

    // sqrt(9) = 3 cols, 3 rows
    expect(result.positions.size).toBe(9);

    // N0 at (0,0), N3 at (1,0), N6 at (2,0)
    const posN0 = result.positions.get("N0")!;
    const posN3 = result.positions.get("N3")!;
    const posN6 = result.positions.get("N6")!;

    expect(posN0.y).toBe(0);
    expect(posN3.y).toBe(100); // row 1
    expect(posN6.y).toBe(200); // row 2
  });
});
