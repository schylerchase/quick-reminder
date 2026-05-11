import test from "node:test";
import assert from "node:assert/strict";
import { ReminderStore } from "../src/store";
import { DEFAULT_SETTINGS, type PluginData, type Reminder } from "../src/types";

test("markNotified records notification time without completing the reminder", async () => {
  const { store, getSaved } = await createStore();

  await store.markNotified("r1");

  const reminder = getSaved().reminders[0] as Reminder & { notifiedAt?: number };
  assert.equal(reminder.notified, true);
  assert.equal(reminder.completedAt, undefined);
  assert.equal(typeof reminder.notifiedAt, "number");
});

test("restore clears notification and completion timestamps", async () => {
  const { store, getSaved } = await createStore({
    notified: true,
    completedAt: 100,
    notifiedAt: 200,
  } as Reminder & { notifiedAt: number });

  await store.restore("r1");

  const reminder = getSaved().reminders[0] as Reminder & { notifiedAt?: number };
  assert.equal(reminder.notified, false);
  assert.equal(reminder.completedAt, undefined);
  assert.equal(reminder.notifiedAt, undefined);
});

async function createStore(reminderPatch: Partial<Reminder> = {}) {
  let saved: PluginData | null = null;
  const reminder = createReminder(reminderPatch);
  const initialData: PluginData = {
    reminders: [reminder],
    settings: {
      ...DEFAULT_SETTINGS,
      mirrorToMarkdown: false,
    },
  };
  const store = new ReminderStore(
    createAppMock(),
    async () => structuredClone(initialData),
    async (data) => {
      saved = structuredClone(data);
    },
  );

  await store.init();

  return {
    store,
    getSaved: () => {
      assert.ok(saved);
      return saved;
    },
  };
}

function createAppMock() {
  return {
    vault: {
      getAbstractFileByPath: () => null,
      createFolder: async () => {},
    },
  } as never;
}

function createReminder(patch: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    text: "call mom",
    rawInput: "call mom tomorrow",
    dueAt: Date.now() + 60_000,
    createdAt: Date.now(),
    notified: false,
    ...patch,
  };
}
