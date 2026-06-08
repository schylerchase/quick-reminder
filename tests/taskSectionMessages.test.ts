import test from "node:test";
import assert from "node:assert/strict";
import {
  getTaskSectionsAlreadyPresentNotice,
  getTaskSectionsInsertedNotice,
  getTaskSectionsMissingNoteNotice,
} from "../src/lib/taskSectionMessages";

test("task section setup notices explain the settings action result", () => {
  assert.match(getTaskSectionsMissingNoteNotice(), /open a markdown note/i);
  assert.match(getTaskSectionsMissingNoteNotice(), /insert/i);

  assert.match(getTaskSectionsAlreadyPresentNotice(), /already has a Tasks section/i);
  assert.match(getTaskSectionsAlreadyPresentNotice(), /use the existing section/i);

  assert.match(getTaskSectionsInsertedNotice(), /task sections inserted/i);
  assert.match(getTaskSectionsInsertedNotice(), /scan the dashboard/i);
});
