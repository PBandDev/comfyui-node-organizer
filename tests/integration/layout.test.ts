import { describe, it, beforeEach, expect } from "vitest";
import { loadFixture, cloneGraph } from "../helpers";
import { layoutGraph } from "../../src/layout/index";
import {
  assertNoOverlaps,
  assertNodesInsideGroups,
  assertFiniteCoordinates,
  assertTopologicalOrder,
  assertIdempotent,
  assertGroupMembershipPreserved,
} from "../invariants";
import type { LGraph } from "../../src/layout/types";

/**
 * Regression tests for the layout algorithm
 * Each fixture is run through all invariants to catch regressions
 */
describe("layoutGraph regression tests", () => {
  // Fixtures that currently pass all tests
  const passingFixtures = [
    "simple-dag.json", // 7 nodes, no groups, basic txt2img DAG
    "nested-groups.json", // Nested groups with node inside inner group
    "nested-wrapper.json", // Group Wrapper containing nested groups
    "complex-parallel.json", // 26 nodes, parallel KSampler High/Low, 5 groups
  ];

  // Fixtures with known issues (documented for future fixes)
  // These use test.skip() to document expected failures
  const knownIssueFixtures: Array<{ name: string; issues: string[] }> = [
    // All fixtures now pass - keeping array for future regression tracking
  ];

  // Test passing fixtures with all invariants
  for (const fixture of passingFixtures) {
    describe(fixture, () => {
      let graph: LGraph;
      let originalGraph: LGraph;

      beforeEach(() => {
        graph = loadFixture(fixture);
        originalGraph = cloneGraph(graph); // Capture state before layout
        layoutGraph(graph);
      });

      it("has no overlapping entities", () => {
        assertNoOverlaps(graph);
      });

      it("keeps nodes inside their groups", () => {
        assertNodesInsideGroups(graph);
      });

      it("has finite coordinates", () => {
        assertFiniteCoordinates(graph);
      });

      it("preserves topological order", () => {
        assertTopologicalOrder(graph);
      });

      it("is idempotent (stable after multiple runs)", () => {
        assertIdempotent(graph);
      });

      it("preserves group membership", () => {
        assertGroupMembershipPreserved(originalGraph, graph);
      });
    });
  }

  // Test fixtures with known issues - skip failing tests
  for (const { name, issues } of knownIssueFixtures) {
    describe(name, () => {
      let graph: LGraph;
      let originalGraph: LGraph;

      beforeEach(() => {
        graph = loadFixture(name);
        originalGraph = cloneGraph(graph);
        layoutGraph(graph);
      });

      // Skip overlap test if known issue
      if (issues.includes("overlap")) {
        it.skip("has no overlapping entities (KNOWN ISSUE)", () => {
          assertNoOverlaps(graph);
        });
      } else {
        it("has no overlapping entities", () => {
          assertNoOverlaps(graph);
        });
      }

      it("keeps nodes inside their groups", () => {
        assertNodesInsideGroups(graph);
      });

      it("has finite coordinates", () => {
        assertFiniteCoordinates(graph);
      });

      it("preserves topological order", () => {
        assertTopologicalOrder(graph);
      });

      // Skip idempotent test if known issue
      if (issues.includes("idempotent")) {
        it.skip("is idempotent (KNOWN ISSUE)", () => {
          assertIdempotent(graph);
        });
      } else {
        it("is idempotent (stable after multiple runs)", () => {
          assertIdempotent(graph);
        });
      }

      // Skip membership test if known issue
      if (issues.includes("membership")) {
        it.skip("preserves group membership (KNOWN ISSUE)", () => {
          assertGroupMembershipPreserved(originalGraph, graph);
        });
      } else {
        it("preserves group membership", () => {
          assertGroupMembershipPreserved(originalGraph, graph);
        });
      }
    });
  }
});

describe("layout algorithm properties", () => {
  it("handles empty graph", () => {
    const graph: LGraph = {
      _nodes: [],
      _groups: [],
      links: new Map(),
    };

    const result = layoutGraph(graph);

    expect(result.nodeCount).toBe(0);
    expect(result.layerCount).toBe(0);
  });

  it("handles single node", () => {
    const graph: LGraph = {
      _nodes: [
        {
          id: 1,
          type: "Note",
          title: "Test",
          pos: [0, 0],
          size: [200, 100],
          inputs: [],
          outputs: [],
        },
      ],
      _groups: [],
      links: new Map(),
    };

    const result = layoutGraph(graph);

    expect(result.nodeCount).toBe(1);
    assertFiniteCoordinates(graph);
  });

  it("handles disconnected nodes", () => {
    const graph: LGraph = {
      _nodes: [
        {
          id: 1,
          type: "Note",
          title: "Note 1",
          pos: [0, 0],
          size: [200, 100],
          inputs: [],
          outputs: [],
        },
        {
          id: 2,
          type: "Note",
          title: "Note 2",
          pos: [500, 500],
          size: [200, 100],
          inputs: [],
          outputs: [],
        },
      ],
      _groups: [],
      links: new Map(),
    };

    layoutGraph(graph);

    assertNoOverlaps(graph);
    assertFiniteCoordinates(graph);
  });
});
