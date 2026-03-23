/**
 * Compaction utilities — post-processing to remove gaps.
 * All functions are pure: they return new maps, never mutate inputs.
 */

import type { Position, LayoutNode } from "./types";

/**
 * Remove vertical gaps between nodes by shifting them up.
 * Nodes are processed in Y order; each is shifted to the earliest available Y.
 */
export function compactVertically(
  positions: ReadonlyMap<string, Position>,
  nodes: ReadonlyArray<LayoutNode>,
  gap: number,
): ReadonlyMap<string, Position> {
  if (nodes.length === 0) return new Map<string, Position>();

  // Build lookup for node dimensions
  const nodeMap = new Map<string, LayoutNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  // Sort node IDs by their current Y position, breaking ties by X
  const sortedIds = [...positions.keys()]
    .filter((id) => nodeMap.has(id))
    .sort((a, b) => {
      const pa = positions.get(a)!;
      const pb = positions.get(b)!;
      if (pa.y !== pb.y) return pa.y - pb.y;
      return pa.x - pb.x;
    });

  const result = new Map<string, Position>(positions);
  let nextY = sortedIds.length > 0 ? positions.get(sortedIds[0])!.y : 0;

  for (const id of sortedIds) {
    const pos = positions.get(id)!;
    const node = nodeMap.get(id)!;
    const newY = Math.min(pos.y, nextY);
    result.set(id, { x: pos.x, y: newY });
    nextY = newY + node.height + gap;
  }

  return result;
}

/**
 * Remove horizontal gaps between nodes by shifting them left.
 * Nodes are processed in X order; each is shifted to the earliest available X.
 */
export function compactHorizontally(
  positions: ReadonlyMap<string, Position>,
  nodes: ReadonlyArray<LayoutNode>,
  gap: number,
): ReadonlyMap<string, Position> {
  if (nodes.length === 0) return new Map<string, Position>();

  // Build lookup for node dimensions
  const nodeMap = new Map<string, LayoutNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  // Sort node IDs by their current X position, breaking ties by Y
  const sortedIds = [...positions.keys()]
    .filter((id) => nodeMap.has(id))
    .sort((a, b) => {
      const pa = positions.get(a)!;
      const pb = positions.get(b)!;
      if (pa.x !== pb.x) return pa.x - pb.x;
      return pa.y - pb.y;
    });

  const result = new Map<string, Position>(positions);
  let nextX = sortedIds.length > 0 ? positions.get(sortedIds[0])!.x : 0;

  for (const id of sortedIds) {
    const pos = positions.get(id)!;
    const node = nodeMap.get(id)!;
    const newX = Math.min(pos.x, nextX);
    result.set(id, { x: newX, y: pos.y });
    nextX = newX + node.width + gap;
  }

  return result;
}
