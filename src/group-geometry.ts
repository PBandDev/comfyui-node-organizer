export interface PositionedItem {
  readonly pos: ArrayLike<number>;
  readonly size: ArrayLike<number>;
}

export function isGroupInsideGroup(
  inner: PositionedItem,
  outer: PositionedItem,
): boolean {
  const ix = Number(inner.pos[0]);
  const iy = Number(inner.pos[1]);
  const iw = Number(inner.size[0]);
  const ih = Number(inner.size[1]);

  const ox = Number(outer.pos[0]);
  const oy = Number(outer.pos[1]);
  const ow = Number(outer.size[0]);
  const oh = Number(outer.size[1]);

  return (
    ix >= ox && iy >= oy && ix + iw <= ox + ow && iy + ih <= oy + oh
  );
}

export function isNodeCenterInsideGroup(
  node: PositionedItem,
  group: PositionedItem,
): boolean {
  const centerX = Number(node.pos[0]) + Number(node.size[0]) / 2;
  const centerY = Number(node.pos[1]) + Number(node.size[1]) / 2;

  const gx = Number(group.pos[0]);
  const gy = Number(group.pos[1]);
  const gw = Number(group.size[0]);
  const gh = Number(group.size[1]);

  return (
    centerX >= gx &&
    centerX <= gx + gw &&
    centerY >= gy &&
    centerY <= gy + gh
  );
}
