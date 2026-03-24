import { createHorizontalAlgorithm } from "./layout/algorithms/horizontal";
import { createSugiyamaAlgorithm } from "./layout/algorithms/sugiyama";
import { createVerticalAlgorithm } from "./layout/algorithms/vertical";
import { layoutWithGroups } from "./layout/framework";
import { parseLayoutToken } from "./layout/tokens";
import {
  DEFAULT_FRAMEWORK_CONFIG,
  type FrameworkConfig,
  type LayoutAlgorithm,
  type LayoutEdge as InternalLayoutEdge,
  type LayoutGroup as InternalLayoutGroup,
  type LayoutNode as InternalLayoutNode,
} from "./layout/types";

export {
  inferGroupMembership,
  type GroupMembership,
  type Rect,
} from "./group-membership";

export interface LayoutNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly kind?: "node" | "subgraph-input" | "subgraph-output";
}

export interface LayoutEdge {
  readonly source: string;
  readonly target: string;
}

export interface LayoutGroup {
  readonly id: string;
  readonly title: string;
  readonly memberIds: ReadonlyArray<string>;
  readonly childGroupIds: ReadonlyArray<string>;
}

export interface PositionedRect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface NormalizeResult {
  readonly nodes: PositionedRect[];
  readonly groups: PositionedRect[];
  readonly memberships: Array<{
    readonly groupId: string;
    readonly nodeIds: string[];
    readonly childGroupIds: string[];
  }>;
}

export interface NormalizeOptions {
  readonly algorithm?: "sugiyama" | "horizontal" | "vertical";
  readonly config?: Partial<FrameworkConfig>;
}

export { DEFAULT_FRAMEWORK_CONFIG, type FrameworkConfig } from "./layout/types";

type AlgorithmName = NonNullable<NormalizeOptions["algorithm"]>;

export function normalizeWorkflowGeometry(
  input: {
    readonly nodes: ReadonlyArray<LayoutNode>;
    readonly edges: ReadonlyArray<LayoutEdge>;
    readonly groups: ReadonlyArray<LayoutGroup>;
  },
  options?: NormalizeOptions,
): NormalizeResult {
  const config: FrameworkConfig = {
    ...DEFAULT_FRAMEWORK_CONFIG,
    ...options?.config,
  };
  const algorithm = createAlgorithm(options?.algorithm ?? "sugiyama", config);

  const nodes: InternalLayoutNode[] = input.nodes.map((node) => {
    if (node.kind === "subgraph-input") {
      return {
        id: node.id,
        width: node.width,
        height: node.height,
        kind: node.kind,
        layerConstraint: "first",
      };
    }

    if (node.kind === "subgraph-output") {
      return {
        id: node.id,
        width: node.width,
        height: node.height,
        kind: node.kind,
        layerConstraint: "last",
      };
    }

    return {
      id: node.id,
      width: node.width,
      height: node.height,
    };
  });

  const edges: InternalLayoutEdge[] = input.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
  }));

  const groups: InternalLayoutGroup[] = input.groups.map((group) => {
    const token = parseLayoutToken(group.title);

    return {
      id: toInternalGroupId(group.id),
      title: group.title,
      memberIds: [...group.memberIds],
      childGroupIds: group.childGroupIds.map(toInternalGroupId),
      ...(token ? { token } : {}),
    };
  });

  const result = layoutWithGroups(nodes, edges, groups, algorithm, config);

  return {
    nodes: input.nodes.flatMap((node) => {
      const position = result.positions.get(node.id);
      return position
        ? [
            {
              id: node.id,
              x: position.x,
              y: position.y,
              width: node.width,
              height: node.height,
            },
          ]
        : [];
    }),
    groups: input.groups.flatMap((group) => {
      const bounds = result.groupBounds.get(toInternalGroupId(group.id));
      return bounds
        ? [
            {
              id: group.id,
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: bounds.height,
            },
          ]
        : [];
    }),
    memberships: input.groups.map((group) => ({
      groupId: group.id,
      nodeIds: [...group.memberIds],
      childGroupIds: [...group.childGroupIds],
    })),
  };
}

function createAlgorithm(
  algorithmName: AlgorithmName,
  config: FrameworkConfig,
): LayoutAlgorithm {
  switch (algorithmName) {
    case "horizontal":
      return createHorizontalAlgorithm(config.horizontalGap);
    case "vertical":
      return createVerticalAlgorithm(config.verticalGap);
    case "sugiyama":
      return createSugiyamaAlgorithm({
        horizontalGap: config.horizontalGap,
        verticalGap: config.verticalGap,
      });
  }
}

function toInternalGroupId(groupId: string): string {
  return `group:${groupId}`;
}
