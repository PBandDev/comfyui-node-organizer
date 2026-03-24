/**
 * Coordinate assignment for layered graphs.
 *
 * Assigns X coordinates based on cumulative layer widths (left-to-right)
 * and Y coordinates by stacking nodes top-to-bottom within each layer.
 */

import type { LayoutNode, Position } from "../../types";

interface CoordinateConfig {
  readonly horizontalGap: number;
  readonly verticalGap: number;
}

/**
 * Assign (x, y) coordinates to all nodes based on their layer ordering.
 *
 * - X: each layer starts after the previous layer's max width + horizontalGap
 * - Y: nodes within a layer are stacked vertically with verticalGap between them
 * - Vertical centering: each layer is centered relative to the tallest layer
 * - Overlap sweep: after centering, ensure no overlaps within each layer
 */
export function assignCoordinates(
  layers: ReadonlyArray<ReadonlyArray<string>>,
  nodeMap: ReadonlyMap<string, LayoutNode>,
  config: CoordinateConfig,
): ReadonlyMap<string, Position> {
  const positions = new Map<string, Position>();

  if (layers.length === 0) return positions;

  // Compute max width per layer and total height per layer
  const layerMaxWidths: number[] = [];
  const layerTotalHeights: number[] = [];

  for (const layer of layers) {
    let maxWidth = 0;
    let totalHeight = 0;
    for (let i = 0; i < layer.length; i++) {
      const node = nodeMap.get(layer[i]);
      if (!node) continue;
      if (node.width > maxWidth) maxWidth = node.width;
      totalHeight += node.height;
      if (i > 0) totalHeight += config.verticalGap;
    }
    layerMaxWidths.push(maxWidth);
    layerTotalHeights.push(totalHeight);
  }

  // Find the tallest layer for vertical centering
  let maxTotalHeight = 0;
  for (const h of layerTotalHeights) {
    if (h > maxTotalHeight) maxTotalHeight = h;
  }

  // Compute X start positions for each layer
  const layerXStarts: number[] = [];
  let currentX = 0;
  for (let li = 0; li < layers.length; li++) {
    layerXStarts.push(currentX);
    currentX += layerMaxWidths[li] + config.horizontalGap;
  }

  // Assign positions: stack top-to-bottom within each layer, then center
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const layerX = layerXStarts[li];

    // Center this layer vertically relative to tallest layer
    const yOffset = (maxTotalHeight - layerTotalHeights[li]) / 2;
    let currentY = yOffset;

    for (const nodeId of layer) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      positions.set(nodeId, { x: layerX, y: currentY });
      currentY += node.height + config.verticalGap;
    }

    // Overlap sweep: ensure no node overlaps the previous one in this layer.
    // This handles edge cases where centering + variable sizes create overlaps.
    for (let i = 1; i < layer.length; i++) {
      const prevId = layer[i - 1];
      const currId = layer[i];
      const prevNode = nodeMap.get(prevId);
      const prevPos = positions.get(prevId);
      const currPos = positions.get(currId);
      if (!prevNode || !prevPos || !currPos) continue;

      const minY = prevPos.y + prevNode.height + config.verticalGap;
      if (currPos.y < minY) {
        positions.set(currId, { x: currPos.x, y: minY });
      }
    }
  }

  return positions;
}
