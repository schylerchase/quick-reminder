import test from "node:test";
import assert from "node:assert/strict";
import {
  DELIMITER_START,
  DELIMITER_END,
  detectNewline,
  findManagedBlock,
  insertEmptyManagedBlock,
  removeManagedBlock,
  replaceManagedBlockContent,
  parseGroupsFromContent,
  renderGroupsToMarkdown,
  type TaskGroup,
} from "../src/lib/managedTasksBlock";

test("findManagedBlock returns absent when no delimiters present", () => {
  const content = "# Note\n\nSome text\n";
  const result = findManagedBlock(content);
  assert.equal(result.present, false);
});

test("findManagedBlock locates delimiter line indices when present", () => {
  const content = [
    "# Note",
    "",
    DELIMITER_START,
    "## Phase A",
    "- [ ] task",
    DELIMITER_END,
    "",
  ].join("\n");
  const result = findManagedBlock(content);
  assert.equal(result.present, true);
  if (!result.present) return;
  assert.equal(result.startLine, 2);
  assert.equal(result.endLine, 5);
});

test("findManagedBlock rejects start without matching end", () => {
  const content = `${DELIMITER_START}\n- [ ] orphan\n`;
  const result = findManagedBlock(content);
  assert.equal(result.present, false);
});

test("insertEmptyManagedBlock appends delimiters with blank line spacing when absent", () => {
  const content = "# Note\n\nbody\n";
  const result = insertEmptyManagedBlock(content);
  assert.match(result, /# Note/);
  assert.match(result, new RegExp(escapeRe(DELIMITER_START)));
  assert.match(result, new RegExp(escapeRe(DELIMITER_END)));
  // start appears before end
  assert.ok(result.indexOf(DELIMITER_START) < result.indexOf(DELIMITER_END));
});

test("insertEmptyManagedBlock is a no-op when block already present", () => {
  const original = `# Note\n\n${DELIMITER_START}\n${DELIMITER_END}\n`;
  const result = insertEmptyManagedBlock(original);
  assert.equal(result, original);
});

test("removeManagedBlock strips delimiters and inner content", () => {
  const content = [
    "# Note",
    "",
    DELIMITER_START,
    "## Phase",
    "- [ ] task",
    DELIMITER_END,
    "tail",
    "",
  ].join("\n");
  const result = removeManagedBlock(content);
  assert.equal(result.includes(DELIMITER_START), false);
  assert.equal(result.includes(DELIMITER_END), false);
  assert.equal(result.includes("- [ ] task"), false);
  assert.match(result, /# Note/);
  assert.match(result, /tail/);
});

test("removeManagedBlock returns original when block absent", () => {
  const content = "# Note\nbody\n";
  assert.equal(removeManagedBlock(content), content);
});

test("replaceManagedBlockContent swaps inner content preserving delimiters", () => {
  const content = [
    "# Note",
    DELIMITER_START,
    "old",
    DELIMITER_END,
    "",
  ].join("\n");
  const result = replaceManagedBlockContent(content, "## New\n- [ ] x");
  assert.match(result, /## New/);
  assert.match(result, /- \[ \] x/);
  assert.equal(result.includes("old"), false);
  assert.match(result, new RegExp(escapeRe(DELIMITER_START)));
  assert.match(result, new RegExp(escapeRe(DELIMITER_END)));
});

test("replaceManagedBlockContent creates block when missing", () => {
  const content = "# Note\nbody\n";
  const result = replaceManagedBlockContent(content, "## New\n- [ ] x");
  assert.match(result, new RegExp(escapeRe(DELIMITER_START)));
  assert.match(result, /## New/);
});

test("parseGroupsFromContent groups checkbox tasks under nearest preceding heading", () => {
  const content = [
    "# Title",
    "",
    "## Phase A",
    "- [ ] alpha task",
    "- [x] alpha done",
    "## Phase B",
    "- [ ] beta task",
  ].join("\n");
  const groups = parseGroupsFromContent(content);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].heading, "Phase A");
  assert.deepEqual(
    groups[0].tasks.map((t) => t.text),
    ["alpha task", "alpha done"],
  );
  assert.equal(groups[0].tasks[1].status, "completed");
  assert.equal(groups[1].heading, "Phase B");
  assert.equal(groups[1].tasks.length, 1);
});

test("parseGroupsFromContent puts pre-heading tasks under Inbox", () => {
  const content = ["- [ ] loose task", "## After", "- [ ] under"].join("\n");
  const groups = parseGroupsFromContent(content);
  assert.equal(groups[0].heading, "Inbox");
  assert.equal(groups[0].isInbox, true);
  assert.equal(groups[0].tasks[0].text, "loose task");
  assert.equal(groups[1].heading, "After");
});

test("parseGroupsFromContent ignores tasks inside code fences", () => {
  const content = [
    "## Phase",
    "```",
    "- [ ] fence task should not count",
    "```",
    "- [ ] real task",
  ].join("\n");
  const groups = parseGroupsFromContent(content);
  assert.equal(groups[0].tasks.length, 1);
  assert.equal(groups[0].tasks[0].text, "real task");
});

test("parseGroupsFromContent skips frontmatter", () => {
  const content = [
    "---",
    "title: Note",
    "tags: [foo]",
    "---",
    "## Phase",
    "- [ ] real task",
  ].join("\n");
  const groups = parseGroupsFromContent(content);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].tasks[0].text, "real task");
});

test("parseGroupsFromContent captures in-progress and cancelled statuses", () => {
  const content = [
    "## P",
    "- [/] doing",
    "- [-] cancelled",
    "- [ ] todo",
    "- [x] done",
  ].join("\n");
  const groups = parseGroupsFromContent(content);
  const statuses = groups[0].tasks.map((t) => t.status);
  assert.deepEqual(statuses, ["in-progress", "cancelled", "todo", "completed"]);
});

test("renderGroupsToMarkdown produces stable round-trip", () => {
  const groups: TaskGroup[] = [
    {
      heading: "Phase A",
      isInbox: false,
      level: 2,
      tasks: [
        { text: "alpha", status: "todo", rawStatusChar: " " },
        { text: "done one", status: "completed", rawStatusChar: "x" },
      ],
    },
    {
      heading: "Inbox",
      isInbox: true,
      level: 2,
      tasks: [{ text: "loose", status: "in-progress", rawStatusChar: "/" }],
    },
  ];
  const md = renderGroupsToMarkdown(groups);
  // Re-parse should give equivalent shape (order of inbox/named may shift; we just check round-trip parse)
  const reparsed = parseGroupsFromContent(md);
  const flat = reparsed.flatMap((g) => g.tasks.map((t) => `${g.heading}:${t.text}:${t.status}`));
  assert.ok(flat.includes("Phase A:alpha:todo"));
  assert.ok(flat.includes("Phase A:done one:completed"));
  assert.ok(flat.includes("Inbox:loose:in-progress"));
});

test("renderGroupsToMarkdown emits headings only when non-inbox", () => {
  const groups: TaskGroup[] = [
    {
      heading: "Inbox",
      isInbox: true,
      level: 2,
      tasks: [{ text: "x", status: "todo", rawStatusChar: " " }],
    },
  ];
  const md = renderGroupsToMarkdown(groups);
  // Inbox group should not write "## Inbox" header to avoid polluting source
  assert.equal(md.includes("## Inbox"), false);
  assert.match(md, /- \[ \] x/);
});

// --- F17: line-ending preservation (no whole-file LF rewrite on CRLF notes) ---

test("detectNewline reports CRLF only when present, else LF", () => {
  assert.equal(detectNewline("a\r\nb"), "\r\n");
  assert.equal(detectNewline("a\nb"), "\n");
  assert.equal(detectNewline(""), "\n");
});

test("insertEmptyManagedBlock preserves CRLF byte-for-byte", () => {
  const content = "# Note\r\n\r\nbody\r\n";
  const result = insertEmptyManagedBlock(content);
  // Full-document equality: proves the file is not rewritten to LF and that
  // exactly the delimiters (no extra/dropped lines) are appended.
  assert.equal(
    result,
    `# Note\r\n\r\nbody\r\n\r\n${DELIMITER_START}\r\n${DELIMITER_END}\r\n`,
  );
});

test("insertEmptyManagedBlock keeps LF input all-LF", () => {
  const content = "# Note\n\nbody\n";
  const result = insertEmptyManagedBlock(content);
  assert.equal(result.includes("\r\n"), false);
  assert.match(result, new RegExp(`${escapeRe(DELIMITER_START)}\\n`));
});

test("removeManagedBlock preserves CRLF on the surviving lines", () => {
  const content = [
    "# Note",
    "",
    DELIMITER_START,
    "## Phase",
    "- [ ] task",
    DELIMITER_END,
    "tail",
    "",
  ].join("\r\n");
  const result = removeManagedBlock(content);
  assert.equal(/[^\r]\n/.test(result), false); // no lone LF
  assert.match(result, /# Note/);
  assert.match(result, /tail/);
  assert.equal(result.includes(DELIMITER_START), false);
});

test("replaceManagedBlockContent round-trips a CRLF document to CRLF", () => {
  const content = ["# Note", DELIMITER_START, "old", DELIMITER_END, ""].join(
    "\r\n",
  );
  const result = replaceManagedBlockContent(content, "## New\n- [ ] x");
  assert.equal(/[^\r]\n/.test(result), false); // every newline is CRLF
  assert.match(result, /## New\r\n- \[ \] x/);
  assert.equal(result.includes("old"), false);
});

test("replaceManagedBlockContent keeps an LF document all-LF", () => {
  const content = ["# Note", DELIMITER_START, "old", DELIMITER_END, ""].join(
    "\n",
  );
  const result = replaceManagedBlockContent(content, "## New\n- [ ] x");
  assert.equal(result.includes("\r\n"), false);
  assert.match(result, /## New\n- \[ \] x/);
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
