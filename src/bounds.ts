import type { Position, GroupBounds } from "./layout/types";

export interface BoundsItem {
  readonly id: number | string;
  readonly pos: ArrayLike<number>;
  readonly size: ArrayLike<number>;
}

/**
 * Compute the bounding rect of all laid-out items for fit-to-view.
 * Includes regular nodes, boundary nodes (inputNode/outputNode), and groups.
 */
export function computeGraphBounds(
  nodes: ReadonlyArray<BoundsItem>,
  inputNode: BoundsItem | undefined,
  outputNode: BoundsItem | undefined,
  positions: ReadonlyMap<string, Position>,
  groupBounds: ReadonlyMap<string, GroupBounds>,
): [number, number, number, number] | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const expandWithItem = (item: BoundsItem): void => {
    const pos = positions.get(String(item.id));
    if (!pos) return;
    const w = item.size[0] ?? 0;
    const h = item.size[1] ?? 0;
    if (pos.x < minX) minX = pos.x;
    if (pos.y < minY) minY = pos.y;
    if (pos.x + w > maxX) maxX = pos.x + w;
    if (pos.y + h > maxY) maxY = pos.y + h;
  };

  for (const node of nodes) {
    expandWithItem(node);
  }

  if (inputNode) expandWithItem(inputNode);
  if (outputNode) expandWithItem(outputNode);

  for (const [, gb] of groupBounds) {
    if (gb.x < minX) minX = gb.x;
    if (gb.y < minY) minY = gb.y;
    if (gb.x + gb.width > maxX) maxX = gb.x + gb.width;
    if (gb.y + gb.height > maxY) maxY = gb.y + gb.height;
  }

  if (!Number.isFinite(minX)) return null;
  return [minX, minY, maxX - minX, maxY - minY];
}
