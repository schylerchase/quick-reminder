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
