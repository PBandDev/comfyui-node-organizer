import type { LGraphNode, LayoutConfig } from "./types";

/**
 * Layout mode parsed from group title tokens
 */
export type LayoutMode =
  | { type: "default" }
  | { type: "horizontal" }
  | { type: "vertical" }
  | { type: "rows"; count: number }
  | { type: "columns"; count: number };

/**
 * Parse layout token from group title (case-insensitive)
 * Supports: [HORIZONTAL], [VERTICAL], [1-9ROW], [1-9COL]
 */
export function parseLayoutToken(title: string): LayoutMode {
  const upper = title.toUpperCase();

  // Check for [HORIZONTAL]
  if (upper.includes("[HORIZONTAL]")) {
    return { type: "horizontal" };
  }

  // Check for [VERTICAL]
  if (upper.includes("[VERTICAL]")) {
    return { type: "vertical" };
  }

  // Check for [xROW] pattern (1-9)
  const rowMatch = upper.match(/\[([1-9])ROW\]/);
  if (rowMatch) {
    const count = parseInt(rowMatch[1], 10);
    // 1ROW is same as horizontal
    if (count === 1) {
      return { type: "horizontal" };
    }
    return { type: "rows", count };
  }

  // Check for [xCOL] pattern (1-9)
  const colMatch = upper.match(/\[([1-9])COL\]/);
  if (colMatch) {
    const count = parseInt(colMatch[1], 10);
    // 1COL is same as vertical
    if (count === 1) {
      return { type: "vertical" };
    }
    return { type: "columns", count };
  }

  return { type: "default" };
}

/**
 * Node info for layout calculations
 */
interface NodeInfo {
  id: number;
  width: number;
  height: number;
  originalX: number;
  originalY: number;
}

/**
 * Result of arranging nodes by mode
 */
export interface ArrangedNode {
  id: number;
  x: number;
  y: number;
}

/**
 * Sort nodes by original position (left-to-right, top-to-bottom)
 */
function sortByOriginalPosition(nodes: NodeInfo[]): NodeInfo[] {
  return [...nodes].sort((a, b) => {
    // Primary: sort by X (left to right)
    if (a.originalX !== b.originalX) {
      return a.originalX - b.originalX;
    }
    // Secondary: sort by Y (top to bottom)
    return a.originalY - b.originalY;
  });
}

/**
 * Arrange nodes in a single horizontal row
 */
function arrangeHorizontal(
  nodes: NodeInfo[],
  startX: number,
  startY: number,
  gap: number
): ArrangedNode[] {
  // Sort by original position (left to right)
  const sorted = sortByOriginalPosition(nodes);

  const result: ArrangedNode[] = [];
  let x = startX;

  for (const node of sorted) {
    result.push({ id: node.id, x, y: startY });
    x += node.width + gap;
  }

  return result;
}

/**
 * Arrange nodes in a single vertical column
 */
function arrangeVertical(
  nodes: NodeInfo[],
  startX: number,
  startY: number,
  gap: number
): ArrangedNode[] {
  // Sort by original position (top to bottom, then left to right)
  const sorted = [...nodes].sort((a, b) => {
    if (a.originalY !== b.originalY) {
      return a.originalY - b.originalY;
    }
    return a.originalX - b.originalX;
  });

  const result: ArrangedNode[] = [];
  let y = startY;

  for (const node of sorted) {
    result.push({ id: node.id, x: startX, y });
    y += node.height + gap;
  }

  return result;
}

/**
 * Arrange nodes into N rows (round-robin distribution)
 * Each row is horizontal, rows stacked vertically
 */
function arrangeRows(
  nodes: NodeInfo[],
  rowCount: number,
  startX: number,
  startY: number,
  horizontalGap: number,
  verticalGap: number
): ArrangedNode[] {
  // Sort by original position first
  const sorted = sortByOriginalPosition(nodes);

  // Distribute round-robin into rows
  const rows: NodeInfo[][] = Array.from({ length: rowCount }, () => []);
  for (let i = 0; i < sorted.length; i++) {
    rows[i % rowCount].push(sorted[i]);
  }

  const result: ArrangedNode[] = [];
  let y = startY;

  for (const row of rows) {
    if (row.length === 0) continue;

    let x = startX;
    let rowMaxHeight = 0;

    for (const node of row) {
      result.push({ id: node.id, x, y });
      x += node.width + horizontalGap;
      rowMaxHeight = Math.max(rowMaxHeight, node.height);
    }

    y += rowMaxHeight + verticalGap;
  }

  return result;
}

/**
 * Arrange nodes into N columns (round-robin distribution)
 * Each column is vertical, columns side-by-side
 */
function arrangeColumns(
  nodes: NodeInfo[],
  colCount: number,
  startX: number,
  startY: number,
  horizontalGap: number,
  verticalGap: number
): ArrangedNode[] {
  // Sort by original position first
  const sorted = sortByOriginalPosition(nodes);

  // Distribute round-robin into columns
  const cols: NodeInfo[][] = Array.from({ length: colCount }, () => []);
  for (let i = 0; i < sorted.length; i++) {
    cols[i % colCount].push(sorted[i]);
  }

  const result: ArrangedNode[] = [];
  let x = startX;

  for (const col of cols) {
    if (col.length === 0) continue;

    let y = startY;
    let colMaxWidth = 0;

    for (const node of col) {
      result.push({ id: node.id, x, y });
      y += node.height + verticalGap;
      colMaxWidth = Math.max(colMaxWidth, node.width);
    }

    x += colMaxWidth + horizontalGap;
  }

  return result;
}

/**
 * Arrange nodes according to layout mode
 */
export function arrangeByMode(
  members: LGraphNode[],
  mode: LayoutMode,
  startX: number,
  startY: number,
  config: LayoutConfig
): ArrangedNode[] {
  // Build node info list with original positions
  const nodes: NodeInfo[] = members.map((n) => ({
    id: n.id,
    width: n.size?.[0] ?? 200,
    height: n.size?.[1] ?? 100,
    originalX: n.pos?.[0] ?? 0,
    originalY: n.pos?.[1] ?? 0,
  }));

  if (nodes.length === 0) {
    return [];
  }

  switch (mode.type) {
    case "horizontal":
      return arrangeHorizontal(nodes, startX, startY, config.horizontalGap);

    case "vertical":
      return arrangeVertical(nodes, startX, startY, config.verticalGap);

    case "rows":
      return arrangeRows(
        nodes,
        mode.count,
        startX,
        startY,
        config.horizontalGap,
        config.verticalGap
      );

    case "columns":
      return arrangeColumns(
        nodes,
        mode.count,
        startX,
        startY,
        config.horizontalGap,
        config.verticalGap
      );

    default:
      // Default mode - caller should use existing behavior
      return [];
  }
}
