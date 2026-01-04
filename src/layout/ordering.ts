import type { LayoutState, Layer, LayoutNode } from "./types";

/**
 * Minimize edge crossings using size-aware barycenter heuristic
 * Uses cumulative height positions instead of simple indices
 * Alternates forward and backward sweeps
 */
export function minimizeCrossings(state: LayoutState): void {
  const { layers, nodes, config } = state;

  if (layers.length < 2) return;

  // Initial ordering: sort by node height (tall nodes first reduces gaps)
  for (const layer of layers) {
    layer.nodes.sort((a, b) => b.height - a.height);
    layer.nodes.forEach((n, i) => {
      n.orderInLayer = i;
    });
  }

  // Pre-compute cumulative height positions for size-aware barycenter
  const heightPositions = new Map<number, number>();
  updateHeightPositions(layers, heightPositions, config.verticalGap);

  // Iterative improvement with forward/backward sweeps
  for (let iter = 0; iter < config.maxIterations; iter++) {
    const improved =
      iter % 2 === 0
        ? sweepForward(layers, nodes, heightPositions, config.verticalGap)
        : sweepBackward(layers, nodes, heightPositions, config.verticalGap);

    if (!improved) break;
  }
}

/**
 * Compute cumulative height positions for each node
 * This gives a position-like weight for size-aware ordering
 */
function updateHeightPositions(
  layers: Layer[],
  positions: Map<number, number>,
  verticalGap: number
): void {
  for (const layer of layers) {
    let y = 0;
    for (const node of layer.nodes) {
      // Position is center of node
      positions.set(node.id, y + node.height / 2);
      y += node.height + verticalGap;
    }
  }
}

/**
 * Forward sweep: order each layer based on predecessors in previous layer
 * Uses height-aware positions for better size consideration
 */
function sweepForward(
  layers: Layer[],
  nodes: Map<number, LayoutNode>,
  heightPositions: Map<number, number>,
  verticalGap: number
): boolean {
  let improved = false;

  for (let i = 1; i < layers.length; i++) {
    const currLayer = layers[i];

    // Compute size-aware barycenter for each node
    const barycenters = new Map<number, number>();

    for (const node of currLayer.nodes) {
      if (node.predecessors.length > 0) {
        let sum = 0;
        let count = 0;

        for (const predId of node.predecessors) {
          const pred = nodes.get(predId);
          if (pred && pred.layer === i - 1) {
            // Use height position instead of simple index
            const pos = heightPositions.get(predId) ?? pred.orderInLayer;
            sum += pos;
            count++;
          }
        }

        if (count > 0) {
          barycenters.set(node.id, sum / count);
        } else {
          barycenters.set(node.id, heightPositions.get(node.id) ?? 0);
        }
      } else {
        barycenters.set(node.id, heightPositions.get(node.id) ?? 0);
      }
    }

    // Sort by barycenter, tie-break by ID for determinism
    const oldOrder = currLayer.nodes.map((n) => n.id).join(",");
    currLayer.nodes.sort((a, b) => {
      const aBar = barycenters.get(a.id) ?? 0;
      const bBar = barycenters.get(b.id) ?? 0;
      const diff = aBar - bBar;
      return diff !== 0 ? diff : a.id - b.id;
    });

    // Reassign integer order
    currLayer.nodes.forEach((n, idx) => {
      n.orderInLayer = idx;
    });

    // Update height positions for next iteration
    let y = 0;
    for (const node of currLayer.nodes) {
      heightPositions.set(node.id, y + node.height / 2);
      y += node.height + verticalGap;
    }

    const newOrder = currLayer.nodes.map((n) => n.id).join(",");
    if (oldOrder !== newOrder) improved = true;
  }

  return improved;
}

/**
 * Backward sweep: order each layer based on successors in next layer
 * Uses height-aware positions for better size consideration
 */
function sweepBackward(
  layers: Layer[],
  nodes: Map<number, LayoutNode>,
  heightPositions: Map<number, number>,
  verticalGap: number
): boolean {
  let improved = false;

  for (let i = layers.length - 2; i >= 0; i--) {
    const currLayer = layers[i];

    // Compute size-aware barycenter for each node based on successors
    const barycenters = new Map<number, number>();

    for (const node of currLayer.nodes) {
      if (node.successors.length > 0) {
        let sum = 0;
        let count = 0;

        for (const succId of node.successors) {
          const succ = nodes.get(succId);
          if (succ && succ.layer === i + 1) {
            // Use height position instead of simple index
            const pos = heightPositions.get(succId) ?? succ.orderInLayer;
            sum += pos;
            count++;
          }
        }

        if (count > 0) {
          barycenters.set(node.id, sum / count);
        } else {
          barycenters.set(node.id, heightPositions.get(node.id) ?? 0);
        }
      } else {
        barycenters.set(node.id, heightPositions.get(node.id) ?? 0);
      }
    }

    // Sort by barycenter, tie-break by ID for determinism
    const oldOrder = currLayer.nodes.map((n) => n.id).join(",");
    currLayer.nodes.sort((a, b) => {
      const aBar = barycenters.get(a.id) ?? 0;
      const bBar = barycenters.get(b.id) ?? 0;
      const diff = aBar - bBar;
      return diff !== 0 ? diff : a.id - b.id;
    });

    // Reassign integer order
    currLayer.nodes.forEach((n, idx) => {
      n.orderInLayer = idx;
    });

    // Update height positions for next iteration
    let y = 0;
    for (const node of currLayer.nodes) {
      heightPositions.set(node.id, y + node.height / 2);
      y += node.height + verticalGap;
    }

    const newOrder = currLayer.nodes.map((n) => n.id).join(",");
    if (oldOrder !== newOrder) improved = true;
  }

  return improved;
}
