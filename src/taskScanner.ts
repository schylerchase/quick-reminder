import { App, TFile, normalizePath } from "obsidian";
import { ScrapedTask } from "./types";

const CHECKBOX_TASK_RE = /^\s*[-*+]\s+\[(?<status>[^\]])\]\s+(?<text>.+)$/;
const TODO_MARKER_RE = /^\s*(?:[-*+]\s+)?(?<marker>TODO|FIXME|TASK):\s*(?<text>.+)$/;
const FENCE_RE = /^\s*(```|~~~)/;
const HEADING_RE = /^\s{0,3}#{1,6}\s+(?<heading>.+?)\s*#*\s*$/;

export class TaskScanner {
  constructor(private app: App) {}

  async scan(ignoredPaths: string[] = []): Promise<ScrapedTask[]> {
    const ignored = new Set(ignoredPaths.map((path) => normalizePath(path)));
    const files = this.app.vault.getMarkdownFiles();
    const results = await Promise.all(
      files
        .filter((file) => !ignored.has(normalizePath(file.path)))
        .map((file) => this.scanFile(file)),
    );
    return results
      .flat()
      .sort((a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line);
  }

  private async scanFile(file: TFile): Promise<ScrapedTask[]> {
    const content = await this.app.vault.cachedRead(file);
    const lines = content.split(/\r?\n/);
    const tasks: ScrapedTask[] = [];
    const state = new MarkdownScanState(lines);

    lines.forEach((line, index) => {
      if (state.shouldSkip(line, index)) {
        return;
      }

      if (state.consumeHeading(line)) {
        return;
      }

      const task = parseTaskLine(file, line, index + 1, state.currentCategory);
      if (task) {
        tasks.push(task);
      }
    });

    return tasks;
  }

  async completeCheckbox(task: ScrapedTask): Promise<boolean> {
    return this.setCheckboxStatus(task, "completed");
  }

  async uncompleteCheckbox(task: ScrapedTask): Promise<boolean> {
    return this.setCheckboxStatus(task, "todo");
  }

  async setCheckboxStatus(task: ScrapedTask, status: "todo" | "in-progress" | "completed"): Promise<boolean> {
    if (task.kind !== "checkbox") return false;
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) return false;

    const content = await this.app.vault.read(file);
    const lines = content.split(/\r?\n/);
    const index = task.line - 1;
    const line = lines[index];
    if (!line || !CHECKBOX_TASK_RE.test(line)) return false;

    lines[index] = line.replace(/\[[^\]]\]/, `[${getCheckboxStatusMarker(status)}]`);
    await this.app.vault.modify(file, lines.join(content.includes("\r\n") ? "\r\n" : "\n"));
    return true;
  }

  async readTaskLine(task: ScrapedTask): Promise<string | null> {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) return null;

    const content = await this.app.vault.read(file);
    const line = content.split(/\r?\n/)[task.line - 1];
    return line ?? null;
  }

  async replaceTaskLine(task: ScrapedTask, nextLine: string): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) return false;

    const content = await this.app.vault.read(file);
    const newline = content.includes("\r\n") ? "\r\n" : "\n";
    const lines = content.split(/\r?\n/);
    const index = task.line - 1;
    const line = lines[index];
    if (!line || !CHECKBOX_TASK_RE.test(line)) return false;

    lines[index] = nextLine;
    await this.app.vault.modify(file, lines.join(newline));
    return true;
  }

  async deleteTaskLine(task: ScrapedTask): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) return false;

    const content = await this.app.vault.read(file);
    const newline = content.includes("\r\n") ? "\r\n" : "\n";
    const lines = content.split(/\r?\n/);
    const index = task.line - 1;
    const line = lines[index];
    if (!line || !isScannableTaskLine(line)) return false;

    lines.splice(index, 1);
    await this.app.vault.modify(file, lines.join(newline));
    return true;
  }
}

class MarkdownScanState {
  private inCodeFence = false;
  private inFrontmatter: boolean;
  currentCategory = "Uncategorized";

  constructor(lines: string[]) {
    this.inFrontmatter = lines[0]?.trim() === "---";
  }

  shouldSkip(line: string, index: number): boolean {
    if (this.consumeFrontmatterBoundary(line, index)) {
      return true;
    }
    if (this.inFrontmatter) {
      return true;
    }
    if (FENCE_RE.test(line)) {
      this.inCodeFence = !this.inCodeFence;
      return true;
    }
    return this.inCodeFence;
  }

  private consumeFrontmatterBoundary(line: string, index: number): boolean {
    const isClosingBoundary = index > 0 && this.inFrontmatter && line.trim() === "---";
    this.inFrontmatter = isClosingBoundary ? false : this.inFrontmatter;
    return isClosingBoundary;
  }

  consumeHeading(line: string): boolean {
    const heading = line.match(HEADING_RE)?.groups?.heading?.trim();
    if (!heading) {
      return false;
    }
    this.currentCategory = heading;
    return true;
  }
}

function parseTaskLine(file: TFile, line: string, lineNumber: number, category: string): ScrapedTask | null {
  return parseCheckboxTask(file, line, lineNumber, category) ?? parseMarkerTask(file, line, lineNumber, category);
}

function isScannableTaskLine(line: string): boolean {
  return CHECKBOX_TASK_RE.test(line) || TODO_MARKER_RE.test(line);
}

function parseCheckboxTask(file: TFile, line: string, lineNumber: number, category: string): ScrapedTask | null {
  const checkbox = line.match(CHECKBOX_TASK_RE);
  if (!checkbox?.groups) {
    return null;
  }
  const status = getCheckboxStatus(checkbox.groups.status);

  return {
    id: `${file.path}:${lineNumber}:checkbox`,
    text: checkbox.groups.text.trim(),
    filePath: file.path,
    line: lineNumber,
    kind: "checkbox",
    status,
    completed: status === "completed",
    category,
    project: getProjectName(file),
  };
}

function parseMarkerTask(file: TFile, line: string, lineNumber: number, category: string): ScrapedTask | null {
  const marker = line.match(TODO_MARKER_RE);
  const markerText = marker?.groups?.text.trim();
  if (!marker?.groups || !markerText) {
    return null;
  }

  const markerName = marker.groups.marker.toUpperCase();
  return {
    id: `${file.path}:${lineNumber}:${markerName}`,
    text: markerText,
    filePath: file.path,
    line: lineNumber,
    kind: "marker",
    status: "marker",
    completed: false,
    category,
    project: getProjectName(file),
    marker: markerName,
  };
}

function getCheckboxStatus(status: string): ScrapedTask["status"] {
  const normalized = status.trim().toLowerCase();
  if (normalized === "x") {
    return "completed";
  }
  if (normalized === "/") {
    return "in-progress";
  }
  return "todo";
}

function getCheckboxStatusMarker(status: "todo" | "in-progress" | "completed"): string {
  if (status === "completed") {
    return "x";
  }
  if (status === "in-progress") {
    return "/";
  }
  return " ";
}

function getProjectName(file: TFile): string {
  const parts = file.path.split("/");
  if (parts[0]?.toLowerCase() === "projects" && parts[1]) {
    return parts[1];
  }
  if (parts.length > 1) {
    return parts[0];
  }
  return file.basename;
}
