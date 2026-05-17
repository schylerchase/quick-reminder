import { Notice, Platform } from "obsidian";
import { Reminder } from "./types";
import { ReminderStore } from "./store";

type FireCallback = (reminder: Reminder) => void | Promise<void>;
const MAX_TIMEOUT_MS = 2_147_483_000;
const PERMISSION_REQUEST_TIMEOUT_MS = 5_000;

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
    const clamped = Math.min(delay, MAX_TIMEOUT_MS);
    const reminderId = reminder.id;
    const timer = setTimeout(() => {
      this.timers.delete(reminderId);
      const current = this.findPendingReminder(reminderId);
      if (!current) return;
      if (current.dueAt > Date.now()) {
        this.schedule(current);
        return;
      }
      void this.fire(current);
    }, clamped);
    this.timers.set(reminderId, timer);
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
      await this.fire(overdue[0]);
      return;
    }

    // Batch path: show all notifications synchronously, then mark every
    // overdue reminder notified in ONE persist call. Avoids N sequential
    // vault.process writes to the mirror file on launch, which used to
    // block the UI for several seconds on cloud-synced vaults.
    new Notice(`${overdue.length} reminders were missed. Showing now.`, 5000);
    const fired: string[] = [];
    for (const reminder of overdue) {
      try {
        showNativeNotification(reminder, this.store.settings.soundOnNotify);
      } catch (e) {
        console.error("native notify failed, falling back to Notice", e);
        showFallbackNotice(reminder);
      }
      fired.push(reminder.id);
    }
    try {
      await this.store.markManyNotified(fired);
    } catch (e) {
      // Don't let a persistence failure abort scheduler bootstrap: the user
      // has already SEEN the notifications, so the worst case is they fire
      // again next launch. Better than failing scheduleAll() entirely.
      console.error("Quick Reminder failed to persist overdue mark", e);
    }
  }

  private async fire(reminder: Reminder): Promise<void> {
    // Re-resolve from the store: the captured snapshot may be stale if the
    // reminder was deleted, edited, or already notified while the timer slept.
    const current = this.findPendingReminder(reminder.id);
    if (!current) return;

    try {
      showNativeNotification(current, this.store.settings.soundOnNotify);
    } catch (e) {
      console.error("native notify failed, falling back to Notice", e);
      showFallbackNotice(current);
    }
    await this.onFire(current);
  }

  private findPendingReminder(id: string): Reminder | null {
    return this.store.pending.find((r) => r.id === id) ?? null;
  }
}

function showNativeNotification(reminder: Reminder, silent: boolean): void {
  // Mobile (Obsidian iOS/Android) does not expose the Web Notification API
  // reliably; some platforms' requestPermission never resolves. Fall back to
  // an in-app Notice so the reminder is never silently lost.
  if (Platform.isMobileApp || typeof Notification === "undefined") {
    showFallbackNotice(reminder);
    return;
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
    return;
  }
  if (Notification.permission === "denied") {
    showFallbackNotice(reminder);
    return;
  }

  // Race requestPermission against a timeout so the user always sees the
  // reminder even if the platform never resolves the permission promise.
  let resolved = false;
  const fallbackTimer = setTimeout(() => {
    if (resolved) return;
    resolved = true;
    showFallbackNotice(reminder);
  }, PERMISSION_REQUEST_TIMEOUT_MS);

  Notification.requestPermission()
    .then((perm) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(fallbackTimer);
      if (perm === "granted") {
        fire();
      } else {
        showFallbackNotice(reminder);
      }
    })
    .catch((e) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(fallbackTimer);
      console.error("notification permission request failed", e);
      showFallbackNotice(reminder);
    });
}

function showFallbackNotice(reminder: Reminder): void {
  new Notice(`Reminder: ${reminder.text}`, 10_000);
}
