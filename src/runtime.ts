import { isGroup, type CanvasItem } from "./utils";

export interface CanvasLike<TGraph = unknown> {
  readonly graph: TGraph | null;
  readonly getCurrentGraph?: () => TGraph | null;
  readonly selectedItems?: Iterable<CanvasItem>;
}

export interface AppLike<TGraph = unknown> {
  readonly canvas?: CanvasLike<TGraph> | null;
  readonly graph?: TGraph | null;
}

export function getCurrentGraph<TGraph>(app: AppLike<TGraph>): TGraph | null {
  const canvas = app.canvas;
  if (!canvas) return null;
  return canvas.getCurrentGraph?.() ?? canvas.graph ?? app.graph ?? null;
}

export function getSelectedGroups(
  canvas: CanvasLike | null | undefined,
): Array<{ id: number; title: string }> {
  if (!canvas?.selectedItems) return [];

  const groups: Array<{ id: number; title: string }> = [];
  for (const item of canvas.selectedItems) {
    if (isGroup(item)) {
      groups.push({ id: item.id as number, title: item.title });
    }
  }
  return groups;
}
