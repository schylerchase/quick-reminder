import test from "node:test";
import assert from "node:assert/strict";
import {
  getModalSubmitButtonPresentation,
  runSingleModalSubmit,
  shouldCloseAfterSubmit,
} from "../src/lib/modalSubmit";

test("modal submit stays open when the workflow reports failure", () => {
  assert.equal(shouldCloseAfterSubmit(false), false);
});

test("destructive confirmation stays open when source edit fails", () => {
  const sourceEditSucceeded = false;

  assert.equal(shouldCloseAfterSubmit(sourceEditSucceeded), false);
});

test("modal submit closes for successful or legacy void submit handlers", () => {
  assert.equal(shouldCloseAfterSubmit(true), true);
  assert.equal(shouldCloseAfterSubmit(undefined), true);
});

test("modal submit button presentation switches labels while submitting", () => {
  assert.deepEqual(
    getModalSubmitButtonPresentation(false, "Delete", "Deleting..."),
    { disabled: false, text: "Delete" },
  );
  assert.deepEqual(
    getModalSubmitButtonPresentation(true, "Delete", "Deleting..."),
    { disabled: true, text: "Deleting..." },
  );
});

test("single modal submit ignores re-entry while a submit is running", async () => {
  let isSubmitting = false;
  let submitCalls = 0;
  let finishSubmit: (() => void) | null = null;

  const workflow = {
    isSubmitting: () => isSubmitting,
    setSubmitting: (next: boolean) => {
      isSubmitting = next;
    },
    submit: async () => {
      submitCalls += 1;
      await new Promise<void>((resolve) => {
        finishSubmit = resolve;
      });
      return true;
    },
  };

  const first = runSingleModalSubmit(workflow);
  await Promise.resolve();

  const second = await runSingleModalSubmit(workflow);
  assert.deepEqual(second, { started: false });
  assert.equal(submitCalls, 1);
  assert.equal(isSubmitting, true);

  finishSubmit?.();
  assert.deepEqual(await first, { started: true, result: true });
  assert.equal(isSubmitting, false);
});
