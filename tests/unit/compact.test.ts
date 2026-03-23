import { describe, it, expect } from "vitest";
import {
  compactVertically,
  compactHorizontally,
} from "../../src/layout/compact";
import type { Position, LayoutNode } from "../../src/layout/types";

function node(id: string, width = 100, height = 60): LayoutNode {
  return { id, width, height };
}

// ---------------------------------------------------------------------------
// compactVertically
// ---------------------------------------------------------------------------

describe("compactVertically", () => {
  it("removes vertical gaps between nodes", () => {
    const nodes = [node("A", 100, 50), node("B", 100, 50)];
    const positions = new Map<string, Position>([
      ["A", { x: 0, y: 0 }],
      ["B", { x: 0, y: 200 }], // 150px gap after A (A ends at 50)
    ]);

    const result = compactVertically(positions, nodes, 10);

    expect(result.get("A")!.y).toBe(0);
    // B should be shifted up to A.y + A.height + gap = 0 + 50 + 10 = 60
    expect(result.get("B")!.y).toBe(60);
  });

  it("does not change already-compact layout", () => {
    const nodes = [node("A", 100, 50), node("B", 100, 50)];
    const positions = new Map<string, Position>([
      ["A", { x: 0, y: 0 }],
      ["B", { x: 0, y: 60 }], // exactly 10px gap after A
    ]);

    const result = compactVertically(positions, nodes, 10);

    expect(result.get("A")!.y).toBe(0);
    expect(result.get("B")!.y).toBe(60);
  });

  it("handles single node", () => {
    const nodes = [node("A")];
    const positions = new Map<string, Position>([["A", { x: 5, y: 100 }]]);

    const result = compactVertically(positions, nodes, 10);

    expect(result.get("A")!.y).toBe(100);
    expect(result.get("A")!.x).toBe(5); // X unchanged
  });

  it("returns empty map for empty input", () => {
    const result = compactVertically(new Map(), [], 10);
    expect(result.size).toBe(0);
  });

  it("preserves X coordinates", () => {
    const nodes = [node("A", 100, 50), node("B", 100, 50)];
    const positions = new Map<string, Position>([
      ["A", { x: 100, y: 0 }],
      ["B", { x: 200, y: 500 }],
    ]);

    const result = compactVertically(positions, nodes, 10);

    expect(result.get("A")!.x).toBe(100);
    expect(result.get("B")!.x).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// compactHorizontally
// ---------------------------------------------------------------------------

describe("compactHorizontally", () => {
  it("removes horizontal gaps between nodes", () => {
    const nodes = [node("A", 80, 50), node("B", 80, 50)];
    const positions = new Map<string, Position>([
      ["A", { x: 0, y: 0 }],
      ["B", { x: 300, y: 0 }], // 220px gap after A (A ends at 80)
    ]);

    const result = compactHorizontally(positions, nodes, 10);

    expect(result.get("A")!.x).toBe(0);
    // B should be shifted left to A.x + A.width + gap = 0 + 80 + 10 = 90
    expect(result.get("B")!.x).toBe(90);
  });

  it("does not change already-compact layout", () => {
    const nodes = [node("A", 80, 50), node("B", 80, 50)];
    const positions = new Map<string, Position>([
      ["A", { x: 0, y: 0 }],
      ["B", { x: 90, y: 0 }], // exactly 10px gap
    ]);

    const result = compactHorizontally(positions, nodes, 10);

    expect(result.get("A")!.x).toBe(0);
    expect(result.get("B")!.x).toBe(90);
  });

  it("preserves Y coordinates", () => {
    const nodes = [node("A", 80, 50), node("B", 80, 50)];
    const positions = new Map<string, Position>([
      ["A", { x: 0, y: 100 }],
      ["B", { x: 500, y: 200 }],
    ]);

    const result = compactHorizontally(positions, nodes, 10);

    expect(result.get("A")!.y).toBe(100);
    expect(result.get("B")!.y).toBe(200);
  });

  it("returns empty map for empty input", () => {
    const result = compactHorizontally(new Map(), [], 10);
    expect(result.size).toBe(0);
  });
});
