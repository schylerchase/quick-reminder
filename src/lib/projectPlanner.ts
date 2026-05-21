import {
  DELIMITER_END,
  DELIMITER_START,
} from "./managedTasksBlock";

export type ProjectTaskStatus = "todo" | "in-progress" | "completed";

export interface ProjectTask {
  text: string;
  notes: string[];
  status: ProjectTaskStatus;
}

export interface ProjectPhase {
  name: string;
  tasks: ProjectTask[];
}

export interface ProjectPlan {
  title: string;
  filePath: string;
  phases: ProjectPhase[];
}

const METADATA_RE = /^(Project|File):\s*(?<value>.+?)\s*$/i;
const HEADING_RE = /^#{2,6}\s+(?<name>.+?)\s*#*\s*$/;
const BULLET_RE = /^(?<indent>\s*)[-*+]\s+(?<text>.+?)\s*$/;
const CHECKBOX_RE = /^\[(?<status>[ xX/])\]\s+(?<text>.+?)\s*$/;

const STATUS_FROM_CHAR: Record<string, ProjectTaskStatus> = {
  " ": "todo",
  x: "completed",
  X: "completed",
  "/": "in-progress",
};

export function parseProjectOutline(outline: string): ProjectPlan {
  const phases: ProjectPhase[] = [];
  let title = "";
  let filePath = "";
  let currentPhase: ProjectPhase | null = null;
  let currentTask: ProjectTask | null = null;

  const getCurrentPhase = (): ProjectPhase => {
    if (currentPhase) return currentPhase;
    currentPhase = { name: "Tasks", tasks: [] };
    phases.push(currentPhase);
    return currentPhase;
  };

  for (const rawLine of outline.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/g, "");
    const trimmed = line.trim();
    if (!trimmed) continue;

    const metadata = trimmed.match(METADATA_RE);
    if (metadata?.groups) {
      const key = metadata[1].toLowerCase();
      const value = metadata.groups.value.trim();
      if (key === "project") title = value;
      else filePath = value;
      continue;
    }

    const heading = trimmed.match(HEADING_RE);
    if (heading?.groups) {
      currentPhase = { name: heading.groups.name.trim(), tasks: [] };
      phases.push(currentPhase);
      currentTask = null;
      continue;
    }

    const bullet = line.match(BULLET_RE);
    if (!bullet?.groups) continue;

    const task = parseTaskText(bullet.groups.text);
    const isIndented = bullet.groups.indent.length > 0;
    if (isIndented && currentTask) {
      currentTask.notes.push(task.text);
      continue;
    }

    currentTask = task;
    getCurrentPhase().tasks.push(currentTask);
  }

  return {
    title,
    filePath: normalizeProjectFilePath(filePath, title),
    phases: phases.filter((phase) => phase.name.trim() || phase.tasks.length > 0),
  };
}

export function renderProjectPlanMarkdown(plan: ProjectPlan): string {
  const lines: string[] = [`# ${plan.title.trim()}`, ""];

  for (const phase of plan.phases) {
    const tasks = phase.tasks.filter((task) => task.text.trim().length > 0);
    if (tasks.length === 0) continue;
    lines.push(`## ${phase.name.trim() || "Tasks"}`);
    for (const task of tasks) {
      lines.push(`- [${taskStatusChar(task.status)}] ${task.text.trim()}`);
      for (const note of task.notes) {
        const trimmed = note.trim();
        if (trimmed) lines.push(`  - ${trimmed}`);
      }
    }
    lines.push("");
  }

  lines.push(DELIMITER_START, DELIMITER_END, "");
  return lines.join("\n");
}

export function normalizeProjectFilePath(rawPath: string, title: string): string {
  const fallback = sanitizeProjectTitleForPath(title);
  const source = rawPath.trim() || fallback;
  if (!source) return "";

  const normalized = source
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .trim();
  return /\.md$/i.test(normalized) ? normalized : `${normalized}.md`;
}

export function validateProjectPlan(plan: ProjectPlan): string[] {
  const errors: string[] = [];
  if (!plan.title.trim()) {
    errors.push("Add a project name.");
  }

  const hasTasks = plan.phases.some((phase) =>
    phase.tasks.some((task) => task.text.trim().length > 0),
  );
  if (!hasTasks) {
    errors.push("Add at least one task.");
  }

  const path = normalizeProjectFilePath(plan.filePath, plan.title);
  if ((path || plan.title.trim()) && !isVaultRelativeMarkdownPath(path)) {
    errors.push("Use a vault-relative note path.");
  }
  return errors;
}

export function isVaultRelativeMarkdownPath(path: string): boolean {
  if (!path || path.startsWith("/") || !/\.md$/i.test(path)) return false;
  if (path.includes(":") || path.includes("\0")) return false;
  return path.split("/").every((segment) =>
    segment.length > 0 && segment !== "." && segment !== "..",
  );
}

function parseTaskText(rawText: string): ProjectTask {
  const checkbox = rawText.trim().match(CHECKBOX_RE);
  if (checkbox?.groups) {
    return {
      text: checkbox.groups.text.trim(),
      notes: [],
      status: STATUS_FROM_CHAR[checkbox.groups.status] ?? "todo",
    };
  }
  return {
    text: rawText.trim(),
    notes: [],
    status: "todo",
  };
}

function taskStatusChar(status: ProjectTaskStatus): string {
  if (status === "completed") return "x";
  if (status === "in-progress") return "/";
  return " ";
}

function sanitizeProjectTitleForPath(title: string): string {
  return title
    .trim()
    .replace(/[\\/:*?"<>|#[\]^]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^-+|-+$/g, "");
}
