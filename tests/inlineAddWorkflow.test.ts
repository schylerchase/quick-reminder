import test from "node:test";
import assert from "node:assert/strict";
import { runInlineAddWorkflow } from "../src/lib/inlineAddWorkflow";

test("inline add workflow restores the form only after the write succeeds", async () => {
  const events: string[] = [];

  const result = await runInlineAddWorkflow({
    getTarget: async () => "Tasks.md",
    write: async () => {
      events.push("write");
    },
    restore: () => {
      events.push("restore");
    },
  });

  assert.equal(result, true);
  assert.deepEqual(events, ["write", "restore"]);
});

test("inline add workflow keeps the form open when the target is missing", async () => {
  let restored = false;

  const result = await runInlineAddWorkflow({
    getTarget: async () => null,
    write: async () => {
      throw new Error("should not write");
    },
    restore: () => {
      restored = true;
    },
  });

  assert.equal(result, false);
  assert.equal(restored, false);
});

test("inline add workflow keeps the form open when the write fails", async () => {
  let restored = false;
  let captured: unknown = null;
  const error = new Error("disk full");

  const result = await runInlineAddWorkflow({
    getTarget: async () => "Tasks.md",
    write: async () => {
      throw error;
    },
    restore: () => {
      restored = true;
    },
    onWriteError: (reason) => {
      captured = reason;
    },
  });

  assert.equal(result, false);
  assert.equal(restored, false);
  assert.equal(captured, error);
});

test("inline add workflow ignores re-entry while a write is running", async () => {
  let isSubmitting = false;
  let writeCalls = 0;
  let restored = 0;
  let finishWrite: (() => void) | null = null;

  const workflow = {
    isSubmitting: () => isSubmitting,
    setSubmitting: (next: boolean) => {
      isSubmitting = next;
    },
    getTarget: async () => "Tasks.md",
    write: async () => {
      writeCalls += 1;
      await new Promise<void>((resolve) => {
        finishWrite = resolve;
      });
    },
    restore: () => {
      restored += 1;
    },
  };

  const first = runInlineAddWorkflow(workflow);
  await Promise.resolve();

  const second = await runInlineAddWorkflow(workflow);
  assert.equal(second, false);
  assert.equal(writeCalls, 1);
  assert.equal(isSubmitting, true);
  assert.equal(restored, 0);

  finishWrite?.();
  assert.equal(await first, true);
  assert.equal(isSubmitting, false);
  assert.equal(restored, 1);
});
