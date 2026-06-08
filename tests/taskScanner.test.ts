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
  assert.match(content, /follow up Friday 2pm/);
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
