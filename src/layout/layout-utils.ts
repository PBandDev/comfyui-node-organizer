import type { LGraphNode } from "./types";

/**
 * Get internal edges between group members by examining node connections
 * Returns array of [sourceId, targetId] pairs where both are in the group
 */
export function getInternalEdges(
  memberIds: Set<number>,
  allNodes: Map<number, LGraphNode>
): Array<[number, number]> {
  const edges: Array<[number, number]> = [];

  // Build a map of linkId -> sourceNodeId for all member outputs
  const linkToSource = new Map<number, number>();
  for (const memberId of memberIds) {
    const node = allNodes.get(memberId);
    if (!node?.outputs) continue;

    for (const output of node.outputs) {
      if (output.links) {
        for (const linkId of output.links) {
          linkToSource.set(linkId, memberId);
        }
      }
    }
  }

  // Check each member's inputs to find internal connections
  for (const memberId of memberIds) {
    const node = allNodes.get(memberId);
    if (!node?.inputs) continue;

    for (const input of node.inputs) {
      if (input.link !== null && input.link !== undefined) {
        const sourceId = linkToSource.get(input.link);
        if (sourceId !== undefined && memberIds.has(sourceId)) {
          edges.push([sourceId, memberId]);
        }
      }
    }
  }

  return edges;
}

/**
 * Assign layers to group members using longest-path algorithm
 * Returns members grouped by layer (index 0 = sources)
 */
export function assignMemberLayers(
  memberIds: Set<number>,
  edges: Array<[number, number]>,
  allNodes: Map<number, LGraphNode>
): LGraphNode[][] {
  // Build adjacency and in-degree
  const successors = new Map<number, number[]>();
  const inDegree = new Map<number, number>();

  for (const id of memberIds) {
    successors.set(id, []);
    inDegree.set(id, 0);
  }

  for (const [source, target] of edges) {
    successors.get(source)!.push(target);
    inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
  }

  // Longest-path layer assignment via topological sort
  const nodeLayer = new Map<number, number>();
  const queue: number[] = [];

  // Start with sources (in-degree 0)
  for (const id of memberIds) {
    if ((inDegree.get(id) ?? 0) === 0) {
      queue.push(id);
      nodeLayer.set(id, 0);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLayer = nodeLayer.get(current) ?? 0;

    for (const succ of successors.get(current) ?? []) {
      // Update successor layer to max of current paths
      const succLayer = nodeLayer.get(succ) ?? 0;
      nodeLayer.set(succ, Math.max(succLayer, currentLayer + 1));

      // Decrease in-degree and add to queue when all predecessors processed
      const newInDegree = (inDegree.get(succ) ?? 1) - 1;
      inDegree.set(succ, newInDegree);
      if (newInDegree === 0) {
        queue.push(succ);
      }
    }
  }

  // Handle any unvisited nodes (cycles or disconnected)
  for (const id of memberIds) {
    if (!nodeLayer.has(id)) {
      nodeLayer.set(id, 0);
    }
  }

  // Group by layer
  const maxLayer = Math.max(...nodeLayer.values(), 0);
  const layers: LGraphNode[][] = Array.from({ length: maxLayer + 1 }, () => []);

  for (const id of memberIds) {
    const node = allNodes.get(id);
    if (node) {
      const layer = nodeLayer.get(id) ?? 0;
      layers[layer].push(node);
    }
  }

  return layers;
}
