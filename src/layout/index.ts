import type { LGraph, LayoutConfig, LayoutResult } from "./types";
import { DEFAULT_CONFIG } from "./types";
import { buildLayoutGraph } from "./graph-builder";
import { assignLayers } from "./layer-assign";
import { minimizeCrossings } from "./ordering";
import {
  assignLayerXPositions,
  assignNodeYPositions,
  recalculateLayerXPositions,
  applyPositions,
  compactVertically,
  resolveAllOverlaps,
} from "./positioning";
import { resizeGroupsToFit } from "./groups";
import { debugLog } from "../debug";

/**
 * Main entry point: layout the entire graph
 *
 * Pipeline:
 * 1. Build layout graph (classify nodes, collapse reroutes, filter disconnected)
 * 2. Assign layers via longest-path algorithm
 * 3. Minimize edge crossings via size-aware barycenter heuristic
 * 4. Assign X/Y coordinates with bin packing
 * 5. Compact vertically to reduce gaps
 * 6. Apply positions (includes disconnected zone and reroute restoration)
 * 7. Resize groups to fit their members
 */
export function layoutGraph(
  graph: LGraph,
  config?: Partial<LayoutConfig>
): LayoutResult {
  const startTime = performance.now();
  const fullConfig: LayoutConfig = { ...DEFAULT_CONFIG, ...config };

  // Handle empty graph
  const nodeList = graph._nodes ?? [];
  if (nodeList.length === 0) {
    return {
      nodeCount: 0,
      layerCount: 0,
      groupCount: 0,
      executionMs: 0,
    };
  }

  // Phase 1: Build layout graph (includes classification and reroute collapse)
  const state = buildLayoutGraph(graph, fullConfig);

  // Phase 2: Assign layers
  assignLayers(state);

  // Phase 3: Minimize crossings (size-aware barycenter)
  minimizeCrossings(state);

  // Phase 4: Assign coordinates (with bin packing)
  assignLayerXPositions(state);
  assignNodeYPositions(state);

  // Phase 4b: Recalculate X after bin packing updates maxWidth
  // (bin packing may place multiple nodes in a row, making layer wider)
  recalculateLayerXPositions(state);

  // Phase 5: Compact vertically
  compactVertically(state);

  // Phase 6: Apply to ComfyUI nodes (includes disconnected and reroute handling)
  applyPositions(state);

  // Phase 7: Resize groups
  const groupCount = resizeGroupsToFit(state);

  // Phase 8: Resolve all overlaps (groups + nodes unified)
  // Uses scanline algorithm with priority-based monotonic pushing
  resolveAllOverlaps(state);

  // Trigger canvas redraw
  if (graph.setDirtyCanvas) {
    graph.setDirtyCanvas(true, true);
  }

  const executionMs = performance.now() - startTime;

  // Count total nodes including disconnected and reroutes
  const disconnectedCount = state.disconnectedNodes?.size ?? 0;
  const rerouteCount = state.rerouteChains?.reduce((sum, c) => sum + c.nodes.length, 0) ?? 0;
  const totalNodes = state.nodes.size + disconnectedCount + rerouteCount;

  debugLog(
    `Layout complete: ${totalNodes} nodes (${state.nodes.size} in DAG, ${disconnectedCount} disconnected, ${rerouteCount} reroutes), ${state.layers.length} layers in ${executionMs.toFixed(1)}ms`
  );

  return {
    nodeCount: totalNodes,
    layerCount: state.layers.length,
    groupCount,
    executionMs,
  };
}

// Re-export types and config
export type { LayoutConfig, LayoutResult, SelectedGroupLayoutResult } from "./types";
export { DEFAULT_CONFIG } from "./types";

// Export selected groups layout
export { layoutSelectedGroups } from "./selected-groups";
