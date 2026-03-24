import { describe, expect, it } from "vitest";
import { inferGroupMembership, normalizeWorkflowGeometry } from "../../src/core";

function layoutNode(
  id: string,
  width = 100,
  height = 60,
): { id: string; width: number; height: number } {
  return { id, width, height };
}

function layoutEdge(source: string, target: string): { source: string; target: string } {
  return { source, target };
}

describe("normalizeWorkflowGeometry", () => {
  it("lays out a single node", () => {
    const result = normalizeWorkflowGeometry({
      nodes: [layoutNode("A")],
      edges: [],
      groups: [],
    });

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      id: "A",
      width: 100,
      height: 60,
    });
    expect(Number.isFinite(result.nodes[0]?.x)).toBe(true);
    expect(Number.isFinite(result.nodes[0]?.y)).toBe(true);
    expect(result.groups).toEqual([]);
    expect(result.memberships).toEqual([]);
  });

  it("lays out a chain", () => {
    const result = normalizeWorkflowGeometry({
      nodes: [layoutNode("A"), layoutNode("B"), layoutNode("C")],
      edges: [layoutEdge("A", "B"), layoutEdge("B", "C")],
      groups: [],
    });

    expect(result.nodes).toHaveLength(3);
    for (const node of result.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });

  it("handles groups with members", () => {
    const result = normalizeWorkflowGeometry({
      nodes: [layoutNode("n1"), layoutNode("n2"), layoutNode("n3")],
      edges: [layoutEdge("n1", "n2")],
      groups: [
        {
          id: "g1",
          title: "My Group",
          memberIds: ["n1", "n2"],
          childGroupIds: [],
        },
      ],
    });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.id).toBe("g1");
    expect(result.memberships).toEqual([
      { groupId: "g1", nodeIds: ["n1", "n2"], childGroupIds: [] },
    ]);
    expect((result.groups[0]?.width ?? 0) > 0).toBe(true);
    expect((result.groups[0]?.height ?? 0) > 0).toBe(true);
  });

  it("parses layout tokens from group titles automatically", () => {
    const result = normalizeWorkflowGeometry({
      nodes: [layoutNode("n1"), layoutNode("n2"), layoutNode("n3")],
      edges: [],
      groups: [
        {
          id: "g1",
          title: "Row Group [HORIZONTAL]",
          memberIds: ["n1", "n2", "n3"],
          childGroupIds: [],
        },
      ],
    });

    const groupNodes = result.nodes.filter((node) => ["n1", "n2", "n3"].includes(node.id));
    expect(new Set(groupNodes.map((node) => node.y)).size).toBe(1);
  });

  it("accepts an algorithm option", () => {
    const input = {
      nodes: [layoutNode("A"), layoutNode("B")],
      edges: [layoutEdge("A", "B")],
      groups: [],
    };

    expect(normalizeWorkflowGeometry(input, { algorithm: "sugiyama" }).nodes).toHaveLength(2);
    expect(normalizeWorkflowGeometry(input, { algorithm: "horizontal" }).nodes).toHaveLength(2);
    expect(normalizeWorkflowGeometry(input, { algorithm: "vertical" }).nodes).toHaveLength(2);
  });

  it("returns deterministic results", () => {
    const input = {
      nodes: [layoutNode("A"), layoutNode("B"), layoutNode("C")],
      edges: [layoutEdge("A", "B"), layoutEdge("B", "C")],
      groups: [],
    };

    expect(normalizeWorkflowGeometry(input)).toEqual(normalizeWorkflowGeometry(input));
  });

  it("returns a JSON-serializable result", () => {
    const result = normalizeWorkflowGeometry({
      nodes: [layoutNode("A"), layoutNode("B")],
      edges: [layoutEdge("A", "B")],
      groups: [
        {
          id: "g1",
          title: "Group",
          memberIds: ["A", "B"],
          childGroupIds: [],
        },
      ],
    });

    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("handles subgraph boundary nodes", () => {
    const result = normalizeWorkflowGeometry({
      nodes: [
        layoutNode("A"),
        { id: "in", width: 80, height: 40, kind: "subgraph-input" as const },
        { id: "out", width: 80, height: 40, kind: "subgraph-output" as const },
      ],
      edges: [layoutEdge("in", "A"), layoutEdge("A", "out")],
      groups: [],
    });

    expect(result.nodes.map((node) => node.id).sort()).toEqual(["A", "in", "out"]);
  });

  it("handles empty input", () => {
    expect(
      normalizeWorkflowGeometry({
        nodes: [],
        edges: [],
        groups: [],
      }),
    ).toEqual({
      nodes: [],
      groups: [],
      memberships: [],
    });
  });
});

describe("core re-exports inferGroupMembership", () => {
  it("is callable from the core entrypoint", () => {
    expect(
      inferGroupMembership(
        [{ id: "n1", x: 10, y: 10, width: 50, height: 50 }],
        [{ id: "g1", x: 0, y: 0, width: 200, height: 200 }],
      ),
    ).toEqual([{ groupId: "g1", nodeIds: ["n1"], childGroupIds: [] }]);
  });
});
