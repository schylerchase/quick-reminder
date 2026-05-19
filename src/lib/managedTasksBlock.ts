/**
 * Pure utilities for the "managed tasks" block in a markdown file.
 *
 * A managed block is bounded by:
 *
 *   <!-- qr:tasks:start -->
 *   ...content...
 *   <!-- qr:tasks:end -->
 *
 * Inside the block:
 *   - `## Heading` lines define phase/category names.
 *   - Standard checkbox tasks (`- [ ] text`) belong to the nearest preceding `##`.
 *   - Tasks appearing before any `##` go in the implicit "Inbox" group.
 *
 * No Obsidian runtime deps — safe to unit test in plain Node.
 */

export const DELIMITER_START = "<!-- qr:tasks:start -->";
export const DELIMITER_END = "<!-- qr:tasks:end -->";

export type ManagedTaskStatus =
  | "todo"
  | "in-progress"
  | "completed"
  | "cancelled";

export interface ManagedTask {
  text: string;
  status: ManagedTaskStatus;
  rawStatusChar: string; // ' ', 'x', '/', '-', etc. preserves source char
}

export interface TaskGroup {
  heading: string;
  isInbox: boolean;
  level: number; // markdown heading level (2 for `##`); inbox = 0
  tasks: ManagedTask[];
}

export type ManagedBlockLocation =
  | { present: true; startLine: number; endLine: number }
  | { present: false };

const CHECKBOX_RE = /^\s*[-*+]\s+\[(?<status>[^\]])\]\s+(?<text>.+?)\s*$/;
const HEADING_RE = /^(?<hashes>#{1,6})\s+(?<heading>.+?)\s*#*\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;

const STATUS_FROM_CHAR: Record<string, ManagedTaskStatus> = {
  " ": "todo",
  x: "completed",
  X: "completed",
  "/": "in-progress",
  "-": "cancelled",
};

export function findManagedBlock(content: string): ManagedBlockLocation {
  const lines = content.split(/\r?\n/);
  let startLine = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (startLine === -1 && trimmed === DELIMITER_START) {
      startLine = i;
      continue;
    }
    if (startLine !== -1 && trimmed === DELIMITER_END) {
      return { present: true, startLine, endLine: i };
    }
  }
  return { present: false };
}

export function insertEmptyManagedBlock(content: string): string {
  if (findManagedBlock(content).present) return content;
  const trailing = content.endsWith("\n") ? "" : "\n";
  const spacer = content.length === 0 || content.endsWith("\n\n") ? "" : "\n";
  return `${content}${trailing}${spacer}${DELIMITER_START}\n${DELIMITER_END}\n`;
}

export function removeManagedBlock(content: string): string {
  const loc = findManagedBlock(content);
  if (!loc.present) return content;
  const lines = content.split(/\r?\n/);
  const trailingNewline = content.endsWith("\n");
  // Remove delimiter lines and everything between, plus one trailing blank line if present.
  const removeStart = loc.startLine;
  let removeEnd = loc.endLine; // inclusive
  // Drop a single empty separator line just before the block, if present.
  let trimBefore = 0;
  if (removeStart > 0 && lines[removeStart - 1].trim() === "") trimBefore = 1;
  lines.splice(removeStart - trimBefore, removeEnd - removeStart + 1 + trimBefore);
  const out = lines.join("\n");
  return trailingNewline && !out.endsWith("\n") ? `${out}\n` : out;
}

export function extractManagedBlockContent(content: string): string | null {
  const loc = findManagedBlock(content);
  if (!loc.present) return null;
  const lines = content.split(/\r?\n/);
  return lines.slice(loc.startLine + 1, loc.endLine).join("\n");
}

export function replaceManagedBlockContent(
  content: string,
  newInner: string,
): string {
  const loc = findManagedBlock(content);
  const innerTrimmed = newInner.replace(/^\n+|\n+$/g, "");
  if (!loc.present) {
    const withBlock = insertEmptyManagedBlock(content);
    return replaceManagedBlockContent(withBlock, innerTrimmed);
  }
  const lines = content.split(/\r?\n/);
  const before = lines.slice(0, loc.startLine + 1);
  const after = lines.slice(loc.endLine);
  const innerLines = innerTrimmed.length === 0 ? [] : innerTrimmed.split("\n");
  return [...before, ...innerLines, ...after].join("\n");
}

export function parseGroupsFromContent(content: string): TaskGroup[] {
  const lines = content.split(/\r?\n/);
  const groups: TaskGroup[] = [];
  let current: TaskGroup = {
    heading: "Inbox",
    isInbox: true,
    level: 0,
    tasks: [],
  };
  let inCodeFence = false;
  let inFrontmatter =
    lines[0]?.trim() === "---" &&
    lines.slice(1).some((l) => l.trim() === "---");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (inFrontmatter) {
      if (i > 0 && line.trim() === "---") inFrontmatter = false;
      continue;
    }
    if (FENCE_RE.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    const heading = line.match(HEADING_RE);
    if (heading?.groups) {
      const level = heading.groups.hashes.length;
      // H1 is the document title — never a phase boundary. Only `##`+ count.
      if (level < 2) continue;
      // Push current if it had any tasks OR was a real heading (non-inbox).
      if (current.tasks.length > 0 || !current.isInbox) {
        groups.push(current);
      }
      current = {
        heading: heading.groups.heading.trim(),
        isInbox: false,
        level,
        tasks: [],
      };
      continue;
    }

    const checkbox = line.match(CHECKBOX_RE);
    if (checkbox?.groups) {
      const ch = checkbox.groups.status;
      current.tasks.push({
        text: checkbox.groups.text.trim(),
        status: STATUS_FROM_CHAR[ch] ?? "todo",
        rawStatusChar: ch,
      });
    }
  }
  if (current.tasks.length > 0 || !current.isInbox) groups.push(current);
  return groups;
}

export function renderGroupsToMarkdown(groups: TaskGroup[]): string {
  // Inbox must lead — pre-heading tasks have no parent heading to stick to.
  // Otherwise reparsing yields wrong grouping (loose tasks bleed under prior heading).
  const ordered = [
    ...groups.filter((g) => g.isInbox),
    ...groups.filter((g) => !g.isInbox),
  ];
  const sections: string[] = [];
  for (const group of ordered) {
    const taskLines = group.tasks.map(
      (t) => `- [${t.rawStatusChar}] ${t.text}`,
    );
    if (group.isInbox) {
      if (taskLines.length === 0) continue;
      sections.push(taskLines.join("\n"));
      continue;
    }
    const hashes = "#".repeat(group.level || 2);
    sections.push([`${hashes} ${group.heading}`, ...taskLines].join("\n"));
  }
  return sections.join("\n\n");
}
