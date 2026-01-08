import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type {
  LGraph,
  LGraphNode,
  LGraphGroup,
  LLink,
} from "../src/layout/types";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Raw ComfyUI workflow JSON structure */
interface WorkflowJSON {
  nodes: Array<{
    id: number;
    type: string;
    title?: string;
    pos: [number, number];
    size: [number, number];
    flags?: { pinned?: boolean; collapsed?: boolean };
    locked?: boolean;
    order?: number;
    inputs?: Array<{ name: string; type: string; link: number | null }>;
    outputs?: Array<{ name: string; type: string; links: number[] | null }>;
  }>;
  links: Array<[number, number, number, number, number, string]>;
  groups?: Array<{
    id?: number;
    title: string;
    bounding: [number, number, number, number];
    color?: string;
    font_size?: number;
    flags?: Record<string, unknown>;
  }>;
  definitions?: {
    subgraphs?: SubgraphDefinition[];
  };
}

/** Subgraph definition from workflow JSON */
interface SubgraphDefinition {
  id: string;
  name: string;
  inputNode?: { id: number; bounding: [number, number, number, number] };
  outputNode?: { id: number; bounding: [number, number, number, number] };
  nodes: Array<{
    id: number;
    type: string;
    title?: string;
    pos: [number, number];
    size: [number, number];
    flags?: { pinned?: boolean; collapsed?: boolean };
    locked?: boolean;
    order?: number;
    inputs?: Array<{ name: string; type: string; link: number | null }>;
    outputs?: Array<{ name: string; type: string; links: number[] | null }>;
  }>;
  groups?: Array<{
    id?: number;
    title: string;
    bounding: [number, number, number, number];
    color?: string;
    font_size?: number;
    flags?: Record<string, unknown>;
  }>;
  links: Array<{
    id: number;
    origin_id: number;
    origin_slot: number;
    target_id: number;
    target_slot: number;
    type: string;
  }>;
}

/**
 * Load a workflow fixture and convert to LGraph format
 */
export function loadFixture(filename: string): LGraph {
  const fixturePath = join(__dirname, "fixtures", filename);
  const json = JSON.parse(readFileSync(fixturePath, "utf-8")) as WorkflowJSON;
  return convertWorkflowToLGraph(json);
}

/**
 * Load a subgraph fixture (extracts first subgraph from workflow JSON)
 * Returns LGraph with inputNode/outputNode in runtime format (pos/size)
 */
export function loadSubgraphFixture(filename: string): LGraph {
  const fixturePath = join(__dirname, "fixtures", filename);
  const json = JSON.parse(readFileSync(fixturePath, "utf-8")) as WorkflowJSON;

  const subgraph = json.definitions?.subgraphs?.[0];
  if (!subgraph) {
    throw new Error(`No subgraph found in ${filename}`);
  }

  return convertSubgraphToLGraph(subgraph);
}

/**
 * Convert subgraph definition to LGraph format with I/O nodes
 */
function convertSubgraphToLGraph(subgraph: SubgraphDefinition): LGraph {
  // Convert nodes
  const nodes: LGraphNode[] = subgraph.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title ?? n.type,
    pos: [...n.pos],
    size: [...n.size],
    inputs:
      n.inputs?.map((i) => ({
        name: i.name,
        type: i.type,
        link: i.link,
      })) ?? [],
    outputs:
      n.outputs?.map((o) => ({
        name: o.name,
        type: o.type,
        links: o.links ? [...o.links] : null,
      })) ?? [],
    flags: n.flags ? { ...n.flags } : undefined,
    locked: n.locked,
    order: n.order,
  }));

  // Convert links from object array format to Map
  const links = new Map<number, LLink>();
  for (const link of subgraph.links) {
    links.set(link.id, {
      id: link.id,
      origin_id: link.origin_id,
      origin_slot: link.origin_slot,
      target_id: link.target_id,
      target_slot: link.target_slot,
      type: link.type,
    });
  }

  // Convert groups
  const groups: LGraphGroup[] = (subgraph.groups ?? []).map((g, idx) => ({
    id: g.id ?? idx,
    title: g.title,
    pos: [g.bounding[0], g.bounding[1]],
    size: [g.bounding[2], g.bounding[3]],
  }));

  // Create graph with I/O nodes in runtime format (pos/size from bounding)
  const graph: LGraph = {
    _nodes: nodes,
    _groups: groups,
    links,
  };

  if (subgraph.inputNode) {
    const [x, y, w, h] = subgraph.inputNode.bounding;
    graph.inputNode = {
      id: subgraph.inputNode.id,
      pos: [x, y],
      size: [w, h],
    };
  }

  if (subgraph.outputNode) {
    const [x, y, w, h] = subgraph.outputNode.bounding;
    graph.outputNode = {
      id: subgraph.outputNode.id,
      pos: [x, y],
      size: [w, h],
    };
  }

  return graph;
}

/**
 * Convert ComfyUI workflow JSON to LGraph format for layout algorithm
 */
export function convertWorkflowToLGraph(workflow: WorkflowJSON): LGraph {
  // Convert nodes
  const nodes: LGraphNode[] = workflow.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title ?? n.type,
    pos: [...n.pos],
    size: [...n.size],
    inputs:
      n.inputs?.map((i) => ({
        name: i.name,
        type: i.type,
        link: i.link,
      })) ?? [],
    outputs:
      n.outputs?.map((o) => ({
        name: o.name,
        type: o.type,
        links: o.links ? [...o.links] : null,
      })) ?? [],
    flags: n.flags ? { ...n.flags } : undefined,
    locked: n.locked,
    order: n.order,
  }));

  // Convert links: [linkId, originId, originSlot, targetId, targetSlot, type]
  const links = new Map<number, LLink>();
  for (const [
    linkId,
    originId,
    originSlot,
    targetId,
    targetSlot,
    type,
  ] of workflow.links) {
    links.set(linkId, {
      id: linkId,
      origin_id: originId,
      origin_slot: originSlot,
      target_id: targetId,
      target_slot: targetSlot,
      type,
    });
  }

  // Convert groups
  const groups: LGraphGroup[] = (workflow.groups ?? []).map((g, idx) => ({
    id: g.id ?? idx,
    title: g.title,
    pos: [g.bounding[0], g.bounding[1]],
    size: [g.bounding[2], g.bounding[3]],
  }));

  return {
    _nodes: nodes,
    _groups: groups,
    links,
  };
}

/**
 * Capture current positions of all nodes, groups, and I/O nodes for comparison
 */
export function capturePositions(
  graph: LGraph
): Map<string, { x: number; y: number; width: number; height: number }> {
  const positions = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >();

  for (const node of graph._nodes) {
    positions.set(`node_${node.id}`, {
      x: node.pos[0],
      y: node.pos[1],
      width: node.size[0],
      height: node.size[1],
    });
  }

  for (const group of graph._groups) {
    positions.set(`group_${group.id}`, {
      x: group.pos[0],
      y: group.pos[1],
      width: group.size[0],
      height: group.size[1],
    });
  }

  // Capture I/O node positions if present
  if (graph.inputNode?.pos && graph.inputNode?.size) {
    positions.set(`io_${graph.inputNode.id}`, {
      x: graph.inputNode.pos[0],
      y: graph.inputNode.pos[1],
      width: graph.inputNode.size[0],
      height: graph.inputNode.size[1],
    });
  }
  if (graph.outputNode?.pos && graph.outputNode?.size) {
    positions.set(`io_${graph.outputNode.id}`, {
      x: graph.outputNode.pos[0],
      y: graph.outputNode.pos[1],
      width: graph.outputNode.size[0],
      height: graph.outputNode.size[1],
    });
  }

  return positions;
}

/**
 * Get links as an iterable array
 */
function getLinksArray(links: LGraph["links"]): LLink[] {
  if (links instanceof Map) {
    return Array.from(links.values());
  }
  if (Array.isArray(links)) {
    return links;
  }
  return Object.values(links);
}

/**
 * Deep clone a graph for idempotency testing
 * Preserves I/O nodes if present
 */
export function cloneGraph(graph: LGraph): LGraph {
  const linksArr = getLinksArray(graph.links);

  const cloned = convertWorkflowToLGraph({
    nodes: graph._nodes.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      pos: [...n.pos],
      size: [...n.size],
      flags: n.flags ? { ...n.flags } : undefined,
      locked: n.locked,
      order: n.order,
      inputs: n.inputs?.map((i) => ({ ...i })),
      outputs: n.outputs?.map((o) => ({
        ...o,
        links: o.links ? [...o.links] : null,
      })),
    })),
    links: linksArr.map((l) => [
      l.id,
      l.origin_id,
      l.origin_slot,
      l.target_id,
      l.target_slot,
      l.type,
    ]),
    groups: graph._groups.map((g) => ({
      id: g.id,
      title: g.title,
      bounding: [g.pos[0], g.pos[1], g.size[0], g.size[1]],
    })),
  });

  // Preserve I/O nodes if present
  if (graph.inputNode) {
    cloned.inputNode = {
      id: graph.inputNode.id,
      pos: [...graph.inputNode.pos],
      size: [...graph.inputNode.size],
    };
  }

  if (graph.outputNode) {
    cloned.outputNode = {
      id: graph.outputNode.id,
      pos: [...graph.outputNode.pos],
      size: [...graph.outputNode.size],
    };
  }

  return cloned;
}
