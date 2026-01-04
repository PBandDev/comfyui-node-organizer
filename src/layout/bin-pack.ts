import type { PackedRow, LayoutConfig } from "./types";

/** Node size info for packing */
interface NodeSize {
  id: number;
  width: number;
  height: number;
}

/**
 * Pack nodes into rows using First-Fit Decreasing Height (FFDH) algorithm
 *
 * Strategy:
 * 1. Sort nodes by height descending (tall nodes first)
 * 2. For each node, try to fit into existing row
 * 3. If no row fits, create new row
 * 4. Rows are sorted by height for visual consistency
 *
 * @param nodeIds - Node IDs to pack
 * @param sizes - Map of node ID to size
 * @param config - Layout configuration
 * @returns Array of packed rows
 */
export function packNodesIntoRows(
  nodeIds: number[],
  sizes: Map<number, { width: number; height: number }>,
  config: LayoutConfig
): PackedRow[] {
  if (nodeIds.length === 0) return [];

  // maxColumns: 0=auto, 1=disabled (vertical stack), 2+=fixed columns
  if (config.maxColumns === 1) {
    // Vertical stacking - one node per row
    return packVertically(nodeIds, sizes, config.verticalGap);
  }

  // Build sized node list
  const nodeSizes: NodeSize[] = nodeIds.map((id) => {
    const size = sizes.get(id);
    return {
      id,
      width: size?.width ?? 200,
      height: size?.height ?? 100,
    };
  });

  // Sort by height descending (FFDH: tall nodes first)
  nodeSizes.sort((a, b) => b.height - a.height);

  if (config.maxColumns >= 2) {
    // Fixed column count
    return packFixedColumns(nodeSizes, config.maxColumns, config.verticalGap);
  }

  // Auto mode: use maxRowWidth
  return packByWidth(nodeSizes, config.maxRowWidth, config.horizontalGap, config.verticalGap);
}

/**
 * Pack nodes vertically (one per row) - legacy behavior
 */
function packVertically(
  nodeIds: number[],
  sizes: Map<number, { width: number; height: number }>,
  verticalGap: number
): PackedRow[] {
  const rows: PackedRow[] = [];
  let yOffset = 0;

  for (const id of nodeIds) {
    const size = sizes.get(id);
    const height = size?.height ?? 100;
    const width = size?.width ?? 200;

    rows.push({
      nodes: [id],
      height,
      yOffset,
      width,
    });

    yOffset += height + verticalGap;
  }

  return rows;
}

/**
 * Pack nodes into fixed number of columns
 * Distributes nodes round-robin by height to balance columns
 */
function packFixedColumns(
  nodeSizes: NodeSize[],
  columnCount: number,
  verticalGap: number
): PackedRow[] {
  // Group nodes by similar height into rows
  const rows: PackedRow[] = [];
  let currentRow: NodeSize[] = [];

  for (const node of nodeSizes) {
    currentRow.push(node);

    if (currentRow.length >= columnCount) {
      // Row is full
      const rowHeight = Math.max(...currentRow.map((n) => n.height));
      const rowWidth = currentRow.reduce((sum, n) => sum + n.width, 0);

      rows.push({
        nodes: currentRow.map((n) => n.id),
        height: rowHeight,
        yOffset: 0, // Set later
        width: rowWidth,
      });

      currentRow = [];
    }
  }

  // Handle remaining nodes in last partial row
  if (currentRow.length > 0) {
    const rowHeight = Math.max(...currentRow.map((n) => n.height));
    const rowWidth = currentRow.reduce((sum, n) => sum + n.width, 0);

    rows.push({
      nodes: currentRow.map((n) => n.id),
      height: rowHeight,
      yOffset: 0,
      width: rowWidth,
    });
  }

  // Calculate y offsets
  let yOffset = 0;
  for (const row of rows) {
    row.yOffset = yOffset;
    yOffset += row.height + verticalGap;
  }

  return rows;
}

/**
 * Pack nodes by maximum row width (auto column count)
 * Uses FFDH: First-Fit Decreasing Height
 */
function packByWidth(
  nodeSizes: NodeSize[],
  maxRowWidth: number,
  horizontalGap: number,
  verticalGap: number
): PackedRow[] {
  const rows: Array<{
    nodes: NodeSize[];
    height: number;
    currentWidth: number;
  }> = [];

  for (const node of nodeSizes) {
    // Try to fit into existing row
    let placed = false;

    for (const row of rows) {
      const newWidth = row.currentWidth + horizontalGap + node.width;

      // Check if node fits and heights are compatible
      // Allow 50% height variance to keep rows visually balanced
      const heightRatio = row.height > 0 ? node.height / row.height : 1;
      const heightCompatible = heightRatio >= 0.5 && heightRatio <= 2.0;

      if (newWidth <= maxRowWidth && heightCompatible) {
        row.nodes.push(node);
        row.currentWidth = newWidth;
        row.height = Math.max(row.height, node.height);
        placed = true;
        break;
      }
    }

    if (!placed) {
      // Create new row
      rows.push({
        nodes: [node],
        height: node.height,
        currentWidth: node.width,
      });
    }
  }

  // Sort rows by their tallest node height (tallest first for visual hierarchy)
  rows.sort((a, b) => b.height - a.height);

  // Convert to PackedRow format with y offsets
  const result: PackedRow[] = [];
  let yOffset = 0;

  for (const row of rows) {
    result.push({
      nodes: row.nodes.map((n) => n.id),
      height: row.height,
      yOffset,
      width: row.currentWidth,
    });

    yOffset += row.height + verticalGap;
  }

  return result;
}

/**
 * Calculate total height of packed rows
 */
export function getPackedHeight(rows: PackedRow[]): number {
  if (rows.length === 0) return 0;
  const lastRow = rows[rows.length - 1];
  return lastRow.yOffset + lastRow.height;
}

/**
 * Calculate max width across all packed rows
 */
export function getPackedWidth(rows: PackedRow[]): number {
  return Math.max(0, ...rows.map((r) => r.width));
}
