import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CATEGORY_FILE_PATH,
  getCategoryInputInitialPath,
} from "../src/lib/taskTarget";

test("category add rows default to the note they are rendered under", () => {
  assert.equal(
    getCategoryInputInitialPath("Projects/Roadmap.md", false),
    "Projects/Roadmap.md",
  );
});

test("compact note-head category buttons also target that note", () => {
  assert.equal(
    getCategoryInputInitialPath("Projects/Roadmap.md", true),
    "Projects/Roadmap.md",
  );
});

test("empty category targets still fall back to the default task file", () => {
  assert.equal(DEFAULT_CATEGORY_FILE_PATH, "tasks.md");
});

