/**
 * Barycenter crossing minimization.
 *
 * Repeatedly sweeps forward and backward through layers, reordering
 * nodes within each layer by the average (barycenter) position of
 * their neighbors in the adjacent fixed layer.
 */

import type { LayoutNode, LayoutEdge } from "../../types";

/**
 * Reorder nodes within each layer to minimize edge crossings.
 * Uses the barycenter heuristic with alternating forward/backward sweeps.
 *
 * @param layers - Node IDs grouped by layer index
 * @param edges - Directed edges (assumed acyclic, source layer < target layer)
 * @param nodeMap - Lookup for node dimensions (used for tie-breaking stability)
 * @param maxIterations - Number of full forward+backward sweeps (default 24)
 * @returns Reordered layers
 */
export function minimizeCrossings(
  layers: ReadonlyArray<ReadonlyArray<string>>,
  edges: ReadonlyArray<LayoutEdge>,
  _nodeMap: ReadonlyMap<string, LayoutNode>,
  maxIterations: number = 24,
): ReadonlyArray<ReadonlyArray<string>> {
  if (layers.length <= 1) return layers;

  // Build adjacency lookup for cross-layer connections
  // For each node, store indices of connected nodes in adjacent layers
  const nodeToLayer = new Map<string, number>();
  for (let li = 0; li < layers.length; li++) {
    for (const id of layers[li]) {
      nodeToLayer.set(id, li);
    }
  }

  // Forward neighbors: node -> nodes in the next layer
  const forwardNeighbors = new Map<string, string[]>();
  // Backward neighbors: node -> nodes in the previous layer
  const backwardNeighbors = new Map<string, string[]>();

  for (const layer of layers) {
    for (const id of layer) {
      forwardNeighbors.set(id, []);
      backwardNeighbors.set(id, []);
    }
  }

  for (const e of edges) {
    const srcLayer = nodeToLayer.get(e.source);
    const tgtLayer = nodeToLayer.get(e.target);
    if (srcLayer === undefined || tgtLayer === undefined) continue;

    if (tgtLayer > srcLayer) {
      forwardNeighbors.get(e.source)!.push(e.target);
      backwardNeighbors.get(e.target)!.push(e.source);
    } else if (srcLayer > tgtLayer) {
      forwardNeighbors.get(e.target)!.push(e.source);
      backwardNeighbors.get(e.source)!.push(e.target);
    }
  }

  // Mutable copy of layers
  let current: string[][] = layers.map((layer) => [...layer]);

  let bestCrossings = countAllCrossings(current, forwardNeighbors);
  let bestLayers: string[][] = current.map((layer) => [...layer]);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Forward sweep: fix layer i, reorder layer i+1
    for (let li = 1; li < current.length; li++) {
      current[li] = reorderByBarycenter(
        current[li],
        current[li - 1],
        backwardNeighbors,
      );
    }

    // Backward sweep: fix layer i, reorder layer i-1
    for (let li = current.length - 2; li >= 0; li--) {
      current[li] = reorderByBarycenter(
        current[li],
        current[li + 1],
        forwardNeighbors,
      );
    }

    const crossings = countAllCrossings(current, forwardNeighbors);
    if (crossings < bestCrossings) {
      bestCrossings = crossings;
      bestLayers = current.map((layer) => [...layer]);
    }

    // Early exit if no crossings remain
    if (bestCrossings === 0) break;
  }

  return bestLayers;
}

/**
 * Reorder `layer` based on barycenter positions in `fixedLayer`.
 * `neighborsMap` maps each node in `layer` to its neighbors in `fixedLayer`.
 */
function reorderByBarycenter(
  layer: ReadonlyArray<string>,
  fixedLayer: ReadonlyArray<string>,
  neighborsMap: ReadonlyMap<string, string[]>,
): string[] {
  // Build position index for fixed layer
  const fixedPosition = new Map<string, number>();
  for (let i = 0; i < fixedLayer.length; i++) {
    fixedPosition.set(fixedLayer[i], i);
  }

  // Compute barycenter for each node
  const barycenters = new Map<string, number>();
  for (const id of layer) {
    const neighbors = neighborsMap.get(id) ?? [];
    const relevantPositions: number[] = [];
    for (const n of neighbors) {
      const pos = fixedPosition.get(n);
      if (pos !== undefined) {
        relevantPositions.push(pos);
      }
    }

    if (relevantPositions.length > 0) {
      const sum = relevantPositions.reduce((a, b) => a + b, 0);
      barycenters.set(id, sum / relevantPositions.length);
    }
    // Nodes with no connections keep their original position
  }

  // Sort: nodes with barycenters first (by value), then nodes without (keep original order)
  const withBarycenter: string[] = [];
  const withoutBarycenter: string[] = [];
  const originalIndex = new Map<string, number>();

  for (let i = 0; i < layer.length; i++) {
    originalIndex.set(layer[i], i);
    if (barycenters.has(layer[i])) {
      withBarycenter.push(layer[i]);
    } else {
      withoutBarycenter.push(layer[i]);
    }
  }

  withBarycenter.sort((a, b) => {
    const ba = barycenters.get(a)!;
    const bb = barycenters.get(b)!;
    if (ba !== bb) return ba - bb;
    // Stable tie-break: original order
    return originalIndex.get(a)! - originalIndex.get(b)!;
  });

  // Merge: interleave nodes without barycenters at their original positions
  // Simple approach: put barycenter-sorted nodes first, then the rest
  // Better approach: insert non-barycenter nodes at their original relative positions
  const result: string[] = new Array(layer.length);
  const usedSlots = new Set<number>();

  // Place nodes without barycenters at their original indices first
  for (const id of withoutBarycenter) {
    const idx = originalIndex.get(id)!;
    result[idx] = id;
    usedSlots.add(idx);
  }

  // Fill remaining slots with barycenter-sorted nodes
  let bIdx = 0;
  for (let i = 0; i < result.length; i++) {
    if (!usedSlots.has(i)) {
      result[i] = withBarycenter[bIdx++];
    }
  }

  return result;
}

/**
 * Count total edge crossings between all adjacent layer pairs.
 */
function countAllCrossings(
  layers: ReadonlyArray<ReadonlyArray<string>>,
  forwardNeighbors: ReadonlyMap<string, string[]>,
): number {
  let total = 0;
  for (let li = 0; li < layers.length - 1; li++) {
    total += countCrossingsBetweenLayers(
      layers[li],
      layers[li + 1],
      forwardNeighbors,
    );
  }
  return total;
}

/**
 * Count edge crossings between two adjacent layers.
 * Two edges (u1->v1) and (u2->v2) cross if u1 is before u2 in topLayer
 * but v1 is after v2 in bottomLayer (or vice versa).
 */
function countCrossingsBetweenLayers(
  topLayer: ReadonlyArray<string>,
  bottomLayer: ReadonlyArray<string>,
  forwardNeighbors: ReadonlyMap<string, string[]>,
): number {
  // Build position maps
  const bottomPos = new Map<string, number>();
  for (let i = 0; i < bottomLayer.length; i++) {
    bottomPos.set(bottomLayer[i], i);
  }

  // Collect all edges as (topIndex, bottomIndex) pairs
  const edgePairs: Array<{ top: number; bottom: number }> = [];
  for (let ti = 0; ti < topLayer.length; ti++) {
    const neighbors = forwardNeighbors.get(topLayer[ti]) ?? [];
    for (const n of neighbors) {
      const bi = bottomPos.get(n);
      if (bi !== undefined) {
        edgePairs.push({ top: ti, bottom: bi });
      }
    }
  }

  // Count crossings by comparing all pairs
  // O(E^2) but fine for typical graph sizes
  let crossings = 0;
  for (let i = 0; i < edgePairs.length; i++) {
    for (let j = i + 1; j < edgePairs.length; j++) {
      const e1 = edgePairs[i];
      const e2 = edgePairs[j];
      if (
        (e1.top < e2.top && e1.bottom > e2.bottom) ||
        (e1.top > e2.top && e1.bottom < e2.bottom)
      ) {
        crossings++;
      }
    }
  }

  return crossings;
}
