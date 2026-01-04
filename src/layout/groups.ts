import type { LayoutState, LGraphGroup } from "./types";
import { debugLog } from "../index";

/** Title bar height for groups */
const GROUP_TITLE_HEIGHT = 50;

/**
 * Resize groups to fit their contents after layout
 * Uses bottom-up processing: deepest groups first, then parents
 */
export function resizeGroupsToFit(state: LayoutState): number {
  const { groupsByDepth, allNodes, config } = state;

  if (!groupsByDepth || !allNodes) {
    debugLog("Missing groupsByDepth or allNodes");
    return 0;
  }

  let resizedCount = 0;
  const maxDepth = groupsByDepth.length - 1;

  // Process from deepest to shallowest (bottom-up)
  for (let depth = maxDepth; depth >= 0; depth--) {
    for (const layoutGroup of groupsByDepth[depth]) {
      const { group, memberIds, childGroups } = layoutGroup;

      // Skip groups with no content
      if (memberIds.size === 0 && childGroups.length === 0) {
        debugLog(`Skipping empty group "${group.title}"`);
        continue;
      }

      // Calculate bounding box from positioned members and child groups
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      // Include direct member nodes
      for (const nodeId of memberIds) {
        const node = allNodes.get(nodeId);
        if (!node) continue;

        const nx = node.pos?.[0] ?? 0;
        const ny = node.pos?.[1] ?? 0;
        const nw = node.size?.[0] ?? 200;
        const nh = node.size?.[1] ?? 100;

        minX = Math.min(minX, nx);
        minY = Math.min(minY, ny);
        maxX = Math.max(maxX, nx + nw);
        maxY = Math.max(maxY, ny + nh);
      }

      // Include child groups (already resized in previous iterations)
      for (const child of childGroups) {
        const cg = child.group;
        const cx = cg.pos[0];
        const cy = cg.pos[1];
        const cw = cg.size[0];
        const ch = cg.size[1];

        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx + cw);
        maxY = Math.max(maxY, cy + ch);
      }

      // Handle empty bounds (shouldn't happen but be safe)
      if (minX === Infinity) {
        debugLog(`No content bounds for group "${group.title}"`);
        continue;
      }

      // Calculate final group bounds with padding
      const padding = config.groupPadding;
      const newX = minX - padding;
      const newY = minY - padding - GROUP_TITLE_HEIGHT;
      const newWidth = maxX - minX + padding * 2;
      const newHeight = maxY - minY + padding * 2 + GROUP_TITLE_HEIGHT;

      debugLog(
        `Resizing group "${group.title}" (depth ${layoutGroup.depth}) to [${newX}, ${newY}, ${newWidth}, ${newHeight}]`
      );

      // Update group bounds
      updateGroupBounds(group, newX, newY, newWidth, newHeight);

      resizedCount++;
    }
  }

  return resizedCount;
}

/**
 * Update group bounds using multiple methods for compatibility
 */
function updateGroupBounds(
  group: LGraphGroup,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  // Method 1: Direct pos/size array mutation (most common)
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

  // Method 4: Try bounding array (older format)
  const gAny = group as LGraphGroup & { bounding?: number[] };
  if (Array.isArray(gAny.bounding)) {
    gAny.bounding[0] = x;
    gAny.bounding[1] = y;
    gAny.bounding[2] = width;
    gAny.bounding[3] = height;
  }
}
