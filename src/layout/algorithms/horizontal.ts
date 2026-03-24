/**
 * Horizontal layout algorithm — places nodes in a single left-to-right row.
 *
 * Ignores edges entirely (token layouts ignore DAG structure).
 * Nodes are placed in input order; vertically centered by midpoint.
 */

import type { LayoutAlgorithm, LayoutInput, LayoutOutput, Position } from "../types";

const DEFAULT_GAP = 40;

export function createHorizontalAlgorithm(gap: number = DEFAULT_GAP): LayoutAlgorithm {
  return {
    name: "horizontal",
    layout(input: LayoutInput): LayoutOutput {
      const positions = new Map<string, Position>();
      const { nodes } = input;

      if (nodes.length === 0) {
        return { positions };
      }

      // Find max height for vertical centering
      let maxHeight = 0;
      for (const node of nodes) {
        if (node.height > maxHeight) maxHeight = node.height;
      }

      // Place nodes left-to-right, centered vertically
      let currentX = 0;
      for (const node of nodes) {
        const centeredY = maxHeight / 2 - node.height / 2;
        positions.set(node.id, { x: currentX, y: centeredY });
        currentX += node.width + gap;
      }

      return { positions };
    },
  };
}
