import test from "node:test";
import assert from "node:assert/strict";
import {
  getDashboardSectionClassNames,
  getPathBasename,
  getTaskSourceLineLabel,
} from "../src/lib/viewHelpers";

test("dashboard section classes expose a stable slug for responsive layout", () => {
  assert.deepEqual(
    getDashboardSectionClassNames("Completed vault tasks", false),
    ["qr-view-section", "qr-view-section-completed-vault-tasks"],
  );
});

test("dashboard section classes mark empty sections for density rules", () => {
  assert.deepEqual(
    getDashboardSectionClassNames("Upcoming", true),
    ["qr-view-section", "qr-view-section-upcoming", "qr-view-section-empty"],
  );
});

test("daily console helpers format note and source labels", () => {
  assert.equal(getPathBasename("Games/The First Descendant/Gley Build Tasks.md"), "Gley Build Tasks.md");
  assert.equal(getPathBasename(null), "No active note");
  assert.equal(
    getTaskSourceLineLabel({
      id: "task-1",
      legacyIds: [],
      text: "Gley equipped",
      contextNotes: [],
      contextNoteLines: [],
      filePath: "Games/The First Descendant/Gley Build Tasks.md",
      line: 14,
      kind: "checkbox",
      status: "todo",
      completed: false,
      category: "Auto Tracked",
      project: "",
    }),
    "Games/The First Descendant/Gley Build Tasks.md:14",
  );
});
