import test from "node:test";
import assert from "node:assert/strict";
import { filterTasksByQuery, getTaskSearchText } from "../src/lib/task-search";
import type { ScrapedTask } from "../src/types";

test("filterTasksByQuery searches category-specific task fields", () => {
  const tasks = [
    makeTask("Audit backups", "Tasks", ["RTO policy"]),
    makeTask("Configure alerts", "To Do", ["SOC escalation"]),
  ];

  const matches = filterTasksByQuery(tasks, "backup");

  assert.deepEqual(matches.map((task) => task.text), ["Audit backups"]);
});

test("getTaskSearchText includes context, file, category, project, and status", () => {
  const task = makeTask("Write handoff", "Security Monitoring", ["client SOC"]);

  const haystack = getTaskSearchText(task);

  assert.match(haystack, /write handoff/);
  assert.match(haystack, /client soc/);
  assert.match(haystack, /projects\/alpha\.md/);
  assert.match(haystack, /security monitoring/);
  assert.match(haystack, /alpha/);
  assert.match(haystack, /todo/);
});

function makeTask(
  text: string,
  category: string,
  contextNotes: string[],
): ScrapedTask {
  return {
    id: `task:${text}`,
    legacyIds: [],
    text,
    contextNotes,
    contextNoteLines: [],
    filePath: "Projects/Alpha.md",
    line: 1,
    kind: "checkbox",
    status: "todo",
    completed: false,
    category,
    project: "Alpha",
  };
}
