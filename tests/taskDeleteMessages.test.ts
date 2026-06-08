import test from "node:test";
import assert from "node:assert/strict";
import {
  getTaskDeleteFailedNotice,
  getTaskDeleteRefreshFailedNotice,
} from "../src/lib/taskDeleteMessages";

test("task delete failure notice gives a source-note recovery path", () => {
  const notice = getTaskDeleteFailedNotice();

  assert.match(notice, /could not delete/i);
  assert.match(notice, /source note/i);
  assert.match(notice, /try again/i);
});

test("task delete refresh failure notice makes clear the task is already gone", () => {
  const notice = getTaskDeleteRefreshFailedNotice();

  assert.match(notice, /deleted/i);
  assert.match(notice, /could not refresh/i);
  assert.match(notice, /reload Obsidian/i);
});
