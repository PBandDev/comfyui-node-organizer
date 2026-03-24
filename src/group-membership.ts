import {
  isCenterInsideRect,
  isRectInsideRect,
} from "./group-geometry";

export interface Rect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface GroupMembership {
  readonly groupId: string;
  readonly nodeIds: string[];
  readonly childGroupIds: string[];
}

export function inferGroupMembership(
  nodes: ReadonlyArray<Rect>,
  groups: ReadonlyArray<Rect>,
): GroupMembership[] {
  if (groups.length === 0) {
    return [];
  }

  const groupById = new Map<string, Rect>();
  const groupAreas = new Map<string, number>();
  for (const group of groups) {
    groupById.set(group.id, group);
    groupAreas.set(group.id, group.width * group.height);
  }

  const childGroupIds = new Map<string, string[]>();
  for (const inner of groups) {
    let nearestParent: Rect | null = null;
    let nearestArea = Number.POSITIVE_INFINITY;

    for (const outer of groups) {
      if (outer.id === inner.id || !isRectInsideRect(inner, outer)) {
        continue;
      }

      const outerArea = groupAreas.get(outer.id) ?? Number.POSITIVE_INFINITY;
      if (outerArea < nearestArea) {
        nearestParent = outer;
        nearestArea = outerArea;
      }
    }

    if (nearestParent) {
      const children = childGroupIds.get(nearestParent.id) ?? [];
      children.push(inner.id);
      childGroupIds.set(nearestParent.id, children);
    }
  }

  return groups.map((group) => {
    const directChildIds = childGroupIds.get(group.id) ?? [];
    const nodeIds: string[] = [];

    for (const node of nodes) {
      if (!isCenterInsideRect(node, group)) {
        continue;
      }

      let insideDirectChild = false;
      for (const childId of directChildIds) {
        const childGroup = groupById.get(childId);
        if (childGroup && isCenterInsideRect(node, childGroup)) {
          insideDirectChild = true;
          break;
        }
      }

      if (!insideDirectChild) {
        nodeIds.push(node.id);
      }
    }

    return {
      groupId: group.id,
      nodeIds,
      childGroupIds: [...directChildIds],
    };
  });
}
