/**
 * Pure layout types — no ComfyUI/LGraph dependencies.
 * These are the abstract types for the layout framework.
 */

/** Position as a simple object */
export interface Position {
  readonly x: number;
  readonly y: number;
}

/** A node to be laid out — just an ID and dimensions */
export interface LayoutNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly kind?: "node" | "subgraph-input" | "subgraph-output";
  readonly layerConstraint?: "first" | "last";
}

/** A directed edge between nodes */
export interface LayoutEdge {
  readonly source: string;
  readonly target: string;
}

/** Token parsed from group title like [HORIZONTAL], [2ROW], etc. */
export interface LayoutToken {
  readonly mode: "horizontal" | "vertical" | "grid";
  readonly count?: number;
  readonly dimension?: "row" | "col";
}

/** A group of nodes, possibly with nested child groups */
export interface LayoutGroup {
  readonly id: string;
  readonly title: string;
  readonly memberIds: ReadonlyArray<string>;
  readonly childGroupIds: ReadonlyArray<string>;
  readonly token?: LayoutToken;
}

/** Input to a layout algorithm — one level of the hierarchy */
export interface LayoutInput {
  readonly nodes: ReadonlyArray<LayoutNode>;
  readonly edges: ReadonlyArray<LayoutEdge>;
}

/** Output from a layout algorithm — position map */
export interface LayoutOutput {
  readonly positions: ReadonlyMap<string, Position>;
}

/** The pluggable algorithm interface */
export interface LayoutAlgorithm {
  readonly name: string;
  layout(input: LayoutInput): LayoutOutput;
}

/** Group bounds after layout (position + size) */
export interface GroupBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Full result from the framework (after group recursion) */
export interface FrameworkResult {
  readonly positions: ReadonlyMap<string, Position>;
  readonly groupBounds: ReadonlyMap<string, GroupBounds>;
}

/** Configuration for the framework */
export interface FrameworkConfig {
  readonly horizontalGap: number;
  readonly verticalGap: number;
  readonly groupPadding: number;
  readonly groupTitleHeight: number;
  readonly disconnectedGap: number;
}

/** Default config */
export const DEFAULT_FRAMEWORK_CONFIG: FrameworkConfig = {
  horizontalGap: 100,
  verticalGap: 40,
  groupPadding: 30,
  groupTitleHeight: 46,
  disconnectedGap: 150,
};
