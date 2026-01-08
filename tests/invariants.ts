import { expect } from "vitest";
import type { LGraph, LGraphNode, LGraphGroup, LLink } from "../src/layout/types";
import { capturePositions, cloneGraph } from "./helpers";
import { layoutGraph } from "../src/layout/index";

/** Bounding box for collision detection */
interface BoundingBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Check if two bounding boxes overlap (AABB collision)
 * Uses a small gap tolerance to avoid false positives from floating point
 */
function boxesOverlap(a: BoundingBox, b: BoundingBox, gap = 0): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

/**
 * Get all entities (nodes, groups, and I/O nodes) as bounding boxes
 */
function getAllEntities(graph: LGraph): BoundingBox[] {
  const entities: BoundingBox[] = [];

  for (const node of graph._nodes) {
    entities.push({
      id: `node_${node.id}`,
      x: node.pos[0],
      y: node.pos[1],
      width: node.size[0],
      height: node.size[1],
    });
  }

  for (const group of graph._groups) {
    entities.push({
      id: `group_${group.id}`,
      x: group.pos[0],
      y: group.pos[1],
      width: group.size[0],
      height: group.size[1],
    });
  }

  // Include subgraph I/O nodes if present (runtime format: pos/size)
  const graphAny = graph as Record<string, unknown>;
  if (graphAny.inputNode && typeof graphAny.inputNode === "object") {
    const io = graphAny.inputNode as { id: number; pos: [number, number]; size: [number, number] };
    if (io.pos && io.size) {
      entities.push({
        id: `io_${io.id}`,
        x: io.pos[0],
        y: io.pos[1],
        width: io.size[0],
        height: io.size[1],
      });
    }
  }
  if (graphAny.outputNode && typeof graphAny.outputNode === "object") {
    const io = graphAny.outputNode as { id: number; pos: [number, number]; size: [number, number] };
    if (io.pos && io.size) {
      entities.push({
        id: `io_${io.id}`,
        x: io.pos[0],
        y: io.pos[1],
        width: io.size[0],
        height: io.size[1],
      });
    }
  }

  return entities;
}

/**
 * Determine which nodes are inside which groups based on position
 */
function getNodesInsideGroups(graph: LGraph): Map<number, LGraphGroup> {
  const nodeToGroup = new Map<number, LGraphGroup>();

  for (const node of graph._nodes) {
    const nodeX = node.pos[0];
    const nodeY = node.pos[1];
    const nodeRight = nodeX + node.size[0];
    const nodeBottom = nodeY + node.size[1];

    // Find the smallest group that contains this node
    let bestGroup: LGraphGroup | undefined;
    let bestArea = Infinity;

    for (const group of graph._groups) {
      const groupX = group.pos[0];
      const groupY = group.pos[1];
      const groupRight = groupX + group.size[0];
      const groupBottom = groupY + group.size[1];

      // Check if node is inside group bounds
      if (
        nodeX >= groupX &&
        nodeY >= groupY &&
        nodeRight <= groupRight &&
        nodeBottom <= groupBottom
      ) {
        const area = group.size[0] * group.size[1];
        if (area < bestArea) {
          bestArea = area;
          bestGroup = group;
        }
      }
    }

    if (bestGroup) {
      nodeToGroup.set(node.id, bestGroup);
    }
  }

  return nodeToGroup;
}

/**
 * Check if a node bounding box is fully inside a group bounding box
 */
function isNodeInsideGroup(node: BoundingBox, group: BoundingBox): boolean {
  return (
    node.x >= group.x &&
    node.y >= group.y &&
    node.x + node.width <= group.x + group.width &&
    node.y + node.height <= group.y + group.height
  );
}

/**
 * Assert no two standalone entities overlap
 * Nodes inside groups are excluded from overlap checks with their containing groups
 * (including parent groups in nested group hierarchies)
 */
export function assertNoOverlaps(graph: LGraph): void {
  const entities = getAllEntities(graph);
  const overlaps: string[] = [];

  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i];
      const b = entities[j];

      // Skip node-vs-group overlap if node is fully inside that group
      // This handles nested groups: a node inside inner group is also inside outer group
      if (a.id.startsWith("node_") && b.id.startsWith("group_")) {
        if (isNodeInsideGroup(a, b)) continue;
      }
      if (b.id.startsWith("node_") && a.id.startsWith("group_")) {
        if (isNodeInsideGroup(b, a)) continue;
      }

      // Skip group-vs-group overlap if one contains the other (nested groups)
      if (a.id.startsWith("group_") && b.id.startsWith("group_")) {
        // Check if one fully contains the other
        const aContainsB =
          a.x <= b.x &&
          a.y <= b.y &&
          a.x + a.width >= b.x + b.width &&
          a.y + a.height >= b.y + b.height;
        const bContainsA =
          b.x <= a.x &&
          b.y <= a.y &&
          b.x + b.width >= a.x + a.width &&
          b.y + b.height >= a.y + a.height;
        if (aContainsB || bContainsA) continue;
      }

      if (boxesOverlap(a, b)) {
        overlaps.push(`${a.id} overlaps ${b.id}`);
      }
    }
  }

  expect(overlaps, `Found ${overlaps.length} overlapping entities`).toEqual([]);
}

/**
 * Assert all nodes that were inside groups remain inside their groups
 * This catches bug 0008 where nodes ended up outside their groups
 */
export function assertNodesInsideGroups(graph: LGraph): void {
  const errors: string[] = [];

  for (const group of graph._groups) {
    const groupX = group.pos[0];
    const groupY = group.pos[1];
    const groupRight = groupX + group.size[0];
    const groupBottom = groupY + group.size[1];

    // Find nodes that should be inside this group (based on current containment)
    for (const node of graph._nodes) {
      const nodeX = node.pos[0];
      const nodeY = node.pos[1];
      const nodeRight = nodeX + node.size[0];
      const nodeBottom = nodeY + node.size[1];

      // Check if node center is inside group
      const nodeCenterX = nodeX + node.size[0] / 2;
      const nodeCenterY = nodeY + node.size[1] / 2;

      if (
        nodeCenterX >= groupX &&
        nodeCenterX <= groupRight &&
        nodeCenterY >= groupY &&
        nodeCenterY <= groupBottom
      ) {
        // Node center is inside group - verify entire node fits
        if (nodeX < groupX || nodeY < groupY || nodeRight > groupRight || nodeBottom > groupBottom) {
          errors.push(
            `Node ${node.id} (${node.title}) extends outside group "${group.title}": ` +
              `node [${nodeX}, ${nodeY}, ${nodeRight}, ${nodeBottom}] vs group [${groupX}, ${groupY}, ${groupRight}, ${groupBottom}]`
          );
        }
      }
    }
  }

  expect(errors, `Found ${errors.length} nodes outside their groups`).toEqual([]);
}

/**
 * Assert all coordinates are finite numbers
 * Note: Negative coordinates are allowed since some workflows may position nodes above/left of origin
 * This catches NaN and Infinity bugs
 */
export function assertFiniteCoordinates(graph: LGraph): void {
  const errors: string[] = [];

  for (const node of graph._nodes) {
    if (!Number.isFinite(node.pos[0]) || !Number.isFinite(node.pos[1])) {
      errors.push(`Node ${node.id} has non-finite position: [${node.pos[0]}, ${node.pos[1]}]`);
    }
  }

  for (const group of graph._groups) {
    if (!Number.isFinite(group.pos[0]) || !Number.isFinite(group.pos[1])) {
      errors.push(`Group ${group.id} has non-finite position: [${group.pos[0]}, ${group.pos[1]}]`);
    }
    if (!Number.isFinite(group.size[0]) || !Number.isFinite(group.size[1])) {
      errors.push(`Group ${group.id} has non-finite size: [${group.size[0]}, ${group.size[1]}]`);
    }
  }

  // Check subgraph I/O nodes if present
  const graphAny = graph as Record<string, unknown>;
  for (const key of ["inputNode", "outputNode"]) {
    const ioNode = graphAny[key] as { id: number; pos: [number, number] } | undefined;
    if (ioNode?.pos) {
      if (!Number.isFinite(ioNode.pos[0]) || !Number.isFinite(ioNode.pos[1])) {
        errors.push(`I/O node ${ioNode.id} has non-finite position: [${ioNode.pos[0]}, ${ioNode.pos[1]}]`);
      }
    }
  }

  expect(errors, `Found ${errors.length} invalid coordinates`).toEqual([]);
}

/**
 * Assert topological order is preserved: if A→B link exists, A must be positioned left of B
 * This catches fundamental DAG ordering bugs
 */
export function assertTopologicalOrder(graph: LGraph): void {
  const errors: string[] = [];
  const nodeMap = new Map<number, LGraphNode>();

  for (const node of graph._nodes) {
    nodeMap.set(node.id, node);
  }

  // Check each link
  const links = graph.links instanceof Map ? graph.links.values() : Object.values(graph.links);

  for (const link of links) {
    const sourceNode = nodeMap.get(link.origin_id);
    const targetNode = nodeMap.get(link.target_id);

    if (!sourceNode || !targetNode) continue;

    // Skip reroute nodes (they're positioned along edges)
    if (sourceNode.type === "Reroute" || targetNode.type === "Reroute") continue;

    // Source should be left of target (or at same X if in same layer)
    const sourceRight = sourceNode.pos[0] + sourceNode.size[0];
    if (sourceRight > targetNode.pos[0] + targetNode.size[0]) {
      errors.push(
        `Link ${link.id}: source node ${sourceNode.id} (${sourceNode.title}) at X=${sourceNode.pos[0]} ` +
          `is right of target node ${targetNode.id} (${targetNode.title}) at X=${targetNode.pos[0]}`
      );
    }
  }

  expect(errors, `Found ${errors.length} topological order violations`).toEqual([]);
}

/**
 * Assert layout is idempotent: running twice produces same positions
 * This catches oscillation bugs like 0011
 */
export function assertIdempotent(graph: LGraph): void {
  // Capture positions after first layout (already run by caller)
  const positions1 = capturePositions(graph);

  // Run layout again
  layoutGraph(graph);

  // Capture positions after second layout
  const positions2 = capturePositions(graph);

  // Compare
  const differences: string[] = [];

  for (const [id, pos1] of positions1) {
    const pos2 = positions2.get(id);
    if (!pos2) {
      differences.push(`${id} missing after second layout`);
      continue;
    }

    // Allow small movements (up to 5 pixels) due to rounding in group resize/centering
    const tolerance = 5;
    if (
      Math.abs(pos1.x - pos2.x) > tolerance ||
      Math.abs(pos1.y - pos2.y) > tolerance
    ) {
      differences.push(
        `${id} moved: [${pos1.x.toFixed(1)}, ${pos1.y.toFixed(1)}] → [${pos2.x.toFixed(1)}, ${pos2.y.toFixed(1)}]`
      );
    }
  }

  expect(differences, `Layout is not idempotent: ${differences.length} entities moved`).toEqual([]);
}

/**
 * Assert that nodes which were inside groups before layout remain inside their groups after
 * This catches regressions where layout breaks group containment
 * Must be called with graph state BEFORE and AFTER layout
 */
export function assertGroupMembershipPreserved(
  originalGraph: LGraph,
  layoutGraph: LGraph
): void {
  const errors: string[] = [];

  // Get which nodes were inside which groups BEFORE layout
  const beforeMembership = getNodesInsideGroups(originalGraph);

  // For each node that was in a group, verify it's still in that group after layout
  for (const [nodeId, originalGroup] of beforeMembership) {
    const node = layoutGraph._nodes.find((n) => n.id === nodeId);
    const group = layoutGraph._groups.find((g) => g.id === originalGroup.id);

    if (!node || !group) continue;

    // Check if node is still fully inside the group
    const nodeRight = node.pos[0] + node.size[0];
    const nodeBottom = node.pos[1] + node.size[1];
    const groupRight = group.pos[0] + group.size[0];
    const groupBottom = group.pos[1] + group.size[1];

    if (
      node.pos[0] < group.pos[0] ||
      node.pos[1] < group.pos[1] ||
      nodeRight > groupRight ||
      nodeBottom > groupBottom
    ) {
      errors.push(
        `Node ${nodeId} (${node.title}) was in group "${originalGroup.title}" but is now outside: ` +
          `node [${node.pos[0].toFixed(0)}, ${node.pos[1].toFixed(0)}] vs group [${group.pos[0].toFixed(0)}, ${group.pos[1].toFixed(0)}, ${group.size[0].toFixed(0)}, ${group.size[1].toFixed(0)}]`
      );
    }
  }

  expect(
    errors,
    `Found ${errors.length} nodes that moved outside their original groups`
  ).toEqual([]);
}
