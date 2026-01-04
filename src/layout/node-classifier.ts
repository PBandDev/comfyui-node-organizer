import type { LGraph, LLink, ClassifiedNodes } from "./types";
import { debugLog } from "../index";

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
 * Classify nodes into connected, disconnected, and reroutes
 *
 * - connected: nodes with at least one link
 * - disconnected: nodes with no links (annotations, bookmarks, etc.)
 * - reroutes: nodes with type "Reroute" (handled separately for chain collapse)
 */
export function classifyNodes(graph: LGraph): ClassifiedNodes {
  const hasLinks = new Set<number>();

  // Mark all nodes that appear in any link
  if (graph.links) {
    for (const link of iterateLinks(graph.links)) {
      if (typeof link.origin_id === "number") {
        hasLinks.add(link.origin_id);
      }
      if (typeof link.target_id === "number") {
        hasLinks.add(link.target_id);
      }
    }
  }

  const connected = new Set<number>();
  const disconnected = new Set<number>();
  const reroutes = new Set<number>();

  const nodes = graph._nodes ?? [];
  for (const node of nodes) {
    if (!node || node.id === undefined) continue;

    const nodeType = node.type ?? "";

    // Check if this is a reroute node
    // Common reroute types: "Reroute", "Reroute (rgthree)", etc.
    const isReroute = nodeType === "Reroute" || nodeType.startsWith("Reroute ");

    if (isReroute) {
      reroutes.add(node.id);
      // Reroutes are also tracked as connected if they have links
      if (hasLinks.has(node.id)) {
        connected.add(node.id);
      }
    } else if (hasLinks.has(node.id)) {
      connected.add(node.id);
    } else {
      disconnected.add(node.id);
    }
  }

  debugLog(
    `Classified: ${connected.size} connected, ${disconnected.size} disconnected, ${reroutes.size} reroutes`
  );

  return { connected, disconnected, reroutes };
}
