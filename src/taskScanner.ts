import { App, TFile, normalizePath } from "obsidian";
import { ScrapedTask } from "./types";

const CHECKBOX_TASK_RE = /^\s*[-*+]\s+\[(?<status>[^\]])\]\s+(?<text>.+)$/;
const TODO_MARKER_RE =
  /^\s*(?:[-*+]\s+)?(?<marker>TODO|FIXME|TASK):\s*(?<text>.+)$/;
const FENCE_RE = /^\s*(```|~~~)/;
const HEADING_RE = /^\s{0,3}#{1,6}\s+(?<heading>.+?)\s*#*\s*$/;
const MANAGED_BLOCK_START_RE = /^\s*<!--\s*qr:tasks:start\s*-->\s*$/;
const MANAGED_BLOCK_END_RE = /^\s*<!--\s*qr:tasks:end\s*-->\s*$/;

export class TaskScanner {
  constructor(
    private app: App,
    /**
     * Called BEFORE every internal vault.process write so subscribers can
     * register the path as an expected self-modify. The view uses this to
     * suppress exactly one modify event per write — replacing the prior
     * 800ms time-window suppression which could swallow real user edits.
     */
    private onWillModifyFile: (path: string) => void = () => {},
  ) {}

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

  /**
   * Scan a single file. Public so the view's incremental refresh (F06) can
   * re-scan only the changed file and splice its tasks into the cached list,
   * instead of re-parsing every markdown file in the vault on each edit.
   */
  async scanFile(file: TFile): Promise<ScrapedTask[]> {
    const content = await this.app.vault.cachedRead(file);
    const lines = content.split(/\r?\n/);
    const tasks: ScrapedTask[] = [];
    const state = new MarkdownScanState(lines);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (state.shouldSkip(line, index)) {
        continue;
      }

      if (state.consumeHeading(line)) {
        continue;
      }

      const task = parseTaskLine(file, line, index + 1, state.currentCategory);
      if (task) {
        const context = collectTaskContextNotes(lines, index);
        task.contextNotes = context.notes;
        task.contextNoteLines = context.lines;
        tasks.push(task);
        index = context.lastIndex;
      }
    }

    return tasks;
  }

  async completeCheckbox(task: ScrapedTask): Promise<boolean> {
    return (await this.setCheckboxStatus(task, "completed")) !== null;
  }

  async uncompleteCheckbox(task: ScrapedTask): Promise<boolean> {
    return (await this.setCheckboxStatus(task, "todo")) !== null;
  }

  async setCheckboxStatus(
    task: ScrapedTask,
    status: "todo" | "in-progress" | "completed",
  ): Promise<ScrapedTask | null> {
    if (task.kind !== "checkbox") return null;
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) return null;

    let updatedTask: ScrapedTask | null = null;

    this.onWillModifyFile(file.path);
    await this.app.vault.process(file, (content) => {
      const newline = content.includes("\r\n") ? "\r\n" : "\n";
      const lines = content.split(/\r?\n/);
      const index = resolveTaskLineIndex(file, lines, task);
      if (index === -1) return content;
      const line = lines[index];

      const context = collectTaskContextNotes(lines, index);
      const block = lines.slice(index, context.lastIndex + 1);
      block[0] = updateStatusMetadata(
        line.replace(/\[[^\]]\]/, `[${getCheckboxStatusMarker(status)}]`),
        status,
      );
      lines.splice(index, block.length);
      const sectionHeading = getTaskSectionHeading(status);
      const insertIndex = ensureTaskSectionInsertIndex(lines, sectionHeading);
      lines.splice(insertIndex, 0, ...block);
      updatedTask = parseCheckboxTask(
        file,
        block[0],
        insertIndex + 1,
        sectionHeading,
      );
      if (updatedTask) {
        const contextLines = block.slice(1);
        updatedTask.contextNotes = contextLines
          .map((noteLine) => stripTaskContextNote(noteLine))
          .filter(Boolean);
        updatedTask.contextNoteLines = contextLines;
      }
      return lines.join(newline);
    });

    return updatedTask;
  }

  async setCheckboxText(
    task: ScrapedTask,
    newText: string,
  ): Promise<ScrapedTask | null> {
    if (task.kind !== "checkbox") return null;
    const cleaned = newText.trim();
    if (cleaned.length === 0) return null;
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) return null;

    let updated: ScrapedTask | null = null;
    this.onWillModifyFile(file.path);
    await this.app.vault.process(file, (content) => {
      const newline = content.includes("\r\n") ? "\r\n" : "\n";
      const lines = content.split(/\r?\n/);
      const index = resolveTaskLineIndex(file, lines, task);
      if (index === -1) return content;
      const line = lines[index];
      const match = line.match(CHECKBOX_TASK_RE);
      if (!match?.groups) return content;
      const prefix = line.slice(0, line.indexOf(`[${match.groups.status}]`));
      const rewritten = `${prefix}[${match.groups.status}] ${cleaned}`;
      lines[index] = rewritten;
      updated = parseCheckboxTask(file, rewritten, task.line, task.category);
      if (updated) {
        updated.contextNotes = task.contextNotes;
        updated.contextNoteLines = task.contextNoteLines;
      }
      return lines.join(newline);
    });
    return updated;
  }

  async organizeTopLevelTaskSections(
    filePath: string,
    allowedHeadings?: readonly string[],
  ): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return false;

    const allowed = allowedHeadings
      ? new Set(allowedHeadings.map((h) => h.toLowerCase()))
      : null;
    let changed = false;

    this.onWillModifyFile(file.path);
    await this.app.vault.process(file, (content) => {
      const newline = content.includes("\r\n") ? "\r\n" : "\n";
      const lines = content.split(/\r?\n/);
      const tasksHeading = findHeadingIndex(lines, "Tasks");
      if (tasksHeading === -1) return content;

      const tasksEnd = findNextHeadingAtOrAbove(lines, tasksHeading + 1, 2);
      const endIndex = tasksEnd === -1 ? lines.length : tasksEnd;
      const moves: Array<{
        start: number;
        end: number;
        section: string;
        block: string[];
      }> = [];
      let currentSection = "";
      let inCodeFence = false;
      let inManagedBlock = false;

      for (let index = tasksHeading + 1; index < endIndex; index += 1) {
        // F18: skip the qr:tasks managed (mirror) block. Its indent-0 mirror
        // checkboxes match the task filter below, so without tracking the
        // delimiter comments this loop would splice mirror lines OUT of the
        // auto-generated block and into a `###` section — corrupting the
        // mirror and producing a duplicated/desynced task. Mirrors the
        // delimiter handling in MarkdownScanState.shouldSkip.
        if (inManagedBlock) {
          if (MANAGED_BLOCK_END_RE.test(lines[index])) inManagedBlock = false;
          continue;
        }
        if (MANAGED_BLOCK_START_RE.test(lines[index])) {
          inManagedBlock = true;
          continue;
        }
        // Track fence parity so a code-block example like "- [x] do thing"
        // inside ```...``` is treated as content, not a real task. Without
        // this, the splice below would pull the example out of the fence
        // and corrupt the rendered note.
        if (FENCE_RE.test(lines[index])) {
          inCodeFence = !inCodeFence;
          continue;
        }
        if (inCodeFence) continue;
        const heading = lines[index].match(HEADING_RE)?.groups?.heading?.trim();
        if (heading) {
          currentSection = heading;
          continue;
        }
        if (
          getIndentLength(lines[index]) !== 0 ||
          !CHECKBOX_TASK_RE.test(lines[index])
        ) {
          continue;
        }

        const task = parseCheckboxTask(
          file,
          lines[index],
          index + 1,
          currentSection,
        );
        if (!task) continue;
        if (!isSectionManagedCheckboxStatus(task.status)) continue;

        const section = getTaskSectionHeading(task.status);
        // Only inject sections the user opted in to via taskSectionHeadings.
        // Otherwise an auto-organize on modify could silently create a brand
        // new "Cancelled" heading the user never wanted.
        if (allowed && !allowed.has(section.toLowerCase())) continue;
        if (section.toLowerCase() === currentSection.toLowerCase()) {
          continue;
        }

        const context = collectTaskContextNotes(lines, index);
        moves.push({
          start: index,
          end: context.lastIndex,
          section,
          block: lines.slice(index, context.lastIndex + 1),
        });
        index = context.lastIndex;
      }

      if (moves.length === 0) return content;

      for (const move of [...moves].sort((a, b) => b.start - a.start)) {
        lines.splice(move.start, move.end - move.start + 1);
      }

      for (const move of moves) {
        const insertIndex = ensureTaskSectionInsertIndex(lines, move.section);
        lines.splice(insertIndex, 0, ...move.block);
      }

      changed = true;
      return lines.join(newline);
    });

    return changed;
  }

  async appendTask(
    filePath: string,
    text: string,
    contextNotes: string[] = [],
  ): Promise<ScrapedTask | null> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return null;

    let task: ScrapedTask | null = null;

    this.onWillModifyFile(file.path);
    await this.app.vault.process(file, (content) => {
      const newline = content.includes("\r\n") ? "\r\n" : "\n";
      const lines = content.split(/\r?\n/);
      const insertIndex = ensureTaskSectionInsertIndex(lines, "To Do");
      const line = `- [ ] ${text.trim()}`;
      const noteLines = formatTaskContextNotes(contextNotes);
      lines.splice(insertIndex, 0, line, ...noteLines);

      task = parseCheckboxTask(file, line, insertIndex + 1, "To Do");
      if (task) {
        task.contextNotes = noteLines
          .map((noteLine) => stripTaskContextNote(noteLine))
          .filter(Boolean);
        task.contextNoteLines = noteLines;
      }
      return lines.join(newline);
    });

    return task;
  }

  async appendTaskContextNote(
    task: ScrapedTask,
    note: string,
  ): Promise<boolean> {
    return this.appendTaskContextNotes(task, [note]);
  }

  async appendTaskContextNotes(
    task: ScrapedTask,
    notes: string[],
  ): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) return false;

    const trimmedNotes = notes.map((note) => note.trim()).filter(Boolean);
    if (trimmedNotes.length === 0) return false;

    let changed = false;

    this.onWillModifyFile(file.path);
    await this.app.vault.process(file, (content) => {
      const newline = content.includes("\r\n") ? "\r\n" : "\n";
      const lines = content.split(/\r?\n/);
      const index = resolveTaskLineIndex(file, lines, task);
      if (index === -1) return content;
      const line = lines[index];

      const context = collectTaskContextNotes(lines, index);
      lines.splice(
        context.lastIndex + 1,
        0,
        ...formatTaskContextNotes(trimmedNotes),
      );
      changed = true;
      return lines.join(newline);
    });

    return changed;
  }

  async replaceTaskContextNotes(
    task: ScrapedTask,
    notes: string[],
  ): Promise<boolean> {
    return this.replaceTaskContextNoteLineArray(
      task,
      formatTaskContextNotes(notes),
    );
  }

  async replaceTaskContextNoteLines(
    task: ScrapedTask,
    rawNoteBlock: string,
  ): Promise<boolean> {
    return this.replaceTaskContextNoteLineArray(task, rawNoteBlock);
  }

  private async replaceTaskContextNoteLineArray(
    task: ScrapedTask,
    noteBlock: string[] | string,
  ): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) return false;

    let changed = false;

    this.onWillModifyFile(file.path);
    await this.app.vault.process(file, (content) => {
      const newline = content.includes("\r\n") ? "\r\n" : "\n";
      const lines = content.split(/\r?\n/);
      const index = resolveTaskLineIndex(file, lines, task);
      if (index === -1) return content;
      const line = lines[index];

      const context = collectTaskContextNotes(lines, index);
      const noteLines = Array.isArray(noteBlock)
        ? noteBlock
        : formatInlineContextNoteLines(noteBlock, getIndentLength(line) + 2);
      lines.splice(index + 1, context.lastIndex - index, ...noteLines);
      changed = true;
      return lines.join(newline);
    });

    return changed;
  }

  async readTaskLine(task: ScrapedTask): Promise<string | null> {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) return null;

    const content = await this.app.vault.read(file);
    const line = content.split(/\r?\n/)[task.line - 1];
    return line ?? null;
  }

  async replaceTaskLine(task: ScrapedTask, nextLine: string): Promise<ScrapedTask | null> {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) return null;

    let updated: ScrapedTask | null = null;

    this.onWillModifyFile(file.path);
    await this.app.vault.process(file, (content) => {
      const newline = content.includes("\r\n") ? "\r\n" : "\n";
      const lines = content.split(/\r?\n/);
      const index = resolveTaskLineIndex(file, lines, task);
      if (index === -1) return content;
      const line = lines[index];

      const nextTask = parseCheckboxTask(file, nextLine, task.line, task.category);
      if (!nextTask) return content;
      nextTask.contextNotes = task.contextNotes;
      nextTask.contextNoteLines = task.contextNoteLines;

      lines[index] = nextLine;
      updated = nextTask;
      return lines.join(newline);
    });

    return updated;
  }

  async deleteTaskLine(task: ScrapedTask): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) return false;

    let changed = false;

    this.onWillModifyFile(file.path);
    await this.app.vault.process(file, (content) => {
      const newline = content.includes("\r\n") ? "\r\n" : "\n";
      const lines = content.split(/\r?\n/);
      const index = resolveTaskLineIndex(file, lines, task);
      if (index === -1) return content;
      const line = lines[index];

      const context = collectTaskContextNotes(lines, index);
      lines.splice(index, context.lastIndex - index + 1);
      changed = true;
      return lines.join(newline);
    });

    return changed;
  }
}

class MarkdownScanState {
  private inCodeFence = false;
  private inFrontmatter: boolean;
  private inManagedBlock = false;
  currentCategory = "Uncategorized";

  constructor(lines: string[]) {
    // Only treat the opening `---` as frontmatter if there is a closing `---`
    // somewhere in the file. A lone `---` at the top is a horizontal rule
    // (markdown spec) and treating the whole document as frontmatter hides
    // every task in the file silently.
    this.inFrontmatter =
      lines[0]?.trim() === "---" && hasClosingFrontmatterMarker(lines);
  }

  shouldSkip(line: string, index: number): boolean {
    if (this.consumeFrontmatterBoundary(line, index)) {
      return true;
    }
    if (this.inFrontmatter) {
      return true;
    }

    // Managed block is a mirror of above-block tasks; counting its lines too
    // would double the task list. Track via delimiter comments and skip
    // everything between them (inclusive).
    if (this.inManagedBlock) {
      if (MANAGED_BLOCK_END_RE.test(line)) {
        this.inManagedBlock = false;
      }
      return true;
    }
    if (FENCE_RE.test(line)) {
      this.inCodeFence = !this.inCodeFence;
      return true;
    }
    if (this.inCodeFence) return true;

    if (MANAGED_BLOCK_START_RE.test(line)) {
      this.inManagedBlock = true;
      return true;
    }
    return MANAGED_BLOCK_END_RE.test(line);
  }

  private consumeFrontmatterBoundary(line: string, index: number): boolean {
    const isClosingBoundary =
      index > 0 && this.inFrontmatter && line.trim() === "---";
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

function parseTaskLine(
  file: TFile,
  line: string,
  lineNumber: number,
  category: string,
): ScrapedTask | null {
  return (
    parseCheckboxTask(file, line, lineNumber, category) ??
    parseMarkerTask(file, line, lineNumber, category)
  );
}

function isScannableTaskLine(line: string): boolean {
  return CHECKBOX_TASK_RE.test(line) || TODO_MARKER_RE.test(line);
}

/**
 * F05: confirm the line at a cached index still belongs to `task`. The cached
 * `task.line` goes stale whenever a prior dashboard action relocated a task
 * block (e.g. setCheckboxStatus moves the block under a different `###`
 * heading), shifting every other task's line number. Comparing the parsed
 * line's stable id (filePath + kind + identity text — status fields excluded,
 * so a status change does NOT break identity) is how scanFile recognises the
 * same task across edits.
 */
function taskLineIdentityMatches(
  file: TFile,
  line: string | undefined,
  task: ScrapedTask,
): boolean {
  if (!line) return false;
  const parsed = parseTaskLine(file, line, task.line, task.category);
  return parsed !== null && parsed.id === task.id;
}

/**
 * Resolve the current index of `task` within `lines`, re-verifying identity
 * before any splice. Returns the cached index when it still matches; otherwise
 * searches for the UNIQUE line whose identity matches. Returns -1 when zero or
 * more than one line matches (ambiguous duplicate) — the caller MUST abort the
 * write rather than mutate or delete the wrong task.
 */
function resolveTaskLineIndex(
  file: TFile,
  lines: string[],
  task: ScrapedTask,
): number {
  const cached = task.line - 1;
  if (
    cached >= 0 &&
    cached < lines.length &&
    taskLineIdentityMatches(file, lines[cached], task)
  ) {
    return cached;
  }
  let found = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (taskLineIdentityMatches(file, lines[index], task)) {
      if (found !== -1) return -1; // ambiguous: refuse to guess which is meant
      found = index;
    }
  }
  return found;
}

function parseCheckboxTask(
  file: TFile,
  line: string,
  lineNumber: number,
  category: string,
): ScrapedTask | null {
  const checkbox = line.match(CHECKBOX_TASK_RE);
  if (!checkbox?.groups) {
    return null;
  }
  const status = getCheckboxStatus(
    checkbox.groups.status,
    checkbox.groups.text,
  );
  const text = cleanTaskText(checkbox.groups.text);

  return {
    id: buildCheckboxTaskId(file.path, text),
    legacyIds: [
      `${file.path}:${lineNumber}:checkbox`,
      `${file.path}:${lineNumber}:checkbox:${text}`,
    ],
    text,
    contextNotes: [],
    contextNoteLines: [],
    filePath: file.path,
    line: lineNumber,
    kind: "checkbox",
    status,
    completed: status === "completed",
    category,
    project: getProjectName(file),
  };
}

function parseMarkerTask(
  file: TFile,
  line: string,
  lineNumber: number,
  category: string,
): ScrapedTask | null {
  const marker = line.match(TODO_MARKER_RE);
  const markerText = marker?.groups?.text.trim();
  if (!marker?.groups || !markerText) {
    return null;
  }

  const markerName = marker.groups.marker.toUpperCase();
  return {
    id: buildMarkerTaskId(file.path, markerName, markerText),
    legacyIds: [`${file.path}:${lineNumber}:${markerName}`],
    text: markerText,
    contextNotes: [],
    contextNoteLines: [],
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

export function buildCheckboxTaskId(filePath: string, text: string): string {
  return `task:${stableHash([filePath, "checkbox", normalizeTaskIdentityText(text)].join("\u001f"))}`;
}

/**
 * Extract the post-checkbox task text from a raw markdown line, normalized the
 * same way the scanner does. Returns null if the line is not a checkbox task.
 *
 * Use this when computing `sourceTaskId` for a freshly created task so the id
 * matches what scanFile() will compute on the next scan.
 */
export function extractCheckboxTaskText(line: string): string | null {
  const match = line.match(CHECKBOX_TASK_RE);
  if (!match?.groups) return null;
  return cleanTaskText(match.groups.text);
}

function buildMarkerTaskId(
  filePath: string,
  markerName: string,
  text: string,
): string {
  return `task:${stableHash([filePath, markerName, normalizeTaskIdentityText(text)].join("\u001f"))}`;
}

function normalizeTaskIdentityText(text: string): string {
  return cleanTaskText(text).toLowerCase().replace(/\s+/g, " ").trim();
}

function hasClosingFrontmatterMarker(lines: string[]): boolean {
  // Scan only the first ~50 lines and ignore `---` markers inside a code
  // fence. Without the fence guard, an unclosed YAML header followed by a
  // ``` fence containing `---` would wrongly extend "frontmatter" past the
  // fence, silently dropping every task in between.
  const limit = Math.min(lines.length, 50);
  let inFence = false;
  for (let index = 1; index < limit; index += 1) {
    const line = lines[index];
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (line.trim() === "---") return true;
  }
  return false;
}

function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function collectTaskContextNotes(
  lines: string[],
  taskIndex: number,
): { notes: string[]; lines: string[]; lastIndex: number } {
  const taskIndent = getIndentLength(lines[taskIndex]);
  const notes: string[] = [];
  const contextLines: string[] = [];
  let lastIndex = taskIndex;

  for (let index = taskIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "") {
      break;
    }

    const indent = getIndentLength(line);
    if (indent <= taskIndent) {
      break;
    }
    if (isScannableTaskLine(line)) {
      break;
    }
    // Don't consume code-fence markers as context. Otherwise the outer
    // scan loop never sees the fence, MarkdownScanState's parity is wrong,
    // and tasks below either disappear or fenced code is scraped as tasks.
    if (FENCE_RE.test(line)) {
      break;
    }

    const note = stripTaskContextNote(line);
    if (note) {
      notes.push(note);
    }
    contextLines.push(line);
    lastIndex = index;
  }

  return { notes, lines: contextLines, lastIndex };
}

function getIndentLength(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function stripTaskContextNote(line: string): string {
  return cleanTaskText(
    line
      .trim()
      .replace(/^[-*+]\s+/, "")
      .trim(),
  );
}

function formatTaskContextNotes(notes: string[]): string[] {
  return notes
    .map((note) => note.trim())
    .filter(Boolean)
    .map((note) => `  - ${note}`);
}

function formatInlineContextNoteLines(
  rawNoteBlock: string,
  baseIndentLength: number,
): string[] {
  const lines = rawNoteBlock
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line) => line.trim() !== "");
  const commonIndent = getCommonIndentLength(lines);
  const baseIndent = " ".repeat(baseIndentLength);
  return lines.map((line) => `${baseIndent}${line.slice(commonIndent)}`);
}

function getCommonIndentLength(lines: string[]): number {
  const indentedLines = lines.filter((line) => line.trim() !== "");
  if (indentedLines.length === 0) return 0;
  return Math.min(...indentedLines.map((line) => getIndentLength(line)));
}

function getCheckboxStatus(
  status: string,
  text: string,
): ScrapedTask["status"] {
  const normalized = status.trim().toLowerCase();
  const normalizedText = text.toLowerCase();
  const statusValue =
    getInlineFieldValue(text, "status") ??
    getInlineFieldValue(text, "currentStatus");
  const normalizedStatusValue = normalizeStatusValue(statusValue);
  if (
    normalized === "-" ||
    normalizedStatusValue === "cancelled" ||
    hasInlineField(normalizedText, "cancelled")
  ) {
    return "cancelled";
  }
  if (
    normalized === "x" ||
    normalizedStatusValue === "completed" ||
    hasInlineField(normalizedText, "completion")
  ) {
    return "completed";
  }
  if (
    normalized === "/" ||
    normalizedStatusValue === "in-progress" ||
    hasInlineField(normalizedText, "inprogress")
  ) {
    return "in-progress";
  }
  return "todo";
}

function isSectionManagedCheckboxStatus(
  status: ScrapedTask["status"],
): status is "todo" | "in-progress" | "completed" | "cancelled" {
  return (
    status === "todo" ||
    status === "in-progress" ||
    status === "completed" ||
    status === "cancelled"
  );
}

// F21: the field-name regexes below are templated on a fixed set of field
// names known at module load, but were previously recompiled (new RegExp) on
// every checkbox line of every file on every scan. Memoize one RegExp per
// (shape, fieldName) so the scan hot path reuses them.
const hasFieldReCache = new Map<string, RegExp>();
const removeFieldReCache = new Map<string, RegExp>();
const valueFieldReCache = new Map<string, RegExp>();

function memoRe(
  cache: Map<string, RegExp>,
  fieldName: string,
  make: () => RegExp,
): RegExp {
  let re = cache.get(fieldName);
  if (!re) {
    re = make();
    cache.set(fieldName, re);
  }
  return re;
}

function hasInlineField(normalizedText: string, fieldName: string): boolean {
  return memoRe(
    hasFieldReCache,
    fieldName,
    () => new RegExp(`\\[\\s*${fieldName}\\s*::`),
  ).test(normalizedText);
}

function getCheckboxStatusMarker(
  status: "todo" | "in-progress" | "completed",
): string {
  if (status === "completed") {
    return "x";
  }
  if (status === "in-progress") {
    return "/";
  }
  return " ";
}

function updateStatusMetadata(
  line: string,
  status: "todo" | "in-progress" | "completed",
): string {
  let updated = removeInlineField(line, "inProgress");
  updated = removeInlineField(updated, "completion");
  updated = removeInlineField(updated, "status");
  updated = removeInlineField(updated, "currentStatus");
  // Strip [cancelled:: ...] too — getCheckboxStatus inspects this field
  // FIRST, so leaving it behind silently reverts a Done/To-Do click back
  // to "cancelled" on the next scan.
  updated = removeInlineField(updated, "cancelled");
  if (status === "in-progress") {
    return appendInlineField(updated, "status", "In Progress");
  }
  if (status === "completed") {
    return appendInlineField(updated, "status", "Completed");
  }
  return updated.trimEnd();
}

function removeInlineField(line: string, fieldName: string): string {
  return line
    .replace(
      memoRe(
        removeFieldReCache,
        fieldName,
        () => new RegExp(`\\s*\\[\\s*${fieldName}\\s*::[^\\]]*\\]`, "gi"),
      ),
      "",
    )
    .trimEnd();
}

function appendInlineField(
  line: string,
  fieldName: string,
  value: string,
): string {
  return `${line.trimEnd()} [${fieldName}:: ${value}]`;
}

function cleanTaskText(text: string): string {
  return stripStatusFields(text)
    .replace(/\s{2,}/g, " ")
    .trim();
}

// F21: precompiled once instead of rebuilt per call (stripStatusFields runs on
// every checkbox line via cleanTaskText/parseCheckboxTask).
const STATUS_FIELD_NAMES = [
  "status",
  "currentStatus",
  "inProgress",
  "completion",
  "cancelled",
] as const;
const STRIP_STATUS_FIELD_RES = STATUS_FIELD_NAMES.map(
  (fieldName) =>
    new RegExp("\\s*`?\\[\\s*" + fieldName + "\\s*::[^\\]]*\\]`?", "gi"),
);

function stripStatusFields(text: string): string {
  let updated = text;
  for (const re of STRIP_STATUS_FIELD_RES) {
    updated = updated.replace(re, "");
  }
  return updated.trim();
}

function getInlineFieldValue(text: string, fieldName: string): string | null {
  const match = text.match(
    memoRe(
      valueFieldReCache,
      fieldName,
      () => new RegExp(`\\[\\s*${fieldName}\\s*::\\s*([^\\]]+)\\]`, "i"),
    ),
  );
  return match?.[1]?.replace(/`/g, "").trim() ?? null;
}

function normalizeStatusValue(
  value: string | null,
): ScrapedTask["status"] | null {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  if (!normalized) return null;
  if (normalized === "inprogress") return "in-progress";
  if (normalized === "todo" || normalized === "to") return "todo";
  if (
    normalized === "completed" ||
    normalized === "complete" ||
    normalized === "done"
  )
    return "completed";
  if (normalized === "cancelled" || normalized === "canceled")
    return "cancelled";
  return null;
}

function ensureTaskSectionInsertIndex(
  lines: string[],
  sectionHeading: string,
): number {
  let tasksHeading = findHeadingIndex(lines, "Tasks");
  if (tasksHeading === -1) {
    if (lines.length > 0 && lines[lines.length - 1].trim() !== "") {
      lines.push("");
    }
    lines.push("## Tasks", "", `### ${sectionHeading}`, "");
    return lines.length;
  }

  let sectionIndex = findTaskSectionHeadingIndex(
    lines,
    sectionHeading,
    tasksHeading,
  );
  if (sectionIndex === -1) {
    const nextTopLevel = findNextHeadingAtOrAbove(lines, tasksHeading + 1, 2);
    const insertHeadingAt = nextTopLevel === -1 ? lines.length : nextTopLevel;
    const headingBlock = ["", `### ${sectionHeading}`, ""];
    lines.splice(insertHeadingAt, 0, ...headingBlock);
    sectionIndex = insertHeadingAt + 1;
  }

  let insertAt = sectionIndex + 1;
  while (insertAt < lines.length && lines[insertAt].trim() === "") {
    insertAt += 1;
  }
  return insertAt;
}

function getTaskSectionHeading(
  status: "todo" | "in-progress" | "completed" | "cancelled",
): string {
  if (status === "in-progress") {
    return "In Progress";
  }
  if (status === "completed") {
    return "Completed";
  }
  if (status === "cancelled") {
    return "Cancelled";
  }
  return "To Do";
}

function findTaskSectionHeadingIndex(
  lines: string[],
  headingName: string,
  tasksHeadingIndex: number,
): number {
  const nextTopLevel = findNextHeadingAtOrAbove(
    lines,
    tasksHeadingIndex + 1,
    2,
  );
  const endIndex = nextTopLevel === -1 ? lines.length : nextTopLevel;
  for (let i = tasksHeadingIndex + 1; i < endIndex; i += 1) {
    const heading = lines[i].match(HEADING_RE)?.groups?.heading?.trim();
    if (heading?.toLowerCase() === headingName.toLowerCase()) {
      return i;
    }
  }
  return -1;
}

function findHeadingIndex(
  lines: string[],
  headingName: string,
  startIndex = 0,
): number {
  for (let i = startIndex; i < lines.length; i += 1) {
    const heading = lines[i].match(HEADING_RE)?.groups?.heading?.trim();
    if (heading?.toLowerCase() === headingName.toLowerCase()) {
      return i;
    }
  }
  return -1;
}

function findNextHeadingAtOrAbove(
  lines: string[],
  startIndex: number,
  maxLevel: number,
): number {
  for (let i = startIndex; i < lines.length; i += 1) {
    const match = lines[i].match(/^\s{0,3}(#{1,6})\s+/);
    if (match && match[1].length <= maxLevel) {
      return i;
    }
  }
  return -1;
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
