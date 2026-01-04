import type { LayoutState, LayoutNode, Layer } from "./types";

/**
 * Assign layers to nodes using longest-path algorithm
 * Sources (no predecessors) get layer 0
 * Each node gets max(predecessor layers) + 1
 */
export function assignLayers(state: LayoutState): void {
  const { nodes } = state;

  // Topological sort via Kahn's algorithm
  const inDegree = new Map<number, number>();
  const queue: number[] = [];
  const order: number[] = [];

  // Initialize in-degrees
  for (const [id, node] of nodes) {
    inDegree.set(id, node.predecessors.length);
    if (node.predecessors.length === 0) {
      queue.push(id);
    }
  }

  // Process nodes in topological order
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    order.push(nodeId);

    const node = nodes.get(nodeId)!;
    for (const succId of node.successors) {
      const deg = (inDegree.get(succId) ?? 1) - 1;
      inDegree.set(succId, deg);
      if (deg === 0) {
        queue.push(succId);
      }
    }
  }

  // Handle cycles: add remaining nodes (shouldn't happen in valid DAG)
  for (const [id] of nodes) {
    if (!order.includes(id)) {
      order.push(id);
    }
  }

  // Assign layers via longest path from sources
  for (const nodeId of order) {
    const node = nodes.get(nodeId)!;

    if (node.predecessors.length === 0) {
      // Source node: layer 0
      node.layer = 0;
    } else {
      // Max layer of predecessors + 1
      let maxPredLayer = 0;
      for (const predId of node.predecessors) {
        const pred = nodes.get(predId);
        if (pred && pred.layer >= 0) {
          maxPredLayer = Math.max(maxPredLayer, pred.layer + 1);
        }
      }
      node.layer = maxPredLayer;
    }
  }

  // Ensure all nodes have valid layer (handle edge cases)
  for (const node of nodes.values()) {
    if (node.layer < 0) {
      node.layer = 0;
    }
  }

  // Build layer structures
  const layerMap = new Map<number, LayoutNode[]>();
  for (const node of nodes.values()) {
    const arr = layerMap.get(node.layer) ?? [];
    arr.push(node);
    layerMap.set(node.layer, arr);
  }

  // Sort layers by index and create Layer objects
  const sortedLayerIndices = [...layerMap.keys()].sort((a, b) => a - b);
  const layers: Layer[] = [];

  for (const index of sortedLayerIndices) {
    const layerNodes = layerMap.get(index)!;
    // Sort nodes in layer by ID for initial deterministic order
    layerNodes.sort((a, b) => a.id - b.id);
    layerNodes.forEach((n, i) => {
      n.orderInLayer = i;
    });

    layers.push({
      index,
      nodes: layerNodes,
      x: 0,
      maxWidth: Math.max(...layerNodes.map((n) => n.width), 100),
    });
  }

  state.layers = layers;
}
