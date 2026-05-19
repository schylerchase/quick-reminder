import test from "node:test";
import assert from "node:assert/strict";
import {
  DELIMITER_START,
  DELIMITER_END,
} from "../src/lib/managedTasksBlock";
import {
  regenerateManagedBlock,
  insertManagedBlockIfNeeded,
  addTaskUnderHeading,
  appendHeading,
  renameHeadingInContent,
  setCheckboxStatusOnLine,
  CONTENT_REGION,
  findContentRegion,
} from "../src/lib/managedTasksOps";

const sample = (pre: string, block: string, post = ""): string => {
  const blockBody = block ? `\n${block}\n` : "\n";
  return `${pre}\n${DELIMITER_START}${blockBody}${DELIMITER_END}\n${post}`;
};

test("findContentRegion splits file around managed block", () => {
  const content = sample("# Note\n\n## Phase\n- [ ] task", "## Phase\n- [ ] task");
  const region = findContentRegion(content);
  assert.equal(region.kind, "with-block");
  if (region.kind !== "with-block") return;
  assert.match(region.before, /# Note/);
  assert.match(region.blockContent, /## Phase/);
});

test("findContentRegion returns whole content as before when no block", () => {
  const content = "# Note\n\n## Phase\n- [ ] task";
  const region = findContentRegion(content);
  assert.equal(region.kind, "no-block");
});

test("regenerateManagedBlock copies groups from above-block content into block", () => {
  const pre = "# Title\n\n## Roadmap\n- [ ] ship it\n- [x] design\n\n## Loose\n- [ ] note";
  const content = sample(pre, "");
  const result = regenerateManagedBlock(content);
  assert.match(result, /## Roadmap/);
  assert.match(result, /- \[ \] ship it/);
  assert.match(result, /- \[x\] design/);
  assert.match(result, /## Loose/);
  // Original pre-content still intact (block mirrors it)
  assert.match(result, /# Title/);
});

test("regenerateManagedBlock is a no-op when no managed block exists", () => {
  const content = "# Title\n## Phase\n- [ ] task\n";
  const result = regenerateManagedBlock(content);
  assert.equal(result, content);
});

test("regenerateManagedBlock places Inbox tasks first inside block", () => {
  const pre = "- [ ] loose\n\n## Phase A\n- [ ] under";
  const content = sample(pre, "");
  const result = regenerateManagedBlock(content);
  const blockMatch = result.match(
    new RegExp(
      `${escapeRe(DELIMITER_START)}([\\s\\S]*?)${escapeRe(DELIMITER_END)}`,
    ),
  );
  assert.ok(blockMatch);
  const inner = blockMatch![1];
  assert.ok(
    inner.indexOf("- [ ] loose") < inner.indexOf("## Phase A"),
    "inbox task should render before named heading",
  );
});

test("insertManagedBlockIfNeeded does not regenerate an existing block", () => {
  const content = sample("## Source\n- [ ] source task", "## Old Mirror\n- [ ] edited mirror task");

  assert.equal(insertManagedBlockIfNeeded(content), content);
});

test("addTaskUnderHeading inserts a checkbox under an existing heading above the block", () => {
  const pre = "## Phase\n- [ ] existing";
  const content = sample(pre, "");
  const result = addTaskUnderHeading(content, "Phase", "fresh task");
  // Insertion order: existing task remains; new task appears after it but still under Phase.
  const phaseSection = result.split("## Phase")[1].split(DELIMITER_START)[0];
  assert.match(phaseSection, /- \[ \] existing/);
  assert.match(phaseSection, /- \[ \] fresh task/);
  assert.ok(
    phaseSection.indexOf("existing") < phaseSection.indexOf("fresh task"),
  );
});

test("addTaskUnderHeading creates heading if missing", () => {
  const pre = "## Other\n- [ ] x";
  const content = sample(pre, "");
  const result = addTaskUnderHeading(content, "New Phase", "fresh task");
  assert.match(result, /## New Phase/);
  // New heading + task must be above the block delimiter
  assert.ok(
    result.indexOf("New Phase") < result.indexOf(DELIMITER_START),
  );
});

test("addTaskUnderHeading uses Inbox semantics when heading is empty/Inbox", () => {
  const pre = "## Phase\n- [ ] x";
  const content = sample(pre, "");
  const result = addTaskUnderHeading(content, "Inbox", "loose one");
  // Loose task should land above ## Phase (pre-heading zone)
  const beforeHeading = result.slice(0, result.indexOf("## Phase"));
  assert.match(beforeHeading, /- \[ \] loose one/);
});

test("addTaskUnderHeading keeps Inbox tasks below the document title", () => {
  const pre = "# Project Plan\n\n## Phase\n- [ ] x";
  const content = sample(pre, "");
  const result = addTaskUnderHeading(content, "Inbox", "loose one");
  const titleIdx = result.indexOf("# Project Plan");
  const taskIdx = result.indexOf("- [ ] loose one");
  const phaseIdx = result.indexOf("## Phase");

  assert.ok(titleIdx < taskIdx, "Inbox task should not be inserted above H1");
  assert.ok(taskIdx < phaseIdx, "Inbox task should still precede phase headings");
});

test("appendHeading inserts new heading just above the managed block", () => {
  const pre = "# Title\n\n## Old";
  const content = sample(pre, "");
  const result = appendHeading(content, "Fresh");
  // ## Fresh appears, and it is between '## Old' and DELIMITER_START
  const oldIdx = result.indexOf("## Old");
  const freshIdx = result.indexOf("## Fresh");
  const delimIdx = result.indexOf(DELIMITER_START);
  assert.ok(oldIdx < freshIdx && freshIdx < delimIdx);
});

test("appendHeading is a no-op when heading already exists case-sensitive", () => {
  const pre = "## Phase";
  const content = sample(pre, "");
  const result = appendHeading(content, "Phase");
  // Should not produce a second '## Phase'
  const occurrences = (result.match(/## Phase/g) || []).length;
  assert.equal(occurrences, 1);
});

test("appendHeading creates block + heading when block missing", () => {
  const content = "# Note\n";
  const result = appendHeading(content, "New");
  assert.match(result, new RegExp(escapeRe(DELIMITER_START)));
  assert.match(result, /## New/);
});

test("renameHeadingInContent rewrites heading text above the block", () => {
  const pre = "## Old Name\n- [ ] task";
  const content = sample(pre, "");
  const result = renameHeadingInContent(content, "Old Name", "New Name");
  assert.match(result, /## New Name/);
  assert.equal(result.includes("## Old Name"), false);
});

test("renameHeadingInContent leaves other headings untouched", () => {
  const pre = "## Keep\n- [ ] a\n## Target\n- [ ] b";
  const content = sample(pre, "");
  const result = renameHeadingInContent(content, "Target", "Renamed");
  assert.match(result, /## Keep/);
  assert.match(result, /## Renamed/);
  assert.equal(result.includes("## Target"), false);
});

test("setCheckboxStatusOnLine rewrites checkbox char on the given 0-indexed line", () => {
  const content = ["## Phase", "- [ ] todo one", "- [x] done one"].join("\n");
  const result = setCheckboxStatusOnLine(content, 1, "x");
  const lines = result.split("\n");
  assert.equal(lines[1], "- [x] todo one");
  assert.equal(lines[2], "- [x] done one"); // untouched
});

test("setCheckboxStatusOnLine no-ops when line is not a checkbox", () => {
  const content = "## Phase\nnot a checkbox";
  const result = setCheckboxStatusOnLine(content, 1, "x");
  assert.equal(result, content);
});

test("CONTENT_REGION enum exposes labels", () => {
  // Compile-time sanity; runtime accessor not strictly needed but kept for ergonomic use.
  assert.equal(CONTENT_REGION.WithBlock, "with-block");
  assert.equal(CONTENT_REGION.NoBlock, "no-block");
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
