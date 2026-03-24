import { describe, expect, it } from "vitest";
import {
  inferGroupMembership,
  type GroupMembership,
  type Rect,
} from "../../src/group-membership";

function rect(id: string, x: number, y: number, width: number, height: number): Rect {
  return { id, x, y, width, height };
}

function membership(groupId: string, nodeIds: string[], childGroupIds: string[]): GroupMembership {
  return { groupId, nodeIds, childGroupIds };
}

describe("inferGroupMembership", () => {
  it("returns empty array when no groups", () => {
    const nodes = [rect("n1", 0, 0, 100, 60)];

    expect(inferGroupMembership(nodes, [])).toEqual([]);
  });

  it("assigns node to group via center-point containment", () => {
    const nodes = [rect("n1", 0, 0, 100, 60)];
    const groups = [rect("g1", 0, 0, 200, 200)];

    expect(inferGroupMembership(nodes, groups)).toEqual([
      membership("g1", ["n1"], []),
    ]);
  });

  it("does not assign node when center is outside group", () => {
    const nodes = [rect("n1", 300, 300, 100, 60)];
    const groups = [rect("g1", 0, 0, 200, 200)];

    expect(inferGroupMembership(nodes, groups)).toEqual([
      membership("g1", [], []),
    ]);
  });

  it("infers nested group hierarchy via full-rect containment", () => {
    const nodes = [rect("n1", 50, 50, 80, 40)];
    const groups = [rect("outer", 0, 0, 400, 400), rect("inner", 20, 20, 200, 200)];

    const result = inferGroupMembership(nodes, groups);

    expect(result.find((entry) => entry.groupId === "outer")).toEqual(
      membership("outer", [], ["inner"]),
    );
    expect(result.find((entry) => entry.groupId === "inner")).toEqual(
      membership("inner", ["n1"], []),
    );
  });

  it("assigns node to nearest containing group, not ancestor", () => {
    const nodes = [rect("n1", 50, 50, 60, 40)];
    const groups = [rect("outer", 0, 0, 500, 500), rect("inner", 30, 30, 200, 200)];

    const result = inferGroupMembership(nodes, groups);

    expect(result.find((entry) => entry.groupId === "outer")).toEqual(
      membership("outer", [], ["inner"]),
    );
    expect(result.find((entry) => entry.groupId === "inner")).toEqual(
      membership("inner", ["n1"], []),
    );
  });

  it("handles multiple nodes across multiple groups", () => {
    const nodes = [
      rect("n1", 10, 10, 50, 50),
      rect("n2", 310, 10, 50, 50),
      rect("n3", 600, 600, 50, 50),
    ];
    const groups = [rect("g1", 0, 0, 200, 200), rect("g2", 300, 0, 200, 200)];

    const result = inferGroupMembership(nodes, groups);

    expect(result.find((entry) => entry.groupId === "g1")).toEqual(
      membership("g1", ["n1"], []),
    );
    expect(result.find((entry) => entry.groupId === "g2")).toEqual(
      membership("g2", ["n2"], []),
    );
  });

  it("is deterministic across repeated calls", () => {
    const nodes = [rect("n1", 10, 10, 50, 50), rect("n2", 60, 60, 50, 50)];
    const groups = [rect("g1", 0, 0, 300, 300), rect("g2", 5, 5, 200, 200)];

    expect(inferGroupMembership(nodes, groups)).toEqual(
      inferGroupMembership(nodes, groups),
    );
  });
});
