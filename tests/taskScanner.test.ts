import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCheckboxTaskId,
  extractCheckboxTaskText,
} from "../src/taskScanner";

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
