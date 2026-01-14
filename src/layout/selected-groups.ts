import type {
  LGraph,
  LGraphNode,
  LGraphGroup,
  LayoutConfig,
  SelectedGroupLayoutResult,
} from "./types";
import { DEFAULT_CONFIG } from "./types";
import { getInternalEdges, assignMemberLayers } from "./layout-utils";
import { packNodesIntoRows } from "./bin-pack";
import { debugLog } from "../debug";
import { parseLayoutToken, arrangeByMode } from "./title-tokens";

/** Title bar height for groups */
const GROUP_TITLE_HEIGHT = 50;

/**
 * Update group bounds using multiple methods for compatibility
 * Handles pos/size arrays, _pos/_size internal properties,
 * _bounding Rectangle, and bounding array formats
 */
function updateGroupBounds(
  group: LGraphGroup,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  // Method 1: Direct pos/size array mutation
  if (Array.isArray(group.pos)) {
    group.pos[0] = x;
    group.pos[1] = y;
  }
  if (Array.isArray(group.size)) {
    group.size[0] = width;
    group.size[1] = height;
  }

  // Method 2: Try _pos/_size internal properties
  const g = group as LGraphGroup & {
    _pos?: [number, number];
    _size?: [number, number];
  };
  if (Array.isArray(g._pos)) {
    g._pos[0] = x;
    g._pos[1] = y;
  }
  if (Array.isArray(g._size)) {
    g._size[0] = width;
    g._size[1] = height;
  }

  // Method 3: Update _bounding Rectangle if present
  if (group._bounding) {
    const b = group._bounding;
    b.x = x;
    b.y = y;
    b.width = width;
    b.height = height;
  }

  // Method 4: Try bounding array (older format / JSON serialization)
  const gAny = group as LGraphGroup & { bounding?: number[] };
  if (Array.isArray(gAny.bounding)) {
    gAny.bounding[0] = x;
    gAny.bounding[1] = y;
    gAny.bounding[2] = width;
    gAny.bounding[3] = height;
  }
}

/**
 * Translate group position by delta, handling all position formats
 * Similar to updateGroupBounds but for relative position changes
 */
function translateGroupPosition(
  group: LGraphGroup,
  deltaX: number,
  deltaY: number
): void {
  // Method 1: Direct pos array mutation
  if (Array.isArray(group.pos)) {
    group.pos[0] += deltaX;
    group.pos[1] += deltaY;
  }

  // Method 2: Try _pos internal property
  const g = group as LGraphGroup & { _pos?: [number, number] };
  if (Array.isArray(g._pos)) {
    g._pos[0] += deltaX;
    g._pos[1] += deltaY;
  }

  // Method 3: Update _bounding Rectangle if present
  if (group._bounding) {
    group._bounding.x += deltaX;
    group._bounding.y += deltaY;
  }

  // Method 4: Try bounding array (older format / JSON serialization)
  const gAny = group as LGraphGroup & { bounding?: number[] };
  if (Array.isArray(gAny.bounding)) {
    gAny.bounding[0] += deltaX;
    gAny.bounding[1] += deltaY;
  }
}

/**
 * Resize a group to fit its member nodes
 */
function resizeGroupToFitMembers(
  group: LGraphGroup,
  memberIds: Set<number>,
  allNodes: Map<number, LGraphNode>,
  config: LayoutConfig
): void {
  if (memberIds.size === 0) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const nodeId of memberIds) {
    const node = allNodes.get(nodeId);
    if (!node?.pos) continue;
    const nw = node.size?.[0] ?? 200;
    const nh = node.size?.[1] ?? 100;
    minX = Math.min(minX, node.pos[0]);
    minY = Math.min(minY, node.pos[1]);
    maxX = Math.max(maxX, node.pos[0] + nw);
    maxY = Math.max(maxY, node.pos[1] + nh);
  }

  if (minX === Infinity) return;

  // Update group position and size with padding (handles all formats)
  const newX = minX - config.groupPadding;
  const newY = minY - config.groupPadding - GROUP_TITLE_HEIGHT;
  const newW = maxX - minX + config.groupPadding * 2;
  const newH = maxY - minY + config.groupPadding * 2 + GROUP_TITLE_HEIGHT;
  updateGroupBounds(group, newX, newY, newW, newH);
}

/**
 * Translate a group and its tracked members by a delta
 */
function translateGroupWithMembers(
  group: LGraphGroup,
  deltaX: number,
  deltaY: number,
  memberIds: Set<number>,
  allNodes: Map<number, LGraphNode>,
  allGroups: LGraphGroup[]
): void {
  // Move the group itself (handles all formats: pos, _pos, _bounding, bounding)
  translateGroupPosition(group, deltaX, deltaY);

  // Translate tracked member nodes
  for (const nodeId of memberIds) {
    const node = allNodes.get(nodeId);
    if (node?.pos) {
      node.pos[0] += deltaX;
      node.pos[1] += deltaY;
    }
  }

  // Find and translate nested groups inside this group
  for (const nestedGroup of allGroups) {
    if (nestedGroup === group) continue;
    if (groupContainsGroup(group, nestedGroup)) {
      translateGroupPosition(nestedGroup, deltaX, deltaY);
    }
  }
}

/**
 * Check if outer group's bounds fully contain inner group's bounds
 */
function groupContainsGroup(outer: LGraphGroup, inner: LGraphGroup): boolean {
  const ox = outer.pos[0];
  const oy = outer.pos[1];
  const ow = outer.size[0];
  const oh = outer.size[1];

  const ix = inner.pos[0];
  const iy = inner.pos[1];
  const iw = inner.size[0];
  const ih = inner.size[1];

  return ix >= ox && iy >= oy && ix + iw <= ox + ow && iy + ih <= oy + oh;
}

/**
 * Check if a node's origin is inside a group's content area
 */
function nodeInsideGroup(node: LGraphNode, group: LGraphGroup): boolean {
  const gx = group.pos[0];
  const gy = group.pos[1] + GROUP_TITLE_HEIGHT;
  const gw = group.size[0];
  const gh = group.size[1] - GROUP_TITLE_HEIGHT;

  const nx = node.pos?.[0] ?? 0;
  const ny = node.pos?.[1] ?? 0;

  return nx >= gx && nx < gx + gw && ny >= gy && ny < gy + gh;
}

/**
 * Collect all nested child groups within a parent group
 */
function collectNestedGroups(
  parent: LGraphGroup,
  allGroups: LGraphGroup[]
): LGraphGroup[] {
  const nested: LGraphGroup[] = [];
  const queue = [parent];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const group of allGroups) {
      if (group === current) continue;
      if (groupContainsGroup(current, group) && !nested.includes(group)) {
        nested.push(group);
        queue.push(group);
      }
    }
  }

  return nested;
}

/**
 * Collect all member nodes within a group (excluding nodes in nested child groups)
 */
function collectDirectMembers(
  group: LGraphGroup,
  allNodes: Map<number, LGraphNode>,
  nestedGroups: LGraphGroup[]
): Set<number> {
  const members = new Set<number>();

  for (const [nodeId, node] of allNodes) {
    if (!nodeInsideGroup(node, group)) continue;

    // Check if node is inside a nested group (exclude it from direct members)
    let inNestedGroup = false;
    for (const nested of nestedGroups) {
      if (nodeInsideGroup(node, nested)) {
        inNestedGroup = true;
        break;
      }
    }

    if (!inNestedGroup) {
      members.add(nodeId);
    }
  }

  return members;
}

/**
 * Layout contents of a single group and resize it to fit
 * Returns the bounding box of the group's contents
 */
function layoutGroupContents(
  group: LGraphGroup,
  memberIds: Set<number>,
  nestedGroups: LGraphGroup[],
  allNodes: Map<number, LGraphNode>,
  config: LayoutConfig,
  processedGroups: Set<LGraphGroup>
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  // Skip if already processed (handles nested groups selected individually)
  if (processedGroups.has(group)) {
    return null;
  }
  processedGroups.add(group);

  // Collect non-locked members
  const members: LGraphNode[] = [];
  for (const nodeId of memberIds) {
    const node = allNodes.get(nodeId);
    if (!node) continue;
    if (node.flags?.pinned || node.locked) continue;
    members.push(node);
  }

  // Handle empty group with no nested groups
  if (members.length === 0 && nestedGroups.length === 0) {
    debugLog(`Skipping empty group "${group.title}"`);
    return null;
  }

  // Parse layout token from group title
  const layoutMode = parseLayoutToken(group.title);

  debugLog(
    `layoutGroupContents "${group.title}": members=${members.length}, nestedGroups=${nestedGroups.length}, mode=${layoutMode.type}`
  );

  // Get the group's current content area start position
  const startX = group.pos[0] + config.groupPadding;
  const startY = group.pos[1] + config.groupPadding + GROUP_TITLE_HEIGHT;

  // Track bounds of all positioned content
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  let contentEndY = startY;

  // If layout mode is specified, use token-based layout (ignores internal edges)
  // This handles both direct member nodes AND nested groups as top-level items
  if (layoutMode.type !== "default" && (members.length > 0 || nestedGroups.length > 0)) {
    // First, recursively process nested groups (bottom-up) so their sizes are final
    // Sort by containment depth (deepest first)
    const sortedNested = [...nestedGroups].sort((a, b) => {
      let aDepth = 0,
        bDepth = 0;
      for (const other of nestedGroups) {
        if (other !== a && groupContainsGroup(other, a)) aDepth++;
        if (other !== b && groupContainsGroup(other, b)) bDepth++;
      }
      return bDepth - aDepth; // Deepest first
    });

    // Track member IDs for each nested group (needed for translation later)
    const nestedGroupMembers = new Map<number, Set<number>>();

    for (const nested of sortedNested) {
      if (processedGroups.has(nested)) continue;

      const nestedMemberIds = new Set<number>();
      for (const [nodeId, node] of allNodes) {
        if (nodeInsideGroup(node, nested)) {
          // Check not in deeper nested group
          let inDeeperGroup = false;
          for (const other of sortedNested) {
            if (other !== nested && groupContainsGroup(nested, other) && nodeInsideGroup(node, other)) {
              inDeeperGroup = true;
              break;
            }
          }
          if (!inDeeperGroup) {
            nestedMemberIds.add(nodeId);
          }
        }
      }
      nestedGroupMembers.set(nested.id, nestedMemberIds);

      const deeperNested = sortedNested.filter(
        (g) => g !== nested && groupContainsGroup(nested, g)
      );

      layoutGroupContents(
        nested,
        nestedMemberIds,
        deeperNested,
        allNodes,
        config,
        processedGroups
      );

      // Resize nested group to fit its (possibly rearranged) contents
      resizeGroupToFitMembers(nested, nestedMemberIds, allNodes, config);
    }

    // Now create combined items list: direct member nodes + direct nested groups
    // Direct nested groups are those not contained by other nested groups
    const directNestedGroups = nestedGroups.filter((g) => {
      for (const other of nestedGroups) {
        if (other !== g && groupContainsGroup(other, g)) return false;
      }
      return true;
    });

    // Create fake LGraphNode-like objects for nested groups so we can use arrangeByMode
    const groupItems: LGraphNode[] = directNestedGroups.map((g) => ({
      id: -g.id, // Negative ID to distinguish from real nodes
      type: "__group__",
      title: g.title,
      pos: [g.pos[0], g.pos[1]] as [number, number],
      size: [g.size[0], g.size[1]] as [number, number],
      inputs: [],
      outputs: [],
    }));

    // Combine members and group items
    const allItems = [...members, ...groupItems];

    if (allItems.length > 0) {
      const arranged = arrangeByMode(allItems, layoutMode, startX, startY, config);

      for (const pos of arranged) {
        if (pos.id < 0) {
          // This is a nested group (negative ID)
          const groupId = -pos.id;
          const nestedGroup = directNestedGroups.find((g) => g.id === groupId);
          if (nestedGroup) {
            const oldX = nestedGroup.pos[0];
            const oldY = nestedGroup.pos[1];
            const deltaX = pos.x - oldX;
            const deltaY = pos.y - oldY;

            // Use tracked members for accurate translation after token layout
            const trackedMembers = nestedGroupMembers.get(groupId) ?? new Set();
            translateGroupWithMembers(nestedGroup, deltaX, deltaY, trackedMembers, allNodes, nestedGroups);
            debugLog(`  Nested group ${groupId} (${nestedGroup.title}): token layout [${pos.x}, ${pos.y}]`);

            const gw = nestedGroup.size[0];
            const gh = nestedGroup.size[1];

            minX = Math.min(minX, pos.x);
            minY = Math.min(minY, pos.y);
            maxX = Math.max(maxX, pos.x + gw);
            maxY = Math.max(maxY, pos.y + gh);
            contentEndY = Math.max(contentEndY, pos.y + gh);
          }
        } else {
          // This is a regular node
          const node = allNodes.get(pos.id);
          if (node?.pos) {
            node.pos[0] = pos.x;
            node.pos[1] = pos.y;
            debugLog(`  Member ${node.id} (${node.type}): token layout [${pos.x}, ${pos.y}]`);

            const nw = node.size?.[0] ?? 200;
            const nh = node.size?.[1] ?? 100;

            minX = Math.min(minX, pos.x);
            minY = Math.min(minY, pos.y);
            maxX = Math.max(maxX, pos.x + nw);
            maxY = Math.max(maxY, pos.y + nh);
            contentEndY = Math.max(contentEndY, pos.y + nh);
          }
        }
      }
    }
  } else if (members.length > 0) {
    // Default behavior: check internal edges for layer-based or vertical stack layout
    const edges = getInternalEdges(memberIds, allNodes);

    if (edges.length > 0) {
      // Has internal connections - use layer-based layout
      const layers = assignMemberLayers(memberIds, edges, allNodes);

      let x = startX;
      for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
        const layer = layers[layerIdx];
        if (layer.length === 0) continue;

        // Sort layer by height (tallest first for stable layout)
        layer.sort((a, b) => (b.size?.[1] ?? 100) - (a.size?.[1] ?? 100));

        let y = startY;
        let layerMaxWidth = 0;

        for (const node of layer) {
          if (node.pos) {
            node.pos[0] = x;
            node.pos[1] = y;
            debugLog(
              `  Member ${node.id} (${node.type}): layer ${layerIdx}, pos [${x}, ${y}]`
            );
          }

          const nw = node.size?.[0] ?? 200;
          const nh = node.size?.[1] ?? 100;

          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + nw);
          maxY = Math.max(maxY, y + nh);

          layerMaxWidth = Math.max(layerMaxWidth, nw);
          y += nh + config.verticalGap;
        }

        contentEndY = Math.max(contentEndY, y - config.verticalGap);
        x += layerMaxWidth + config.horizontalGap;
      }
    } else {
      // No internal connections - use vertical stacking
      members.sort((a, b) => (b.size?.[1] ?? 100) - (a.size?.[1] ?? 100));

      // Build sizes map
      const sizes = new Map<number, { width: number; height: number }>();
      for (const node of members) {
        sizes.set(node.id, {
          width: node.size?.[0] ?? 200,
          height: node.size?.[1] ?? 100,
        });
      }

      // Pack into rows (vertical stack with maxColumns=1)
      const nodeIds = members.map((n) => n.id);
      const rows = packNodesIntoRows(nodeIds, sizes, {
        ...config,
        maxColumns: 1,
      });

      for (const row of rows) {
        const x = startX;
        const y = startY + row.yOffset;

        for (const nodeId of row.nodes) {
          const node = allNodes.get(nodeId);
          if (node?.pos) {
            node.pos[0] = x;
            node.pos[1] = y;
            debugLog(`  Member ${node.id} (${node.type}): stacked pos [${x}, ${y}]`);

            const nw = node.size?.[0] ?? 200;
            const nh = node.size?.[1] ?? 100;

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + nw);
            maxY = Math.max(maxY, y + nh);
          }
        }
        contentEndY = Math.max(contentEndY, startY + row.yOffset + row.height);
      }
    }
  }

  // Process nested groups (bottom-up: deepest first)
  // In default mode, reposition direct nested groups below member content
  const sortedNested = [...nestedGroups].sort((a, b) => {
    // Count how many other nested groups contain each
    let depthA = 0;
    let depthB = 0;
    for (const other of nestedGroups) {
      if (other !== a && groupContainsGroup(other, a)) depthA++;
      if (other !== b && groupContainsGroup(other, b)) depthB++;
    }
    return depthB - depthA; // Deepest first
  });

  // Identify direct nested groups (not contained by other nested groups)
  const directNestedGroups = sortedNested.filter((g) => {
    for (const other of nestedGroups) {
      if (other !== g && groupContainsGroup(other, g)) return false;
    }
    return true;
  });

  // Sort direct groups by original position for stable ordering
  directNestedGroups.sort((a, b) => {
    const yDiff = a.pos[1] - b.pos[1];
    return yDiff !== 0 ? yDiff : a.pos[0] - b.pos[0];
  });

  for (const nestedGroup of directNestedGroups) {
    // Skip if already processed (by token mode)
    if (processedGroups.has(nestedGroup)) {
      // Still include bounds
      minX = Math.min(minX, nestedGroup.pos[0]);
      minY = Math.min(minY, nestedGroup.pos[1]);
      maxX = Math.max(maxX, nestedGroup.pos[0] + nestedGroup.size[0]);
      maxY = Math.max(maxY, nestedGroup.pos[1] + nestedGroup.size[1]);
      continue;
    }

    // Get nested group's members and children
    const nestedChildren = collectNestedGroups(nestedGroup, nestedGroups);
    const nestedMembers = collectDirectMembers(nestedGroup, allNodes, nestedChildren);

    // In default mode, reposition nested group below current content
    if (layoutMode.type === "default") {
      // Position nested group's left edge at startX (same as members) for consistent alignment
      // This prevents the group from shifting leftward on each layout run
      const targetX = startX;
      const targetY = contentEndY + config.verticalGap;
      const deltaX = targetX - nestedGroup.pos[0];
      const deltaY = targetY - nestedGroup.pos[1];

      if (deltaX !== 0 || deltaY !== 0) {
        translateGroupWithMembers(nestedGroup, deltaX, deltaY, nestedMembers, allNodes, nestedGroups);
        debugLog(`  Repositioned nested group "${nestedGroup.title}" to [${targetX}, ${targetY}]`);
      }
    }

    // Recursively layout nested group contents
    layoutGroupContents(
      nestedGroup,
      nestedMembers,
      nestedChildren,
      allNodes,
      config,
      processedGroups
    );

    // Resize nested group to fit its organized contents
    resizeGroupToFitMembers(nestedGroup, nestedMembers, allNodes, config);

    // Update contentEndY for next nested group
    contentEndY = Math.max(contentEndY, nestedGroup.pos[1] + nestedGroup.size[1]);

    // Update bounds to include nested group
    minX = Math.min(minX, nestedGroup.pos[0]);
    minY = Math.min(minY, nestedGroup.pos[1]);
    maxX = Math.max(maxX, nestedGroup.pos[0] + nestedGroup.size[0]);
    maxY = Math.max(maxY, nestedGroup.pos[1] + nestedGroup.size[1]);
  }

  // Resize group to fit contents
  if (minX !== Infinity) {
    const newX = minX - config.groupPadding;
    const newY = minY - config.groupPadding - GROUP_TITLE_HEIGHT;
    const newWidth = maxX - minX + config.groupPadding * 2;
    const newHeight = maxY - minY + config.groupPadding * 2 + GROUP_TITLE_HEIGHT;

    debugLog(
      `Resizing group "${group.title}" to [${newX}, ${newY}, ${newWidth}, ${newHeight}]`
    );

    updateGroupBounds(group, newX, newY, newWidth, newHeight);

    return { minX, minY, maxX, maxY };
  }

  return null;
}

/**
 * Layout only the contents of selected groups
 * Ignores external connections - uses only internal edges
 * Auto-includes nested groups when parent is selected
 *
 * @param graph - The full graph (for node/link access)
 * @param selectedGroupIds - Set of group IDs to organize
 * @param config - Layout configuration
 */
export function layoutSelectedGroups(
  graph: LGraph,
  selectedGroupIds: Set<number>,
  config?: Partial<LayoutConfig>
): SelectedGroupLayoutResult {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const startTime = performance.now();

  // Build allNodes map
  const allNodes = new Map<number, LGraphNode>();
  for (const node of graph._nodes ?? []) {
    if (!node || node.id === undefined) continue;
    allNodes.set(node.id, node);
  }

  // Get all groups
  const allGroups = graph._groups ?? [];

  // Find selected groups
  const selectedGroups: LGraphGroup[] = [];
  for (const group of allGroups) {
    if (selectedGroupIds.has(group.id)) {
      selectedGroups.push(group);
    }
  }

  if (selectedGroups.length === 0) {
    debugLog("No selected groups found");
    return {
      nodeCount: 0,
      groupCount: 0,
      executionMs: performance.now() - startTime,
    };
  }

  // Filter to only top-level selected groups
  // (nested groups selected individually will be handled, but if both parent and child
  // are selected, we only process from the parent)
  const topLevelSelected: LGraphGroup[] = [];
  for (const group of selectedGroups) {
    let hasSelectedParent = false;
    for (const other of selectedGroups) {
      if (other !== group && groupContainsGroup(other, group)) {
        hasSelectedParent = true;
        break;
      }
    }
    if (!hasSelectedParent) {
      topLevelSelected.push(group);
    }
  }

  // Track processed groups to avoid double-processing
  const processedGroups = new Set<LGraphGroup>();
  let totalNodes = 0;

  // Process each top-level selected group
  for (const group of topLevelSelected) {
    // Collect nested groups within this group
    const nestedGroups = collectNestedGroups(group, allGroups);

    // Collect direct members (excluding those in nested groups)
    const memberIds = collectDirectMembers(group, allNodes, nestedGroups);

    debugLog(
      `Processing group "${group.title}": ${memberIds.size} direct members, ${nestedGroups.length} nested groups`
    );

    // Layout group contents
    layoutGroupContents(
      group,
      memberIds,
      nestedGroups,
      allNodes,
      fullConfig,
      processedGroups
    );

    totalNodes += memberIds.size;
    // Count nested group members too
    for (const nested of nestedGroups) {
      const nestedChildren = collectNestedGroups(nested, nestedGroups);
      const nestedMembers = collectDirectMembers(nested, allNodes, nestedChildren);
      totalNodes += nestedMembers.size;
    }
  }

  // Trigger canvas redraw
  graph.setDirtyCanvas?.(true, true);

  const result: SelectedGroupLayoutResult = {
    nodeCount: totalNodes,
    groupCount: processedGroups.size,
    executionMs: performance.now() - startTime,
  };

  debugLog(
    `layoutSelectedGroups complete: ${result.nodeCount} nodes, ${result.groupCount} groups, ${result.executionMs.toFixed(1)}ms`
  );

  return result;
}
