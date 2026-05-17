import { App, WorkspaceLeaf } from "obsidian";

export async function openMainViewLeaf(
  workspace: App["workspace"],
  viewType: string,
  reveal = true,
): Promise<WorkspaceLeaf | null> {
  const leaf = findMainViewLeaf(workspace, viewType) ?? workspace.getLeaf("split", "vertical");
  if (!leaf) return null;

  if (leaf.view.getViewType() !== viewType) {
    await leaf.setViewState({ type: viewType, active: reveal });
  }
  await leaf.loadIfDeferred();
  workspace.rightSplit.collapse();
  if (reveal) {
    await workspace.revealLeaf(leaf);
  }
  workspace.setActiveLeaf(leaf, { focus: true });
  return leaf;
}

function findMainViewLeaf(workspace: App["workspace"], viewType: string): WorkspaceLeaf | null {
  return workspace
    .getLeavesOfType(viewType)
    .find((leaf) => !leaf.view.containerEl.closest(".mod-left-split, .mod-right-split")) ?? null;
}
