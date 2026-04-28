import { Notice } from "obsidian";
import { Reminder } from "./types";
import { ReminderStore } from "./store";

type FireCallback = (reminder: Reminder) => void;

export class Scheduler {
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(
    private store: ReminderStore,
    private onFire: FireCallback,
  ) {}

  scheduleAll(): void {
    this.cancelAll();
    for (const r of this.store.pending) {
      this.schedule(r);
    }
  }

  schedule(reminder: Reminder): void {
    this.cancel(reminder.id);
    const delay = reminder.dueAt - Date.now();
    if (delay <= 0) {
      return;
    }
    const clamped = Math.min(delay, 2_147_483_000);
    const timer = setTimeout(() => {
      this.timers.delete(reminder.id);
      this.fire(reminder);
    }, clamped);
    this.timers.set(reminder.id, timer);
  }

  cancel(id: string): void {
    const t = this.timers.get(id);
    if (t) {
      clearTimeout(t);
      this.timers.delete(id);
    }
  }

  cancelAll(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  async scanOverdue(): Promise<void> {
    if (!this.store.settings.fireMissedOnLaunch) return;
    const now = Date.now();
    const overdue = this.store.pending.filter((r) => r.dueAt <= now);
    if (overdue.length === 0) return;

    if (overdue.length === 1) {
      this.fire(overdue[0]);
      return;
    }

    new Notice(`${overdue.length} reminders were missed. Showing now.`, 5000);
    for (const r of overdue) {
      this.fire(r);
    }
  }

  private fire(reminder: Reminder): void {
    try {
      showNativeNotification(reminder, this.store.settings.soundOnNotify);
    } catch (e) {
      console.error("native notify failed, falling back to Notice", e);
      new Notice(`⏰ ${reminder.text}`, 10_000);
    }
    this.onFire(reminder);
  }
}

function showNativeNotification(reminder: Reminder, silent: boolean): void {
  if (typeof Notification === "undefined") {
    throw new Error("Notification API unavailable");
  }

  const fire = () => {
    const n = new Notification("Quick Reminder", {
      body: reminder.text,
      silent: !silent,
      tag: reminder.id,
      requireInteraction: false,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  };

  if (Notification.permission === "granted") {
    fire();
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((perm) => {
      if (perm === "granted") fire();
    });
  }
}
