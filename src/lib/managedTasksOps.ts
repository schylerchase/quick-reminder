/**
 * Higher-level pure transformations on file content involving the managed block.
 *
 * Model:
 *   - The managed block is a MIRROR (like an auto-TOC). Source-of-truth tasks
 *     live ABOVE the delimiters under `## headings`.
 *   - Regenerate parses everything above the block, groups by heading, and
 *     overwrites the block content.
 *   - UI ops (add/check/rename) mutate the canonical region above the block,
 *     not the block itself. Then we regenerate.
 *
 * All functions are pure (string in → string out) so they unit-test cleanly.
 */

import {
  DELIMITER_START,
  DELIMITER_END,
  findManagedBlock,
  insertEmptyManagedBlock,
  parseGroupsFromContent,
  renderGroupsToMarkdown,
  replaceManagedBlockContent,
  type TaskGroup,
} from "./managedTasksBlock";

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const CHECKBOX_RE = /^(\s*[-*+]\s+\[)([^\]])(\]\s+.+)$/;
const CHECKBOX_TASK_RE = /^\s*[-*+]\s+\[[^\]]\]\s+/m;

export enum CONTENT_REGION {
  WithBlock = "with-block",
  NoBlock = "no-block",
}

export type ContentRegion =
  | {
      kind: CONTENT_REGION.WithBlock;
      before: string;
      blockContent: string;
      after: string;
      startLine: number;
      endLine: number;
    }
  | { kind: CONTENT_REGION.NoBlock };

export function findContentRegion(content: string): ContentRegion {
  const loc = findManagedBlock(content);
  if (!loc.present) return { kind: CONTENT_REGION.NoBlock };
  const lines = content.split(/\r?\n/);
  const before = lines.slice(0, loc.startLine).join("\n");
  const blockContent = lines.slice(loc.startLine + 1, loc.endLine).join("\n");
  const after = lines.slice(loc.endLine + 1).join("\n");
  return {
    kind: CONTENT_REGION.WithBlock,
    before,
    blockContent,
    after,
    startLine: loc.startLine,
    endLine: loc.endLine,
  };
}

export function regenerateManagedBlock(content: string): string {
  const region = findContentRegion(content);
  if (region.kind === CONTENT_REGION.NoBlock) return content;
  const groups = parseGroupsFromContent(region.before);
  const rendered = renderGroupsToMarkdown(groups);
  return replaceManagedBlockContent(content, rendered);
}

/**
 * Idempotent: insert an empty managed block if absent, else leave existing
 * block (and its possibly user-edited mirror content) untouched.
 *
 * Different from `regenerateManagedBlock`, which would wipe in-block edits
 * by rebuilding from above-block content.
 */
export function insertManagedBlockIfNeeded(content: string): string {
  if (findManagedBlock(content).present) return content;
  if (!CHECKBOX_TASK_RE.test(content)) return content;
  return regenerateManagedBlock(insertEmptyManagedBlock(content));
}

export function addTaskUnderHeading(
  content: string,
  headingName: string,
  taskText: string,
): string {
  const ensured = findManagedBlock(content).present
    ? content
    : insertEmptyManagedBlock(content);
  const region = findContentRegion(ensured);
  if (region.kind !== CONTENT_REGION.WithBlock) return ensured;

  const beforeLines = region.before.split(/\r?\n/);
  const isInbox =
    headingName.trim() === "" || /^inbox$/i.test(headingName.trim());

  if (isInbox) {
    // Inbox lands above all phase headings (level >= 2), but BELOW the H1
    // document title — sticking a loose task above `# Project Plan` looks
    // like a stray bullet, not a task in the document.
    const firstPhaseHeadingIdx = beforeLines.findIndex((l) => {
      const m = l.match(HEADING_RE);
      return m !== null && m[1].length >= 2;
    });
    const newLine = `- [ ] ${taskText}`;
    if (firstPhaseHeadingIdx === -1) {
      beforeLines.push(newLine);
    } else {
      beforeLines.splice(firstPhaseHeadingIdx, 0, newLine);
    }
  } else {
    const headingIdx = beforeLines.findIndex((l) => {
      const m = l.match(HEADING_RE);
      return m && m[2].trim() === headingName;
    });
    const newLine = `- [ ] ${taskText}`;
    if (headingIdx === -1) {
      // Append heading + task at the very end of before-block region
      if (
        beforeLines.length > 0 &&
        beforeLines[beforeLines.length - 1].trim() !== ""
      ) {
        beforeLines.push("");
      }
      beforeLines.push(`## ${headingName}`, newLine);
    } else {
      // Insert after the heading line (and any contiguous task lines under it)
      let insertAt = headingIdx + 1;
      while (
        insertAt < beforeLines.length &&
        /^\s*[-*+]\s+\[/.test(beforeLines[insertAt])
      ) {
        insertAt += 1;
      }
      beforeLines.splice(insertAt, 0, newLine);
    }
  }

  const newBefore = beforeLines.join("\n");
  const reassembled = assembleWithRegion(newBefore, region);
  return regenerateManagedBlock(reassembled);
}

export function appendHeading(content: string, headingName: string): string {
  const ensured = findManagedBlock(content).present
    ? content
    : insertEmptyManagedBlock(content);
  const region = findContentRegion(ensured);
  if (region.kind !== CONTENT_REGION.WithBlock) return ensured;

  const beforeLines = region.before.split(/\r?\n/);
  const exists = beforeLines.some((l) => {
    const m = l.match(HEADING_RE);
    return m && m[2].trim() === headingName;
  });
  if (exists) return ensured;

  if (beforeLines.length > 0 && beforeLines[beforeLines.length - 1].trim() !== "") {
    beforeLines.push("");
  }
  beforeLines.push(`## ${headingName}`);
  const newBefore = beforeLines.join("\n");
  const reassembled = assembleWithRegion(newBefore, region);
  return regenerateManagedBlock(reassembled);
}

export function renameHeadingInContent(
  content: string,
  oldName: string,
  newName: string,
): string {
  const region = findContentRegion(content);
  const target =
    region.kind === CONTENT_REGION.WithBlock ? region.before : content;
  const updated = target
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(HEADING_RE);
      if (m && m[2].trim() === oldName) {
        return `${m[1]} ${newName}`;
      }
      return line;
    })
    .join("\n");
  if (region.kind === CONTENT_REGION.WithBlock) {
    const reassembled = assembleWithRegion(updated, region);
    return regenerateManagedBlock(reassembled);
  }
  return updated;
}

export function setCheckboxStatusOnLine(
  content: string,
  lineIndex: number,
  statusChar: string,
): string {
  const lines = content.split(/\r?\n/);
  if (lineIndex < 0 || lineIndex >= lines.length) return content;
  const match = lines[lineIndex].match(CHECKBOX_RE);
  if (!match) return content;
  lines[lineIndex] = `${match[1]}${statusChar}${match[3]}`;
  return lines.join("\n");
}

function assembleWithRegion(
  newBefore: string,
  region: Extract<ContentRegion, { kind: CONTENT_REGION.WithBlock }>,
): string {
  const parts = [
    newBefore,
    DELIMITER_START,
    region.blockContent,
    DELIMITER_END,
    region.after,
  ];
  // Filter empty trailing segments to avoid stray blank lines, then re-join.
  return parts
    .filter((p, idx) => idx === 0 || idx === parts.length - 1 || true)
    .join("\n");
}

// Re-export for callers that want everything from one place
export type { TaskGroup };
