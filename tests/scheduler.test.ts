import test from "node:test";
import assert from "node:assert/strict";
import { Notice } from "obsidian";
import { Scheduler } from "../src/scheduler";
import type { Reminder } from "../src/types";

test("scanOverdue shows an Obsidian notice when notification permission is denied after prompting", async () => {
  Notice.reset();
  const previousNotification = globalThis.Notification;
  const reminder = createReminder({ dueAt: Date.now() - 1_000 });
  const store = {
    settings: {
      fireMissedOnLaunch: true,
      soundOnNotify: true,
    },
    get pending() {
      return [reminder];
    },
  };
  const fired: string[] = [];

  class FakeNotification {
    static permission = "default";

    static async requestPermission(): Promise<NotificationPermission> {
      return "denied";
    }
  }

  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    value: FakeNotification,
  });

  try {
    const scheduler = new Scheduler(store as never, (firedReminder) => {
      fired.push(firedReminder.id);
    });

    await scheduler.scanOverdue();
    await Promise.resolve();

    assert.equal(fired.length, 1);
    assert.equal(Notice.entries.length, 1);
    assert.match(Notice.entries[0].message, /reminder due/i);
    assert.match(Notice.entries[0].message, /pay bill/);
  } finally {
    if (previousNotification === undefined) {
      delete (globalThis as { Notification?: unknown }).Notification;
    } else {
      Object.defineProperty(globalThis, "Notification", {
        configurable: true,
        value: previousNotification,
      });
    }
  }
});

test("scanOverdue with a single overdue reminder skips firing if it was removed before the timer", async () => {
  Notice.reset();
  // Single-reminder path goes through fire(), which re-resolves from the
  // store and bails if the snapshot is stale.
  const reminder = createReminder({ id: "rA", text: "first", dueAt: Date.now() - 1_000 });
  let pendingSet: Reminder[] = [reminder];
  const fired: string[] = [];
  const store = {
    settings: { fireMissedOnLaunch: true, soundOnNotify: false },
    get pending() {
      return pendingSet;
    },
    async markManyNotified() {
      // no-op for tests that only use the single-reminder fire() path
    },
  };

  const scheduler = new Scheduler(store as never, (firedReminder) => {
    fired.push(firedReminder.id);
  });

  // Simulate the reminder being removed before scanOverdue runs (e.g. the
  // user deleted it from another device and Quick Reminder synced before
  // the scheduler started).
  pendingSet = [];

  await scheduler.scanOverdue();
  await Promise.resolve();

  assert.deepEqual(fired, [], "scanOverdue should not fire reminders that are no longer pending");
});

test("scanOverdue batches markNotified for the multi-reminder cascade", async () => {
  Notice.reset();
  const ids = ["r1", "r2", "r3"];
  const reminders = ids.map((id, i) =>
    createReminder({ id, text: `r-${id}`, dueAt: Date.now() - (i + 1) * 1000 }),
  );
  let markedIds: readonly string[] | null = null;
  let markCalls = 0;
  const store = {
    settings: { fireMissedOnLaunch: true, soundOnNotify: false },
    get pending() {
      return reminders;
    },
    async markManyNotified(values: readonly string[]) {
      markCalls += 1;
      markedIds = values;
    },
  };

  const scheduler = new Scheduler(store as never, () => {
    /* per-reminder onFire is not called in the batch path */
  });

  await scheduler.scanOverdue();

  assert.equal(markCalls, 1, "exactly one persist for the entire cascade");
  assert.deepEqual([...(markedIds ?? [])], ids);
  assert.equal(Notice.entries[0]?.message, "3 missed reminders. Showing them now.");
});

test("fire swallows and logs onFire persistence failures instead of rejecting (F41)", async () => {
  Notice.reset();
  // Single-overdue path goes through fire(), which awaits onFire (store
  // persistence). A rejecting onFire must be logged-and-swallowed so the timer
  // callback's `void this.fire(...)` cannot raise an unhandled rejection.
  const reminder = createReminder({ id: "rFire", dueAt: Date.now() - 1_000 });
  const store = {
    settings: { fireMissedOnLaunch: true, soundOnNotify: false },
    get pending() {
      return [reminder];
    },
  };

  const errors: unknown[][] = [];
  const previousError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };

  try {
    const scheduler = new Scheduler(store as never, async () => {
      throw new Error("persist failed");
    });

    // Must resolve, not reject, even though onFire throws.
    await scheduler.scanOverdue();

    const logged = errors.some((args) =>
      args.some((a) => typeof a === "string" && /reminder fire failed/i.test(a)),
    );
    assert.equal(logged, true, "onFire failure should be logged and swallowed");
  } finally {
    console.error = previousError;
  }
});

test("permission-race fallbackTimer is registered for unload cleanup (F46)", async () => {
  Notice.reset();
  const previousNotification = globalThis.Notification;
  // showNativeNotification's race path uses window.setTimeout (DOM number
  // handle). node has no `window`, so provide a minimal one delegating to the
  // real timer functions.
  const previousWindow = (globalThis as { window?: unknown }).window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setTimeout, clearTimeout },
  });
  const reminder = createReminder({ id: "rPerm", dueAt: Date.now() - 1_000 });
  const store = {
    settings: { fireMissedOnLaunch: true, soundOnNotify: false },
    get pending() {
      return [reminder];
    },
  };

  // permission "default" forces the requestPermission race path that creates
  // the 5s fallbackTimer. Resolve "granted" so the timer is cleared on settle
  // and never leaks into the runner as an open handle.
  class FakeNotification {
    static permission = "default";
    static async requestPermission(): Promise<NotificationPermission> {
      return "granted";
    }
    onclick: (() => void) | null = null;
    constructor(_title: string, _opts: unknown) {}
    close(): void {}
  }

  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    value: FakeNotification,
  });

  const registered: number[] = [];
  const fakePlugin = {
    registerInterval(id: number): number {
      registered.push(id);
      return id;
    },
  };

  try {
    const scheduler = new Scheduler(
      store as never,
      async () => {
        /* persistence no-op */
      },
      fakePlugin as never,
    );

    await scheduler.scanOverdue();
    // Let the resolved requestPermission().then() run and clear the timer.
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(
      registered.length,
      1,
      "the permission-race fallbackTimer must be registered via plugin.registerInterval",
    );
  } finally {
    if (previousNotification === undefined) {
      delete (globalThis as { Notification?: unknown }).Notification;
    } else {
      Object.defineProperty(globalThis, "Notification", {
        configurable: true,
        value: previousNotification,
      });
    }
    if (previousWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      });
    }
  }
});

function createReminder(patch: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    text: "pay bill",
    rawInput: "pay bill yesterday",
    dueAt: Date.now() + 60_000,
    createdAt: Date.now(),
    notified: false,
    ...patch,
  };
}
