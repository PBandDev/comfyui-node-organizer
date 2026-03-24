import { describe, expect, it } from "vitest";
import { createLayoutAlgorithm } from "../../src/layout/algorithm-factory";
import type { LayoutInput, LayoutNode } from "../../src/layout/types";

describe("createLayoutAlgorithm", () => {
  it("creates a horizontal algorithm using horizontalGap", () => {
    const algorithm = createLayoutAlgorithm("horizontal", {
      horizontalGap: 123,
      verticalGap: 77,
    });

    const positions = algorithm.layout({
      nodes: [
        { id: "a", width: 10, height: 10 },
        { id: "b", width: 10, height: 10 },
      ],
      edges: [],
    }).positions;

    expect(algorithm.name).toBe("horizontal");
    expect(positions.get("b")?.x).toBe(133);
  });

  it("creates a vertical algorithm using verticalGap", () => {
    const algorithm = createLayoutAlgorithm("vertical", {
      horizontalGap: 123,
      verticalGap: 77,
    });

    const positions = algorithm.layout({
      nodes: [
        { id: "a", width: 10, height: 10 },
        { id: "b", width: 10, height: 10 },
      ],
      edges: [],
    }).positions;

    expect(algorithm.name).toBe("vertical");
    expect(positions.get("b")?.y).toBe(87);
  });

  it("creates a sugiyama algorithm using both spacing values", () => {
    const algorithm = createLayoutAlgorithm("sugiyama", {
      horizontalGap: 123,
      verticalGap: 77,
    });

    const input: LayoutInput = {
      nodes: [
        { id: "left-a", width: 10, height: 10 },
        { id: "left-b", width: 10, height: 10 },
        { id: "right", width: 10, height: 10 },
      ] satisfies LayoutNode[],
      edges: [
        { source: "left-a", target: "right" },
        { source: "left-b", target: "right" },
      ],
    };

    const positions = algorithm.layout(input).positions;

    expect(algorithm.name).toBe("sugiyama");
    expect(positions.get("right")?.x).toBe(133);
    expect(positions.get("left-b")?.y).toBe(87);
  });
});
