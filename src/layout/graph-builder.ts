import type {
  LGraph,
  LGraphNode,
  LGraphGroup,
  LayoutNode,
  LayoutGroup,
  LayoutState,
  LayoutConfig,
  RerouteChain,
} from "./types";
import { DEFAULT_CONFIG } from "./types";
import { classifyNodes } from "./node-classifier";
import { findRerouteChains, getRerouteNodeIds, getVirtualEdges } from "./reroute-collapse";
import { debugLog } from "../index";

/**
 * Runtime subgraph I/O node (has pos/size like regular nodes, not bounding)
 */
interface RuntimeIONode {
  id: number;
  pos: [number, number];
  size: [number, number];
}

/**
 * Check if an object looks like a subgraph I/O node at runtime
 * Runtime has pos/size (not bounding like JSON export)
 */
function isValidIONode(obj: unknown): obj is RuntimeIONode {
  if (!obj || typeof obj !== "object") return false;
  const candidate = obj as Record<string, unknown>;
  // Must have numeric id
  if (typeof candidate.id !== "number") return false;
  // Use duck typing - pos/size may be getters returning array-like objects
  const pos = candidate.pos as [number, number] | undefined;
  const size = candidate.size as [number, number] | undefined;
  if (!pos || typeof pos[0] !== "number" || typeof pos[1] !== "number") return false;
  if (!size || typeof size[0] !== "number" || typeof size[1] !== "number") return false;
  return true;
}

/**
 * Convert runtime I/O node to LGraphNode-like object for layout
 */
function ioNodeToLGraphNode(ioNode: RuntimeIONode, type: "input" | "output"): LGraphNode {
  return {
    id: ioNode.id,
    type: `subgraph_${type}`,
    title: type === "input" ? "Input" : "Output",
    pos: [ioNode.pos[0], ioNode.pos[1]],
    size: [ioNode.size[0], ioNode.size[1]],
    inputs: [],
    outputs: [],
  };
}

/** Title bar height for groups */
const GROUP_TITLE_HEIGHT = 50;

/**
 * Check if outer group's bounds fully contain inner group's bounds
 */
function groupContainsGroup(outer: LGraphGroup, inner: LGraphGroup): boolean {
  const ox = outer.pos[0];
  const oy = outer.pos[1];
  const ow = outer.size[0];
  const oh = outer.size[1];

  const ix = inner.pos[0];
  const iy = inner.pos[1];
  const iw = inner.size[0];
  const ih = inner.size[1];

  // Inner's bounds must be fully within outer's bounds
  return ix >= ox && iy >= oy && ix + iw <= ox + ow && iy + ih <= oy + oh;
}

/**
 * Build parent-child hierarchy for groups based on bounds containment
 * Assigns parentGroup, childGroups, and depth to each LayoutGroup
 */
function buildGroupHierarchy(layoutGroups: LayoutGroup[]): void {
  // For each group, find its parent (smallest containing group)
  for (const inner of layoutGroups) {
    let bestParent: LayoutGroup | null = null;
    let bestArea = Infinity;

    for (const outer of layoutGroups) {
      if (outer === inner) continue;
      if (groupContainsGroup(outer.group, inner.group)) {
        const area = outer.group.size[0] * outer.group.size[1];
        if (area < bestArea) {
          bestArea = area;
          bestParent = outer;
        }
      }
    }

    inner.parentGroup = bestParent;
    if (bestParent) {
      bestParent.childGroups.push(inner);
    }
  }

  // Calculate depths using BFS from roots
  const roots = layoutGroups.filter((g) => !g.parentGroup);
  const queue: Array<{ group: LayoutGroup; depth: number }> = roots.map(
    (g) => ({ group: g, depth: 0 })
  );

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const { group, depth } = item;
    group.depth = depth;
    for (const child of group.childGroups) {
      queue.push({ group: child, depth: depth + 1 });
    }
  }
}

/**
 * Check if a node's origin is inside a group's content area
 */
function nodeInsideGroup(node: LGraphNode, group: LGraphGroup): boolean {
  const gx = group.pos[0];
  const gy = group.pos[1] + GROUP_TITLE_HEIGHT;
  const gw = group.size[0];
  const gh = group.size[1] - GROUP_TITLE_HEIGHT;

  const nx = node.pos?.[0] ?? 0;
  const ny = node.pos?.[1] ?? 0;

  return nx >= gx && nx < gx + gw && ny >= gy && ny < gy + gh;
}

/**
 * Build layout graph from ComfyUI graph
 * Groups are treated as "mega-nodes" with full hierarchy support
 */
export function buildLayoutGraph(
  graph: LGraph,
  config: Partial<LayoutConfig> = {}
): LayoutState {
  const fullConfig: LayoutConfig = { ...DEFAULT_CONFIG, ...config };
  const nodes = new Map<number, LayoutNode>();
  const groups: LayoutGroup[] = [];

  // First pass: Extract all nodes
  const graphNodes = graph._nodes ?? [];
  const allNodes = new Map<number, LGraphNode>();

  for (const node of graphNodes) {
    if (!node || node.id === undefined) continue;
    allNodes.set(node.id, node);
  }

  // Track subgraph I/O nodes separately (they need special position handling)
  // Runtime I/O nodes have pos/size like regular nodes
  const ioNodes = new Map<number, RuntimeIONode>();

  // Check for subgraph I/O nodes (Subgraph extends LGraph)
  const graphAny = graph as unknown as Record<string, unknown>;
  if (isValidIONode(graphAny.inputNode)) {
    const inputNode = graphAny.inputNode as RuntimeIONode;
    const inputLGraphNode = ioNodeToLGraphNode(inputNode, "input");
    allNodes.set(inputNode.id, inputLGraphNode);
    ioNodes.set(inputNode.id, inputNode);
    debugLog(`Found subgraph input node id=${inputNode.id} at [${inputNode.pos}]`);
  }
  if (isValidIONode(graphAny.outputNode)) {
    const outputNode = graphAny.outputNode as RuntimeIONode;
    const outputLGraphNode = ioNodeToLGraphNode(outputNode, "output");
    allNodes.set(outputNode.id, outputLGraphNode);
    ioNodes.set(outputNode.id, outputNode);
    debugLog(`Found subgraph output node id=${outputNode.id} at [${outputNode.pos}]`);
  }

  // Classify nodes into connected/disconnected/reroutes
  const classified = classifyNodes(graph);
  const disconnectedNodes = classified.disconnected;

  // Find and collapse reroute chains if enabled
  let rerouteChains: RerouteChain[] = [];
  let collapsedRerouteIds = new Set<number>();

  if (fullConfig.collapseReroutes && classified.reroutes.size > 0) {
    rerouteChains = findRerouteChains(graph, classified.reroutes);
    collapsedRerouteIds = getRerouteNodeIds(rerouteChains);
  }

  // Second pass: Create LayoutGroup objects (without hierarchy yet)
  const graphGroups = graph._groups ?? [];

  for (const group of graphGroups) {
    if (!group || !group.pos || !group.size) continue;

    const layoutGroup: LayoutGroup = {
      group,
      memberIds: new Set<number>(),
      childGroups: [],
      parentGroup: null,
      depth: 0,
      width: 0,
      height: 0,
    };

    groups.push(layoutGroup);
  }

  // Third pass: Build group hierarchy (parent-child relationships)
  buildGroupHierarchy(groups);

  // Fourth pass: Assign nodes to their INNERMOST containing group
  // A node belongs only to the deepest group that contains it
  const nodeToGroup = new Map<number, LayoutGroup>();

  for (const [nodeId, node] of allNodes) {
    let bestGroup: LayoutGroup | null = null;
    let maxDepth = -1;

    for (const layoutGroup of groups) {
      if (nodeInsideGroup(node, layoutGroup.group)) {
        if (layoutGroup.depth > maxDepth) {
          maxDepth = layoutGroup.depth;
          bestGroup = layoutGroup;
        }
      }
    }

    if (bestGroup) {
      bestGroup.memberIds.add(nodeId);
      nodeToGroup.set(nodeId, bestGroup);
    }
  }

  // Log group membership
  for (const layoutGroup of groups) {
    const parentInfo = layoutGroup.parentGroup
      ? ` (inside "${layoutGroup.parentGroup.group.title}")`
      : "";
    debugLog(
      `Group "${layoutGroup.group.title}": ${layoutGroup.memberIds.size} direct members, ${layoutGroup.childGroups.length} child groups${parentInfo}`
    );
  }

  // Fifth pass: Calculate group sizes bottom-up (deepest first)
  // Build groupsByDepth array for bottom-up processing
  const maxDepth = Math.max(0, ...groups.map((g) => g.depth));
  const groupsByDepth: LayoutGroup[][] = [];

  for (let d = 0; d <= maxDepth; d++) {
    groupsByDepth.push(groups.filter((g) => g.depth === d));
  }

  // Process from deepest to shallowest
  for (let depth = maxDepth; depth >= 0; depth--) {
    for (const layoutGroup of groupsByDepth[depth]) {
      let totalWidth = 0;
      let totalHeight = 0;

      // Use bounding box of member positions (more accurate than summing heights)
      let minY = Infinity;
      let maxY = -Infinity;
      let hasMembers = false;

      for (const nodeId of layoutGroup.memberIds) {
        const node = allNodes.get(nodeId);
        if (!node) continue;
        hasMembers = true;
        const w = node.size?.[0] ?? 200;
        const h = node.size?.[1] ?? 100;
        const ny = node.pos?.[1] ?? 0;
        totalWidth = Math.max(totalWidth, w);
        minY = Math.min(minY, ny);
        maxY = Math.max(maxY, ny + h);
      }

      if (hasMembers && minY !== Infinity) {
        totalHeight = maxY - minY;
      }

      // Include child groups (already calculated in previous iterations)
      // Child groups add to height below members
      let childGroupsHeight = 0;
      for (const child of layoutGroup.childGroups) {
        totalWidth = Math.max(totalWidth, child.width);
        childGroupsHeight += child.height + fullConfig.verticalGap;
      }
      totalHeight += childGroupsHeight;

      // Add padding and title
      layoutGroup.width = totalWidth + fullConfig.groupPadding * 2;
      layoutGroup.height =
        totalHeight + fullConfig.groupPadding * 2 + GROUP_TITLE_HEIGHT;
    }
  }

  // Sixth pass: Create LayoutNodes
  // - Standalone connected nodes become regular layout nodes
  // - Top-level groups get a representative node
  // - Nested groups are handled internally by their parent
  // - Disconnected nodes and collapsed reroutes are EXCLUDED (placed separately later)
  const groupRepresentatives = new Map<LayoutGroup, number>();

  for (const [id, node] of allNodes) {
    // Skip disconnected nodes - they'll be placed in a separate zone
    if (disconnectedNodes.has(id)) {
      continue;
    }

    // Skip collapsed reroute nodes - they'll be restored after layout
    if (collapsedRerouteIds.has(id)) {
      continue;
    }

    const group = nodeToGroup.get(id);

    if (group) {
      // This node is in a group
      // Only create representative for top-level groups
      const topLevelGroup = getTopLevelGroup(group);

      if (!groupRepresentatives.has(topLevelGroup)) {
        // First member becomes the representative for the top-level group
        groupRepresentatives.set(topLevelGroup, id);

        // Create layout node with TOP-LEVEL GROUP dimensions
        nodes.set(id, {
          node,
          id,
          layer: -1,
          orderInLayer: 0,
          predecessors: [],
          successors: [],
          width: topLevelGroup.width,
          height: topLevelGroup.height,
          x: 0,
          y: 0,
          isGroupRepresentative: true,
          group: topLevelGroup,
        });
      }
      // Skip non-representative group members - they'll be positioned relative to group
    } else {
      // Standalone node (or I/O node)
      const runtimeIONode = ioNodes.get(id);
      nodes.set(id, {
        node,
        id,
        layer: -1,
        orderInLayer: 0,
        predecessors: [],
        successors: [],
        width: node.size?.[0] ?? 200,
        height: node.size?.[1] ?? 100,
        x: 0,
        y: 0,
        isSubgraphIO: runtimeIONode !== undefined,
        runtimeIONode,
      });
    }
  }

  // Seventh pass: Build adjacency from links
  // For group members, redirect connections to the top-level group representative
  // Skip links involving collapsed reroutes (handled via virtual edges)
  const links = graph.links;
  if (links) {
    // Handle different link storage formats:
    // - Map<number, LLink> (newer ComfyUI)
    // - Record<number, LLink> (object with numeric keys)
    // - LLink[] (array, common in subgraphs)
    let linkEntries: Iterable<[number, { origin_id: number; target_id: number } | null]>;

    if (links instanceof Map) {
      linkEntries = links.entries();
    } else if (Array.isArray(links)) {
      // Array of link objects (subgraph format)
      linkEntries = links.map((link, i) => [i, link] as const);
    } else {
      // Object with numeric keys
      linkEntries = Object.entries(links).map(([k, v]) => [Number(k), v] as const);
    }

    for (const [, link] of linkEntries) {
      if (!link || typeof link !== "object") continue;
      if (typeof link.origin_id !== "number" || typeof link.target_id !== "number") continue;

      let sourceId = link.origin_id;
      let targetId = link.target_id;

      // Skip links involving collapsed reroutes (handled via virtual edges)
      if (collapsedRerouteIds.has(sourceId) || collapsedRerouteIds.has(targetId)) {
        continue;
      }

      // Redirect group members to their top-level group representative
      const sourceGroup = nodeToGroup.get(sourceId);
      const targetGroup = nodeToGroup.get(targetId);

      if (sourceGroup) {
        const topLevel = getTopLevelGroup(sourceGroup);
        sourceId = groupRepresentatives.get(topLevel)!;
      }
      if (targetGroup) {
        const topLevel = getTopLevelGroup(targetGroup);
        targetId = groupRepresentatives.get(topLevel)!;
      }

      // Skip internal group connections (within same top-level group)
      if (sourceGroup && targetGroup) {
        const sourceTop = getTopLevelGroup(sourceGroup);
        const targetTop = getTopLevelGroup(targetGroup);
        if (sourceTop === targetTop) {
          continue;
        }
      }

      const sourceNode = nodes.get(sourceId);
      const targetNode = nodes.get(targetId);

      if (sourceNode && targetNode) {
        if (!sourceNode.successors.includes(targetId)) {
          sourceNode.successors.push(targetId);
        }
        if (!targetNode.predecessors.includes(sourceId)) {
          targetNode.predecessors.push(sourceId);
        }
      }
    }
  }

  // Eighth pass: Add virtual edges from collapsed reroute chains
  if (rerouteChains.length > 0) {
    const virtualEdges = getVirtualEdges(rerouteChains);

    for (const [sourceId, targetIds] of virtualEdges) {
      // Handle group redirection for source
      const sourceGroup = nodeToGroup.get(sourceId);
      let effectiveSourceId = sourceId;
      if (sourceGroup) {
        const topLevel = getTopLevelGroup(sourceGroup);
        effectiveSourceId = groupRepresentatives.get(topLevel)!;
      }

      const sourceNode = nodes.get(effectiveSourceId);
      if (!sourceNode) continue;

      for (const targetId of targetIds) {
        // Handle group redirection for target
        const targetGroup = nodeToGroup.get(targetId);
        let effectiveTargetId = targetId;
        if (targetGroup) {
          const topLevel = getTopLevelGroup(targetGroup);
          effectiveTargetId = groupRepresentatives.get(topLevel)!;
        }

        const targetNode = nodes.get(effectiveTargetId);
        if (!targetNode) continue;

        // Skip if same group
        if (sourceGroup && targetGroup) {
          const sourceTop = getTopLevelGroup(sourceGroup);
          const targetTop = getTopLevelGroup(targetGroup);
          if (sourceTop === targetTop) continue;
        }

        if (!sourceNode.successors.includes(effectiveTargetId)) {
          sourceNode.successors.push(effectiveTargetId);
        }
        if (!targetNode.predecessors.includes(effectiveSourceId)) {
          targetNode.predecessors.push(effectiveSourceId);
        }
      }
    }
  }

  return {
    nodes,
    layers: [],
    groups,
    config: fullConfig,
    nodeToGroup,
    groupRepresentatives,
    allNodes,
    groupsByDepth,
    disconnectedNodes,
    rerouteChains,
  };
}

/**
 * Get the top-level group (root of hierarchy) for a given group
 */
function getTopLevelGroup(group: LayoutGroup): LayoutGroup {
  let current = group;
  while (current.parentGroup) {
    current = current.parentGroup;
  }
  return current;
}
