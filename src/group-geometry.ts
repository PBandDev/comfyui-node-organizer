export interface PositionedItem {
  readonly pos: ArrayLike<number>;
  readonly size: ArrayLike<number>;
}

export interface RectGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function isGroupInsideGroup(
  inner: PositionedItem,
  outer: PositionedItem,
): boolean {
  return isRectInsideRect(toRectGeometry(inner), toRectGeometry(outer));
}

export function isNodeCenterInsideGroup(
  node: PositionedItem,
  group: PositionedItem,
): boolean {
  return isCenterInsideRect(toRectGeometry(node), toRectGeometry(group));
}

export function isRectInsideRect(
  inner: RectGeometry,
  outer: RectGeometry,
): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function isCenterInsideRect(
  item: RectGeometry,
  container: RectGeometry,
): boolean {
  const centerX = item.x + item.width / 2;
  const centerY = item.y + item.height / 2;

  return (
    centerX >= container.x &&
    centerX <= container.x + container.width &&
    centerY >= container.y &&
    centerY <= container.y + container.height
  );
}

function toRectGeometry(item: PositionedItem): RectGeometry {
  return {
    x: Number(item.pos[0]),
    y: Number(item.pos[1]),
    width: Number(item.size[0]),
    height: Number(item.size[1]),
  };
}
