import test from "node:test";
import assert from "node:assert/strict";
import {
  getFileRevealFailedNotice,
  getFileRevealMissingActiveFileNotice,
  getFileRevealSuccessNotice,
} from "../src/lib/fileRevealMessages";

test("file reveal notices explain source-navigation recovery", () => {
  assert.match(getFileRevealMissingActiveFileNotice(), /open a note/i);
  assert.match(getFileRevealMissingActiveFileNotice(), /reveal/i);

  assert.match(getFileRevealSuccessNotice(), /revealed/i);
  assert.match(getFileRevealSuccessNotice(), /Files/i);

  assert.match(getFileRevealFailedNotice(), /could not reveal/i);
  assert.match(getFileRevealFailedNotice(), /Files core plugin/i);
  assert.match(getFileRevealFailedNotice(), /open the note/i);
});
