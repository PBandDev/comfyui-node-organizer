/**
 * Grid layout algorithm — distributes nodes into rows and columns.
 *
 * Supports specifying either a row count or column count.
 * Nodes fill left-to-right, top-to-bottom.
 * Ignores edges (token layouts ignore DAG structure).
 */

import type { LayoutAlgorithm, LayoutInput, LayoutOutput, Position } from "../types";

const DEFAULT_GAP = 40;

export interface GridConfig {
  readonly rows?: number;
  readonly columns?: number;
  readonly gap?: number;
}

export function createGridAlgorithm(config: GridConfig): LayoutAlgorithm {
  const gap = config.gap ?? DEFAULT_GAP;

  return {
    name: "grid",
    layout(input: LayoutInput): LayoutOutput {
      const positions = new Map<string, Position>();
      const { nodes } = input;

      if (nodes.length === 0) {
        return { positions };
      }

      const n = nodes.length;

      // Determine grid dimensions
      let rows: number;
      let cols: number;

      if (config.rows !== undefined) {
        rows = config.rows;
        cols = Math.ceil(n / rows);
      } else if (config.columns !== undefined) {
        cols = config.columns;
        rows = Math.ceil(n / cols);
      } else {
        // Default: sqrt(n) columns
        cols = Math.ceil(Math.sqrt(n));
        rows = Math.ceil(n / cols);
      }

      // Find max node dimensions for uniform cell sizing
      let maxWidth = 0;
      let maxHeight = 0;
      for (const node of nodes) {
        if (node.width > maxWidth) maxWidth = node.width;
        if (node.height > maxHeight) maxHeight = node.height;
      }

      const cellWidth = maxWidth + gap;
      const cellHeight = maxHeight + gap;

      // Place nodes left-to-right, top-to-bottom
      // Node index i goes to (row = floor(i / cols), col = i % cols)
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const row = Math.floor(i / cols);
        const col = i % cols;

        // Center node within its cell
        const x = col * cellWidth + (maxWidth - node.width) / 2;
        const y = row * cellHeight + (maxHeight - node.height) / 2;

        positions.set(node.id, { x, y });
      }

      return { positions };
    },
  };
}
