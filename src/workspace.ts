import { App, WorkspaceLeaf } from "obsidian";

// Single source of truth for "is this leaf in a sidebar?" — must cover both
// desktop splits (.mod-left-split / .mod-right-split) and mobile drawers
// (.workspace-drawer / .mod-sidedock). Duplicating the selector across files
// drifted on iPad and caused Sidebar/Dashboard button bugs.
const SIDEBAR_SELECTOR =
  ".mod-left-split, .mod-right-split, .workspace-drawer, .mod-sidedock";
const RIGHT_SIDEBAR_SELECTOR =
  ".mod-right-split, .workspace-drawer.mod-right, .mod-sidedock.mod-right";

export function isSidebarLeaf(leaf: WorkspaceLeaf): boolean {
  return leaf.view.containerEl.closest(SIDEBAR_SELECTOR) !== null;
}

export function isMainPaneLeaf(leaf: WorkspaceLeaf): boolean {
  return !isSidebarLeaf(leaf);
}

export function isRightSidebarLeaf(leaf: WorkspaceLeaf): boolean {
  return leaf.view.containerEl.closest(RIGHT_SIDEBAR_SELECTOR) !== null;
}

export function isSidebarContainer(containerEl: HTMLElement): boolean {
  return containerEl.closest(SIDEBAR_SELECTOR) !== null;
}

// rightSplit shape differs between desktop (.expand/.collapse always present)
// and iPad (drawer with similar but historically-shifting methods). Calling
// through optional chaining means a missing method is a no-op rather than
// a crash, and centralizing the call site means future API drift is one fix.
type WorkspaceWithRightSplit = App["workspace"] & {
  rightSplit?: { expand?: () => void; collapse?: () => void };
};

export function expandRightSidebar(workspace: App["workspace"]): void {
  (workspace as WorkspaceWithRightSplit).rightSplit?.expand?.();
}

export function collapseRightSidebar(workspace: App["workspace"]): void {
  (workspace as WorkspaceWithRightSplit).rightSplit?.collapse?.();
}

export async function openMainViewLeaf(
  workspace: App["workspace"],
  viewType: string,
  reveal = true,
): Promise<WorkspaceLeaf | null> {
  const leaf = findOrReuseMainPaneLeaf(workspace, viewType);
  if (!leaf) return null;

  if (leaf.view.getViewType() !== viewType) {
    await leaf.setViewState({ type: viewType, active: reveal });
  }
  await leaf.loadIfDeferred();
  collapseRightSidebar(workspace);
  if (reveal) {
    await workspace.revealLeaf(leaf);
  }
  workspace.setActiveLeaf(leaf, { focus: true });
  return leaf;
}

export async function openSidebarViewLeaf(
  workspace: App["workspace"],
  viewType: string,
  reveal = true,
): Promise<WorkspaceLeaf | null> {
  const restored = workspace.getLeavesOfType(viewType).find(isSidebarLeaf);
  if (restored) {
    if (isRightSidebarLeaf(restored)) expandRightSidebar(workspace);
    if (restored.view.getViewType() !== viewType) {
      await restored.setViewState({ type: viewType, active: reveal });
    }
    await restored.loadIfDeferred();
    return restored;
  }

  expandRightSidebar(workspace);
  const leaf = workspace.getRightLeaf(false) ?? workspace.getRightLeaf(true);
  if (!leaf) return null;

  if (leaf.view.getViewType() !== viewType) {
    await leaf.setViewState({ type: viewType, active: reveal });
  }
  await leaf.loadIfDeferred();
  return leaf;
}

export async function openRightSidebarViewLeaf(
  workspace: App["workspace"],
  viewType: string,
  reveal = true,
): Promise<WorkspaceLeaf | null> {
  return openSidebarViewLeaf(workspace, viewType, reveal);
}

/**
 * Get a leaf in the main pane to host the view. Preference:
 * 1. Existing leaf of this view type in the main pane — keep continuity
 * 2. Most-recent main-pane leaf — take it over (its current view is displaced)
 * 3. Any main-pane leaf
 * 4. Last resort: new vertical split (only when no main-pane leaf exists)
 *
 * Replacing an active note's leaf is intentional: "Dashboard" should TAKE
 * OVER the active note tab rather than splitting the workspace.
 */
export function findOrReuseMainPaneLeaf(
  workspace: App["workspace"],
  viewType: string,
): WorkspaceLeaf {
  const existing = workspace.getLeavesOfType(viewType).find(isMainPaneLeaf);
  if (existing) return existing;

  const recent = workspace.getMostRecentLeaf(workspace.rootSplit);
  if (recent && isMainPaneLeaf(recent)) return recent;

  let any: WorkspaceLeaf | null = null;
  workspace.iterateAllLeaves((leaf) => {
    if (!any && isMainPaneLeaf(leaf)) any = leaf;
  });
  if (any) return any;

  return workspace.getLeaf("split", "vertical");
}
