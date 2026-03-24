/**
 * Bridge between ComfyUI's LGraph runtime objects and the pure layout types.
 *
 * Uses structural typing to avoid tight coupling to ComfyUI class hierarchy.
 * Handles Float64Array pos/size fields, Map-based link storage, and group
 * hierarchy inference via spatial containment.
 */

import type {
  LayoutNode,
  LayoutEdge,
  LayoutGroup,
  Position,
  GroupBounds,
  LayoutToken,
  FrameworkResult,
} from "./layout/types";
import { parseLayoutToken } from "./layout/tokens";
import { debugLog } from "./debug";
import {
  inferGroupMembership,
  type Rect as MembershipRect,
} from "./group-membership";
import {
  fromNumericGroupLayoutId,
  toGroupLayoutId,
} from "./layout/group-ids";

// ---------------------------------------------------------------------------
// Structural types for ComfyUI runtime objects
// ---------------------------------------------------------------------------

interface GraphNode {
  readonly id: number | string;
  readonly type: string;
  readonly title: string;
  readonly pos: ArrayLike<number>;
  readonly size: ArrayLike<number>;
  readonly inputs?: ReadonlyArray<{ link: number | null }>;
  readonly outputs?: ReadonlyArray<{ links: number[] | null }>;
}

interface GraphBoundaryNode {
  readonly id: number;
  readonly pos: ArrayLike<number>;
  readonly size: ArrayLike<number>;
}

interface GraphGroup {
  readonly id: number;
  readonly title: string;
  pos: ArrayLike<number>;
  size: ArrayLike<number>;
  readonly _children?: ReadonlySet<{ readonly id: number | string }>;
}

interface GraphLink {
  readonly id: number;
  readonly origin_id: number;
  readonly target_id: number;
}

/** Minimal structural interface for ComfyUI graph objects (LGraph | Subgraph). */
export interface GraphLike {
  readonly _nodes: ReadonlyArray<GraphNode>;
  readonly _groups: GraphGroup[];
  readonly links: Map<number, GraphLink> | Record<number, GraphLink>;
  readonly inputNode?: GraphBoundaryNode;
  readonly outputNode?: GraphBoundaryNode;
  setDirtyCanvas?(fg: boolean, bg: boolean): void;
}

// ---------------------------------------------------------------------------
// Extract layout input from a ComfyUI graph
// ---------------------------------------------------------------------------

export function extractLayoutInput(graph: GraphLike): {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  groups: LayoutGroup[];
} {
  // 1. Convert nodes
  const nodes: LayoutNode[] = graph._nodes.map((n) => ({
    id: String(n.id),
    width: Number(n.size[0]),
    height: Number(n.size[1]),
  }));

  if (graph.inputNode) {
    nodes.push({
      id: String(graph.inputNode.id),
      width: Number(graph.inputNode.size[0]),
      height: Number(graph.inputNode.size[1]),
      kind: "subgraph-input",
      layerConstraint: "first",
    });
  }

  if (graph.outputNode) {
    nodes.push({
      id: String(graph.outputNode.id),
      width: Number(graph.outputNode.size[0]),
      height: Number(graph.outputNode.size[1]),
      kind: "subgraph-output",
      layerConstraint: "last",
    });
  }

  // 2. Extract edges from links
  const edges: LayoutEdge[] = [];
  const linksIterable =
    graph.links instanceof Map
      ? graph.links.values()
      : Object.values(graph.links);

  for (const link of linksIterable) {
    if (link) {
      edges.push({
        source: String(link.origin_id),
        target: String(link.target_id),
      });
    }
  }

  // 3. Build group hierarchy
  const groups = buildGroupsFromGraph(graph);

  debugLog(
    `Extracted: ${nodes.length} nodes, ${edges.length} edges, ${groups.length} groups`,
  );
  return { nodes, edges, groups };
}

// ---------------------------------------------------------------------------
// Build LayoutGroup array with parent-child hierarchy from spatial containment
// ---------------------------------------------------------------------------

function buildGroupsFromGraph(graph: GraphLike): LayoutGroup[] {
  const graphGroups = graph._groups;
  if (graphGroups.length === 0) return [];

  const nodeRects: MembershipRect[] = graph._nodes.map((node) => ({
    id: String(node.id),
    x: Number(node.pos[0]),
    y: Number(node.pos[1]),
    width: Number(node.size[0]),
    height: Number(node.size[1]),
  }));
  const groupRects: MembershipRect[] = graphGroups.map((group) => ({
    id: String(group.id),
    x: Number(group.pos[0]),
    y: Number(group.pos[1]),
    width: Number(group.size[0]),
    height: Number(group.size[1]),
  }));
  const memberships = inferGroupMembership(nodeRects, groupRects);
  const membershipsByGroupId = new Map(
    memberships.map((membership) => [membership.groupId, membership]),
  );

  return graphGroups.map((group) => {
    const membership = membershipsByGroupId.get(String(group.id));
    const token: LayoutToken | null = parseLayoutToken(group.title);

    return {
      id: toGroupLayoutId(group.id),
      title: group.title,
      memberIds: membership?.nodeIds ?? [],
      childGroupIds: (membership?.childGroupIds ?? []).map((childGroupId) =>
        toGroupLayoutId(Number(childGroupId)),
      ),
      ...(token ? { token } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// Apply layout output back to the ComfyUI graph
// ---------------------------------------------------------------------------

export function applyLayoutOutput(
  graph: GraphLike,
  result: {
    readonly positions: ReadonlyMap<string, Position>;
    readonly groupBounds: ReadonlyMap<string, GroupBounds>;
  },
): void {
  // Apply node positions
  for (const node of graph._nodes) {
    const pos = result.positions.get(String(node.id));
    if (pos) {
      // Mutate in-place — ComfyUI internals may hold references to the typed array
      const mutablePos = node.pos as { [index: number]: number };
      mutablePos[0] = pos.x;
      mutablePos[1] = pos.y;
    }
  }

  if (graph.inputNode) {
    const pos = result.positions.get(String(graph.inputNode.id));
    if (pos) {
      const mutablePos = graph.inputNode.pos as { [index: number]: number };
      mutablePos[0] = pos.x;
      mutablePos[1] = pos.y;
    }
  }

  if (graph.outputNode) {
    const pos = result.positions.get(String(graph.outputNode.id));
    if (pos) {
      const mutablePos = graph.outputNode.pos as { [index: number]: number };
      mutablePos[0] = pos.x;
      mutablePos[1] = pos.y;
    }
  }

  // Apply group bounds
  for (const group of graph._groups) {
    const namespacedGroupId = toGroupLayoutId(group.id);
    const resolvedBounds = result.groupBounds.get(namespacedGroupId);
    if (resolvedBounds) {
      const mutablePos = group.pos as { [index: number]: number };
      mutablePos[0] = resolvedBounds.x;
      mutablePos[1] = resolvedBounds.y;

      const mutableSize = group.size as { [index: number]: number };
      mutableSize[0] = resolvedBounds.width;
      mutableSize[1] = resolvedBounds.height;

      // NOTE: Do NOT call recomputeInsideNodes() here.
      // Our adapter mutates pos/size arrays in-place, which doesn't trigger
      // ComfyUI's internal cache invalidation. recomputeInsideNodes() then
      // reads stale pre-organize positions and populates _children with
      // wrong node IDs. Verified 2026-03-21 via runtime inspection.
      // See AGENTS.md for more details.
    }
  }

  // Mark canvas as dirty
  if (graph.setDirtyCanvas) {
    graph.setDirtyCanvas(true, true);
  }

  debugLog(
    `Applied: ${result.positions.size} positions, ${result.groupBounds.size} group bounds`,
  );
}

// ---------------------------------------------------------------------------
// Extract layout input for specific groups only (selected-groups mode)
// ---------------------------------------------------------------------------

export function extractGroupLayoutInput(
  graph: GraphLike,
  groupIds: ReadonlySet<number>,
): {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  groups: LayoutGroup[];
} {
  // Get the full extraction first
  const full = extractLayoutInput(graph);

  // Filter to only the selected groups and their nested children
  const selectedLayoutGroupIds = new Set(
    [...groupIds].map((groupId) => toGroupLayoutId(groupId)),
  );

  // Expand to include all nested child groups
  const allGroupIds = new Set(selectedLayoutGroupIds);
  const groupMap = new Map(full.groups.map((g) => [g.id, g]));

  function addChildren(gId: string): void {
    const g = groupMap.get(gId);
    if (!g) return;
    for (const childId of g.childGroupIds) {
      if (!allGroupIds.has(childId)) {
        allGroupIds.add(childId);
        addChildren(childId);
      }
    }
  }

  for (const gId of selectedLayoutGroupIds) {
    addChildren(gId);
  }

  // Filter groups
  const groups = full.groups.filter((g) => allGroupIds.has(g.id));

  // Collect all node IDs that belong to these groups
  const relevantNodeIds = new Set<string>();
  for (const g of groups) {
    for (const mId of g.memberIds) {
      relevantNodeIds.add(mId);
    }
  }

  // Filter nodes and edges
  const nodes = full.nodes.filter((n) => relevantNodeIds.has(n.id));
  const edges = full.edges.filter(
    (e) => relevantNodeIds.has(e.source) && relevantNodeIds.has(e.target),
  );

  return { nodes, edges, groups };
}

export function anchorSelectedGroupLayoutResult(
  graph: GraphLike,
  groups: ReadonlyArray<LayoutGroup>,
  selectedGroupIds: ReadonlySet<number>,
  result: FrameworkResult,
): FrameworkResult {
  const selectedLayoutGroupIds = new Set(
    [...selectedGroupIds].map((groupId) => toGroupLayoutId(groupId)),
  );
  if (selectedLayoutGroupIds.size === 0) {
    return result;
  }

  const parentByChildId = new Map<string, string>();
  const groupById = new Map(groups.map((group) => [group.id, group]));
  for (const group of groups) {
    for (const childGroupId of group.childGroupIds) {
      parentByChildId.set(childGroupId, group.id);
    }
  }

  const selectedRootIds = [...selectedLayoutGroupIds].filter((groupId) => {
    let parentId = parentByChildId.get(groupId);
    while (parentId) {
      if (selectedLayoutGroupIds.has(parentId)) {
        return false;
      }
      parentId = parentByChildId.get(parentId);
    }
    return true;
  });

  if (selectedRootIds.length === 0) {
    return result;
  }

  const anchoredPositions = new Map(result.positions);
  const anchoredGroupBounds = new Map(result.groupBounds);
  const graphGroupById = new Map(
    graph._groups.map((group) => [group.id, group]),
  );

  for (const rootGroupId of selectedRootIds) {
    const originalGraphGroupId = fromNumericGroupLayoutId(rootGroupId);
    if (originalGraphGroupId === null) continue;

    const originalGroup = graphGroupById.get(originalGraphGroupId);
    const layoutRootBounds = anchoredGroupBounds.get(rootGroupId);
    if (!originalGroup || !layoutRootBounds) continue;

    const dx = Number(originalGroup.pos[0]) - layoutRootBounds.x;
    const dy = Number(originalGroup.pos[1]) - layoutRootBounds.y;
    if (dx === 0 && dy === 0) continue;

    const nodeIdsToTranslate = new Set<string>();
    const groupIdsToTranslate = new Set<string>();
    const stack = [rootGroupId];

    while (stack.length > 0) {
      const groupId = stack.pop();
      if (!groupId || groupIdsToTranslate.has(groupId)) continue;

      groupIdsToTranslate.add(groupId);
      const group = groupById.get(groupId);
      if (!group) continue;

      for (const memberId of group.memberIds) {
        nodeIdsToTranslate.add(memberId);
      }
      for (const childGroupId of group.childGroupIds) {
        stack.push(childGroupId);
      }
    }

    for (const nodeId of nodeIdsToTranslate) {
      const pos = anchoredPositions.get(nodeId);
      if (!pos) continue;
      anchoredPositions.set(nodeId, { x: pos.x + dx, y: pos.y + dy });
    }

    for (const groupId of groupIdsToTranslate) {
      const bounds = anchoredGroupBounds.get(groupId);
      if (!bounds) continue;
      anchoredGroupBounds.set(groupId, {
        x: bounds.x + dx,
        y: bounds.y + dy,
        width: bounds.width,
        height: bounds.height,
      });
    }
  }

  return {
    positions: anchoredPositions,
    groupBounds: anchoredGroupBounds,
  };
}
