const GROUP_LAYOUT_ID_PREFIX = "group:";

export function toGroupLayoutId(groupId: string | number): string {
  return `${GROUP_LAYOUT_ID_PREFIX}${groupId}`;
}

export function fromGroupLayoutId(groupId: string): string | null {
  if (!groupId.startsWith(GROUP_LAYOUT_ID_PREFIX)) {
    return null;
  }

  return groupId.slice(GROUP_LAYOUT_ID_PREFIX.length);
}

export function fromNumericGroupLayoutId(groupId: string): number | null {
  const rawGroupId = fromGroupLayoutId(groupId);
  if (rawGroupId === null) {
    return null;
  }

  const parsed = Number(rawGroupId);
  return Number.isFinite(parsed) ? parsed : null;
}
