import type { ScrapedTask } from "../types";

/**
 * Single source of truth for "what fields of a ScrapedTask are searchable."
 * Used by both the dashboard search bar (live filter on rendered rows) and
 * external callers (e.g. command-palette search). Pure — no DOM access.
 */
export function getTaskSearchText(task: ScrapedTask): string {
  return [
    task.text,
    ...task.contextNotes,
    task.filePath,
    task.category,
    task.project,
    task.status,
    task.marker ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

export function filterTasksByQuery(
  tasks: readonly ScrapedTask[],
  query: string,
): ScrapedTask[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [...tasks];
  return tasks.filter((task) => getTaskSearchText(task).includes(needle));
}
