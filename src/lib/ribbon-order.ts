export function getRibbonIconIndex(iconEl: HTMLElement): number | null {
  const parent = iconEl.parentElement;
  if (!parent) return null;

  const siblings = Array.from(parent.children);
  const index = siblings.indexOf(iconEl);
  return index === -1 ? null : index;
}

export function restoreRibbonIconIndex(
  iconEl: HTMLElement,
  savedIndex: number | null | undefined,
): void {
  if (typeof savedIndex !== "number" || !Number.isFinite(savedIndex)) return;
  const parent = iconEl.parentElement;
  if (!parent) return;

  const nextIndex = Math.max(0, Math.trunc(savedIndex));
  const siblings = Array.from(parent.children).filter((child) => child !== iconEl);
  parent.insertBefore(iconEl, siblings[nextIndex] ?? null);
}

export function shouldManageRibbonIconIndex(isMobileApp: boolean): boolean {
  return !isMobileApp;
}
