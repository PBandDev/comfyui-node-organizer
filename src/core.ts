import {
  createLayoutAlgorithm,
  type LayoutAlgorithmName,
} from "./layout/algorithm-factory";
import { layoutWithGroups } from "./layout/framework";
import { toGroupLayoutId } from "./layout/group-ids";
import { parseLayoutToken } from "./layout/tokens";
import {
  DEFAULT_FRAMEWORK_CONFIG,
  type FrameworkConfig,
  type LayoutEdge as InternalLayoutEdge,
  type LayoutGroup as InternalLayoutGroup,
  type LayoutNode as InternalLayoutNode,
} from "./layout/types";

export {
  inferGroupMembership,
  type GroupMembership,
  type Rect,
} from "./group-membership";

export interface WorkflowNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly kind?: "node" | "subgraph-input" | "subgraph-output";
}

export interface WorkflowEdge {
  readonly source: string;
  readonly target: string;
}

export interface WorkflowGroup {
  readonly id: string;
  readonly title: string;
  readonly memberIds: ReadonlyArray<string>;
  readonly childGroupIds: ReadonlyArray<string>;
}

export interface WorkflowRect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WorkflowMembership {
  readonly groupId: string;
  readonly nodeIds: string[];
  readonly childGroupIds: string[];
}

export interface NormalizeWorkflowResult {
  readonly nodes: WorkflowRect[];
  readonly groups: WorkflowRect[];
  readonly memberships: WorkflowMembership[];
}

export interface NormalizeWorkflowOptions {
  readonly algorithm?: LayoutAlgorithmName;
  readonly config?: Partial<FrameworkConfig>;
}

export { DEFAULT_FRAMEWORK_CONFIG, type FrameworkConfig } from "./layout/types";

export function normalizeWorkflowGeometry(
  input: {
    readonly nodes: ReadonlyArray<WorkflowNode>;
    readonly edges: ReadonlyArray<WorkflowEdge>;
    readonly groups: ReadonlyArray<WorkflowGroup>;
  },
  options?: NormalizeWorkflowOptions,
): NormalizeWorkflowResult {
  const config: FrameworkConfig = {
    ...DEFAULT_FRAMEWORK_CONFIG,
    ...options?.config,
  };
  const algorithm = createLayoutAlgorithm(
    options?.algorithm ?? "sugiyama",
    config,
  );

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
      id: toGroupLayoutId(group.id),
      title: group.title,
      memberIds: [...group.memberIds],
      childGroupIds: group.childGroupIds.map(toGroupLayoutId),
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
      const bounds = result.groupBounds.get(toGroupLayoutId(group.id));
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
