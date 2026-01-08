/**
 * Minimal type definitions for ComfyUI/LiteGraph
 * These match the runtime global objects, not the package exports
 */

/** Point as [x, y] */
export type Point = [x: number, y: number];

/** Size as [width, height] */
export type Size = [width: number, height: number];

/** Node input slot */
export interface NodeInputSlot {
  name: string;
  type: string;
  link: number | null;
}

/** Node output slot */
export interface NodeOutputSlot {
  name: string;
  type: string;
  links: number[] | null;
}

/** Node flags */
export interface NodeFlags {
  pinned?: boolean;
  collapsed?: boolean;
}

/** LiteGraph Node */
export interface LGraphNode {
  id: number;
  type: string;
  title: string;
  pos: Point;
  size: Size;
  inputs: NodeInputSlot[];
  outputs: NodeOutputSlot[];
  flags?: NodeFlags;
  locked?: boolean;
  order?: number;
}

/** LiteGraph Group */
export interface LGraphGroup {
  id: number;
  title: string;
  pos: Point;
  size: Size;
  _nodes?: LGraphNode[];
  _children?: Set<{ id: number }>;
  _bounding?: {
    x: number;
    y: number;
    width: number;
    height: number;
    set?: (x: number, y: number, w: number, h: number) => void;
  };
  resizeTo?: (items: Iterable<LGraphNode>, padding?: number) => void;
}

/** LiteGraph Link */
export interface LLink {
  id: number;
  origin_id: number;
  origin_slot: number;
  target_id: number;
  target_slot: number;
  type: string;
}

/** Subgraph I/O node (runtime format with pos/size like regular nodes) */
export interface SubgraphIONode {
  id: number;
  pos: [number, number];
  size: [number, number];
}

/** LiteGraph Graph (or Subgraph with I/O nodes) */
export interface LGraph {
  _nodes: LGraphNode[];
  _groups: LGraphGroup[];
  /** Links can be Map, Record, or Array depending on context */
  links: Map<number, LLink> | Record<number, LLink> | LLink[];
  setDirtyCanvas?: (fg: boolean, bg: boolean) => void;
  /** Subgraph input node (only on Subgraph, not root LGraph) */
  inputNode?: SubgraphIONode;
  /** Subgraph output node (only on Subgraph, not root LGraph) */
  outputNode?: SubgraphIONode;
}

/** Layout node with computed metadata */
export interface LayoutNode {
  /** Reference to ComfyUI node */
  node: LGraphNode;
  /** Node ID */
  id: number;
  /** DAG depth (0 = sources/inputs) */
  layer: number;
  /** Vertical position within layer */
  orderInLayer: number;
  /** Node IDs this depends on (predecessors) */
  predecessors: number[];
  /** Node IDs that depend on this (successors) */
  successors: number[];
  /** Node width (or group width if representative) */
  width: number;
  /** Node height (or group height if representative) */
  height: number;
  /** Computed X coordinate */
  x: number;
  /** Computed Y coordinate */
  y: number;
  /** True if this node represents a group in the layout */
  isGroupRepresentative?: boolean;
  /** The group this node represents (if isGroupRepresentative) */
  group?: LayoutGroup;
  /** True if this is a subgraph I/O node (input or output boundary) */
  isSubgraphIO?: boolean;
  /** Reference to runtime I/O node for position updates (has pos/size) */
  runtimeIONode?: { id: number; pos: [number, number]; size: [number, number] };
}

/** Layer = vertical column of nodes */
export interface Layer {
  /** Layer index (0 = leftmost) */
  index: number;
  /** Nodes in this layer */
  nodes: LayoutNode[];
  /** Computed X position for this layer */
  x: number;
  /** Max node width in this layer */
  maxWidth: number;
}

/** Layout group tracking with hierarchy support */
export interface LayoutGroup {
  /** Reference to ComfyUI group */
  group: LGraphGroup;
  /** Node IDs directly contained (not in child groups) */
  memberIds: Set<number>;
  /** Child groups (nested inside this group) */
  childGroups: LayoutGroup[];
  /** Parent group (group containing this one), null for top-level */
  parentGroup: LayoutGroup | null;
  /** Nesting depth (0 = top-level) */
  depth: number;
  /** Calculated width for the group */
  width: number;
  /** Calculated height for the group */
  height: number;
}

/** Layout configuration */
export interface LayoutConfig {
  /** Horizontal gap between layers */
  horizontalGap: number;
  /** Vertical gap between nodes in same layer */
  verticalGap: number;
  /** Padding inside groups */
  groupPadding: number;
  /** Layout origin X */
  startX: number;
  /** Layout origin Y */
  startY: number;
  /** Max barycenter iterations */
  maxIterations: number;
  /** Max columns per layer (0=auto, 1=disabled/vertical stack, 2+=fixed) */
  maxColumns: number;
  /** Max row width before new row when maxColumns=0 */
  maxRowWidth: number;
  /** Collapse reroute chains into edge waypoints */
  collapseReroutes: boolean;
  /** Gap between disconnected zone and DAG */
  disconnectedGap: number;
}

/** Default configuration */
export const DEFAULT_CONFIG: LayoutConfig = {
  horizontalGap: 100,
  verticalGap: 40,
  groupPadding: 30,
  startX: 100,
  startY: 100,
  maxIterations: 24,
  maxColumns: 0,
  maxRowWidth: 800,
  collapseReroutes: true,
  disconnectedGap: 150,
};

/** Node classification result */
export interface ClassifiedNodes {
  /** Nodes with connections (participate in DAG) */
  connected: Set<number>;
  /** Nodes without any connections */
  disconnected: Set<number>;
  /** Reroute nodes (for special handling) */
  reroutes: Set<number>;
}

/** Reroute chain for collapse/restore */
export interface RerouteChain {
  /** Reroute node IDs in order */
  nodes: number[];
  /** Source node before chain */
  sourceNode: number;
  /** Source slot index */
  sourceSlot: number;
  /** Target nodes after chain */
  targets: Array<{ node: number; slot: number }>;
}

/** Packed row within a layer (for bin packing) */
export interface PackedRow {
  /** Node IDs in this row */
  nodes: number[];
  /** Max node height in row */
  height: number;
  /** Vertical offset from layer start */
  yOffset: number;
  /** Total width of nodes + gaps in row */
  width: number;
}

/** Graph layout state */
export interface LayoutState {
  /** All layout nodes by ID (includes group representatives) */
  nodes: Map<number, LayoutNode>;
  /** Layers of nodes */
  layers: Layer[];
  /** Groups */
  groups: LayoutGroup[];
  /** Config */
  config: LayoutConfig;
  /** Maps node ID to its group (if any) */
  nodeToGroup?: Map<number, LayoutGroup>;
  /** Maps group to its representative node ID */
  groupRepresentatives?: Map<LayoutGroup, number>;
  /** All original ComfyUI nodes by ID */
  allNodes?: Map<number, LGraphNode>;
  /** Groups organized by depth (index 0 = deepest) for bottom-up processing */
  groupsByDepth?: LayoutGroup[][];
  /** Disconnected node IDs (placed in separate zone) */
  disconnectedNodes?: Set<number>;
  /** Collapsed reroute chains (restored after layout) */
  rerouteChains?: RerouteChain[];
  /** Packed rows per layer (for bin-packed layout) */
  packedRows?: Map<number, PackedRow[]>;
}

/** Layout result */
export interface LayoutResult {
  /** Number of nodes processed */
  nodeCount: number;
  /** Number of layers */
  layerCount: number;
  /** Number of groups resized */
  groupCount: number;
  /** Execution time in ms */
  executionMs: number;
}
