/**
 * Layout module barrel export.
 */

export {
  layoutWithGroups,
  buildGroupHierarchy,
  splitDisconnected,
  placeDisconnected,
  translatePositions,
} from "./framework.js";

export { compactVertically, compactHorizontally } from "./compact.js";

export type {
  Position,
  LayoutNode,
  LayoutEdge,
  LayoutGroup,
  LayoutToken,
  LayoutInput,
  LayoutOutput,
  LayoutAlgorithm,
  GroupBounds,
  FrameworkResult,
  FrameworkConfig,
} from "./types.js";

export { DEFAULT_FRAMEWORK_CONFIG } from "./types.js";
