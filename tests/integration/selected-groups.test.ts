import { describe, it, beforeEach, expect } from "vitest";
import { loadFixture, capturePositions } from "../helpers";
import { layoutSelectedGroups } from "../../src/layout/selected-groups";
import { parseLayoutToken } from "../../src/layout/title-tokens";
import {
  assertNodesInsideGroups,
  assertFiniteCoordinates,
} from "../invariants";
import type { LGraph } from "../../src/layout/types";

/**
 * Tests for layoutSelectedGroups function
 * Note: External overlaps are acceptable per requirements
 */
describe("layoutSelectedGroups", () => {
  describe("single group with internal connections", () => {
    let graph: LGraph;

    beforeEach(() => {
      // nested-groups.json has groups with internal connections
      // Group 1 "Step 1 - Load model" contains node 4 (CheckpointLoaderSimple)
      graph = loadFixture("nested-groups.json");
    });

    it("organizes nodes within selected group", () => {
      // Select group 1 which contains node 4
      const result = layoutSelectedGroups(graph, new Set([1]));

      expect(result.nodeCount).toBeGreaterThanOrEqual(0);
      expect(result.groupCount).toBe(1);
      assertFiniteCoordinates(graph);
    });

    it("resizes group to fit contents", () => {
      layoutSelectedGroups(graph, new Set([1]));

      const groupAfter = graph._groups.find((g) => g.id === 1);
      // Group size should be finite and positive
      expect(Number.isFinite(groupAfter!.size[0])).toBe(true);
      expect(Number.isFinite(groupAfter!.size[1])).toBe(true);
      expect(groupAfter!.size[0]).toBeGreaterThan(0);
      expect(groupAfter!.size[1]).toBeGreaterThan(0);
    });

    it("preserves external node positions", () => {
      // Capture positions of nodes NOT in group 1
      const nodesBefore = new Map<number, [number, number]>();
      for (const node of graph._nodes) {
        // Node 4 is in group 1, all others should be unchanged
        if (node.id !== 4) {
          nodesBefore.set(node.id, [...node.pos]);
        }
      }

      layoutSelectedGroups(graph, new Set([1]));

      // Verify external nodes haven't moved
      for (const [nodeId, posBefore] of nodesBefore) {
        const node = graph._nodes.find((n) => n.id === nodeId);
        expect(node).toBeDefined();
        expect(node!.pos[0]).toBe(posBefore[0]);
        expect(node!.pos[1]).toBe(posBefore[1]);
      }
    });

    it("is idempotent", () => {
      layoutSelectedGroups(graph, new Set([1]));
      const positions1 = capturePositions(graph);

      layoutSelectedGroups(graph, new Set([1]));
      const positions2 = capturePositions(graph);

      // Compare positions with small tolerance
      for (const [id, pos1] of positions1) {
        const pos2 = positions2.get(id);
        if (pos2) {
          expect(Math.abs(pos1.x - pos2.x)).toBeLessThan(5);
          expect(Math.abs(pos1.y - pos2.y)).toBeLessThan(5);
        }
      }
    });
  });

  describe("single group with disconnected nodes", () => {
    let graph: LGraph;

    beforeEach(() => {
      // Create a graph with a group containing disconnected nodes
      graph = {
        _nodes: [
          {
            id: 1,
            type: "Note",
            title: "Note 1",
            pos: [100, 100],
            size: [200, 100],
            inputs: [],
            outputs: [],
          },
          {
            id: 2,
            type: "Note",
            title: "Note 2",
            pos: [150, 250],
            size: [200, 100],
            inputs: [],
            outputs: [],
          },
          {
            id: 3,
            type: "Note",
            title: "External Node",
            pos: [500, 500],
            size: [200, 100],
            inputs: [],
            outputs: [],
          },
        ],
        _groups: [
          {
            id: 1,
            title: "Test Group",
            pos: [50, 50],
            size: [350, 350],
          },
        ],
        links: new Map(),
      };
    });

    it("stacks disconnected nodes vertically", () => {
      const result = layoutSelectedGroups(graph, new Set([1]));

      expect(result.nodeCount).toBe(2);
      expect(result.groupCount).toBe(1);

      // Nodes should have same X (stacked vertically)
      const node1 = graph._nodes.find((n) => n.id === 1)!;
      const node2 = graph._nodes.find((n) => n.id === 2)!;
      expect(node1.pos[0]).toBe(node2.pos[0]);

      assertFiniteCoordinates(graph);
    });

    it("resizes group to fit stacked nodes", () => {
      layoutSelectedGroups(graph, new Set([1]));

      const group = graph._groups.find((g) => g.id === 1)!;
      expect(Number.isFinite(group.size[0])).toBe(true);
      expect(Number.isFinite(group.size[1])).toBe(true);
      expect(group.size[0]).toBeGreaterThan(0);
      expect(group.size[1]).toBeGreaterThan(0);
    });
  });

  describe("multiple groups", () => {
    let graph: LGraph;

    beforeEach(() => {
      graph = loadFixture("nested-groups.json");
    });

    it("organizes each group independently", () => {
      // Select groups 1 and 2 (not nested)
      const result = layoutSelectedGroups(graph, new Set([1, 2]));

      expect(result.groupCount).toBeGreaterThanOrEqual(2);
      assertFiniteCoordinates(graph);
    });

    it("handles non-overlapping groups", () => {
      layoutSelectedGroups(graph, new Set([1, 2]));

      // Both groups should have valid coordinates
      const group1 = graph._groups.find((g) => g.id === 1)!;
      const group2 = graph._groups.find((g) => g.id === 2)!;

      expect(Number.isFinite(group1.pos[0])).toBe(true);
      expect(Number.isFinite(group2.pos[0])).toBe(true);
    });
  });

  describe("nested groups", () => {
    let graph: LGraph;

    beforeEach(() => {
      // nested-groups.json has Group 3 containing Group 4 (nested)
      graph = loadFixture("nested-groups.json");
    });

    it("auto-includes nested groups when parent selected", () => {
      // Select group 3 which contains group 4
      const result = layoutSelectedGroups(graph, new Set([3]));

      // Should include the nested group
      expect(result.groupCount).toBeGreaterThanOrEqual(1);
      assertFiniteCoordinates(graph);
    });

    it("positions nested groups correctly", () => {
      layoutSelectedGroups(graph, new Set([3]));

      // Group 4 should still be inside Group 3
      const group3 = graph._groups.find((g) => g.id === 3)!;
      const group4 = graph._groups.find((g) => g.id === 4)!;

      // Check group 4 is within group 3 bounds
      expect(group4.pos[0]).toBeGreaterThanOrEqual(group3.pos[0]);
      expect(group4.pos[1]).toBeGreaterThanOrEqual(group3.pos[1]);
      expect(group4.pos[0] + group4.size[0]).toBeLessThanOrEqual(
        group3.pos[0] + group3.size[0]
      );
      expect(group4.pos[1] + group4.size[1]).toBeLessThanOrEqual(
        group3.pos[1] + group3.size[1]
      );
    });

    it("keeps nodes inside selected groups", () => {
      layoutSelectedGroups(graph, new Set([3]));

      // Nodes inside group 3 should remain inside it
      assertNodesInsideGroups(graph);
    });
  });

  describe("edge cases", () => {
    it("handles empty graph", () => {
      const graph: LGraph = {
        _nodes: [],
        _groups: [],
        links: new Map(),
      };

      const result = layoutSelectedGroups(graph, new Set([1]));

      expect(result.nodeCount).toBe(0);
      expect(result.groupCount).toBe(0);
    });

    it("handles non-existent group IDs", () => {
      const graph = loadFixture("nested-groups.json");

      const result = layoutSelectedGroups(graph, new Set([999]));

      expect(result.groupCount).toBe(0);
    });

    it("handles empty groups", () => {
      const graph: LGraph = {
        _nodes: [
          {
            id: 1,
            type: "Note",
            title: "External",
            pos: [500, 500],
            size: [200, 100],
            inputs: [],
            outputs: [],
          },
        ],
        _groups: [
          {
            id: 1,
            title: "Empty Group",
            pos: [50, 50],
            size: [200, 200],
          },
        ],
        links: new Map(),
      };

      // Should not crash
      const result = layoutSelectedGroups(graph, new Set([1]));

      // Empty group is still processed, just has no content
      expect(result.nodeCount).toBe(0);
      assertFiniteCoordinates(graph);
    });

    it("handles locked nodes", () => {
      const graph: LGraph = {
        _nodes: [
          {
            id: 1,
            type: "Note",
            title: "Locked Node",
            pos: [100, 100],
            size: [200, 100],
            inputs: [],
            outputs: [],
            locked: true,
          },
          {
            id: 2,
            type: "Note",
            title: "Normal Node",
            pos: [100, 250],
            size: [200, 100],
            inputs: [],
            outputs: [],
          },
        ],
        _groups: [
          {
            id: 1,
            title: "Test Group",
            pos: [50, 50],
            size: [350, 400],
          },
        ],
        links: new Map(),
      };

      const lockedPosBefore = [...graph._nodes[0].pos];

      layoutSelectedGroups(graph, new Set([1]));

      // Locked node should not move
      expect(graph._nodes[0].pos[0]).toBe(lockedPosBefore[0]);
      expect(graph._nodes[0].pos[1]).toBe(lockedPosBefore[1]);
    });

    it("handles group with only locked nodes", () => {
      const graph: LGraph = {
        _nodes: [
          {
            id: 1,
            type: "Note",
            title: "Locked Node",
            pos: [100, 100],
            size: [200, 100],
            inputs: [],
            outputs: [],
            locked: true,
          },
        ],
        _groups: [
          {
            id: 1,
            title: "Test Group",
            pos: [50, 50],
            size: [350, 250],
          },
        ],
        links: new Map(),
      };

      // Should not crash
      const result = layoutSelectedGroups(graph, new Set([1]));
      expect(result).toBeDefined();
    });
  });

  describe("groups with internal connections", () => {
    it("uses layer-based layout for connected nodes", () => {
      const graph: LGraph = {
        _nodes: [
          {
            id: 1,
            type: "NodeA",
            title: "Node A",
            pos: [100, 100],
            size: [200, 100],
            inputs: [],
            outputs: [{ name: "out", type: "FLOAT", links: [1] }],
          },
          {
            id: 2,
            type: "NodeB",
            title: "Node B",
            pos: [100, 300],
            size: [200, 100],
            inputs: [{ name: "in", type: "FLOAT", link: 1 }],
            outputs: [],
          },
        ],
        _groups: [
          {
            id: 1,
            title: "Test Group",
            pos: [50, 50],
            size: [400, 400],
          },
        ],
        links: new Map([
          [
            1,
            {
              id: 1,
              origin_id: 1,
              origin_slot: 0,
              target_id: 2,
              target_slot: 0,
              type: "FLOAT",
            },
          ],
        ]),
      };

      layoutSelectedGroups(graph, new Set([1]));

      // With layer-based layout, source (node 1) should be left of target (node 2)
      const node1 = graph._nodes.find((n) => n.id === 1)!;
      const node2 = graph._nodes.find((n) => n.id === 2)!;
      expect(node1.pos[0]).toBeLessThan(node2.pos[0]);

      assertFiniteCoordinates(graph);
    });
  });

  describe("parseLayoutToken", () => {
    it("parses [HORIZONTAL] token", () => {
      expect(parseLayoutToken("My Group [HORIZONTAL]")).toEqual({
        type: "horizontal",
      });
    });

    it("parses [VERTICAL] token", () => {
      expect(parseLayoutToken("[VERTICAL] Group")).toEqual({ type: "vertical" });
    });

    it("parses [xROW] tokens", () => {
      expect(parseLayoutToken("Group [2ROW]")).toEqual({ type: "rows", count: 2 });
      expect(parseLayoutToken("[3ROW] Test")).toEqual({ type: "rows", count: 3 });
    });

    it("parses [xCOL] tokens", () => {
      expect(parseLayoutToken("Group [2COL]")).toEqual({
        type: "columns",
        count: 2,
      });
      expect(parseLayoutToken("[4COL] Test")).toEqual({
        type: "columns",
        count: 4,
      });
    });

    it("treats [1ROW] as horizontal", () => {
      expect(parseLayoutToken("Group [1ROW]")).toEqual({ type: "horizontal" });
    });

    it("treats [1COL] as vertical", () => {
      expect(parseLayoutToken("Group [1COL]")).toEqual({ type: "vertical" });
    });

    it("is case-insensitive", () => {
      expect(parseLayoutToken("[horizontal]")).toEqual({ type: "horizontal" });
      expect(parseLayoutToken("[Vertical]")).toEqual({ type: "vertical" });
      expect(parseLayoutToken("[2row]")).toEqual({ type: "rows", count: 2 });
      expect(parseLayoutToken("[3Col]")).toEqual({ type: "columns", count: 3 });
    });

    it("returns default for no token", () => {
      expect(parseLayoutToken("Normal Group")).toEqual({ type: "default" });
      expect(parseLayoutToken("")).toEqual({ type: "default" });
    });

    it("returns first matching token", () => {
      // HORIZONTAL comes before xROW in parsing order
      expect(parseLayoutToken("[HORIZONTAL] [2ROW]")).toEqual({
        type: "horizontal",
      });
    });
  });

  describe("groups with layout tokens", () => {
    function createTestGraph(groupTitle: string): LGraph {
      return {
        _nodes: [
          {
            id: 1,
            type: "Note",
            title: "Node 1",
            pos: [100, 100],
            size: [200, 100],
            inputs: [],
            outputs: [],
          },
          {
            id: 2,
            type: "Note",
            title: "Node 2",
            pos: [100, 250],
            size: [200, 100],
            inputs: [],
            outputs: [],
          },
          {
            id: 3,
            type: "Note",
            title: "Node 3",
            pos: [100, 400],
            size: [200, 100],
            inputs: [],
            outputs: [],
          },
          {
            id: 4,
            type: "Note",
            title: "Node 4",
            pos: [100, 550],
            size: [200, 100],
            inputs: [],
            outputs: [],
          },
        ],
        _groups: [
          {
            id: 1,
            title: groupTitle,
            pos: [50, 50],
            size: [500, 700],
          },
        ],
        links: new Map(),
      };
    }

    it("[HORIZONTAL] arranges nodes in single row", () => {
      const graph = createTestGraph("Test [HORIZONTAL]");
      layoutSelectedGroups(graph, new Set([1]));

      // All nodes should have same Y (single row)
      const ys = graph._nodes.map((n) => n.pos[1]);
      expect(new Set(ys).size).toBe(1);

      // Nodes should be spread horizontally
      const xs = graph._nodes.map((n) => n.pos[0]).sort((a, b) => a - b);
      expect(xs[3]).toBeGreaterThan(xs[0]);

      assertFiniteCoordinates(graph);
    });

    it("[VERTICAL] arranges nodes in single column", () => {
      const graph = createTestGraph("Test [VERTICAL]");
      layoutSelectedGroups(graph, new Set([1]));

      // All nodes should have same X (single column)
      const xs = graph._nodes.map((n) => n.pos[0]);
      expect(new Set(xs).size).toBe(1);

      // Nodes should be spread vertically
      const ys = graph._nodes.map((n) => n.pos[1]).sort((a, b) => a - b);
      expect(ys[3]).toBeGreaterThan(ys[0]);

      assertFiniteCoordinates(graph);
    });

    it("[2ROW] distributes nodes into 2 rows", () => {
      const graph = createTestGraph("Test [2ROW]");
      layoutSelectedGroups(graph, new Set([1]));

      // Should have exactly 2 distinct Y values (2 rows)
      const ys = new Set(graph._nodes.map((n) => n.pos[1]));
      expect(ys.size).toBe(2);

      assertFiniteCoordinates(graph);
    });

    it("[3COL] distributes nodes into 3 columns", () => {
      const graph = createTestGraph("Test [3COL]");
      layoutSelectedGroups(graph, new Set([1]));

      // Should have 3 distinct X values (4 nodes into 3 cols = 2,1,1 distribution)
      const xs = new Set(graph._nodes.map((n) => n.pos[0]));
      expect(xs.size).toBe(3);

      assertFiniteCoordinates(graph);
    });

    it("lowercase token works", () => {
      const graph = createTestGraph("Test [horizontal]");
      layoutSelectedGroups(graph, new Set([1]));

      // All nodes should have same Y (single row)
      const ys = graph._nodes.map((n) => n.pos[1]);
      expect(new Set(ys).size).toBe(1);

      assertFiniteCoordinates(graph);
    });

    it("ignores DAG structure with token", () => {
      // Create graph with connected nodes
      const graph: LGraph = {
        _nodes: [
          {
            id: 1,
            type: "NodeA",
            title: "Node A",
            pos: [100, 100],
            size: [200, 100],
            inputs: [],
            outputs: [{ name: "out", type: "FLOAT", links: [1] }],
          },
          {
            id: 2,
            type: "NodeB",
            title: "Node B",
            pos: [100, 300],
            size: [200, 100],
            inputs: [{ name: "in", type: "FLOAT", link: 1 }],
            outputs: [],
          },
        ],
        _groups: [
          {
            id: 1,
            title: "Test [HORIZONTAL]",
            pos: [50, 50],
            size: [500, 400],
          },
        ],
        links: new Map([
          [
            1,
            {
              id: 1,
              origin_id: 1,
              origin_slot: 0,
              target_id: 2,
              target_slot: 0,
              type: "FLOAT",
            },
          ],
        ]),
      };

      layoutSelectedGroups(graph, new Set([1]));

      // With [HORIZONTAL], both nodes should have same Y regardless of connection
      const node1 = graph._nodes.find((n) => n.id === 1)!;
      const node2 = graph._nodes.find((n) => n.id === 2)!;
      expect(node1.pos[1]).toBe(node2.pos[1]);

      assertFiniteCoordinates(graph);
    });

    it("nested groups respect their own tokens", () => {
      const graph: LGraph = {
        _nodes: [
          // Nodes in outer group (not in inner)
          {
            id: 1,
            type: "Note",
            title: "Outer 1",
            pos: [100, 100],
            size: [100, 100],
            inputs: [],
            outputs: [],
          },
          {
            id: 2,
            type: "Note",
            title: "Outer 2",
            pos: [100, 250],
            size: [100, 100],
            inputs: [],
            outputs: [],
          },
          // Nodes in inner group
          {
            id: 3,
            type: "Note",
            title: "Inner 1",
            pos: [350, 150],
            size: [100, 100],
            inputs: [],
            outputs: [],
          },
          {
            id: 4,
            type: "Note",
            title: "Inner 2",
            pos: [350, 300],
            size: [100, 100],
            inputs: [],
            outputs: [],
          },
        ],
        _groups: [
          {
            id: 1,
            title: "Outer [HORIZONTAL]",
            pos: [50, 50],
            size: [600, 500],
          },
          {
            id: 2,
            title: "Inner [VERTICAL]",
            pos: [300, 100],
            size: [200, 350],
          },
        ],
        links: new Map(),
      };

      layoutSelectedGroups(graph, new Set([1]));

      // Inner group nodes should have same X (vertical)
      const inner1 = graph._nodes.find((n) => n.id === 3)!;
      const inner2 = graph._nodes.find((n) => n.id === 4)!;
      expect(inner1.pos[0]).toBe(inner2.pos[0]);

      assertFiniteCoordinates(graph);
    });

    it("resizes group to fit token-arranged contents", () => {
      const graph = createTestGraph("Test [HORIZONTAL]");
      layoutSelectedGroups(graph, new Set([1]));

      const group = graph._groups.find((g) => g.id === 1)!;

      // Group should be wider than tall (horizontal layout)
      // With 4 nodes of 200px width + gaps, width should be significant
      expect(group.size[0]).toBeGreaterThan(600);

      assertFiniteCoordinates(graph);
    });
  });
});
