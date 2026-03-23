/**
 * Sugiyama layered DAG layout algorithm.
 *
 * Implements the classic 4-phase approach:
 * 1. Cycle breaking (greedy feedback arc set)
 * 2. Layer assignment (longest-path)
 * 3. Crossing minimization (barycenter heuristic)
 * 4. Coordinate assignment (stacked + centered)
 *
 * All steps are pure functions — no side effects, deterministic output.
 */

import type {
  LayoutAlgorithm,
  LayoutInput,
  LayoutOutput,
  LayoutNode,
} from "../types";
import { breakCycles } from "./sugiyama/cycle-break";
import { assignLayers } from "./sugiyama/layer-assign";
import { minimizeCrossings } from "./sugiyama/crossing-minimize";
import { assignCoordinates } from "./sugiyama/coordinate-assign";

export interface SugiyamaConfig {
  readonly horizontalGap: number;
  readonly verticalGap: number;
  readonly maxIterations: number;
}

export const DEFAULT_SUGIYAMA_CONFIG: SugiyamaConfig = {
  horizontalGap: 100,
  verticalGap: 40,
  maxIterations: 24,
};

/**
 * Create a Sugiyama layout algorithm instance.
 * The returned object implements LayoutAlgorithm and can be passed to
 * the layout framework.
 */
export function createSugiyamaAlgorithm(
  config?: Partial<SugiyamaConfig>,
): LayoutAlgorithm {
  const cfg: SugiyamaConfig = { ...DEFAULT_SUGIYAMA_CONFIG, ...config };

  return {
    name: "sugiyama",

    layout(input: LayoutInput): LayoutOutput {
      const { nodes, edges } = input;

      if (nodes.length === 0) {
        return { positions: new Map() };
      }

      // Build node lookup
      const nodeMap = new Map<string, LayoutNode>();
      for (const n of nodes) {
        nodeMap.set(n.id, n);
      }

      // Phase 1: Break cycles
      const { edges: acyclicEdges } = breakCycles(nodes, edges);

      // Phase 2: Assign layers (longest-path)
      const layerMap = assignLayers(nodes, acyclicEdges);

      // Build layer arrays from the map
      const layerArrays = buildLayerArrays(layerMap, nodes);

      // Phase 3: Minimize crossings (barycenter heuristic)
      const orderedLayers = minimizeCrossings(
        layerArrays,
        acyclicEdges,
        nodeMap,
        cfg.maxIterations,
      );

      // Phase 4: Assign coordinates
      const positions = assignCoordinates(orderedLayers, nodeMap, {
        horizontalGap: cfg.horizontalGap,
        verticalGap: cfg.verticalGap,
      });

      return { positions };
    },
  };
}

/**
 * Convert a layer map (node -> layer index) into an array of arrays,
 * preserving original node order within each layer for determinism.
 */
function buildLayerArrays(
  layerMap: ReadonlyMap<string, number>,
  nodes: ReadonlyArray<LayoutNode>,
): ReadonlyArray<ReadonlyArray<string>> {
  // Find max layer
  let maxLayer = 0;
  for (const layer of layerMap.values()) {
    if (layer > maxLayer) maxLayer = layer;
  }

  // Build arrays preserving input order within each layer
  const layers: string[][] = [];
  for (let i = 0; i <= maxLayer; i++) {
    layers.push([]);
  }

  for (const n of nodes) {
    const layer = layerMap.get(n.id);
    if (layer !== undefined) {
      layers[layer].push(n.id);
    }
  }

  return layers;
}
