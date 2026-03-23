export interface CanvasItem {
  readonly id: number | string;
  readonly pos: ArrayLike<number>;
  readonly size?: ArrayLike<number>;
  readonly title?: string;
  readonly type?: string | null;
  readonly constructor?: { readonly name?: string };
  selected?: boolean;
}

export interface GroupItem extends CanvasItem {
  readonly title: string;
}

export function isGroup(item: CanvasItem): item is GroupItem {
  if (typeof item.title !== "string") {
    return false;
  }

  if (item.constructor?.name === "LGraphGroup") {
    return true;
  }

  return typeof item.type !== "string";
}
