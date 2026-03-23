/**
 * Tests for src/adapter.ts — the bridge between ComfyUI graph objects
 * and the pure layout framework types.
 */

import { describe, it, expect } from "vitest";
import {
  extractLayoutInput,
  extractGroupLayoutInput,
  applyLayoutOutput,
  anchorSelectedGroupLayoutResult,
} from "../../src/adapter";
import type { GraphLike } from "../../src/adapter";
import type {
  Position,
  GroupBounds,
  LayoutGroup,
  FrameworkResult,
} from "../../src/layout/types";

// ---------------------------------------------------------------------------
// Helper: create a minimal graph-like object
// ---------------------------------------------------------------------------

function makeGraph(opts: {
  nodes?: Array<{
    id: number;
    type: string;
    title: string;
    pos: number[];
    size: number[];
  }>;
  inputNode?: {
    id: number;
    pos: number[];
    size: number[];
  };
  outputNode?: {
    id: number;
    pos: number[];
    size: number[];
  };
  groups?: Array<{
    id: number;
    title: string;
    pos: number[];
    size: number[];
    childrenIds?: number[];
    includeChildrenSet?: boolean;
  }>;
  links?: Array<{
    id: number;
    origin_id: number;
    target_id: number;
  }>;
}): GraphLike {
  const nodes = (opts.nodes ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    pos: [...n.pos],
    size: [...n.size],
    inputs: [],
    outputs: [],
  }));

  const groups = (opts.groups ?? []).map((g) => {
    const childrenIdSet = new Set(g.childrenIds ?? []);
    // _children includes all nodes/groups spatially inside
    const children =
      g.includeChildrenSet === false
        ? undefined
        : new Set(
            nodes
              .filter((n) => isInsideGroup(n, g))
              .map((n) => ({ id: n.id })),
          );
    if (children) {
      for (const cid of childrenIdSet) {
        children.add({ id: cid });
      }
    }
    return {
      id: g.id,
      title: g.title,
      pos: [...g.pos],
      size: [...g.size],
      _children: children as ReadonlySet<{ readonly id: number }> | undefined,
    };
  });

  const linksMap = new Map<
    number,
    { id: number; origin_id: number; target_id: number }
  >();
  for (const link of opts.links ?? []) {
    linksMap.set(link.id, link);
  }

  const graph = {
    _nodes: nodes,
    _groups: groups,
    links: linksMap,
    setDirtyCanvas: undefined,
  };

  if (opts.inputNode) {
    Object.assign(graph, {
      inputNode: {
        id: opts.inputNode.id,
        pos: [...opts.inputNode.pos],
        size: [...opts.inputNode.size],
      },
    });
  }

  if (opts.outputNode) {
    Object.assign(graph, {
      outputNode: {
        id: opts.outputNode.id,
        pos: [...opts.outputNode.pos],
        size: [...opts.outputNode.size],
      },
    });
  }

  return graph as GraphLike;
}

function isInsideGroup(
  node: { pos: number[]; size: number[] },
  group: { pos: number[]; size: number[] },
): boolean {
  return (
    node.pos[0] >= group.pos[0] &&
    node.pos[1] >= group.pos[1] &&
    node.pos[0] + node.size[0] <= group.pos[0] + group.size[0] &&
    node.pos[1] + node.size[1] <= group.pos[1] + group.size[1]
  );
}

// ---------------------------------------------------------------------------
// extractLayoutInput
// ---------------------------------------------------------------------------

describe("extractLayoutInput", () => {
  it("extracts nodes with correct ids and dimensions", () => {
    const graph = makeGraph({
      nodes: [
        { id: 1, type: "KSampler", title: "Sampler", pos: [0, 0], size: [200, 100] },
        { id: 2, type: "VAEDecode", title: "Decode", pos: [300, 0], size: [150, 80] },
      ],
    });

    const { nodes } = extractLayoutInput(graph);

    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toEqual({ id: "1", width: 200, height: 100 });
    expect(nodes[1]).toEqual({ id: "2", width: 150, height: 80 });
  });

  it("extracts edges from links map", () => {
    const graph = makeGraph({
      nodes: [
        { id: 1, type: "A", title: "A", pos: [0, 0], size: [100, 50] },
        { id: 2, type: "B", title: "B", pos: [200, 0], size: [100, 50] },
      ],
      links: [{ id: 1, origin_id: 1, target_id: 2 }],
    });

    const { edges } = extractLayoutInput(graph);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ source: "1", target: "2" });
  });

  it("returns empty arrays for an empty graph", () => {
    const graph = makeGraph({});
    const { nodes, edges, groups } = extractLayoutInput(graph);

    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
    expect(groups).toHaveLength(0);
  });

  it("builds group hierarchy from spatial containment", () => {
    const graph = makeGraph({
      nodes: [
        { id: 1, type: "A", title: "A", pos: [120, 120], size: [100, 50] },
        { id: 2, type: "B", title: "B", pos: [520, 120], size: [100, 50] },
      ],
      groups: [
        { id: 100, title: "Outer", pos: [0, 0], size: [1000, 500] },
        { id: 101, title: "Inner", pos: [100, 100], size: [300, 200] },
      ],
    });

    const { groups } = extractLayoutInput(graph);

    // Outer group should list Inner as child
    const outer = groups.find((g) => g.id === "group:100");
    expect(outer).toBeDefined();
    expect(outer!.childGroupIds).toContain("group:101");

    // Inner group should contain node 1, outer should contain node 2 (not in inner)
    const inner = groups.find((g) => g.id === "group:101");
    expect(inner).toBeDefined();
    expect(inner!.memberIds).toContain("1");
    expect(inner!.childGroupIds).toHaveLength(0);

    // Node 2 is in outer but not in inner
    expect(outer!.memberIds).toContain("2");
    expect(outer!.memberIds).not.toContain("1"); // 1 is in inner, not direct member of outer
  });

  it("infers group members from spatial containment when _children is missing", () => {
    const graph = makeGraph({
      nodes: [
        { id: 1, type: "A", title: "A", pos: [120, 120], size: [100, 50] },
        { id: 2, type: "B", title: "B", pos: [520, 120], size: [100, 50] },
      ],
      groups: [
        {
          id: 100,
          title: "Outer",
          pos: [0, 0],
          size: [1000, 500],
          includeChildrenSet: false,
        },
        {
          id: 101,
          title: "Inner",
          pos: [100, 100],
          size: [300, 200],
          includeChildrenSet: false,
        },
      ],
    });

    const { groups } = extractLayoutInput(graph);
    const outer = groups.find((group) => group.id === "group:100");
    const inner = groups.find((group) => group.id === "group:101");

    expect(inner?.memberIds).toEqual(["1"]);
    expect(outer?.memberIds).toEqual(["2"]);
    expect(outer?.childGroupIds).toEqual(["group:101"]);
  });

  it("treats a node whose center is inside a group as a member", () => {
    const graph = makeGraph({
      nodes: [
        {
          id: 1,
          type: "PreviewImage",
          title: "Preview",
          pos: [120, 50],
          size: [120, 120],
        },
      ],
      groups: [
        {
          id: 100,
          title: "Wrapper",
          pos: [100, 100],
          size: [100, 100],
          includeChildrenSet: false,
        },
      ],
    });

    const { groups } = extractLayoutInput(graph);

    expect(groups[0]?.memberIds).toEqual(["1"]);
  });

  it("excludes a node whose center is outside the group", () => {
    const graph = makeGraph({
      nodes: [
        {
          id: 1,
          type: "PreviewImage",
          title: "Preview",
          pos: [10, 50],
          size: [120, 120],
        },
      ],
      groups: [
        {
          id: 100,
          title: "Wrapper",
          pos: [100, 100],
          size: [100, 100],
          includeChildrenSet: false,
        },
      ],
    });

    const { groups } = extractLayoutInput(graph);

    expect(groups[0]?.memberIds).toEqual([]);
  });

  it("assigns the nearest containing group as parent", () => {
    const graph = makeGraph({
      nodes: [
        { id: 1, type: "A", title: "A", pos: [140, 140], size: [80, 40] },
      ],
      groups: [
        {
          id: 100,
          title: "Outer",
          pos: [0, 0],
          size: [1000, 1000],
          includeChildrenSet: false,
        },
        {
          id: 101,
          title: "Middle",
          pos: [100, 100],
          size: [400, 400],
          includeChildrenSet: false,
        },
        {
          id: 102,
          title: "Inner",
          pos: [120, 120],
          size: [200, 200],
          includeChildrenSet: false,
        },
      ],
    });

    const { groups } = extractLayoutInput(graph);
    const outer = groups.find((group) => group.id === "group:100");
    const middle = groups.find((group) => group.id === "group:101");
    const inner = groups.find((group) => group.id === "group:102");

    expect(outer?.childGroupIds).toEqual(["group:101"]);
    expect(middle?.childGroupIds).toEqual(["group:102"]);
    expect(inner?.memberIds).toEqual(["1"]);
  });

  it("namespaces group ids to avoid collisions with node ids", () => {
    const graph = makeGraph({
      nodes: [
        { id: 3, type: "KSampler", title: "KSampler", pos: [500, 100], size: [100, 50] },
      ],
      groups: [
        {
          id: 3,
          title: "Prompt Group",
          pos: [0, 0],
          size: [1000, 500],
          includeChildrenSet: false,
        },
      ],
    });

    const { nodes, groups } = extractLayoutInput(graph);

    expect(nodes[0].id).toBe("3");
    expect(groups[0].id).toBe("group:3");
  });

  it("parses layout tokens from group titles", () => {
    const graph = makeGraph({
      nodes: [
        { id: 1, type: "A", title: "A", pos: [20, 20], size: [100, 50] },
      ],
      groups: [
        {
          id: 100,
          title: "My Group [HORIZONTAL]",
          pos: [0, 0],
          size: [500, 300],
        },
      ],
    });

    const { groups } = extractLayoutInput(graph);

    expect(groups[0].token).toBeDefined();
    expect(groups[0].id).toBe("group:100");
    expect(groups[0].token!.mode).toBe("horizontal");
  });

  it("handles groups with no token in title", () => {
    const graph = makeGraph({
      nodes: [
        { id: 1, type: "A", title: "A", pos: [20, 20], size: [100, 50] },
      ],
      groups: [
        { id: 100, title: "Plain Group", pos: [0, 0], size: [500, 300] },
      ],
    });

    const { groups } = extractLayoutInput(graph);

    expect(groups[0].token).toBeUndefined();
  });

  it("handles links stored as Record (old ComfyUI format)", () => {
    const nodes = [
      {
        id: 1,
        type: "A",
        title: "A",
        pos: [0, 0],
        size: [100, 50],
        inputs: [] as Array<{ link: number | null }>,
        outputs: [] as Array<{ links: number[] | null }>,
      },
      {
        id: 2,
        type: "B",
        title: "B",
        pos: [200, 0],
        size: [100, 50],
        inputs: [] as Array<{ link: number | null }>,
        outputs: [] as Array<{ links: number[] | null }>,
      },
    ];
    // Use Record instead of Map for links
    const linksRecord: Record<number, { id: number; origin_id: number; target_id: number }> = {
      1: { id: 1, origin_id: 1, target_id: 2 },
    };
    const graph: GraphLike = {
      _nodes: nodes,
      _groups: [],
      links: linksRecord as GraphLike["links"],
    };

    const { edges } = extractLayoutInput(graph);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ source: "1", target: "2" });
  });

  it("includes subgraph boundary nodes in extracted layout input", () => {
    const graph = makeGraph({
      nodes: [
        { id: 1, type: "A", title: "A", pos: [0, 0], size: [100, 50] },
      ],
      inputNode: { id: -10, pos: [-300, 0], size: [120, 220] },
      outputNode: { id: -20, pos: [300, 0], size: [120, 60] },
      links: [
        { id: 1, origin_id: -10, target_id: 1 },
        { id: 2, origin_id: 1, target_id: -20 },
      ],
    });

    const { nodes, edges } = extractLayoutInput(graph);

    expect(nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "-10", width: 120, height: 220 }),
        expect.objectContaining({ id: "1", width: 100, height: 50 }),
        expect.objectContaining({ id: "-20", width: 120, height: 60 }),
      ]),
    );
    expect(edges).toEqual(
      expect.arrayContaining([
        { source: "-10", target: "1" },
        { source: "1", target: "-20" },
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// applyLayoutOutput
// ---------------------------------------------------------------------------

describe("applyLayoutOutput", () => {
  it("applies node positions from layout result", () => {
    const graph = makeGraph({
      nodes: [
        { id: 1, type: "A", title: "A", pos: [0, 0], size: [100, 50] },
        { id: 2, type: "B", title: "B", pos: [0, 0], size: [100, 50] },
      ],
    });

    const positions = new Map<string, Position>([
      ["1", { x: 100, y: 200 }],
      ["2", { x: 300, y: 400 }],
    ]);
    const groupBounds = new Map<string, GroupBounds>();

    applyLayoutOutput(graph, { positions, groupBounds });

    expect(graph._nodes[0].pos[0]).toBe(100);
    expect(graph._nodes[0].pos[1]).toBe(200);
    expect(graph._nodes[1].pos[0]).toBe(300);
    expect(graph._nodes[1].pos[1]).toBe(400);
  });

  it("applies group bounds from layout result", () => {
    const graph = makeGraph({
      groups: [
        { id: 100, title: "Group", pos: [0, 0], size: [100, 100] },
      ],
    });

    const positions = new Map<string, Position>();
    const groupBounds = new Map<string, GroupBounds>([
      ["group:100", { x: 50, y: 60, width: 500, height: 300 }],
    ]);

    applyLayoutOutput(graph, { positions, groupBounds });

    expect(graph._groups[0].pos[0]).toBe(50);
    expect(graph._groups[0].pos[1]).toBe(60);
    expect(graph._groups[0].size[0]).toBe(500);
    expect(graph._groups[0].size[1]).toBe(300);
  });

  it("mutates Float64Array in-place", () => {
    const node = {
      id: 1,
      type: "A",
      title: "A",
      pos: new Float64Array([0, 0]),
      size: new Float64Array([100, 50]),
      inputs: [] as Array<{ link: number | null }>,
      outputs: [] as Array<{ links: number[] | null }>,
    };
    const graph: GraphLike = {
      _nodes: [node],
      _groups: [],
      links: new Map(),
    };

    const positions = new Map<string, Position>([
      ["1", { x: 42, y: 84 }],
    ]);
    applyLayoutOutput(graph, { positions, groupBounds: new Map() });

    // Same Float64Array instance, mutated in-place
    expect(node.pos).toBeInstanceOf(Float64Array);
    expect(node.pos[0]).toBe(42);
    expect(node.pos[1]).toBe(84);
  });

  it("calls setDirtyCanvas when available", () => {
    let dirtyCalled = false;
    const graph = makeGraph({
      nodes: [
        { id: 1, type: "A", title: "A", pos: [0, 0], size: [100, 50] },
      ],
    });
    (graph as { setDirtyCanvas: (fg: boolean, bg: boolean) => void }).setDirtyCanvas = () => {
      dirtyCalled = true;
    };

    applyLayoutOutput(graph, {
      positions: new Map([["1", { x: 0, y: 0 }]]),
      groupBounds: new Map(),
    });

    expect(dirtyCalled).toBe(true);
  });

  it("skips nodes without matching position data", () => {
    const graph = makeGraph({
      nodes: [
        { id: 1, type: "A", title: "A", pos: [10, 20], size: [100, 50] },
      ],
    });

    // Empty positions map — node should not be modified
    applyLayoutOutput(graph, {
      positions: new Map(),
      groupBounds: new Map(),
    });

    expect(graph._nodes[0].pos[0]).toBe(10);
    expect(graph._nodes[0].pos[1]).toBe(20);
  });

  it("applies positions to subgraph boundary nodes", () => {
    const graph = makeGraph({
      nodes: [
        { id: 1, type: "A", title: "A", pos: [10, 20], size: [100, 50] },
      ],
      inputNode: { id: -10, pos: [-300, 0], size: [120, 220] },
      outputNode: { id: -20, pos: [300, 0], size: [120, 60] },
    }) as GraphLike & {
      inputNode: { pos: number[] };
      outputNode: { pos: number[] };
    };

    applyLayoutOutput(graph, {
      positions: new Map([
        ["-10", { x: -100, y: 40 }],
        ["1", { x: 100, y: 200 }],
        ["-20", { x: 400, y: 60 }],
      ]),
      groupBounds: new Map(),
    });

    expect(graph.inputNode.pos).toEqual([-100, 40]);
    expect(graph._nodes[0].pos).toEqual([100, 200]);
    expect(graph.outputNode.pos).toEqual([400, 60]);
  });
});

// ---------------------------------------------------------------------------
// extractGroupLayoutInput
// ---------------------------------------------------------------------------

describe("extractGroupLayoutInput", () => {
  it("filters to only selected groups and their members", () => {
    const graph = makeGraph({
      nodes: [
        { id: 1, type: "A", title: "A", pos: [20, 20], size: [100, 50] },
        { id: 2, type: "B", title: "B", pos: [520, 20], size: [100, 50] },
        { id: 3, type: "C", title: "C", pos: [1020, 20], size: [100, 50] },
      ],
      groups: [
        { id: 100, title: "Group 1", pos: [0, 0], size: [500, 300] },
        { id: 101, title: "Group 2", pos: [500, 0], size: [500, 300] },
      ],
      links: [
        { id: 1, origin_id: 1, target_id: 2 },
        { id: 2, origin_id: 2, target_id: 3 },
      ],
    });

    // Select only group 100
    const { nodes, edges, groups } = extractGroupLayoutInput(
      graph,
      new Set([100]),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("group:100");
    expect(nodes.some((n) => n.id === "1")).toBe(true);
    // Node 2 is in group 101, not selected — should not appear
    expect(nodes.some((n) => n.id === "2")).toBe(false);
    expect(nodes.some((n) => n.id === "3")).toBe(false);
    // Edge from 1->2 crosses group boundaries, target not included
    expect(edges).toHaveLength(0);
  });

  it("includes nested child groups when parent is selected", () => {
    const graph = makeGraph({
      nodes: [
        { id: 1, type: "A", title: "A", pos: [120, 120], size: [100, 50] },
        { id: 2, type: "B", title: "B", pos: [520, 120], size: [100, 50] },
      ],
      groups: [
        { id: 100, title: "Outer", pos: [0, 0], size: [1000, 500] },
        { id: 101, title: "Inner", pos: [100, 100], size: [300, 200] },
      ],
    });

    const { groups } = extractGroupLayoutInput(graph, new Set([100]));

    // Both outer and inner should be included
    expect(groups).toHaveLength(2);
    const ids = groups.map((g) => g.id);
    expect(ids).toContain("group:100");
    expect(ids).toContain("group:101");
  });

  it("keeps edges between members of selected groups", () => {
    const graph = makeGraph({
      nodes: [
        { id: 1, type: "A", title: "A", pos: [20, 20], size: [100, 50] },
        { id: 2, type: "B", title: "B", pos: [200, 20], size: [100, 50] },
      ],
      groups: [
        { id: 100, title: "Group", pos: [0, 0], size: [500, 300] },
      ],
      links: [{ id: 1, origin_id: 1, target_id: 2 }],
    });

    const { edges } = extractGroupLayoutInput(graph, new Set([100]));

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ source: "1", target: "2" });
  });
});

// ---------------------------------------------------------------------------
// anchorSelectedGroupLayoutResult
// ---------------------------------------------------------------------------

describe("anchorSelectedGroupLayoutResult", () => {
  it("reanchors a selected nested group subtree to its original position", () => {
    const graph = makeGraph({
      groups: [
        { id: 100, title: "Outer", pos: [100, 100], size: [600, 400] },
        { id: 101, title: "Inner", pos: [250, 220], size: [250, 180] },
      ],
    });
    const groups: LayoutGroup[] = [
      {
        id: "group:101",
        title: "Inner",
        memberIds: ["1"],
        childGroupIds: ["group:102"],
      },
      {
        id: "group:102",
        title: "Child",
        memberIds: ["2"],
        childGroupIds: [],
      },
    ];
    const result: FrameworkResult = {
      positions: new Map<string, Position>([
        ["1", { x: 30, y: 60 }],
        ["2", { x: 80, y: 120 }],
      ]),
      groupBounds: new Map<string, GroupBounds>([
        ["group:101", { x: 0, y: 0, width: 300, height: 220 }],
        ["group:102", { x: 40, y: 90, width: 120, height: 100 }],
      ]),
    };

    const anchored = anchorSelectedGroupLayoutResult(
      graph,
      groups,
      new Set([101]),
      result,
    );

    expect(anchored.groupBounds.get("group:101")).toEqual({
      x: 250,
      y: 220,
      width: 300,
      height: 220,
    });
    expect(anchored.groupBounds.get("group:102")).toEqual({
      x: 290,
      y: 310,
      width: 120,
      height: 100,
    });
    expect(anchored.positions.get("1")).toEqual({ x: 280, y: 280 });
    expect(anchored.positions.get("2")).toEqual({ x: 330, y: 340 });
  });
});
