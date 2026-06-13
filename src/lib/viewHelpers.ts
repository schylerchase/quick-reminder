import {
  Reminder,
  ScrapedTask,
  TaskDashboardScope,
} from "../types";

export interface TasksPluginApi {
  editTaskLineModal(line: string): Promise<string>;
}

export type TaskStatusPick = "todo" | "in-progress" | "completed";

export type NewTaskRequest = {
  rawInput: string;
  status: TaskStatusPick;
  targetFilePath: string;
  details: string;
};

export type TaskDisplayNoteGroup = {
  filePath: string;
  statuses: Array<{
    title: string;
    categories: Array<{
      title: string;
      tasks: ScrapedTask[];
    }>;
  }>;
};

export const PHASE_PAGE_SIZE = 25;

export type TaskPhaseGroup = {
  name: string;
  isInbox: boolean;
  tasks: ScrapedTask[];
};

export type TaskPhaseNoteGroup = {
  filePath: string;
  phases: TaskPhaseGroup[];
};

export function shouldUseMobileTaskViewport(): boolean {
  if (
    typeof document !== "undefined" &&
    document.body.classList.contains("is-phone")
  ) {
    return true;
  }
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(max-width: 480px)").matches;
}

export function getDashboardSectionClassNames(title: string, isEmpty: boolean): string[] {
  const classes = ["qr-view-section", `qr-view-section-${getDashboardSectionSlug(title)}`];
  if (isEmpty) classes.push("qr-view-section-empty");
  return classes;
}

function getDashboardSectionSlug(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

export function mapTaskKindToStatusPick(task: ScrapedTask): TaskStatusPick {
  if (task.kind !== "checkbox") return "todo";
  if (task.status === "completed") return "completed";
  if (task.status === "in-progress") return "in-progress";
  return "todo";
}

export function getTasksPluginApi(app: unknown): TasksPluginApi | null {
  const tasksPlugin = (app as {
    plugins?: { plugins?: Record<string, unknown> };
  }).plugins?.plugins?.["obsidian-tasks-plugin"] as { apiV1?: unknown } | undefined;
  const api = tasksPlugin?.apiV1 as Partial<TasksPluginApi> | undefined;
  return typeof api?.editTaskLineModal === "function" ? (api as TasksPluginApi) : null;
}

export function getSummaryText(
  overdueCount: number,
  upcomingCount: number,
  scrapedCount: number,
  taskScope: TaskDashboardScope,
  activeFilePath: string | null,
  folderPath: string | null,
): string {
  const taskLabel = getTaskScopeLabel(taskScope, activeFilePath, folderPath);
  if (overdueCount > 0) {
    return `${overdueCount} overdue - ${upcomingCount} upcoming - ${scrapedCount} ${taskLabel}`;
  }
  if (upcomingCount > 0) {
    return `${upcomingCount} upcoming - ${scrapedCount} ${taskLabel}`;
  }
  if (scrapedCount > 0) {
    return `${scrapedCount} ${taskLabel}`;
  }
  if (taskScope === "active" && !activeFilePath) {
    return "No active markdown file";
  }
  if (taskScope === "folder" && folderPath === null) {
    return "No active folder";
  }
  return "Nothing pending";
}

export function getTaskScopeLabel(
  taskScope: TaskDashboardScope,
  activeFilePath: string | null,
  folderPath: string | null,
): string {
  if (taskScope === "folder" && folderPath !== null) {
    return "folder tasks";
  }
  if (taskScope === "active" && activeFilePath) {
    return "current file tasks";
  }
  return "vault tasks";
}

export function isInFolder(filePath: string, folderPath: string): boolean {
  if (folderPath === "" || folderPath === "/" || folderPath === ".") {
    return !filePath.includes("/");
  }
  const normalizedFolder = folderPath.replace(/^\/+|\/+$/g, "");
  if (!normalizedFolder) {
    return !filePath.includes("/");
  }
  return filePath === normalizedFolder || filePath.startsWith(`${normalizedFolder}/`);
}

export function getCurrentFolderScopePath(filePath: string | null, folderPath: string | null): string | null {
  if (folderPath === null) {
    return null;
  }
  if (!filePath?.includes("/")) {
    return folderPath;
  }
  // Use the file's actual parent folder, not just the top-level segment.
  // Previously a file at Projects/Alpha/Beta/note.md scoped to "Projects"
  // and silently broadened the folder view to the whole top-level tree.
  const parent = filePath.slice(0, filePath.lastIndexOf("/"));
  return parent || folderPath;
}

export function groupTasksByPhase(tasks: ScrapedTask[]): TaskPhaseNoteGroup[] {
  const notes: TaskPhaseNoteGroup[] = [];
  for (const task of tasks) {
    let note = notes.find((n) => n.filePath === task.filePath);
    if (!note) {
      note = { filePath: task.filePath, phases: [] };
      notes.push(note);
    }
    const raw = (task.category || "").trim();
    const isInbox = raw === "" || raw.toLowerCase() === "uncategorized";
    const name = isInbox ? "Inbox" : raw;
    let phase = note.phases.find(
      (p) => p.name === name && p.isInbox === isInbox,
    );
    if (!phase) {
      phase = { name, isInbox, tasks: [] };
      note.phases.push(phase);
    }
    phase.tasks.push(task);
  }
  for (const note of notes) {
    // Inbox first, then alphabetical phases by first appearance order (already preserved)
    note.phases.sort((a, b) =>
      a.isInbox === b.isInbox ? 0 : a.isInbox ? -1 : 1,
    );
  }
  return notes;
}

export function getPhaseAccentHue(name: string): number {
  // Deterministic hue 0-359 from name; FNV-1a 32-bit hash mod 360.
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h % 360;
}

export function groupTasksForDisplay(tasks: ScrapedTask[]): TaskDisplayNoteGroup[] {
  const statusOrder: Array<ScrapedTask["status"]> = ["in-progress", "todo", "marker", "completed"];
  const notes: TaskDisplayNoteGroup[] = [];

  for (const task of tasks) {
    let note = notes.find((candidate) => candidate.filePath === task.filePath);
    if (!note) {
      note = { filePath: task.filePath, statuses: [] };
      notes.push(note);
    }

    const statusTitle = getTaskStatusTitle(task.status);
    let status = note.statuses.find((candidate) => candidate.title === statusTitle);
    if (!status) {
      status = { title: statusTitle, categories: [] };
      note.statuses.push(status);
    }

    const categoryTitle = getTaskCategoryTitle(task, statusTitle);
    let category = status.categories.find((candidate) => candidate.title === categoryTitle);
    if (!category) {
      category = { title: categoryTitle, tasks: [] };
      status.categories.push(category);
    }
    category.tasks.push(task);
  }

  for (const note of notes) {
    note.statuses.sort((a, b) => statusOrder.indexOf(getStatusFromTitle(a.title)) - statusOrder.indexOf(getStatusFromTitle(b.title)));
  }

  return notes;
}

export function getTaskStatusTitle(status: ScrapedTask["status"]): string {
  if (status === "in-progress") {
    return "In Progress";
  }
  if (status === "completed") {
    return "Completed";
  }
  if (status === "cancelled") {
    return "Cancelled";
  }
  if (status === "marker") {
    return "Markers";
  }
  return "To Do";
}

export function getTaskContextSummaryText(count: number): string {
  if (count === 1) return "1 subtask / note";
  return `${count} subtasks / notes`;
}

export function getTaskCategoryTitle(task: ScrapedTask, statusTitle: string): string {
  const category = task.category?.trim() || "Uncategorized";
  return category.toLowerCase() === statusTitle.toLowerCase() ? "" : category;
}

export function getStatusFromTitle(title: string): ScrapedTask["status"] {
  if (title === "In Progress") {
    return "in-progress";
  }
  if (title === "Completed") {
    return "completed";
  }
  if (title === "Cancelled") {
    return "cancelled";
  }
  if (title === "Markers") {
    return "marker";
  }
  return "todo";
}

export function compareTaskPageOrder(a: ScrapedTask, b: ScrapedTask): number {
  return a.filePath.localeCompare(b.filePath) || a.line - b.line;
}

export function getTaskPriorityRank(text: string): number {
  const normalized = text.toLowerCase();
  if (hasPriorityEmoji(text, "\u{1F53A}") || hasInlinePriority(normalized, "(?:highest|urgent|critical)") || /\b(?:priority|prio)\s*[:=]\s*(?:highest|urgent|critical)\b/.test(normalized) || /#(?:priority|prio)\/(?:highest|urgent|critical)\b/.test(normalized) || /\bp0\b/.test(normalized) || /!!!/.test(text)) {
    return 0;
  }
  if (hasPriorityEmoji(text, "\u{23EB}") || hasInlinePriority(normalized, "high") || /\b(?:priority|prio)\s*[:=]\s*high\b/.test(normalized) || /#(?:priority|prio)\/high\b/.test(normalized) || /\bp1\b/.test(normalized) || /!!/.test(text)) {
    return 1;
  }
  if (hasPriorityEmoji(text, "\u{1F53C}") || hasInlinePriority(normalized, "medium") || /\b(?:priority|prio)\s*[:=]\s*medium\b/.test(normalized) || /#(?:priority|prio)\/medium\b/.test(normalized) || /\bp2\b/.test(normalized)) {
    return 2;
  }
  if (hasPriorityEmoji(text, "\u{1F53D}") || hasInlinePriority(normalized, "low") || /\b(?:priority|prio)\s*[:=]\s*low\b/.test(normalized) || /#(?:priority|prio)\/low\b/.test(normalized) || /\bp3\b/.test(normalized)) {
    return 3;
  }
  if (hasPriorityEmoji(text, "\u{23EC}") || hasInlinePriority(normalized, "lowest") || /\b(?:priority|prio)\s*[:=]\s*lowest\b/.test(normalized) || /#(?:priority|prio)\/lowest\b/.test(normalized) || /\bp4\b/.test(normalized)) {
    return 4;
  }
  return 5;
}

export function splitTaskInput(input: string): { taskText: string; contextNotes: string[] } {
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const [taskText = "", ...contextNotes] = lines;
  return { taskText, contextNotes: normalizeContextNoteLines(contextNotes) };
}

export function normalizeContextNoteLines(lines: string[]): string[] {
  return lines.map((line) => line.trim().replace(/^[-*+]\s+/, "").trim()).filter(Boolean);
}

export function getTaskContextNoteEditBlock(task: ScrapedTask): string {
  if (task.contextNoteLines.length > 0) {
    return deindentLines(task.contextNoteLines).join("\n");
  }
  return task.contextNotes.join("\n");
}

export function deindentLines(lines: string[]): string[] {
  const commonIndent = getCommonIndentLength(lines);
  return lines.map((line) => line.slice(commonIndent));
}

export function getCommonIndentLength(lines: string[]): number {
  const nonBlank = lines.filter((line) => line.trim() !== "");
  if (nonBlank.length === 0) return 0;
  return Math.min(...nonBlank.map((line) => line.match(/^\s*/)?.[0].length ?? 0));
}

export function handleTextareaIndent(event: KeyboardEvent, textarea: HTMLTextAreaElement): void {
  if (event.key !== "Tab") return;
  event.preventDefault();

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = end === start ? end : value.indexOf("\n", end);
  const selectionEnd = lineEnd === -1 ? value.length : lineEnd;
  const selected = value.slice(lineStart, selectionEnd);
  const updated = event.shiftKey
    ? selected.replace(/^(?:  |\t)/gm, "")
    : selected.replace(/^/gm, "  ");

  textarea.value = `${value.slice(0, lineStart)}${updated}${value.slice(selectionEnd)}`;
  textarea.selectionStart = lineStart;
  textarea.selectionEnd = lineStart + updated.length;
}

export function hasInlinePriority(normalizedText: string, valuePattern: string): boolean {
  return new RegExp(`\\[\\s*(?:priority|prio)::\\s*${valuePattern}\\s*\\]`).test(normalizedText);
}

export function hasPriorityEmoji(text: string, emoji: string): boolean {
  return text.includes(emoji);
}

export function getEmptyScrapedText(title: string, totalCount: number): string {
  if (totalCount > 0) {
    return "No tasks match the current filters.";
  }
  if (title === "Completed vault tasks") {
    return "No completed vault tasks found.";
  }
  if (title === "Ignored") {
    return "No ignored tasks.";
  }
  return "No unchecked tasks or TODO markers found.";
}

export function getTaskKindBadgeText(task: ScrapedTask): string {
  return task.kind === "checkbox" ? "Checkbox" : task.marker ?? "Marker";
}

export function getTaskStatusClassName(status: ScrapedTask["status"]): string {
  return status.replace(/[^a-z0-9]+/g, "-");
}

export function getEmptyText(title: string, isHistory: boolean): string {
  if (isHistory) return "No past reminders.";
  if (title === "Upcoming") return "No upcoming reminders.";
  return "No reminders here.";
}

export function formatWhen(ms: number): string {
  const now = Date.now();
  const diff = ms - now;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);

  const exact = formatExact(ms);
  if (diff < 0) return `overdue - ${exact}`;
  if (mins < 60) return `in ${mins}m - ${exact}`;
  if (hours < 24) return `in ${hours}h - ${exact}`;
  return `in ${days}d - ${exact}`;
}

export function formatHistoryWhen(reminder: Reminder): string {
  if (reminder.completedAt) {
    return `${formatAgo(reminder.completedAt)} done - due ${formatExact(reminder.dueAt)}`;
  }
  const notifiedAt = reminder.notifiedAt ?? reminder.dueAt;
  return `${formatAgo(notifiedAt)} notified - due ${formatExact(reminder.dueAt)}`;
}

export function formatAgo(ms: number): string {
  const abs = Math.abs(Date.now() - ms);
  const mins = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function formatExact(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function hasFutureDueAt(dueAt: number | null): dueAt is number {
  return dueAt !== null && dueAt > Date.now();
}

export function genReminderId(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
