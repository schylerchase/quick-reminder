import test from "node:test";
import assert from "node:assert/strict";
import { canEditPhaseName, getPhaseEditAction } from "../src/lib/phase-actions";

test("canEditPhaseName allows named phases but not Inbox", () => {
  assert.equal(canEditPhaseName({ isInbox: false }), true);
  assert.equal(canEditPhaseName({ isInbox: true }), false);
});

test("getPhaseEditAction exposes a visible edit label for named phases", () => {
  assert.deepEqual(getPhaseEditAction({ name: "Phase One", isInbox: false }), {
    label: "Edit",
    ariaLabel: "Edit Phase One",
    title: "Edit Phase One",
  });
  assert.equal(getPhaseEditAction({ name: "Inbox", isInbox: true }), null);
});
