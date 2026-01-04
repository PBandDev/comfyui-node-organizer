import type { LGraph, LLink, RerouteChain } from "./types";
import { debugLog } from "../index";

/** Link info for chain detection */
interface LinkInfo {
  linkId: number;
  originId: number;
  originSlot: number;
  targetId: number;
  targetSlot: number;
}

/**
 * Iterate over links in a graph (handles Map, Record, and Array formats)
 */
function* iterateLinks(
  links: Map<number, LLink> | Record<number, LLink> | LLink[]
): Generator<LLink> {
  if (links instanceof Map) {
    for (const link of links.values()) {
      if (link) yield link;
    }
  } else if (Array.isArray(links)) {
    for (const link of links) {
      if (link) yield link;
    }
  } else {
    for (const link of Object.values(links)) {
      if (link) yield link;
    }
  }
}

/**
 * Find reroute chains in the graph
 *
 * A chain is a sequence of reroute nodes connected linearly:
 * Source -> Reroute1 -> Reroute2 -> ... -> Target(s)
 *
 * Returns chains that can be collapsed into virtual edges
 */
export function findRerouteChains(
  graph: LGraph,
  reroutes: Set<number>
): RerouteChain[] {
  if (!graph.links || reroutes.size === 0) return [];

  // Build link info maps
  // incomingLinks: target -> [links pointing to it]
  // outgoingLinks: origin -> [links from it]
  const incomingLinks = new Map<number, LinkInfo[]>();
  const outgoingLinks = new Map<number, LinkInfo[]>();

  for (const link of iterateLinks(graph.links)) {
    if (!link || typeof link.origin_id !== "number" || typeof link.target_id !== "number") {
      continue;
    }

    const info: LinkInfo = {
      linkId: link.id,
      originId: link.origin_id,
      originSlot: link.origin_slot,
      targetId: link.target_id,
      targetSlot: link.target_slot,
    };

    if (!incomingLinks.has(link.target_id)) {
      incomingLinks.set(link.target_id, []);
    }
    incomingLinks.get(link.target_id)!.push(info);

    if (!outgoingLinks.has(link.origin_id)) {
      outgoingLinks.set(link.origin_id, []);
    }
    outgoingLinks.get(link.origin_id)!.push(info);
  }

  // Find chain starts: reroutes that are fed by a non-reroute
  const visitedReroutes = new Set<number>();
  const chains: RerouteChain[] = [];

  for (const rerouteId of reroutes) {
    if (visitedReroutes.has(rerouteId)) continue;

    const incoming = incomingLinks.get(rerouteId) ?? [];

    // Find non-reroute sources feeding this reroute
    for (const link of incoming) {
      if (reroutes.has(link.originId)) {
        // Source is also a reroute, this isn't a chain start
        continue;
      }

      // Found a chain start: non-reroute -> reroute
      const chain = traceRerouteChain(
        rerouteId,
        link.originId,
        link.originSlot,
        reroutes,
        outgoingLinks,
        visitedReroutes
      );

      if (chain.nodes.length > 0) {
        chains.push(chain);
      }
    }
  }

  debugLog(`Found ${chains.length} reroute chains`);

  return chains;
}

/**
 * Trace a reroute chain from start to end
 */
function traceRerouteChain(
  startRerouteId: number,
  sourceNode: number,
  sourceSlot: number,
  reroutes: Set<number>,
  outgoingLinks: Map<number, LinkInfo[]>,
  visitedReroutes: Set<number>
): RerouteChain {
  const chainNodes: number[] = [];
  const targets: Array<{ node: number; slot: number }> = [];

  let currentId = startRerouteId;

  while (reroutes.has(currentId) && !visitedReroutes.has(currentId)) {
    visitedReroutes.add(currentId);
    chainNodes.push(currentId);

    const outgoing = outgoingLinks.get(currentId) ?? [];

    if (outgoing.length === 0) {
      // Dead end reroute (no outgoing connections)
      break;
    }

    // Check where the reroute goes
    let nextReroute: number | null = null;

    for (const link of outgoing) {
      if (reroutes.has(link.targetId) && !visitedReroutes.has(link.targetId)) {
        // Continues to another reroute
        nextReroute = link.targetId;
      } else if (!reroutes.has(link.targetId)) {
        // Goes to a non-reroute target
        targets.push({
          node: link.targetId,
          slot: link.targetSlot,
        });
      }
    }

    if (nextReroute !== null) {
      currentId = nextReroute;
    } else {
      // Chain ends here
      break;
    }
  }

  return {
    nodes: chainNodes,
    sourceNode,
    sourceSlot,
    targets,
  };
}

/**
 * Create virtual edges that bypass reroute chains
 *
 * For layout purposes, we replace:
 *   Source -> Reroute1 -> Reroute2 -> Target
 * With:
 *   Source -> Target (virtual edge)
 *
 * @returns Map of source node to target nodes (for DAG building)
 */
export function getVirtualEdges(
  chains: RerouteChain[]
): Map<number, Set<number>> {
  const virtualEdges = new Map<number, Set<number>>();

  for (const chain of chains) {
    if (!virtualEdges.has(chain.sourceNode)) {
      virtualEdges.set(chain.sourceNode, new Set());
    }

    for (const target of chain.targets) {
      virtualEdges.get(chain.sourceNode)!.add(target.node);
    }
  }

  return virtualEdges;
}

/**
 * Position reroute nodes along their chain edges after layout
 *
 * Distributes reroutes evenly between source and target positions
 */
export function restoreReroutePositions(
  chains: RerouteChain[],
  positions: Map<number, { x: number; y: number }>,
  sizes: Map<number, { width: number; height: number }>
): void {
  for (const chain of chains) {
    if (chain.nodes.length === 0 || chain.targets.length === 0) continue;

    const sourcePos = positions.get(chain.sourceNode);
    const sourceSize = sizes.get(chain.sourceNode);
    if (!sourcePos || !sourceSize) continue;

    // Calculate average target position
    let avgTargetX = 0;
    let avgTargetY = 0;
    let validTargets = 0;

    for (const target of chain.targets) {
      const targetPos = positions.get(target.node);
      if (targetPos) {
        avgTargetX += targetPos.x;
        avgTargetY += targetPos.y;
        validTargets++;
      }
    }

    if (validTargets === 0) continue;

    avgTargetX /= validTargets;
    avgTargetY /= validTargets;

    // Source output position (right side of node)
    const startX = sourcePos.x + sourceSize.width;
    const startY = sourcePos.y + sourceSize.height / 2;

    // Target input position
    const endX = avgTargetX;
    const endY = avgTargetY;

    // Distribute reroutes evenly along the path
    const count = chain.nodes.length;
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1);
      const rerouteId = chain.nodes[i];

      // Linear interpolation
      const x = startX + (endX - startX) * t;
      const y = startY + (endY - startY) * t;

      // Center the reroute (typical reroute size: 90x26)
      const rerouteSize = sizes.get(rerouteId) ?? { width: 90, height: 26 };
      positions.set(rerouteId, {
        x: x - rerouteSize.width / 2,
        y: y - rerouteSize.height / 2,
      });
    }
  }
}

/**
 * Get all reroute node IDs from chains (for filtering from main layout)
 */
export function getRerouteNodeIds(chains: RerouteChain[]): Set<number> {
  const ids = new Set<number>();
  for (const chain of chains) {
    for (const nodeId of chain.nodes) {
      ids.add(nodeId);
    }
  }
  return ids;
}
