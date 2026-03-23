/**
 * Core layout framework — recursive group-aware layout orchestration.
 *
 * This is the architectural foundation of the current layout system. It handles:
 * - Bottom-up group hierarchy processing
 * - Delegating to a pluggable LayoutAlgorithm
 * - Disconnected node placement (left of DAG at each level)
 * - Translating nested positions to absolute coordinates
 */

import type {
  LayoutNode,
  LayoutEdge,
  LayoutGroup,
  LayoutAlgorithm,
  FrameworkConfig,
  FrameworkResult,
  Position,
  GroupBounds,
} from "./types";
import { DEFAULT_FRAMEWORK_CONFIG } from "./types";
import { tokenToAlgorithm } from "./tokens";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Layout nodes, edges, and groups using the provided algorithm.
 *
 * Groups are processed bottom-up: leaf groups first, then their parents.
 * Each group's contents are laid out independently, producing a "virtual node"
 * that participates in the parent scope's layout.
 */
export function layoutWithGroups(
  nodes: ReadonlyArray<LayoutNode>,
  edges: ReadonlyArray<LayoutEdge>,
  groups: ReadonlyArray<LayoutGroup>,
  algorithm: LayoutAlgorithm,
  config?: Partial<FrameworkConfig>,
): FrameworkResult {
  const cfg: FrameworkConfig = { ...DEFAULT_FRAMEWORK_CONFIG, ...config };

  // Fast path: no nodes at all
  if (nodes.length === 0) {
    return {
      positions: new Map<string, Position>(),
      groupBounds: new Map<string, GroupBounds>(),
    };
  }

  // Build lookup tables
  const nodeById = new Map<string, LayoutNode>();
  for (const n of nodes) {
    nodeById.set(n.id, n);
  }
  const groupById = new Map<string, LayoutGroup>();
  for (const g of groups) {
    groupById.set(g.id, g);
  }

  // Build group hierarchy
  const { processingOrder, parentMap } = buildGroupHierarchy(groups);

  // Track virtual nodes (groups that have been processed) and their bounds
  const virtualNodes = new Map<string, LayoutNode>();
  const groupBounds = new Map<string, GroupBounds>();

  // Store relative positions for each group's members (before absolute translation)
  // Key: group ID, Value: map of member ID -> position relative to group origin
  const groupMemberRelativePositions = new Map<
    string,
    ReadonlyMap<string, Position>
  >();

  // Process groups bottom-up
  for (const group of processingOrder) {
    const { positions: memberPositions, bounds } = layoutGroupContents(
      group,
      groups,
      nodeById,
      edges,
      virtualNodes,
      algorithm,
      cfg,
    );

    groupMemberRelativePositions.set(group.id, memberPositions);
    groupBounds.set(group.id, bounds);

    // Register as virtual node for parent's layout
    virtualNodes.set(group.id, {
      id: group.id,
      width: bounds.width,
      height: bounds.height,
    });
  }

  // Layout root level: ungrouped nodes + top-level group virtual nodes
  const groupedNodeIds = collectAllGroupedNodeIds(groups);
  const topLevelGroupIds = new Set<string>();
  for (const g of groups) {
    if (!parentMap.has(g.id)) {
      topLevelGroupIds.add(g.id);
    }
  }

  const rootNodes: LayoutNode[] = [];
  for (const n of nodes) {
    if (!groupedNodeIds.has(n.id)) {
      rootNodes.push(n);
    }
  }
  for (const gId of topLevelGroupIds) {
    const vn = virtualNodes.get(gId);
    if (vn) rootNodes.push(vn);
  }

  // Root edges: between root-level items (ungrouped nodes + top-level groups)
  const rootItemIds = new Set(rootNodes.map((n) => n.id));
  const rootEdges = filterEdgesForScope(edges, rootItemIds, groups);

  const rootPositions = layoutScope(rootNodes, rootEdges, algorithm, cfg);

  // Translate all positions to absolute coordinates
  const absolutePositions = new Map<string, Position>();

  // Place ungrouped root nodes
  for (const n of nodes) {
    if (!groupedNodeIds.has(n.id)) {
      const pos = rootPositions.get(n.id);
      if (pos) {
        absolutePositions.set(n.id, pos);
      }
    }
  }

  // Recursively translate group members to absolute coordinates
  for (const gId of topLevelGroupIds) {
    const groupPos = rootPositions.get(gId);
    if (groupPos) {
      translateGroupToAbsolute(
        gId,
        groupPos,
        groupById,
        groupMemberRelativePositions,
        groupBounds,
        absolutePositions,
        cfg,
      );
    }
  }

  // Update group bounds with absolute positions
  const absoluteGroupBounds = new Map<string, GroupBounds>();
  for (const gId of topLevelGroupIds) {
    const groupPos = rootPositions.get(gId);
    if (groupPos) {
      updateGroupBoundsAbsolute(
        gId,
        groupPos,
        groupById,
        groupMemberRelativePositions,
        groupBounds,
        absoluteGroupBounds,
        cfg,
      );
    }
  }

  return {
    positions: absolutePositions,
    groupBounds: absoluteGroupBounds,
  };
}

// ---------------------------------------------------------------------------
// Group hierarchy
// ---------------------------------------------------------------------------

interface GroupHierarchy {
  /** Groups in bottom-up processing order (leaves first) */
  readonly processingOrder: ReadonlyArray<LayoutGroup>;
  /** Maps child group ID -> parent group ID */
  readonly parentMap: ReadonlyMap<string, string>;
}

/**
 * Build the group hierarchy: determine parent-child relationships and
 * return a bottom-up topological processing order.
 */
export function buildGroupHierarchy(
  groups: ReadonlyArray<LayoutGroup>,
): GroupHierarchy {
  const groupById = new Map<string, LayoutGroup>();
  for (const g of groups) {
    groupById.set(g.id, g);
  }

  // Build parent map
  const parentMap = new Map<string, string>();
  for (const g of groups) {
    for (const childId of g.childGroupIds) {
      parentMap.set(childId, g.id);
    }
  }

  // Topological sort: BFS from leaves (groups with no children, or whose
  // children are all already processed)
  const childCountRemaining = new Map<string, number>();
  for (const g of groups) {
    // Only count children that actually exist in our group list
    const validChildren = g.childGroupIds.filter((cid) => groupById.has(cid));
    childCountRemaining.set(g.id, validChildren.length);
  }

  const queue: string[] = [];
  for (const [id, count] of childCountRemaining) {
    if (count === 0) queue.push(id);
  }

  const processingOrder: LayoutGroup[] = [];
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    const group = groupById.get(id);
    if (!group) continue;
    processingOrder.push(group);

    // Notify parent
    const parentId = parentMap.get(id);
    if (parentId !== undefined) {
      const remaining = (childCountRemaining.get(parentId) ?? 1) - 1;
      childCountRemaining.set(parentId, remaining);
      if (remaining === 0) {
        queue.push(parentId);
      }
    }
  }

  return { processingOrder, parentMap };
}

// ---------------------------------------------------------------------------
// Disconnected splitting
// ---------------------------------------------------------------------------

interface SplitResult {
  readonly connected: ReadonlyArray<LayoutNode>;
  readonly disconnected: ReadonlyArray<LayoutNode>;
  readonly connectedEdges: ReadonlyArray<LayoutEdge>;
}

/**
 * Split nodes into connected (have edges) and disconnected (no edges).
 * Preserves original array order for determinism.
 */
export function splitDisconnected(
  nodes: ReadonlyArray<LayoutNode>,
  edges: ReadonlyArray<LayoutEdge>,
): SplitResult {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const hasEdge = new Set<string>();

  const connectedEdges: LayoutEdge[] = [];
  for (const e of edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
      hasEdge.add(e.source);
      hasEdge.add(e.target);
      connectedEdges.push(e);
    }
  }

  const connected: LayoutNode[] = [];
  const disconnected: LayoutNode[] = [];
  for (const n of nodes) {
    if (hasEdge.has(n.id) || n.layerConstraint !== undefined) {
      connected.push(n);
    } else {
      disconnected.push(n);
    }
  }

  return { connected, disconnected, connectedEdges };
}

// ---------------------------------------------------------------------------
// Disconnected placement
// ---------------------------------------------------------------------------

interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Place disconnected nodes in a vertical stack to the LEFT of the DAG bounds.
 * Returns positions for the disconnected nodes only.
 */
export function placeDisconnected(
  disconnected: ReadonlyArray<LayoutNode>,
  dagBounds: Bounds | null,
  config: FrameworkConfig,
): ReadonlyMap<string, Position> {
  const result = new Map<string, Position>();
  if (disconnected.length === 0) return result;

  // Find widest disconnected node for right-aligning the column
  let maxDisconnectedWidth = 0;
  for (const n of disconnected) {
    if (n.width > maxDisconnectedWidth) maxDisconnectedWidth = n.width;
  }

  // Place left of DAG (or at origin if no DAG)
  const dagMinX = dagBounds ? dagBounds.minX : 0;
  const startX = dagMinX - config.disconnectedGap - maxDisconnectedWidth;
  const startY = dagBounds ? dagBounds.minY : 0;

  let currentY = startY;
  for (const n of disconnected) {
    result.set(n.id, { x: startX, y: currentY });
    currentY += n.height + config.verticalGap;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Position translation
// ---------------------------------------------------------------------------

/**
 * Offset all positions by (dx, dy). Returns a new map.
 */
export function translatePositions(
  positions: ReadonlyMap<string, Position>,
  dx: number,
  dy: number,
): ReadonlyMap<string, Position> {
  const result = new Map<string, Position>();
  for (const [id, pos] of positions) {
    result.set(id, { x: pos.x + dx, y: pos.y + dy });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Scope layout (handles disconnected splitting + algorithm call)
// ---------------------------------------------------------------------------

/**
 * Layout a scope (set of nodes + edges), handling disconnected separation.
 * Returns positions for ALL nodes in the scope (connected + disconnected).
 */
function layoutScope(
  nodes: ReadonlyArray<LayoutNode>,
  edges: ReadonlyArray<LayoutEdge>,
  algorithm: LayoutAlgorithm,
  config: FrameworkConfig,
): ReadonlyMap<string, Position> {
  if (nodes.length === 0) return new Map<string, Position>();

  const { connected, disconnected, connectedEdges } = splitDisconnected(
    nodes,
    edges,
  );

  // Layout connected nodes with the algorithm
  let connectedPositions: ReadonlyMap<string, Position>;
  if (connected.length > 0) {
    const result = algorithm.layout({
      nodes: connected,
      edges: connectedEdges,
    });
    connectedPositions = result.positions;
  } else {
    connectedPositions = new Map<string, Position>();
  }

  // Compute DAG bounds from connected positions
  const dagBounds = computeBounds(connectedPositions, connected);

  // Place disconnected nodes
  const disconnectedPositions = placeDisconnected(
    disconnected,
    dagBounds,
    config,
  );

  // Merge
  const merged = new Map<string, Position>();
  for (const [id, pos] of connectedPositions) {
    merged.set(id, pos);
  }
  for (const [id, pos] of disconnectedPositions) {
    merged.set(id, pos);
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Group contents layout
// ---------------------------------------------------------------------------

interface GroupLayoutResult {
  /** Member positions relative to group's (0, 0) — i.e. with padding offset */
  readonly positions: ReadonlyMap<string, Position>;
  /** Group bounding box (relative: x=0, y=0) */
  readonly bounds: GroupBounds;
}

/**
 * Layout the contents of a single group.
 * Child groups that have already been processed appear as virtual nodes.
 */
function layoutGroupContents(
  group: LayoutGroup,
  allGroups: ReadonlyArray<LayoutGroup>,
  nodeById: ReadonlyMap<string, LayoutNode>,
  allEdges: ReadonlyArray<LayoutEdge>,
  virtualNodes: ReadonlyMap<string, LayoutNode>,
  algorithm: LayoutAlgorithm,
  config: FrameworkConfig,
): GroupLayoutResult {
  // Collect members: direct member nodes + child group virtual nodes
  const members: LayoutNode[] = [];
  const memberIdSet = new Set<string>();

  for (const mId of group.memberIds) {
    const node = nodeById.get(mId);
    if (node) {
      members.push(node);
      memberIdSet.add(mId);
    }
  }

  for (const cgId of group.childGroupIds) {
    const vn = virtualNodes.get(cgId);
    if (vn) {
      members.push(vn);
      memberIdSet.add(cgId);
    }
  }

  // Filter edges to internal-only
  const internalEdges = filterEdgesForScope(allEdges, memberIdSet, allGroups);

  const groupAlgorithm = group.token
    ? tokenToAlgorithm(group.token, config.verticalGap)
    : algorithm;

  const rawPositions = group.token
    ? groupAlgorithm.layout({ nodes: members, edges: internalEdges }).positions
    : layoutScope(members, internalEdges, groupAlgorithm, config);

  // Normalize: shift so min position is at (padding, titleHeight + padding)
  // Groups have a title bar at the top, so content starts below it
  const topPadding = config.groupTitleHeight + config.groupPadding;
  const contentBounds = computeBounds(rawPositions, members);

  let shiftX: number;
  let shiftY: number;
  if (contentBounds) {
    shiftX = config.groupPadding - contentBounds.minX;
    shiftY = topPadding - contentBounds.minY;
  } else {
    shiftX = config.groupPadding;
    shiftY = topPadding;
  }

  const normalizedPositions = translatePositions(rawPositions, shiftX, shiftY);

  // Compute group bounds
  const normalizedBounds = computeBounds(normalizedPositions, members);

  let width: number;
  let height: number;
  if (normalizedBounds) {
    width = normalizedBounds.maxX + config.groupPadding;
    height = normalizedBounds.maxY + config.groupPadding;
  } else {
    width = config.groupPadding * 2;
    height = topPadding + config.groupPadding;
  }

  return {
    positions: normalizedPositions,
    bounds: { x: 0, y: 0, width, height },
  };
}

// ---------------------------------------------------------------------------
// Absolute coordinate translation (recursive)
// ---------------------------------------------------------------------------

/**
 * Recursively translate a group's members to absolute coordinates.
 * `groupAbsolutePos` is where the group's top-left corner is placed.
 */
function translateGroupToAbsolute(
  groupId: string,
  groupAbsolutePos: Position,
  groupById: ReadonlyMap<string, LayoutGroup>,
  groupMemberRelativePositions: ReadonlyMap<
    string,
    ReadonlyMap<string, Position>
  >,
  groupBoundsMap: ReadonlyMap<string, GroupBounds>,
  absolutePositions: Map<string, Position>,
  config: FrameworkConfig,
): void {
  const relPositions = groupMemberRelativePositions.get(groupId);
  if (!relPositions) return;

  const group = groupById.get(groupId);
  if (!group) return;

  // Translate direct member nodes
  for (const mId of group.memberIds) {
    const relPos = relPositions.get(mId);
    if (relPos) {
      absolutePositions.set(mId, {
        x: groupAbsolutePos.x + relPos.x,
        y: groupAbsolutePos.y + relPos.y,
      });
    }
  }

  // Translate child groups recursively
  for (const cgId of group.childGroupIds) {
    const relPos = relPositions.get(cgId);
    if (relPos) {
      const childAbsPos: Position = {
        x: groupAbsolutePos.x + relPos.x,
        y: groupAbsolutePos.y + relPos.y,
      };
      translateGroupToAbsolute(
        cgId,
        childAbsPos,
        groupById,
        groupMemberRelativePositions,
        groupBoundsMap,
        absolutePositions,
        config,
      );
    }
  }
}

/**
 * Recursively compute absolute group bounds.
 */
function updateGroupBoundsAbsolute(
  groupId: string,
  groupAbsolutePos: Position,
  groupById: ReadonlyMap<string, LayoutGroup>,
  groupMemberRelativePositions: ReadonlyMap<
    string,
    ReadonlyMap<string, Position>
  >,
  relativeBoundsMap: ReadonlyMap<string, GroupBounds>,
  absoluteBoundsMap: Map<string, GroupBounds>,
  config: FrameworkConfig,
): void {
  const relBounds = relativeBoundsMap.get(groupId);
  if (!relBounds) return;

  absoluteBoundsMap.set(groupId, {
    x: groupAbsolutePos.x,
    y: groupAbsolutePos.y,
    width: relBounds.width,
    height: relBounds.height,
  });

  const group = groupById.get(groupId);
  if (!group) return;

  const relPositions = groupMemberRelativePositions.get(groupId);
  if (!relPositions) return;

  for (const cgId of group.childGroupIds) {
    const relPos = relPositions.get(cgId);
    if (relPos) {
      const childAbsPos: Position = {
        x: groupAbsolutePos.x + relPos.x,
        y: groupAbsolutePos.y + relPos.y,
      };
      updateGroupBoundsAbsolute(
        cgId,
        childAbsPos,
        groupById,
        groupMemberRelativePositions,
        relativeBoundsMap,
        absoluteBoundsMap,
        config,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Edge filtering
// ---------------------------------------------------------------------------

/**
 * Filter edges to only those internal to a scope.
 * An edge is internal if both source and target are in scopeIds.
 * For edges that connect to nodes inside child groups, we remap them
 * to the child group ID (since child groups are virtual nodes in this scope).
 */
function filterEdgesForScope(
  allEdges: ReadonlyArray<LayoutEdge>,
  scopeIds: ReadonlySet<string>,
  allGroups: ReadonlyArray<LayoutGroup>,
): ReadonlyArray<LayoutEdge> {
  const groupById = new Map<string, LayoutGroup>();
  for (const g of allGroups) {
    groupById.set(g.id, g);
  }

  // Build reverse map: node ID -> which group ID contains it (for child group remapping)
  const nodeToGroup = new Map<string, string>();
  for (const g of allGroups) {
    if (scopeIds.has(g.id)) {
      // This is a child group in scope — map its deep members to this group ID
      mapGroupMembersDeep(g, groupById, nodeToGroup);
    }
  }

  const result: LayoutEdge[] = [];
  const seen = new Set<string>();

  for (const e of allEdges) {
    // Remap source/target if they're inside a child group
    const source = nodeToGroup.get(e.source) ?? e.source;
    const target = nodeToGroup.get(e.target) ?? e.target;

    // Both must be in scope
    if (!scopeIds.has(source) || !scopeIds.has(target)) continue;

    // Skip self-loops (happens when source and target are in same child group)
    if (source === target) continue;

    // Deduplicate
    const key = `${source}->${target}`;
    if (seen.has(key)) continue;
    seen.add(key);

    result.push({ source, target });
  }

  return result;
}

/**
 * Recursively map all member nodes of a group (and its nested children)
 * to the group's ID.
 */
function mapGroupMembersDeep(
  group: LayoutGroup,
  groupById: ReadonlyMap<string, LayoutGroup>,
  nodeToGroup: Map<string, string>,
): void {
  for (const mId of group.memberIds) {
    nodeToGroup.set(mId, group.id);
  }
  for (const cgId of group.childGroupIds) {
    const childGroup = groupById.get(cgId);
    if (childGroup) {
      // Map child group's members to the parent group (the one in scope)
      mapGroupMembersDeepToTarget(childGroup, groupById, group.id, nodeToGroup);
    }
  }
}

/**
 * Recursively map all members of `group` to `targetGroupId`.
 */
function mapGroupMembersDeepToTarget(
  group: LayoutGroup,
  groupById: ReadonlyMap<string, LayoutGroup>,
  targetGroupId: string,
  nodeToGroup: Map<string, string>,
): void {
  for (const mId of group.memberIds) {
    nodeToGroup.set(mId, targetGroupId);
  }
  for (const cgId of group.childGroupIds) {
    const childGroup = groupById.get(cgId);
    if (childGroup) {
      mapGroupMembersDeepToTarget(
        childGroup,
        groupById,
        targetGroupId,
        nodeToGroup,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Utility: collect all node IDs that belong to any group (recursively)
// ---------------------------------------------------------------------------

function collectAllGroupedNodeIds(
  groups: ReadonlyArray<LayoutGroup>,
): Set<string> {
  const result = new Set<string>();
  for (const g of groups) {
    for (const mId of g.memberIds) {
      result.add(mId);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Utility: compute bounding box
// ---------------------------------------------------------------------------

function computeBounds(
  positions: ReadonlyMap<string, Position>,
  nodes: ReadonlyArray<LayoutNode>,
): Bounds | null {
  const nodeMap = new Map<string, LayoutNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  for (const [id, pos] of positions) {
    const node = nodeMap.get(id);
    if (!node) continue;
    found = true;
    if (pos.x < minX) minX = pos.x;
    if (pos.y < minY) minY = pos.y;
    const right = pos.x + node.width;
    const bottom = pos.y + node.height;
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }

  if (!found) return null;
  return { minX, minY, maxX, maxY };
}
