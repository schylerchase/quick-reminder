import type { TaskDashboardScope } from "../types";

export type DashboardSourceFilter = "all" | "checkbox" | "marker";

export interface FirstRunActionState {
  pendingCount: number;
  activeTaskCount: number;
  completedTaskCount: number;
  ignoredTaskCount: number;
  search: string;
  sourceFilter: DashboardSourceFilter;
}

export function shouldShowFirstRunActions(state: FirstRunActionState): boolean {
  return (
    state.pendingCount === 0 &&
    state.activeTaskCount === 0 &&
    state.completedTaskCount === 0 &&
    state.ignoredTaskCount === 0 &&
    state.search.trim() === "" &&
    state.sourceFilter === "all"
  );
}

export interface ScopedEmptyTaskActionState {
  scope: TaskDashboardScope;
  scopedActiveTaskCount: number;
  vaultActiveTaskCount: number;
  search: string;
  sourceFilter: DashboardSourceFilter;
}

export interface ScopedEmptyTaskAction {
  text: string;
  label: string;
  nextScope: "vault";
}

export type DashboardSurface = "dashboard" | "sidebar";

export function getDashboardOpenFailedNotice(surface: DashboardSurface): string {
  return `Quick Reminder could not open the ${surface}. Try again from the command palette or reload Obsidian.`;
}

export function getDashboardPaneMissingNotice(): string {
  return "Quick Reminder could not find a note pane. Open any note and try Dashboard again.";
}

export function getDashboardRefreshFailedNotice(surface: DashboardSurface): string {
  return `The ${surface} opened, but Quick Reminder could not refresh it. Click Scan or reload Obsidian.`;
}

export function getDashboardScanFailedNotice(): string {
  return "Quick Reminder could not scan vault tasks. Try again or reload Obsidian.";
}

export function getDashboardScanSuccessNotice(taskCount: number): string {
  const label = taskCount === 1 ? "task" : "tasks";
  return `Scanned ${taskCount} vault ${label}.`;
}

export function getDashboardScanRefreshFailedNotice(taskCount: number): string {
  return `Scan found ${taskCount} vault tasks, but Quick Reminder could not refresh the dashboard. Reload Obsidian.`;
}

export function getScopedEmptyTaskAction(
  state: ScopedEmptyTaskActionState,
): ScopedEmptyTaskAction | null {
  if (state.scope === "vault") return null;
  if (state.scopedActiveTaskCount > 0) return null;
  if (state.vaultActiveTaskCount === 0) return null;
  if (state.search.trim() !== "") return null;
  if (state.sourceFilter !== "all") return null;

  return {
    text: state.scope === "folder" ? "No tasks in this folder." : "No tasks in this note.",
    label: "Show whole vault",
    nextScope: "vault",
  };
}
