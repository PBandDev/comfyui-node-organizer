import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createSugiyamaAlgorithm } from "../../src/layout/algorithms/sugiyama";
import { layoutWithGroups } from "../../src/layout/framework";
import type {
  LayoutEdge,
  LayoutGroup,
  LayoutNode,
  LayoutToken,
  Position,
  GroupBounds,
} from "../../src/layout/types";

const algorithm = createSugiyamaAlgorithm();

function makeNodes(nodeCount: number): fc.Arbitrary<LayoutNode[]> {
  return fc.tuple(
    ...Array.from({ length: nodeCount }, (_, index) =>
      fc.record({
        id: fc.constant(String(index)),
        width: fc.integer({ min: 80, max: 320 }),
        height: fc.integer({ min: 40, max: 220 }),
      }),
    ),
  );
}

function makeDagEdges(nodeIds: string[], maxEdges: number): fc.Arbitrary<LayoutEdge[]> {
  const candidates = nodeIds.flatMap((source, sourceIndex) =>
    nodeIds
      .slice(sourceIndex + 1)
      .map((target) => ({ source, target })),
  );

  return fc.subarray(candidates, {
    minLength: 0,
    maxLength: Math.min(maxEdges, candidates.length),
  });
}

function dagArbitrary(opts: {
  readonly minNodes: number;
  readonly maxNodes: number;
  readonly maxEdges: number;
}): fc.Arbitrary<{ nodes: LayoutNode[]; edges: LayoutEdge[] }> {
  return fc
    .integer({ min: opts.minNodes, max: opts.maxNodes })
    .chain((nodeCount) =>
      makeNodes(nodeCount).chain((nodes) =>
        makeDagEdges(
          nodes.map((node) => node.id),
          opts.maxEdges,
        ).map((edges) => ({ nodes, edges })),
      ),
    );
}

function groupedDagArbitrary(): fc.Arbitrary<{
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  groups: LayoutGroup[];
}> {
  return fc
    .integer({ min: 4, max: 8 })
    .chain((nodeCount) =>
      makeNodes(nodeCount).chain((nodes) => {
        const nodeIds = nodes.map((node) => node.id);
        return fc
          .tuple(
            makeDagEdges(nodeIds, nodeCount * 2),
            fc.subarray(nodeIds, { minLength: 2, maxLength: nodeCount - 1 }),
          )
          .chain(([edges, innerMemberIds]) => {
            const remaining = nodeIds.filter((id) => !innerMemberIds.includes(id));
            return fc
              .subarray(remaining, {
                minLength: 1,
                maxLength: remaining.length,
              })
              .map((outerDirectMemberIds) => ({
                nodes,
                edges,
                groups: [
                  {
                    id: "group:inner",
                    title: "Inner",
                    memberIds: innerMemberIds,
                    childGroupIds: [],
                  },
                  {
                    id: "group:outer",
                    title: "Outer",
                    memberIds: outerDirectMemberIds,
                    childGroupIds: ["group:inner"],
                  },
                ],
              }));
          });
      }),
    );
}

function tokenArbitrary(): fc.Arbitrary<LayoutToken> {
  return fc.oneof(
    fc.constant<LayoutToken>({ mode: "horizontal" }),
    fc.constant<LayoutToken>({ mode: "vertical" }),
    fc.integer({ min: 2, max: 9 }).map<LayoutToken>((count) => ({
      mode: "grid",
      count,
      dimension: "row",
    })),
    fc.integer({ min: 2, max: 9 }).map<LayoutToken>((count) => ({
      mode: "grid",
      count,
      dimension: "col",
    })),
  );
}

function tokenizedGroupedDagArbitrary(): fc.Arbitrary<{
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  groups: LayoutGroup[];
}> {
  return fc
    .integer({ min: 4, max: 8 })
    .chain((nodeCount) =>
      makeNodes(nodeCount).chain((nodes) => {
        const nodeIds = nodes.map((node) => node.id);
        return fc
          .tuple(
            makeDagEdges(nodeIds, nodeCount * 2),
            fc.subarray(nodeIds, { minLength: 2, maxLength: nodeCount - 1 }),
          )
          .chain(([edges, innerMemberIds]) => {
            const remaining = nodeIds.filter((id) => !innerMemberIds.includes(id));
            return fc
              .tuple(
                fc.subarray(remaining, {
                  minLength: 1,
                  maxLength: remaining.length,
                }),
                tokenArbitrary(),
                tokenArbitrary(),
              )
              .map(([outerDirectMemberIds, innerToken, outerToken]) => ({
                nodes,
                edges,
                groups: [
                  {
                    id: "group:inner",
                    title: "Inner",
                    memberIds: innerMemberIds,
                    childGroupIds: [],
                    token: innerToken,
                  },
                  {
                    id: "group:outer",
                    title: "Outer",
                    memberIds: outerDirectMemberIds,
                    childGroupIds: ["group:inner"],
                    token: outerToken,
                  },
                ],
              }));
          });
      }),
    );
}

function assertFinitePositions(
  positions: ReadonlyMap<string, Position>,
): void {
  for (const [id, pos] of positions) {
    expect(Number.isFinite(pos.x), `Node ${id} has non-finite x`).toBe(true);
    expect(Number.isFinite(pos.y), `Node ${id} has non-finite y`).toBe(true);
  }
}

function assertAllNodesPositioned(
  nodes: ReadonlyArray<LayoutNode>,
  positions: ReadonlyMap<string, Position>,
): void {
  for (const node of nodes) {
    expect(positions.has(node.id), `Missing position for node ${node.id}`).toBe(
      true,
    );
  }
}

function assertNoOverlaps(
  nodes: ReadonlyArray<LayoutNode>,
  positions: ReadonlyMap<string, Position>,
): void {
  for (let index = 0; index < nodes.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex += 1) {
      const left = nodes[index];
      const right = nodes[otherIndex];
      const leftPos = positions.get(left.id);
      const rightPos = positions.get(right.id);
      expect(leftPos, `Missing position for node ${left.id}`).toBeDefined();
      expect(rightPos, `Missing position for node ${right.id}`).toBeDefined();

      const overlap =
        leftPos!.x < rightPos!.x + right.width &&
        leftPos!.x + left.width > rightPos!.x &&
        leftPos!.y < rightPos!.y + right.height &&
        leftPos!.y + left.height > rightPos!.y;

      expect(
        overlap,
        `Nodes ${left.id} and ${right.id} overlap: ` +
          `[${leftPos!.x}, ${leftPos!.y}, ${left.width}, ${left.height}] vs ` +
          `[${rightPos!.x}, ${rightPos!.y}, ${right.width}, ${right.height}]`,
      ).toBe(false);
    }
  }
}

function assertPositiveBounds(
  groupId: string,
  bounds: GroupBounds | undefined,
): asserts bounds is GroupBounds {
  if (!bounds) {
    throw new Error(`Missing bounds for group ${groupId}`);
  }
  expect(bounds.width, `Group ${groupId} width must be positive`).toBeGreaterThan(
    0,
  );
  expect(
    bounds.height,
    `Group ${groupId} height must be positive`,
  ).toBeGreaterThan(0);
}

function assertGroupContainsMembers(
  groups: ReadonlyArray<LayoutGroup>,
  nodes: ReadonlyArray<LayoutNode>,
  positions: ReadonlyMap<string, Position>,
  boundsByGroup: ReadonlyMap<string, GroupBounds>,
): void {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  for (const group of groups) {
    const bounds = boundsByGroup.get(group.id);
    assertPositiveBounds(group.id, bounds);

    for (const memberId of group.memberIds) {
      const node = nodeById.get(memberId);
      const pos = positions.get(memberId);
      expect(node, `Missing node ${memberId}`).toBeDefined();
      expect(pos, `Missing position for node ${memberId}`).toBeDefined();

      expect(pos!.x).toBeGreaterThanOrEqual(bounds.x);
      expect(pos!.y).toBeGreaterThanOrEqual(bounds.y);
      expect(pos!.x + node!.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(pos!.y + node!.height).toBeLessThanOrEqual(
        bounds.y + bounds.height,
      );
    }
  }
}

function assertIdempotent(
  nodes: ReadonlyArray<LayoutNode>,
  edges: ReadonlyArray<LayoutEdge>,
  groups: ReadonlyArray<LayoutGroup>,
): void {
  const first = layoutWithGroups(nodes, edges, groups, algorithm);
  const second = layoutWithGroups(nodes, edges, groups, algorithm);

  expect(second.positions.size).toBe(first.positions.size);
  expect(second.groupBounds.size).toBe(first.groupBounds.size);

  for (const [id, firstPos] of first.positions) {
    expect(second.positions.get(id)).toEqual(firstPos);
  }

  for (const [id, firstBounds] of first.groupBounds) {
    expect(second.groupBounds.get(id)).toEqual(firstBounds);
  }
}

describe("property-based layout invariants", () => {
  it("produces finite positions and places every node for random DAGs", () => {
    fc.assert(
      fc.property(
        dagArbitrary({ minNodes: 1, maxNodes: 20, maxEdges: 30 }),
        ({ nodes, edges }) => {
          const result = layoutWithGroups(nodes, edges, [], algorithm);
          assertFinitePositions(result.positions);
          assertAllNodesPositioned(nodes, result.positions);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("avoids node overlaps for random DAGs without groups", () => {
    fc.assert(
      fc.property(
        dagArbitrary({ minNodes: 1, maxNodes: 15, maxEdges: 20 }),
        ({ nodes, edges }) => {
          const result = layoutWithGroups(nodes, edges, [], algorithm);
          assertNoOverlaps(nodes, result.positions);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("is idempotent for random DAGs", () => {
    fc.assert(
      fc.property(
        dagArbitrary({ minNodes: 1, maxNodes: 15, maxEdges: 20 }),
        ({ nodes, edges }) => {
          assertIdempotent(nodes, edges, []);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("keeps grouped members inside positive group bounds", () => {
    fc.assert(
      fc.property(groupedDagArbitrary(), ({ nodes, edges, groups }) => {
        const result = layoutWithGroups(nodes, edges, groups, algorithm);
        assertFinitePositions(result.positions);
        assertAllNodesPositioned(nodes, result.positions);
        assertGroupContainsMembers(
          groups,
          nodes,
          result.positions,
          result.groupBounds,
        );
        assertIdempotent(nodes, edges, groups);
      }),
      { numRuns: 75 },
    );
  });
});

describe("property-based token layout invariants", () => {
  it("produces finite positions and places every node with tokenized groups", () => {
    fc.assert(
      fc.property(
        tokenizedGroupedDagArbitrary(),
        ({ nodes, edges, groups }) => {
          const result = layoutWithGroups(nodes, edges, groups, algorithm);
          assertFinitePositions(result.positions);
          assertAllNodesPositioned(nodes, result.positions);
        },
      ),
      { numRuns: 75 },
    );
  });

  it("avoids node overlaps with tokenized groups", () => {
    fc.assert(
      fc.property(
        tokenizedGroupedDagArbitrary(),
        ({ nodes, edges, groups }) => {
          const result = layoutWithGroups(nodes, edges, groups, algorithm);
          assertNoOverlaps(nodes, result.positions);
        },
      ),
      { numRuns: 75 },
    );
  });

  it("keeps tokenized group members inside positive group bounds", () => {
    fc.assert(
      fc.property(
        tokenizedGroupedDagArbitrary(),
        ({ nodes, edges, groups }) => {
          const result = layoutWithGroups(nodes, edges, groups, algorithm);
          assertGroupContainsMembers(
            groups,
            nodes,
            result.positions,
            result.groupBounds,
          );
        },
      ),
      { numRuns: 75 },
    );
  });

  it("is idempotent with tokenized groups", () => {
    fc.assert(
      fc.property(
        tokenizedGroupedDagArbitrary(),
        ({ nodes, edges, groups }) => {
          assertIdempotent(nodes, edges, groups);
        },
      ),
      { numRuns: 75 },
    );
  });
});
