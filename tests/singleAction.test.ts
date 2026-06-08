import test from "node:test";
import assert from "node:assert/strict";
import {
  getSingleActionButtonState,
  getSingleActionButtonPresentation,
  runKeyedSingleAction,
  runKeyedSingleOpen,
  runSingleOpen,
  runSingleAction,
} from "../src/lib/singleAction";

test("single action button presentation switches labels while running", () => {
  assert.deepEqual(
    getSingleActionButtonPresentation(false, "Done", "Saving..."),
    { disabled: false, text: "Done" },
  );
  assert.deepEqual(
    getSingleActionButtonPresentation(true, "Done", "Saving..."),
    { disabled: true, text: "Saving..." },
  );
});

test("single action button state includes accessible busy state", () => {
  assert.deepEqual(
    getSingleActionButtonState(false, "Scan", "Scanning..."),
    { disabled: false, text: "Scan", ariaBusy: false },
  );
  assert.deepEqual(
    getSingleActionButtonState(true, "Scan", "Scanning..."),
    { disabled: true, text: "Scanning...", ariaBusy: true },
  );
});

test("single action ignores re-entry while an action is running", async () => {
  let isRunning = false;
  let actionCalls = 0;
  let finishAction: (() => void) | null = null;

  const workflow = {
    isRunning: () => isRunning,
    setRunning: (next: boolean) => {
      isRunning = next;
    },
    run: async () => {
      actionCalls += 1;
      await new Promise<void>((resolve) => {
        finishAction = resolve;
      });
      return "saved";
    },
  };

  const first = runSingleAction(workflow);
  await Promise.resolve();

  const second = await runSingleAction(workflow);
  assert.deepEqual(second, { started: false });
  assert.equal(actionCalls, 1);
  assert.equal(isRunning, true);

  finishAction?.();
  assert.deepEqual(await first, { started: true, result: "saved" });
  assert.equal(isRunning, false);
});

test("keyed single action ignores duplicate keys while allowing distinct actions", async () => {
  const runningKeys = new Set<string>();
  let actionCalls = 0;
  let finishAction: (() => void) | null = null;

  const first = runKeyedSingleAction({
    runningKeys,
    key: "convert-selection",
    run: async () => {
      actionCalls += 1;
      await new Promise<void>((resolve) => {
        finishAction = resolve;
      });
      return "converted";
    },
  });
  await Promise.resolve();

  const duplicate = await runKeyedSingleAction({
    runningKeys,
    key: "convert-selection",
    run: () => {
      throw new Error("must not run duplicate");
    },
  });
  const distinct = await runKeyedSingleAction({
    runningKeys,
    key: "add-task-reminder",
    run: () => {
      actionCalls += 1;
      return "task reminder";
    },
  });

  assert.deepEqual(duplicate, { started: false });
  assert.deepEqual(distinct, { started: true, result: "task reminder" });
  assert.equal(actionCalls, 2);
  assert.deepEqual([...runningKeys], ["convert-selection"]);

  finishAction?.();
  assert.deepEqual(await first, { started: true, result: "converted" });
  assert.deepEqual([...runningKeys], []);
});

test("single open ignores re-entry until the opened surface releases", () => {
  let isOpen = false;
  let openCalls = 0;
  let closeSurface: (() => void) | null = null;

  const workflow = {
    isOpen: () => isOpen,
    setOpen: (next: boolean) => {
      isOpen = next;
    },
    open: (release: () => void) => {
      openCalls += 1;
      closeSurface = release;
      return "modal";
    },
  };

  const first = runSingleOpen(workflow);
  assert.deepEqual(first, { opened: true, result: "modal" });
  assert.equal(isOpen, true);

  const second = runSingleOpen(workflow);
  assert.deepEqual(second, { opened: false });
  assert.equal(openCalls, 1);

  closeSurface?.();
  assert.equal(isOpen, false);

  const third = runSingleOpen(workflow);
  assert.deepEqual(third, { opened: true, result: "modal" });
  assert.equal(openCalls, 2);
});

test("single open releases the guard when opening throws", () => {
  let isOpen = false;

  assert.throws(() =>
    runSingleOpen({
      isOpen: () => isOpen,
      setOpen: (next: boolean) => {
        isOpen = next;
      },
      open: () => {
        throw new Error("open failed");
      },
    }),
  );

  assert.equal(isOpen, false);
});

test("keyed single open ignores duplicate keys while allowing distinct surfaces", () => {
  const openKeys = new Set<string>();
  const releases: Array<() => void> = [];
  let openCalls = 0;

  const first = runKeyedSingleOpen({
    openKeys,
    key: "capture",
    open: (release) => {
      openCalls += 1;
      releases.push(release);
      return "capture";
    },
  });
  const duplicate = runKeyedSingleOpen({
    openKeys,
    key: "capture",
    open: () => {
      throw new Error("must not open duplicate");
    },
  });
  const distinct = runKeyedSingleOpen({
    openKeys,
    key: "manager",
    open: (release) => {
      openCalls += 1;
      releases.push(release);
      return "manager";
    },
  });

  assert.deepEqual(first, { opened: true, result: "capture" });
  assert.deepEqual(duplicate, { opened: false });
  assert.deepEqual(distinct, { opened: true, result: "manager" });
  assert.deepEqual([...openKeys].sort(), ["capture", "manager"]);
  assert.equal(openCalls, 2);

  releases[0]?.();
  assert.deepEqual([...openKeys], ["manager"]);
});
