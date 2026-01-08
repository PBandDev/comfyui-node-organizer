import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { LGraph, LGraphNode, LGraphGroup, LLink } from "../src/layout/types";

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
 * Convert ComfyUI workflow JSON to LGraph format for layout algorithm
 */
export function convertWorkflowToLGraph(workflow: WorkflowJSON): LGraph {
  // Convert nodes
  const nodes: LGraphNode[] = workflow.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title ?? n.type,
    pos: [...n.pos] as [number, number],
    size: [...n.size] as [number, number],
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
  for (const [linkId, originId, originSlot, targetId, targetSlot, type] of workflow.links) {
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
    pos: [g.bounding[0], g.bounding[1]] as [number, number],
    size: [g.bounding[2], g.bounding[3]] as [number, number],
  }));

  return {
    _nodes: nodes,
    _groups: groups,
    links,
  };
}

/**
 * Capture current positions of all nodes and groups for comparison
 */
export function capturePositions(
  graph: LGraph
): Map<string, { x: number; y: number; width: number; height: number }> {
  const positions = new Map<string, { x: number; y: number; width: number; height: number }>();

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

  return positions;
}

/**
 * Deep clone a graph for idempotency testing
 */
export function cloneGraph(graph: LGraph): LGraph {
  return convertWorkflowToLGraph({
    nodes: graph._nodes.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      pos: [...n.pos] as [number, number],
      size: [...n.size] as [number, number],
      flags: n.flags ? { ...n.flags } : undefined,
      locked: n.locked,
      order: n.order,
      inputs: n.inputs?.map((i) => ({ ...i })),
      outputs: n.outputs?.map((o) => ({ ...o, links: o.links ? [...o.links] : null })),
    })),
    links: Array.from(graph.links.values()).map((l) => [
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
      bounding: [g.pos[0], g.pos[1], g.size[0], g.size[1]] as [number, number, number, number],
    })),
  });
}
