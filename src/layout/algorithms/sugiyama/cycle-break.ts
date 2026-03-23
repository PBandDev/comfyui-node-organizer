/**
 * Greedy cycle removal via feedback arc set.
 *
 * Produces an acyclic edge set by reversing the minimum number of edges
 * needed to break all cycles. Uses the Berger-Shor greedy heuristic:
 * repeatedly extract sinks, sources, then the node with max (out - in).
 */

import type { LayoutNode, LayoutEdge } from "../../types";

export interface CycleBreakResult {
  readonly edges: ReadonlyArray<LayoutEdge>;
  readonly reversedEdges: ReadonlySet<string>;
}

/**
 * Break cycles in the edge set by reversing backward edges.
 * Returns a new edge array (with some edges flipped) + the set of
 * original "source->target" keys that were reversed.
 */
export function breakCycles(
  nodes: ReadonlyArray<LayoutNode>,
  edges: ReadonlyArray<LayoutEdge>,
): CycleBreakResult {
  if (nodes.length === 0 || edges.length === 0) {
    return { edges, reversedEdges: new Set<string>() };
  }

  const nodeIds = new Set(nodes.map((n) => n.id));

  // Filter edges to only those connecting known nodes
  const validEdges = edges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
  );

  // Build mutable adjacency structures
  const outNeighbors = new Map<string, Set<string>>();
  const inNeighbors = new Map<string, Set<string>>();

  for (const id of nodeIds) {
    outNeighbors.set(id, new Set<string>());
    inNeighbors.set(id, new Set<string>());
  }

  for (const e of validEdges) {
    outNeighbors.get(e.source)!.add(e.target);
    inNeighbors.get(e.target)!.add(e.source);
  }

  // Greedy ordering: sinks to the right, sources to the left
  const remaining = new Set(nodeIds);
  const leftOrder: string[] = [];
  const rightOrder: string[] = [];

  while (remaining.size > 0) {
    // Remove all sinks (out-degree 0 in remaining subgraph)
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of remaining) {
        const outDeg = countInSubgraph(outNeighbors.get(id)!, remaining);
        if (outDeg === 0) {
          rightOrder.push(id);
          remaining.delete(id);
          changed = true;
        }
      }
    }

    // Remove all sources (in-degree 0 in remaining subgraph)
    changed = true;
    while (changed) {
      changed = false;
      for (const id of remaining) {
        const inDeg = countInSubgraph(inNeighbors.get(id)!, remaining);
        if (inDeg === 0) {
          leftOrder.push(id);
          remaining.delete(id);
          changed = true;
        }
      }
    }

    // If stuck, pick node with max (out - in) in remaining subgraph
    if (remaining.size > 0) {
      let best: string | undefined;
      let bestDelta = -Infinity;
      for (const id of remaining) {
        const outDeg = countInSubgraph(outNeighbors.get(id)!, remaining);
        const inDeg = countInSubgraph(inNeighbors.get(id)!, remaining);
        const delta = outDeg - inDeg;
        if (delta > bestDelta || (delta === bestDelta && (best === undefined || id < best))) {
          bestDelta = delta;
          best = id;
        }
      }
      if (best !== undefined) {
        leftOrder.push(best);
        remaining.delete(best);
      }
    }
  }

  // Final ordering: left order + reversed right order
  rightOrder.reverse();
  const finalOrder = [...leftOrder, ...rightOrder];

  // Build position map
  const positionOf = new Map<string, number>();
  for (let i = 0; i < finalOrder.length; i++) {
    positionOf.set(finalOrder[i], i);
  }

  // An edge is "backward" if source appears AFTER target in the order
  const reversedEdges = new Set<string>();
  const resultEdges: LayoutEdge[] = [];

  for (const e of validEdges) {
    const srcPos = positionOf.get(e.source)!;
    const tgtPos = positionOf.get(e.target)!;

    if (srcPos > tgtPos) {
      // Backward edge — reverse it
      reversedEdges.add(`${e.source}->${e.target}`);
      resultEdges.push({ source: e.target, target: e.source });
    } else {
      resultEdges.push(e);
    }
  }

  return { edges: resultEdges, reversedEdges };
}

/** Count how many members of `neighbors` are in `subgraph`. */
function countInSubgraph(neighbors: Set<string>, subgraph: Set<string>): number {
  let count = 0;
  for (const n of neighbors) {
    if (subgraph.has(n)) count++;
  }
  return count;
}
