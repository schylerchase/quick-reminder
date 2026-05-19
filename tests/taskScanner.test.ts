import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCheckboxTaskId,
  extractCheckboxTaskText,
  TaskScanner,
} from "../src/taskScanner";
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
