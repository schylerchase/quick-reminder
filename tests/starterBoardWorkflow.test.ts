import test from "node:test";
import assert from "node:assert/strict";
import {
  getStarterBoardOpenFailedNotice,
  getStarterBoardPathInvalidNotice,
  getStarterBoardPathUnavailableNotice,
  getStarterBoardReadyNotice,
  getStarterBoardSetupFailedNotice,
} from "../src/lib/starterBoardMessages";
import {
  runStarterBoardEntryAction,
  runStarterBoardWorkflow,
} from "../src/lib/starterBoardWorkflow";

test("starter board workflow reports create/open failure before setup work", async () => {
  let setupRan = false;
  const error = new Error("vault create failed");
  let captured: unknown = null;

  const result = await runStarterBoardWorkflow({
    getBoardFile: async () => {
      throw error;
    },
    afterBoardReady: async () => {
      setupRan = true;
    },
    onBoardError: (reason) => {
      captured = reason;
    },
  });

  assert.deepEqual(result, { ok: false, boardReady: false, error });
  assert.equal(setupRan, false);
  assert.equal(captured, error);
});

test("starter board workflow distinguishes setup failure after board exists", async () => {
  const file = { path: "Quick Reminder Dashboard.md" };
  const error = new Error("workspace open failed");
  let captured: unknown = null;

  const result = await runStarterBoardWorkflow({
    getBoardFile: async () => file,
    afterBoardReady: async () => {
      throw error;
    },
    onSetupError: (reason) => {
      captured = reason;
    },
  });

  assert.deepEqual(result, { ok: false, boardReady: true, file, error });
  assert.equal(captured, error);
});

test("starter board workflow succeeds after board and setup complete", async () => {
  const file = { path: "Quick Reminder Dashboard.md" };
  let setupRan = false;

  const result = await runStarterBoardWorkflow({
    getBoardFile: async () => file,
    afterBoardReady: async () => {
      setupRan = true;
    },
  });

  assert.deepEqual(result, { ok: true, boardReady: true, file });
  assert.equal(setupRan, true);
});

test("starter board notices distinguish missing board from setup recovery", () => {
  const ready = getStarterBoardReadyNotice("Quick Reminder Dashboard.md");
  assert.match(ready, /starter dashboard ready/i);
  assert.match(ready, /Quick Reminder Dashboard\.md/);
  assert.doesNotMatch(ready, /console/i);

  const failed = getStarterBoardOpenFailedNotice();
  assert.match(failed, /could not create or open/i);
  assert.match(failed, /starter dashboard/i);

  const setupFailed = getStarterBoardSetupFailedNotice("Quick Reminder Dashboard.md");
  assert.match(setupFailed, /starter dashboard exists/i);
  assert.match(setupFailed, /Quick Reminder Dashboard\.md/);
  assert.match(setupFailed, /open it from the vault/i);
});

test("starter board validation notices guide settings recovery", () => {
  const invalid = getStarterBoardPathInvalidNotice("Quick Reminder Dashboard");
  assert.match(invalid, /Quick Reminder Dashboard/);
  assert.match(invalid, /must end in \.md/i);
  assert.match(invalid, /settings/i);

  const unavailable = getStarterBoardPathUnavailableNotice("Projects");
  assert.match(unavailable, /Projects/);
  assert.match(unavailable, /already a folder/i);
  assert.match(unavailable, /choose another \.md path/i);
});

test("starter board entry action re-enables the trigger after a handled failure", async () => {
  const busyStates: boolean[] = [];

  const result = await runStarterBoardEntryAction({
    openStarterBoard: async () => false,
    setBusy: (busy) => {
      busyStates.push(busy);
    },
  });

  assert.deepEqual(result, { ok: false, handled: true });
  assert.deepEqual(busyStates, [true, false]);
});

test("starter board entry action re-enables the trigger after an exception", async () => {
  const error = new Error("workspace exploded");
  const busyStates: boolean[] = [];
  let captured: unknown = null;

  const result = await runStarterBoardEntryAction({
    openStarterBoard: async () => {
      throw error;
    },
    setBusy: (busy) => {
      busyStates.push(busy);
    },
    onError: (reason) => {
      captured = reason;
    },
  });

  assert.deepEqual(result, { ok: false, handled: false, error });
  assert.deepEqual(busyStates, [true, false]);
  assert.equal(captured, error);
});
