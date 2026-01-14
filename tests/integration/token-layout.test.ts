import { describe, it, expect, beforeEach } from "vitest";
import { loadFixture } from "../helpers";
import { layoutSelectedGroups } from "../../src/layout/selected-groups";
import { layoutGraph } from "../../src/layout/index";
import { assertFiniteCoordinates } from "../invariants";
import type { LGraph } from "../../src/layout/types";

/**
 * Regression tests for token-based layout issues
 * Based on real workflow: token-testing.json
 */
describe("token layout regression", () => {
  let graph: LGraph;

  beforeEach(() => {
    graph = loadFixture("token-testing.json");
  });

  describe("[1ROW] ordering", () => {
    // Group 8 "[1ROW]" contains nodes 41, 42 (GetNode), 43, 44 (PreviewImage), 47 (Note)
    // GetNodes are originally at X=3290, PreviewImages at X=3600

    it("preserves left-to-right order (sources before targets)", () => {
      layoutSelectedGroups(graph, new Set([8]));

      const node41 = graph._nodes.find((n) => n.id === 41)!; // GetNode
      const node42 = graph._nodes.find((n) => n.id === 42)!; // GetNode
      const node43 = graph._nodes.find((n) => n.id === 43)!; // PreviewImage
      const node44 = graph._nodes.find((n) => n.id === 44)!; // PreviewImage

      // GetNodes (originally left at X=3290) should remain left of PreviewImages (X=3600)
      expect(node41.pos[0]).toBeLessThan(node43.pos[0]);
      expect(node42.pos[0]).toBeLessThan(node44.pos[0]);

      assertFiniteCoordinates(graph);
    });

    it("places all nodes at same Y in horizontal row", () => {
      layoutSelectedGroups(graph, new Set([8]));

      const groupNodes = graph._nodes.filter((n) =>
        [41, 42, 43, 44, 47].includes(n.id)
      );
      const ys = new Set(groupNodes.map((n) => n.pos[1]));

      // All nodes should have same Y (single row)
      expect(ys.size).toBe(1);
    });
  });

  describe("[3COL] with nested groups", () => {
    // Group 9 "Full Workflow Group [3COL]" contains nested group 10 "[HORIZONTAL]"
    // Group 10 contains nodes 55, 56, 57 (isolated notes)

    it("includes nested groups in column arrangement", () => {
      layoutSelectedGroups(graph, new Set([9]));

      const group10 = graph._groups.find((g) => g.id === 10)!;

      // Nested group should be positioned
      expect(group10.pos[0]).toBeGreaterThan(0);
      expect(group10.pos[1]).toBeGreaterThan(0);

      assertFiniteCoordinates(graph);
    });

    it("nested group respects its own token when selected directly", () => {
      // Test group 10 "[HORIZONTAL]" directly
      layoutSelectedGroups(graph, new Set([10]));

      const innerNodes = graph._nodes.filter((n) =>
        [55, 56, 57].includes(n.id)
      );
      const ys = new Set(innerNodes.map((n) => n.pos[1]));

      // Inner nodes should all be at same Y (horizontal)
      expect(ys.size).toBe(1);
    });

    it("does not overlap nested groups with other content", () => {
      layoutSelectedGroups(graph, new Set([9]));

      const group10 = graph._groups.find((g) => g.id === 10)!;

      // Group 10 should have valid bounds
      expect(group10.size[0]).toBeGreaterThan(0);
      expect(group10.size[1]).toBeGreaterThan(0);

      assertFiniteCoordinates(graph);
    });
  });

  describe("Organize Workflow with tokens", () => {
    it("respects group tokens in full workflow layout", () => {
      layoutGraph(graph);

      // Group 8 "[1ROW]" - nodes should be at same Y
      const group8Nodes = graph._nodes.filter((n) =>
        [41, 42, 43, 44, 47].includes(n.id)
      );
      const g8Ys = new Set(group8Nodes.map((n) => n.pos[1]));
      expect(g8Ys.size).toBe(1);

      assertFiniteCoordinates(graph);
    });

    it("preserves ordering in workflow layout", () => {
      layoutGraph(graph);

      // In "[1ROW]" group, GetNodes should be left of PreviewImages
      const node41 = graph._nodes.find((n) => n.id === 41)!;
      const node43 = graph._nodes.find((n) => n.id === 43)!;

      expect(node41.pos[0]).toBeLessThan(node43.pos[0]);
    });
  });

  describe("[HORIZONTAL] token", () => {
    // Group 7 "[HORIZONTAL]" contains nodes 32, 33, 34, 35 (PreviewImage nodes)

    it("arranges nodes horizontally", () => {
      layoutSelectedGroups(graph, new Set([7]));

      const nodes = graph._nodes.filter((n) =>
        [32, 33, 34, 35].includes(n.id)
      );
      const ys = new Set(nodes.map((n) => n.pos[1]));

      // All nodes should have same Y
      expect(ys.size).toBe(1);

      assertFiniteCoordinates(graph);
    });
  });
});
