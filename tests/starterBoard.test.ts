import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStarterBoardMarkdown,
  STARTER_BOARD_HEADINGS,
} from "../src/lib/starterBoard";
import {
  DELIMITER_END,
  DELIMITER_START,
  extractManagedBlockContent,
} from "../src/lib/managedTasksBlock";

test("starter board creates source tasks and a managed mirror", () => {
  const markdown = buildStarterBoardMarkdown(new Date("2026-05-21T14:30:00"));

  assert.match(markdown, /^# Quick Reminder Dashboard/m);
  assert.match(markdown, new RegExp(escapeRe(DELIMITER_START)));
  assert.match(markdown, new RegExp(escapeRe(DELIMITER_END)));

  for (const heading of STARTER_BOARD_HEADINGS) {
    assert.match(markdown, new RegExp(`## ${escapeRe(heading)}`));
  }

  const sourceTodayIdx = markdown.indexOf("## Today");
  const delimiterIdx = markdown.indexOf(DELIMITER_START);
  assert.ok(sourceTodayIdx > -1 && sourceTodayIdx < delimiterIdx);

  const mirror = extractManagedBlockContent(markdown);
  assert.ok(mirror);
  assert.match(mirror!, /## Today/);
  assert.match(mirror!, /- \[ \] Capture one real task/);
  assert.match(mirror!, /- \[\/\] Customize this starter board/);

  assert.ok(
    markdown.indexOf("## How this board works") > markdown.indexOf(DELIMITER_END),
    "usage notes should live after the managed block, not inside the mirror source",
  );
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
