/**
 * Longest-path layer assignment for DAGs.
 *
 * Each node is assigned to the layer equal to the length of the longest
 * path from any source to that node. Sources (in-degree 0) get layer 0.
 */

import type { LayoutNode, LayoutEdge } from "../../types";

/**
 * Assign layer indices to each node using longest-path from sources.
 * Assumes the input is acyclic (run breakCycles first).
 * Returns a map of node ID -> layer index (0-based).
 */
export function assignLayers(
  nodes: ReadonlyArray<LayoutNode>,
  edges: ReadonlyArray<LayoutEdge>,
): ReadonlyMap<string, number> {
  const layerMap = new Map<string, number>();

  if (nodes.length === 0) return layerMap;

  const nodeIds = new Set(nodes.map((n) => n.id));

  // Build adjacency: predecessors and successors
  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const id of nodeIds) {
    predecessors.set(id, []);
    successors.set(id, []);
    inDegree.set(id, 0);
  }

  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    successors.get(e.source)!.push(e.target);
    predecessors.get(e.target)!.push(e.source);
    inDegree.set(e.target, inDegree.get(e.target)! + 1);
  }

  // Kahn's algorithm for topological ordering, computing longest path
  const queue: string[] = [];

  // Initialize sources at layer 0
  for (const id of nodeIds) {
    if (inDegree.get(id)! === 0) {
      layerMap.set(id, 0);
      queue.push(id);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const currentLayer = layerMap.get(current)!;

    for (const succ of successors.get(current)!) {
      // Layer of successor = max of all predecessor layers + 1
      const newLayer = currentLayer + 1;
      const existingLayer = layerMap.get(succ);
      if (existingLayer === undefined || newLayer > existingLayer) {
        layerMap.set(succ, newLayer);
      }

      // Decrement in-degree; add to queue when all predecessors processed
      const remaining = inDegree.get(succ)! - 1;
      inDegree.set(succ, remaining);
      if (remaining === 0) {
        queue.push(succ);
      }
    }
  }

  // Handle any nodes not reached (isolated nodes with edges filtered out)
  for (const id of nodeIds) {
    if (!layerMap.has(id)) {
      layerMap.set(id, 0);
    }
  }

  // Enforce explicit layer constraints after longest-path assignment.
  for (const node of nodes) {
    if (node.layerConstraint === "first") {
      layerMap.set(node.id, 0);
    }
  }

  let maxUnconstrainedLayer = 0;
  for (const node of nodes) {
    if (node.layerConstraint === "last") continue;
    const layer = layerMap.get(node.id) ?? 0;
    if (layer > maxUnconstrainedLayer) {
      maxUnconstrainedLayer = layer;
    }
  }

  for (const node of nodes) {
    if (node.layerConstraint === "last") {
      const existingLayer = layerMap.get(node.id) ?? 0;
      layerMap.set(node.id, Math.max(existingLayer, maxUnconstrainedLayer + 1));
    }
  }

  return layerMap;
}
