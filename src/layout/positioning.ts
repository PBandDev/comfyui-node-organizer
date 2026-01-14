import type { LayoutState, LayoutGroup, LGraphNode, LGraphGroup, LayoutConfig, PackedRow, LayoutNode } from "./types";

/**
 * Entity type for unified overlap resolution
 * Represents either a group or a standalone node
 */
interface LayoutEntity {
  id: string;
  type: "group" | "node";
  priority: number;
  x: number;
  y: number;
  width: number;
  height: number;
  initialX: number;  // Original position before overlap resolution
  initialY: number;  // Original position before overlap resolution
  group?: LGraphGroup;
  node?: LGraphNode;
  layoutGroup?: LayoutGroup;
}
import { packNodesIntoRows, getPackedWidth } from "./bin-pack";
import { restoreReroutePositions } from "./reroute-collapse";
import { getInternalEdges, assignMemberLayers } from "./layout-utils";
import { debugLog } from "../debug";
import { parseLayoutToken, arrangeByMode } from "./title-tokens";

/** Title bar height for groups */
const GROUP_TITLE_HEIGHT = 50;

/**
 * Calculate disconnected zone width if there are disconnected nodes
 */
function getDisconnectedZoneWidth(state: LayoutState): number {
  const { disconnectedNodes, allNodes, config } = state;

  if (!disconnectedNodes || disconnectedNodes.size === 0 || !allNodes) {
    return 0;
  }

  let maxWidth = 0;
  for (const nodeId of disconnectedNodes) {
    const node = allNodes.get(nodeId);
    if (node) {
      maxWidth = Math.max(maxWidth, node.size?.[0] ?? 200);
    }
  }
  return maxWidth + config.disconnectedGap;
}

/**
 * Assign X coordinates to layers
 * Accounts for disconnected zone on the left if present
 */
export function assignLayerXPositions(state: LayoutState): void {
  const { layers, config } = state;
  const disconnectedZoneWidth = getDisconnectedZoneWidth(state);

  let x = config.startX + disconnectedZoneWidth;
  for (const layer of layers) {
    layer.x = x;
    x += layer.maxWidth + config.horizontalGap;
  }
}

/**
 * Recalculate layer X positions after bin packing updates maxWidth
 * Also updates node X positions to maintain their offset within each layer
 * Must be called AFTER assignNodeYPositions which updates layer.maxWidth
 */
export function recalculateLayerXPositions(state: LayoutState): void {
  const { layers, config } = state;
  const disconnectedZoneWidth = getDisconnectedZoneWidth(state);

  // Store each node's offset from its layer's current X
  const nodeOffsets = new Map<number, number>();
  for (const layer of layers) {
    for (const node of layer.nodes) {
      nodeOffsets.set(node.id, node.x - layer.x);
    }
  }

  // Recalculate layer X positions using updated maxWidth
  let x = config.startX + disconnectedZoneWidth;
  for (const layer of layers) {
    layer.x = x;
    x += layer.maxWidth + config.horizontalGap;
  }

  // Update node X positions based on new layer X + original offset
  for (const layer of layers) {
    for (const node of layer.nodes) {
      const offset = nodeOffsets.get(node.id) ?? 0;
      node.x = layer.x + offset;
    }
  }
}

/**
 * Assign Y coordinates to nodes within each layer using bin packing
 * Supports multi-column layout based on config.maxColumns
 * Tracks reserved regions to prevent group/node overlaps within same layer
 */
export function assignNodeYPositions(state: LayoutState): void {
  const { layers, config } = state;

  // Store packed rows for reference
  const packedRows = new Map<number, PackedRow[]>();

  for (const layer of layers) {
    // Separate groups (placed first, full width) from standalone nodes
    const groupNodes = layer.nodes.filter((n) => n.isGroupRepresentative);
    const standaloneNodes = layer.nodes.filter((n) => !n.isGroupRepresentative);

    let y = config.startY;
    const reservedRegions: Array<{ top: number; bottom: number }> = [];

    // Position groups first, tracking their Y regions
    for (const node of groupNodes) {
      node.x = layer.x;
      node.y = y;
      reservedRegions.push({ top: y, bottom: y + node.height });
      y += node.height + config.verticalGap;
    }

    // Bin pack standalone nodes, avoiding reserved regions
    if (standaloneNodes.length > 0) {
      // Build size map for bin packing
      const sizes = new Map<number, { width: number; height: number }>();
      for (const node of standaloneNodes) {
        sizes.set(node.id, { width: node.width, height: node.height });
      }

      // Pack nodes into rows
      const nodeIds = standaloneNodes.map((n) => n.id);
      const rows = packNodesIntoRows(nodeIds, sizes, config);

      packedRows.set(layer.index, rows);

      // Assign positions based on packed rows
      for (const row of rows) {
        let rowX = layer.x;
        let rowY = y + row.yOffset;

        // Check if row overlaps any reserved region
        for (const region of reservedRegions) {
          if (rowY < region.bottom && rowY + row.height > region.top) {
            rowY = region.bottom + config.verticalGap;
          }
        }

        for (const nodeId of row.nodes) {
          const node = standaloneNodes.find((n) => n.id === nodeId);
          if (node) {
            node.x = rowX;
            node.y = rowY;
            rowX += node.width + config.horizontalGap;
          }
        }
      }

      // Update layer maxWidth to account for packed rows
      const maxRowWidth = getPackedWidth(rows);
      if (maxRowWidth > layer.maxWidth) {
        layer.maxWidth = maxRowWidth;
      }
    }
  }

  state.packedRows = packedRows;
}

/**
 * Place disconnected nodes in the left margin zone
 * Uses bin packing for compact arrangement
 */
export function placeDisconnectedNodes(state: LayoutState): void {
  const { disconnectedNodes, allNodes, nodeToGroup, config } = state;

  if (!disconnectedNodes || disconnectedNodes.size === 0 || !allNodes) {
    return;
  }

  // Filter out disconnected nodes that are inside groups - they're positioned with their group
  const standaloneDisconnected: number[] = [];
  for (const nodeId of disconnectedNodes) {
    if (nodeToGroup?.has(nodeId)) {
      continue; // Skip - this node is inside a group
    }
    standaloneDisconnected.push(nodeId);
  }

  if (standaloneDisconnected.length === 0) {
    debugLog(`All ${disconnectedNodes.size} disconnected nodes are inside groups`);
    return;
  }

  // Build size map
  const sizes = new Map<number, { width: number; height: number }>();
  for (const nodeId of standaloneDisconnected) {
    const node = allNodes.get(nodeId);
    if (node) {
      sizes.set(nodeId, {
        width: node.size?.[0] ?? 200,
        height: node.size?.[1] ?? 100,
      });
    }
  }

  // Pack into rows using config settings
  const rows = packNodesIntoRows(standaloneDisconnected, sizes, {
    ...config,
    maxColumns: 1, // Stack vertically in left margin
  });

  // Position at startX, startY (left of main DAG)
  const x = config.startX;
  const y = config.startY;

  for (const row of rows) {
    for (const nodeId of row.nodes) {
      const node = allNodes.get(nodeId);
      if (node && node.pos) {
        // Skip locked/pinned nodes
        if (node.flags?.pinned || node.locked) {
          continue;
        }
        node.pos[0] = x;
        node.pos[1] = y + row.yOffset;
      }
    }
  }

  debugLog(
    `Placed ${standaloneDisconnected.length} disconnected nodes in left margin (${disconnectedNodes.size - standaloneDisconnected.length} inside groups)`
  );
}

/**
 * Apply computed positions to actual ComfyUI nodes
 * Handles standalone nodes, subgraph I/O nodes, top-level groups, and nested groups recursively
 * Also restores reroute positions and places disconnected nodes
 */
export function applyPositions(state: LayoutState): void {
  const { nodes, groupRepresentatives, allNodes, groups, config, rerouteChains } = state;

  // First: Apply positions to standalone nodes (including I/O nodes)
  for (const layoutNode of nodes.values()) {
    if (layoutNode.isGroupRepresentative) {
      // This is a group - handled below with recursive positioning
      continue;
    }

    // Handle subgraph I/O nodes (update pos array directly)
    if (layoutNode.isSubgraphIO && layoutNode.runtimeIONode) {
      layoutNode.runtimeIONode.pos[0] = layoutNode.x;
      layoutNode.runtimeIONode.pos[1] = layoutNode.y;

      // Sync allNodes entry for overlap resolution (ioNodeToLGraphNode creates a copy)
      if (allNodes) {
        const allNode = allNodes.get(layoutNode.id);
        if (allNode?.pos) {
          allNode.pos[0] = layoutNode.x;
          allNode.pos[1] = layoutNode.y;
        }
      }

      debugLog(
        `Positioned I/O node id=${layoutNode.id} to [${layoutNode.x}, ${layoutNode.y}]`
      );
      continue;
    }

    const comfyNode = layoutNode.node;

    // Skip locked/pinned nodes
    if (comfyNode.flags?.pinned || comfyNode.locked) {
      continue;
    }

    // Update position
    if (comfyNode.pos) {
      comfyNode.pos[0] = layoutNode.x;
      comfyNode.pos[1] = layoutNode.y;
    }
  }

  // Second: Position group contents recursively (top-level groups only)
  if (groupRepresentatives && allNodes && groups) {
    // Find top-level groups (no parent)
    const topLevelGroups = groups.filter((g) => !g.parentGroup);

    for (const topGroup of topLevelGroups) {
      const repId = groupRepresentatives.get(topGroup);
      if (repId === undefined) continue;

      const repNode = nodes.get(repId);
      if (!repNode) continue;

      // Start positioning at the group's content area
      const startX = repNode.x + config.groupPadding;
      const startY = repNode.y + config.groupPadding + GROUP_TITLE_HEIGHT;

      positionGroupContents(topGroup, startX, startY, allNodes, config);
    }
  }

  // Third: Place disconnected nodes in left margin
  placeDisconnectedNodes(state);

  // Fourth: Restore reroute positions along their chain edges
  if (rerouteChains && rerouteChains.length > 0 && allNodes) {
    // Build positions and sizes maps from actual nodes
    const positions = new Map<number, { x: number; y: number }>();
    const sizes = new Map<number, { width: number; height: number }>();

    for (const [id, node] of allNodes) {
      if (node.pos) {
        positions.set(id, { x: node.pos[0], y: node.pos[1] });
      }
      if (node.size) {
        sizes.set(id, { width: node.size[0], height: node.size[1] });
      }
    }

    // Also include layout node positions (for nodes we just positioned)
    for (const layoutNode of nodes.values()) {
      positions.set(layoutNode.id, { x: layoutNode.x, y: layoutNode.y });
      sizes.set(layoutNode.id, { width: layoutNode.width, height: layoutNode.height });
    }

    // Restore reroute positions
    restoreReroutePositions(rerouteChains, positions, sizes);

    // Apply restored positions to actual nodes
    for (const chain of rerouteChains) {
      for (const rerouteId of chain.nodes) {
        const pos = positions.get(rerouteId);
        const node = allNodes.get(rerouteId);
        if (pos && node && node.pos) {
          node.pos[0] = pos.x;
          node.pos[1] = pos.y;
        }
      }
    }

    debugLog(
      `Restored ${rerouteChains.length} reroute chains`
    );
  }
}

/**
 * Re-layout group contents using proper Sugiyama-style layout for connected members
 * or bin packing for disconnected members
 * Returns the final Y position after all contents
 */
function positionGroupContents(
  group: LayoutGroup,
  startX: number,
  startY: number,
  allNodes: Map<number, LGraphNode>,
  config: LayoutConfig
): number {
  // Collect non-locked members
  const members: LGraphNode[] = [];
  for (const nodeId of group.memberIds) {
    const node = allNodes.get(nodeId);
    if (!node) continue;
    if (node.flags?.pinned || node.locked) continue;
    members.push(node);
  }

  // Handle empty group
  if (members.length === 0 && group.childGroups.length === 0) {
    return startY;
  }

  // Parse layout token from group title
  const layoutMode = parseLayoutToken(group.group.title);

  debugLog(`layoutGroupContents "${group.group.title}": startX=${startX}, members=${members.length}, childGroups=${group.childGroups.length}, mode=${layoutMode.type}`);

  let finalY = startY;

  // If layout mode is specified, use token-based layout (ignores internal edges)
  if (layoutMode.type !== "default" && members.length > 0) {
    const arranged = arrangeByMode(members, layoutMode, startX, startY, config);

    for (const pos of arranged) {
      const node = allNodes.get(pos.id);
      if (node?.pos) {
        node.pos[0] = pos.x;
        node.pos[1] = pos.y;
        debugLog(`  Member ${node.id} (${node.type}): token layout [${pos.x}, ${pos.y}]`);

        const nh = node.size?.[1] ?? 100;
        finalY = Math.max(finalY, pos.y + nh);
      }
    }
  } else if (members.length > 0) {
    // Default behavior: check internal edges for layer-based or bin pack layout
    const edges = getInternalEdges(group.memberIds, allNodes);

    if (edges.length > 0) {
      // Has internal connections - use layer-based layout
      const layers = assignMemberLayers(group.memberIds, edges, allNodes);

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
            debugLog(`  Member ${node.id} (${node.type}): layer ${layerIdx}, pos [${x}, ${y}]`);
          }

          layerMaxWidth = Math.max(layerMaxWidth, node.size?.[0] ?? 200);
          y += (node.size?.[1] ?? 100) + config.verticalGap;
        }

        finalY = Math.max(finalY, y - config.verticalGap);
        x += layerMaxWidth + config.horizontalGap;
      }
    } else {
      // No internal connections - use simple vertical stacking with bin pack
      // Sort by height for consistent layout
      members.sort((a, b) => (b.size?.[1] ?? 100) - (a.size?.[1] ?? 100));

      // Build sizes map
      const sizes = new Map<number, { width: number; height: number }>();
      for (const node of members) {
        sizes.set(node.id, {
          width: node.size?.[0] ?? 200,
          height: node.size?.[1] ?? 100,
        });
      }

      // Pack into rows
      const nodeIds = members.map((n) => n.id);
      const rows = packNodesIntoRows(nodeIds, sizes, config);

      let y = startY;
      for (const row of rows) {
        let x = startX;
        for (const nodeId of row.nodes) {
          const node = allNodes.get(nodeId);
          if (node?.pos) {
            node.pos[0] = x;
            node.pos[1] = y;
            debugLog(`  Member ${node.id} (${node.type}): packed pos [${x}, ${y}]`);
            x += (node.size?.[0] ?? 200) + config.horizontalGap;
          }
        }
        y += row.height + config.verticalGap;
      }
      finalY = y - config.verticalGap;
    }
  }

  // Position child groups after members
  for (const child of group.childGroups) {
    // Calculate child group's content area
    const childStartX = startX;
    const childStartY = finalY + config.verticalGap;

    // First, layout the child group's contents
    const childEndY = positionGroupContents(child, childStartX, childStartY + GROUP_TITLE_HEIGHT, allNodes, config);

    // Update child group position
    if (child.group.pos) {
      child.group.pos[0] = childStartX - config.groupPadding;
      child.group.pos[1] = childStartY - config.groupPadding;
      debugLog(`  Child group "${child.group.title}": pos [${child.group.pos[0]}, ${child.group.pos[1]}]`);
    }

    finalY = childEndY + config.groupPadding;
  }

  return finalY;
}

/**
 * Calculate vertical bounds of nodes in a layer
 * Returns actual min/max Y by iterating all nodes, not assuming array order
 * (Array order is by barycenter, not Y position after bin-packing)
 */
function getLayerBounds(nodes: LayoutNode[]): { minY: number; maxY: number } | null {
  if (nodes.length === 0) return null;

  let minY = Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y + node.height);
  }

  if (minY === Infinity) return null;
  return { minY, maxY };
}

/**
 * Compact vertical layout to reduce gaps
 * Centers layers against the tallest non-group layer
 * Groups are excluded from max calculation to prevent Y explosion
 */
export function compactVertically(state: LayoutState): void {
  const { layers } = state;

  // Calculate max height from STANDALONE nodes only (exclude groups)
  // Groups are outliers that can be 4000px+, which would push all other layers down
  let maxTotalHeight = 0;

  for (const layer of layers) {
    const standaloneNodes = layer.nodes.filter((n) => !n.isGroupRepresentative);

    if (standaloneNodes.length === 0) {
      // Layer is all groups, skip from max calculation
      continue;
    }

    const bounds = getLayerBounds(standaloneNodes);
    if (!bounds) continue;

    const layerHeight = bounds.maxY - bounds.minY;
    maxTotalHeight = Math.max(maxTotalHeight, layerHeight);
  }

  // If no standalone layers, skip centering entirely
  if (maxTotalHeight === 0) return;

  // Center each layer against maxTotalHeight
  for (const layer of layers) {
    if (layer.nodes.length === 0) continue;

    const bounds = getLayerBounds(layer.nodes);
    if (!bounds) continue;

    const layerHeight = bounds.maxY - bounds.minY;
    const offset = (maxTotalHeight - layerHeight) / 2;

    for (const node of layer.nodes) {
      node.y += offset;
    }
  }
}

/**
 * Collect all entities (groups and standalone nodes) for overlap resolution
 * Assigns priority: groups=100, connected nodes=50, disconnected=10
 */
function collectEntities(state: LayoutState): LayoutEntity[] {
  const entities: LayoutEntity[] = [];
  const { groups, allNodes, nodeToGroup, disconnectedNodes } = state;

  if (!allNodes) return entities;

  // Add top-level groups (high priority - they anchor)
  for (const lg of groups ?? []) {
    if (lg.parentGroup) continue; // Skip nested, handled with parent
    const x = lg.group.pos?.[0] ?? 0;
    const y = lg.group.pos?.[1] ?? 0;
    entities.push({
      id: `group_${lg.group.title ?? entities.length}`,
      type: "group",
      priority: 100,
      x,
      y,
      width: lg.group.size?.[0] ?? 0,
      height: lg.group.size?.[1] ?? 0,
      initialX: x,
      initialY: y,
      group: lg.group,
      layoutGroup: lg,
    });
  }

  // Add standalone nodes (lower priority)
  for (const [nodeId, node] of allNodes) {
    if (nodeToGroup?.has(nodeId)) continue; // Inside group
    if (node.flags?.pinned || node.locked) continue;

    const isDisconnected = disconnectedNodes?.has(nodeId) ?? false;
    const x = node.pos?.[0] ?? 0;
    const y = node.pos?.[1] ?? 0;
    entities.push({
      id: `node_${nodeId}`,
      type: "node",
      priority: isDisconnected ? 10 : 50,
      x,
      y,
      width: node.size?.[0] ?? 200,
      height: node.size?.[1] ?? 100,
      initialX: x,
      initialY: y,
      node,
    });
  }

  return entities;
}

/**
 * Scanline overlap resolution for X-axis (push right)
 * Entities are sorted by X, overlapping entities are pushed right
 * Higher priority entities anchor, lower priority pushed
 * Only updates entity.x/y - does NOT modify node.pos (deferred to applyFinalPositions)
 * Returns true if any entity was moved
 */
function scanlineResolveX(
  entities: LayoutEntity[],
  config: LayoutConfig
): boolean {
  let anyChanged = false;
  let iterations = 0;
  const maxIterations = entities.length * 2;

  let changed = true;
  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    // Sort by X position, then priority, then ID (deterministic)
    entities.sort((a, b) => a.x - b.x || b.priority - a.priority || a.id.localeCompare(b.id));

    for (let i = 0; i < entities.length; i++) {
      const anchor = entities[i];

      for (let j = i + 1; j < entities.length; j++) {
        const pushed = entities[j];

        // Check Y overlap (must overlap on Y axis to need X separation)
        const yOverlap =
          anchor.y < pushed.y + pushed.height + config.verticalGap &&
          pushed.y < anchor.y + anchor.height + config.verticalGap;
        if (!yOverlap) continue;

        // Check X overlap
        const requiredX = anchor.x + anchor.width + config.horizontalGap;
        if (pushed.x < requiredX) {
          // Overlap! Push entity j to the right (entity only, not node.pos)
          const dx = requiredX - pushed.x;
          pushed.x = requiredX;
          changed = true;
          anyChanged = true;
          debugLog(`Scanline X: ${pushed.id} right ${dx.toFixed(0)}px (avoid ${anchor.id})`);
        }
      }
    }
  }

  if (iterations > 1) {
    debugLog(`X-axis scanline: ${iterations} iterations`);
  }
  return anyChanged;
}

/**
 * Scanline overlap resolution for Y-axis (push down)
 * Entities are sorted by Y, overlapping entities are pushed down
 * Higher priority entities anchor, lower priority pushed
 * Only updates entity.x/y - does NOT modify node.pos (deferred to applyFinalPositions)
 * Returns true if any entity was moved
 */
function scanlineResolveY(
  entities: LayoutEntity[],
  config: LayoutConfig
): boolean {
  let anyChanged = false;
  let iterations = 0;
  const maxIterations = entities.length * 2;

  let changed = true;
  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    // Sort by Y position, then priority, then ID (deterministic)
    entities.sort((a, b) => a.y - b.y || b.priority - a.priority || a.id.localeCompare(b.id));

    for (let i = 0; i < entities.length; i++) {
      const anchor = entities[i];

      for (let j = i + 1; j < entities.length; j++) {
        const pushed = entities[j];

        // Check X overlap (must overlap on X axis to need Y separation)
        const xOverlap =
          anchor.x < pushed.x + pushed.width + config.horizontalGap &&
          pushed.x < anchor.x + anchor.width + config.horizontalGap;
        if (!xOverlap) continue;

        // Check Y overlap
        const requiredY = anchor.y + anchor.height + config.verticalGap;
        if (pushed.y < requiredY) {
          // Overlap! Push entity j down (entity only, not node.pos)
          const dy = requiredY - pushed.y;
          pushed.y = requiredY;
          changed = true;
          anyChanged = true;
          debugLog(`Scanline Y: ${pushed.id} down ${dy.toFixed(0)}px (avoid ${anchor.id})`);
        }
      }
    }
  }

  if (iterations > 1) {
    debugLog(`Y-axis scanline: ${iterations} iterations`);
  }
  return anyChanged;
}

/**
 * Recursively shift all member nodes and nested child groups
 */
function shiftGroupContentsRecursively(
  layoutGroup: LayoutGroup,
  dx: number,
  dy: number,
  allNodes: Map<number, LGraphNode>
): void {
  // Shift member nodes of this group
  for (const nodeId of layoutGroup.memberIds) {
    const node = allNodes.get(nodeId);
    if (node?.pos) {
      node.pos[0] += dx;
      node.pos[1] += dy;
    }
  }
  // Shift child groups and their contents recursively
  for (const child of layoutGroup.childGroups) {
    if (child.group.pos) {
      child.group.pos[0] += dx;
      child.group.pos[1] += dy;
    }
    shiftGroupContentsRecursively(child, dx, dy, allNodes);
  }
}

/**
 * Recursively shift child groups and their members
 */
function shiftChildGroups(
  layoutGroup: LayoutGroup,
  dx: number,
  dy: number,
  allNodes: Map<number, LGraphNode>
): void {
  for (const child of layoutGroup.childGroups) {
    if (child.group.pos) {
      child.group.pos[0] += dx;
      child.group.pos[1] += dy;
    }
    shiftGroupContentsRecursively(child, dx, dy, allNodes);
  }
}

/**
 * Apply final entity positions to node.pos after scanline resolution
 * Calculates deltas from initial positions and applies to groups/nodes
 */
function applyFinalPositions(
  entities: LayoutEntity[],
  allNodes: Map<number, LGraphNode>
): void {
  for (const entity of entities) {
    const dx = entity.x - entity.initialX;
    const dy = entity.y - entity.initialY;

    // Skip if no movement
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue;

    if (entity.type === "group" && entity.group && entity.layoutGroup) {
      // Set group's final position
      if (entity.group.pos) {
        entity.group.pos[0] = entity.x;
        entity.group.pos[1] = entity.y;
      }
      // Shift all member nodes by the same delta
      for (const nodeId of entity.layoutGroup.memberIds) {
        const node = allNodes.get(nodeId);
        if (node?.pos) {
          node.pos[0] += dx;
          node.pos[1] += dy;
        }
      }
      // Shift child groups recursively
      shiftChildGroups(entity.layoutGroup, dx, dy, allNodes);
    } else if (entity.type === "node" && entity.node?.pos) {
      // Set node's final position
      entity.node.pos[0] = entity.x;
      entity.node.pos[1] = entity.y;
    }
  }
}

/**
 * Unified overlap resolution using scanline algorithm
 * Uses priority-based monotonic pushing (right/down only) to prevent oscillation
 * Groups have highest priority and anchor in place
 * Idempotent: decouples entity tracking from node.pos writes
 */
export function resolveAllOverlaps(state: LayoutState): void {
  const { allNodes, nodes, config } = state;
  if (!allNodes) return;

  const entities = collectEntities(state);
  if (entities.length < 2) {
    debugLog(`Overlap resolution: ${entities.length} entities (skipped)`);
    return;
  }

  // Pass 1: X-axis (left-to-right pushing) - updates entity.x only
  scanlineResolveX(entities, config);

  // Pass 2: Y-axis (top-to-bottom pushing) - updates entity.y only
  scanlineResolveY(entities, config);

  // Pass 3: Apply final positions to node.pos
  applyFinalPositions(entities, allNodes);

  // Pass 4: Sync I/O node positions from allNodes back to runtimeIONode
  // (applyFinalPositions updates allNodes[id].pos, but runtimeIONode.pos needs syncing)
  if (nodes) {
    for (const layoutNode of nodes.values()) {
      if (layoutNode.isSubgraphIO && layoutNode.runtimeIONode) {
        const allNode = allNodes.get(layoutNode.id);
        if (allNode?.pos) {
          layoutNode.runtimeIONode.pos[0] = allNode.pos[0];
          layoutNode.runtimeIONode.pos[1] = allNode.pos[1];
        }
      }
    }
  }

  debugLog(`Overlap resolution: ${entities.length} entities processed`);
}
