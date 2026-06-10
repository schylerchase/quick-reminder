import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCheckboxTaskId,
  extractCheckboxTaskText,
  TaskScanner,
} from "../src/taskScanner";
import type { ScrapedTask } from "../src/types";
import { TFile } from "obsidian";

class FakeFile extends TFile {
  path: string;
  basename: string;

  constructor(path: string) {
    super();
    this.path = path;
    this.basename = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
  }
}

test("extractCheckboxTaskText strips the checkbox prefix and inline status fields", () => {
  const line = "- [ ] write spec [status:: To Do]";
  assert.equal(extractCheckboxTaskText(line), "write spec");
});

test("extractCheckboxTaskText keeps inline [due:: ...] so id matches scanner output", () => {
  const line = "- [ ] call mom [due:: 2026-02-01]";
  const extracted = extractCheckboxTaskText(line);
  assert.equal(extracted, "call mom [due:: 2026-02-01]");

  const idFromCreate = buildCheckboxTaskId("notes/a.md", extracted ?? "");
  const idFromScanner = buildCheckboxTaskId(
    "notes/a.md",
    // mimic what taskScanner.parseCheckboxTask does internally
    "call mom [due:: 2026-02-01]",
  );
  assert.equal(idFromCreate, idFromScanner);
});

test("extractCheckboxTaskText returns null for non-checkbox lines", () => {
  assert.equal(extractCheckboxTaskText("just a paragraph"), null);
  assert.equal(extractCheckboxTaskText("- bullet without checkbox"), null);
});

test("scan ignores checkbox tasks inside a managed tasks block", async () => {
  const file = new FakeFile("Projects/Roadmap.md");
  const content = [
    "# Roadmap",
    "",
    "## Phase A",
    "- [ ] source task",
    "",
    "<!-- qr:tasks:start -->",
    "## Phase A",
    "- [ ] source task",
    "<!-- qr:tasks:end -->",
  ].join("\n");
  const app = {
    vault: {
      getMarkdownFiles: () => [file],
      cachedRead: async () => content,
    },
  };
  const scanner = new TaskScanner(app as never);

  const tasks = await scanner.scan();

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].text, "source task");
  assert.equal(tasks[0].line, 4);
});

test("replaceTaskLine returns the updated task identity after an editor rewrite", async () => {
  const file = new FakeFile("Projects/Roadmap.md");
  let content = [
    "# Roadmap",
    "",
    "- [ ] follow up tomorrow 10am",
    "  - confirm owner",
  ].join("\n");
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => (path === file.path ? file : null),
      process: async (_file: TFile, transform: (text: string) => string) => {
        content = transform(content);
      },
    },
  };
  const scanner = new TaskScanner(app as never);
  const task: ScrapedTask = {
    id: buildCheckboxTaskId(file.path, "follow up tomorrow 10am"),
    legacyIds: [],
    text: "follow up tomorrow 10am",
    contextNotes: ["confirm owner"],
    contextNoteLines: ["  - confirm owner"],
    filePath: file.path,
    line: 3,
    kind: "checkbox",
    status: "todo",
    completed: false,
    category: "Uncategorized",
    project: "Roadmap",
  };

  const updated = await scanner.replaceTaskLine(task, "- [ ] follow up Friday 2pm");

  assert.equal(updated?.id, buildCheckboxTaskId(file.path, "follow up Friday 2pm"));
  assert.equal(updated?.text, "follow up Friday 2pm");
  assert.equal(updated?.line, 3);
  assert.deepEqual(updated?.contextNotes, ["confirm owner"]);
  // F22: assert the EXACT resulting body, not just that the new text appears
  // somewhere. A splice that dropped/duplicated the heading or the preserved
  // "  - confirm owner" context line would pass a substring match but fail this.
  assert.equal(
    content,
    ["# Roadmap", "", "- [ ] follow up Friday 2pm", "  - confirm owner"].join(
      "\n",
    ),
  );
});

test("replaceTaskLine leaves the note unchanged when the rewrite is not a checkbox task", async () => {
  const file = new FakeFile("Projects/Roadmap.md");
  const originalContent = "- [ ] follow up tomorrow 10am";
  let content = originalContent;
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => (path === file.path ? file : null),
      process: async (_file: TFile, transform: (text: string) => string) => {
        content = transform(content);
      },
    },
  };
  const scanner = new TaskScanner(app as never);
  const task: ScrapedTask = {
    id: buildCheckboxTaskId(file.path, "follow up tomorrow 10am"),
    legacyIds: [],
    text: "follow up tomorrow 10am",
    contextNotes: [],
    contextNoteLines: [],
    filePath: file.path,
    line: 1,
    kind: "checkbox",
    status: "todo",
    completed: false,
    category: "Uncategorized",
    project: "Roadmap",
  };

  const updated = await scanner.replaceTaskLine(task, "follow up Friday 2pm");

  assert.equal(updated, null);
  assert.equal(content, originalContent);
});

// --- F05 (mutate-by-identity, never the wrong task) / F07 (content integrity) / F18 (managed block) ---

function makeProcessApp(
  file: FakeFile,
  getContent: () => string,
  setContent: (value: string) => void,
) {
  return {
    vault: {
      getAbstractFileByPath: (path: string) =>
        path === file.path ? file : null,
      process: async (_f: TFile, transform: (text: string) => string) => {
        setContent(transform(getContent()));
      },
    },
  };
}

function checkboxTask(
  file: FakeFile,
  text: string,
  line: number,
  overrides: Partial<ScrapedTask> = {},
): ScrapedTask {
  return {
    id: buildCheckboxTaskId(file.path, text),
    legacyIds: [],
    text,
    contextNotes: [],
    contextNoteLines: [],
    filePath: file.path,
    line,
    kind: "checkbox",
    status: "todo",
    completed: false,
    category: "Uncategorized",
    project: file.basename,
    ...overrides,
  };
}

test("deleteTaskLine resolves by identity when the cached line is stale (F05 — never deletes the wrong task)", async () => {
  const file = new FakeFile("a.md");
  let content = ["- [ ] alpha", "- [ ] beta"].join("\n");
  const scanner = new TaskScanner(
    makeProcessApp(file, () => content, (v) => (content = v)) as never,
  );
  // STALE cached index: beta is really on line 2, but task.line points at line 1
  // (alpha). The old code validated only "some task is here" and would delete alpha.
  const beta = checkboxTask(file, "beta", 1);

  const ok = await scanner.deleteTaskLine(beta);

  assert.equal(ok, true);
  assert.equal(content, "- [ ] alpha");
});

test("deleteTaskLine aborts when the task no longer exists (F05 — no collateral deletion)", async () => {
  const file = new FakeFile("a.md");
  const original = ["- [ ] alpha", "- [ ] gamma"].join("\n");
  let content = original;
  const scanner = new TaskScanner(
    makeProcessApp(file, () => content, (v) => (content = v)) as never,
  );
  const missing = checkboxTask(file, "beta", 1); // beta gone; stale index points at alpha

  const ok = await scanner.deleteTaskLine(missing);

  assert.equal(ok, false);
  assert.equal(content, original);
});

test("deleteTaskLine refuses to guess when two tasks share identity and the index is stale (F05 ambiguity guard)", async () => {
  const file = new FakeFile("a.md");
  const original = ["- [ ] dupe", "- [ ] dupe"].join("\n");
  let content = original;
  const scanner = new TaskScanner(
    makeProcessApp(file, () => content, (v) => (content = v)) as never,
  );
  const dupe = checkboxTask(file, "dupe", 9); // out-of-range stale index forces a search

  const ok = await scanner.deleteTaskLine(dupe);

  assert.equal(ok, false);
  assert.equal(content, original);
});

test("deleteTaskLine removes the task AND its whole context-note block, leaving neighbours intact (F07)", async () => {
  const file = new FakeFile("a.md");
  let content = [
    "- [ ] keep me",
    "- [ ] target task",
    "  - note one",
    "  - note two",
    "- [ ] also keep",
  ].join("\n");
  const scanner = new TaskScanner(
    makeProcessApp(file, () => content, (v) => (content = v)) as never,
  );
  const target = checkboxTask(file, "target task", 2);

  const ok = await scanner.deleteTaskLine(target);

  assert.equal(ok, true);
  assert.equal(content, ["- [ ] keep me", "- [ ] also keep"].join("\n"));
});

test("organizeTopLevelTaskSections leaves a fenced '- [x]' example inside its code fence (F07)", async () => {
  const file = new FakeFile("a.md");
  const original = [
    "## Tasks",
    "",
    "```",
    "- [x] example inside a fence",
    "```",
  ].join("\n");
  let content = original;
  const scanner = new TaskScanner(
    makeProcessApp(file, () => content, (v) => (content = v)) as never,
  );

  const changed = await scanner.organizeTopLevelTaskSections(file.path, [
    "Completed",
    "To Do",
  ]);

  assert.equal(changed, false);
  assert.equal(content, original);
});

test("organizeTopLevelTaskSections does not move mirror checkboxes inside the qr:tasks block (F18)", async () => {
  const file = new FakeFile("a.md");
  const original = [
    "## Tasks",
    "<!-- qr:tasks:start -->",
    "- [x] mirror done",
    "<!-- qr:tasks:end -->",
  ].join("\n");
  let content = original;
  const scanner = new TaskScanner(
    makeProcessApp(file, () => content, (v) => (content = v)) as never,
  );

  // "Completed" is allowed, so without F18 the indent-0 mirror "- [x]" would be
  // spliced out of the managed block into a "### Completed" section.
  const changed = await scanner.organizeTopLevelTaskSections(file.path, [
    "Completed",
  ]);

  assert.equal(changed, false);
  assert.equal(content, original);
});

test("setCheckboxStatus relocates the task WITH its context-note block intact (F07)", async () => {
  const file = new FakeFile("a.md");
  let content = [
    "### To Do",
    "- [ ] ship it",
    "  - subtask note",
    "### Completed",
  ].join("\n");
  const scanner = new TaskScanner(
    makeProcessApp(file, () => content, (v) => (content = v)) as never,
  );
  const task = checkboxTask(file, "ship it", 2);

  const updated = await scanner.setCheckboxStatus(task, "completed");

  assert.notEqual(updated, null);
  const lines = content.split("\n");
  const taskIdx = lines.findIndex((l) => l.includes("ship it"));
  // Block moved as a unit: the task ends up under "### Completed" and its
  // context note stays directly beneath it; nothing dropped or duplicated.
  assert.ok(taskIdx > lines.indexOf("### Completed"));
  assert.equal(lines[taskIdx + 1], "  - subtask note");
  assert.equal(lines.filter((l) => l.includes("ship it")).length, 1);
  assert.equal(lines.filter((l) => l.includes("subtask note")).length, 1);
});

test("setCheckboxText rewrites task text, preserves checkbox marker, leaves context notes intact (F07)", async () => {
  const file = new FakeFile("a.md");
  let content = ["- [x] old title", "  - context note", "- [ ] other"].join(
    "\n",
  );
  const scanner = new TaskScanner(
    makeProcessApp(file, () => content, (v) => (content = v)) as never,
  );
  const task = checkboxTask(file, "old title", 1);

  const updated = await scanner.setCheckboxText(task, "new title");

  assert.notEqual(updated, null);
  assert.equal(updated?.text, "new title");
  assert.equal(
    content,
    ["- [x] new title", "  - context note", "- [ ] other"].join("\n"),
  );
});

test("appendTask creates Tasks and To Do sections then inserts the task (F07)", async () => {
  const file = new FakeFile("a.md");
  let content = "# Notes\n\nSome text.";
  const scanner = new TaskScanner(
    makeProcessApp(file, () => content, (v) => (content = v)) as never,
  );

  const task = await scanner.appendTask(file.path, "buy milk");

  assert.notEqual(task, null);
  assert.equal(task?.text, "buy milk");
  assert.equal(
    content,
    [
      "# Notes",
      "",
      "Some text.",
      "",
      "## Tasks",
      "",
      "### To Do",
      "",
      "- [ ] buy milk",
    ].join("\n"),
  );
});

test("appendTaskContextNotes splices new notes after the last existing context note, leaving neighbours intact (F07)", async () => {
  const file = new FakeFile("a.md");
  let content = [
    "- [ ] task text",
    "  - existing note",
    "- [ ] other task",
  ].join("\n");
  const scanner = new TaskScanner(
    makeProcessApp(file, () => content, (v) => (content = v)) as never,
  );
  const task = checkboxTask(file, "task text", 1);

  const ok = await scanner.appendTaskContextNotes(task, ["new note"]);

  assert.equal(ok, true);
  assert.equal(
    content,
    [
      "- [ ] task text",
      "  - existing note",
      "  - new note",
      "- [ ] other task",
    ].join("\n"),
  );
});

test("replaceTaskContextNotes swaps the entire old note block for new notes, neighbours intact (F07)", async () => {
  const file = new FakeFile("a.md");
  let content = [
    "- [ ] task text",
    "  - old note one",
    "  - old note two",
    "- [ ] other task",
  ].join("\n");
  const scanner = new TaskScanner(
    makeProcessApp(file, () => content, (v) => (content = v)) as never,
  );
  const task = checkboxTask(file, "task text", 1, {
    contextNotes: ["old note one", "old note two"],
    contextNoteLines: ["  - old note one", "  - old note two"],
  });

  const ok = await scanner.replaceTaskContextNotes(task, ["new note"]);

  assert.equal(ok, true);
  assert.equal(
    content,
    ["- [ ] task text", "  - new note", "- [ ] other task"].join("\n"),
  );
});
