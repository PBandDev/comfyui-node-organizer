/**
 * Vertical layout algorithm — places nodes in a single top-to-bottom column.
 *
 * Ignores edges entirely (token layouts ignore DAG structure).
 * Nodes are placed in input order; horizontally centered by midpoint.
 */

import type { LayoutAlgorithm, LayoutInput, LayoutOutput, Position } from "../types";

const DEFAULT_GAP = 40;

export function createVerticalAlgorithm(gap: number = DEFAULT_GAP): LayoutAlgorithm {
  return {
    name: "vertical",
    layout(input: LayoutInput): LayoutOutput {
      const positions = new Map<string, Position>();
      const { nodes } = input;

      if (nodes.length === 0) {
        return { positions };
      }

      // Find max width for horizontal centering
      let maxWidth = 0;
      for (const node of nodes) {
        if (node.width > maxWidth) maxWidth = node.width;
      }

      // Place nodes top-to-bottom, centered horizontally
      let currentY = 0;
      for (const node of nodes) {
        const centeredX = maxWidth / 2 - node.width / 2;
        positions.set(node.id, { x: centeredX, y: currentY });
        currentY += node.height + gap;
      }

      return { positions };
    },
  };
}
