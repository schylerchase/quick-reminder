import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import { Reminder } from "./types";
import { ReminderStore } from "./store";
import { Scheduler } from "./scheduler";
import { QuickCaptureModal } from "./modal";

export const VIEW_TYPE_REMINDER = "quick-reminder-view";

export class ReminderView extends ItemView {
  private refreshHandler = () => this.render();
  private editingId: string | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private store: ReminderStore,
    private scheduler: Scheduler,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_REMINDER;
  }

  getDisplayText(): string {
    return "Quick Reminder";
  }

  getIcon(): string {
    return "list-checks";
  }

  async onOpen(): Promise<void> {
    this.store.onChange(this.refreshHandler);
    this.render();
  }

  async onClose(): Promise<void> {
    this.store.offChange(this.refreshHandler);
  }

  private render(): void {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("qr-view");

    const pending = this.store.pending;
    const now = Date.now();
    const overdue = pending.filter((r) => r.dueAt <= now);
    const upcoming = pending.filter((r) => r.dueAt > now);
    const allDone = this.store.all.filter((r) => r.notified);
    const done = allDone.slice(-30).reverse();

    const header = container.createDiv({ cls: "qr-view-header" });
    const title = header.createDiv({ cls: "qr-view-title" });
    title.createEl("h3", { text: "Reminders" });
    title.createDiv({
      text: getSummaryText(overdue.length, upcoming.length),
      cls: "qr-view-summary",
    });

    const addBtn = header.createEl("button", { text: "New", cls: "qr-view-add-btn" });
    addBtn.onclick = () => {
      new QuickCaptureModal(this.app, this.store, this.scheduler).open();
    };

    this.renderStats(container as HTMLElement, overdue.length, upcoming.length, allDone.length);

    if (overdue.length > 0) {
      this.renderSection(container as HTMLElement, "Overdue", overdue, false);
    }
    this.renderSection(container as HTMLElement, "Upcoming", upcoming, false);
    this.renderSection(container as HTMLElement, "History", done, true);
  }

  private renderStats(
    parent: HTMLElement,
    overdueCount: number,
    upcomingCount: number,
    historyCount: number,
  ): void {
    const stats = parent.createDiv({ cls: "qr-view-stats" });
    this.renderStat(stats, "Overdue", overdueCount, overdueCount > 0);
    this.renderStat(stats, "Upcoming", upcomingCount);
    this.renderStat(stats, "Done", historyCount);
  }

  private renderStat(parent: HTMLElement, label: string, count: number, warn = false): void {
    const stat = parent.createDiv({ cls: `qr-view-stat ${warn ? "is-warning" : ""}` });
    stat.createDiv({ text: String(count), cls: "qr-view-stat-number" });
    stat.createDiv({ text: label, cls: "qr-view-stat-label" });
  }

  private renderSection(
    parent: HTMLElement,
    title: string,
    items: Reminder[],
    isHistory: boolean,
  ): void {
    const section = parent.createDiv({ cls: "qr-view-section" });
    const head = section.createDiv({ cls: "qr-view-section-head" });
    head.createSpan({ text: title, cls: "qr-view-section-title" });
    head.createSpan({
      text: String(items.length),
      cls: "qr-view-section-count",
    });

    if (items.length === 0) {
      section.createDiv({
        text: getEmptyText(title, isHistory),
        cls: "qr-view-empty",
      });
      return;
    }

    for (const r of items) {
      this.renderRow(section, r, isHistory);
    }
  }

  private renderRow(parent: HTMLElement, r: Reminder, isHistory: boolean): void {
    const row = parent.createDiv({ cls: "qr-view-row" });
    row.toggleClass("qr-view-row-done", isHistory);

    if (this.editingId === r.id && !isHistory) {
      this.renderEditRow(row, r);
      return;
    }

    const body = row.createDiv({ cls: "qr-view-row-body" });
    body.createDiv({ text: r.text, cls: "qr-view-row-text" });

    const whenLabel = isHistory ? formatHistoryWhen(r) : formatWhen(r.dueAt);
    body.createDiv({ text: whenLabel, cls: "qr-view-row-when" });

    const actions = row.createDiv({ cls: "qr-view-row-actions" });

    if (!isHistory) {
      const doneBtn = actions.createEl("button", { text: "Done", cls: "qr-row-btn qr-done-btn" });
      doneBtn.onclick = async () => {
        this.scheduler.cancel(r.id);
        await this.store.complete(r.id);
        new Notice("Marked done");
      };

      const snoozeMinutes = this.store.settings.defaultSnoozeMinutes;
      const snoozeBtn = actions.createEl("button", {
        text: `Snooze ${snoozeMinutes}m`,
        cls: "qr-row-btn",
      });
      snoozeBtn.setAttr("aria-label", `Snooze ${snoozeMinutes} minutes`);
      snoozeBtn.onclick = async () => {
        await this.store.snooze(r.id, snoozeMinutes);
        this.scheduler.scheduleAll();
        new Notice(`Snoozed ${snoozeMinutes}m`);
      };

      const editBtn = actions.createEl("button", { text: "Edit", cls: "qr-row-btn" });
      editBtn.onclick = () => {
        this.editingId = r.id;
        this.render();
      };
    } else {
      const restoreBtn = actions.createEl("button", { text: "Restore", cls: "qr-row-btn" });
      restoreBtn.onclick = async () => {
        await this.store.restore(r.id);
        this.scheduler.scheduleAll();
        new Notice("Reminder restored");
      };

      const reuseBtn = actions.createEl("button", { text: "Re-add", cls: "qr-row-btn" });
      reuseBtn.onclick = () => {
        const modal = new QuickCaptureModal(this.app, this.store, this.scheduler);
        modal.open();
        setTimeout(() => {
          const inputEl = this.app.workspace.containerEl.querySelector(
            ".qr-input",
          ) as HTMLInputElement | null;
          if (inputEl) {
            inputEl.value = r.text;
            inputEl.dispatchEvent(new Event("input"));
            inputEl.focus();
            inputEl.select();
          }
        }, 50);
      };
    }

    const delBtn = actions.createEl("button", {
      text: "Delete",
      cls: "qr-row-btn qr-view-del",
    });
    delBtn.setAttr("aria-label", "Delete");
    delBtn.onclick = async () => {
      this.scheduler.cancel(r.id);
      await this.store.remove(r.id);
    };
  }

  private renderEditRow(parent: HTMLElement, r: Reminder): void {
    const editor = parent.createDiv({ cls: "qr-edit-form" });
    const fields = editor.createDiv({ cls: "qr-edit-fields" });
    const textInput = fields.createEl("input", { type: "text", cls: "qr-edit-input" });
    textInput.value = r.text;

    const dueInput = fields.createEl("input", { type: "datetime-local", cls: "qr-edit-input" });
    dueInput.value = formatInputDate(r.dueAt);

    const actions = editor.createDiv({ cls: "qr-edit-actions" });
    actions.createEl("button", { text: "Cancel", cls: "qr-row-btn" }).onclick = () => {
      this.editingId = null;
      this.render();
    };

    actions.createEl("button", { text: "Save", cls: "qr-row-btn qr-done-btn" }).onclick = async () => {
      const text = textInput.value.trim();
      const dueAt = new Date(dueInput.value).getTime();
      if (!text || Number.isNaN(dueAt)) {
        new Notice("Add a task and valid time.");
        return;
      }
      if (dueAt <= Date.now()) {
        new Notice("Reminder time must be in the future.");
        return;
      }
      await this.store.updateReminder(r.id, text, dueAt);
      this.scheduler.scheduleAll();
      this.editingId = null;
      new Notice("Reminder updated");
    };

    window.setTimeout(() => textInput.focus(), 0);
  }
}

function getSummaryText(overdueCount: number, upcomingCount: number): string {
  if (overdueCount > 0) {
    return `${overdueCount} overdue · ${upcomingCount} upcoming`;
  }
  if (upcomingCount > 0) {
    return `${upcomingCount} upcoming`;
  }
  return "Nothing pending";
}

function getEmptyText(title: string, isHistory: boolean): string {
  if (isHistory) return "No past reminders.";
  if (title === "Upcoming") return "No upcoming reminders.";
  return "No reminders here.";
}

function formatWhen(ms: number): string {
  const now = Date.now();
  const diff = ms - now;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);

  const exact = formatExact(ms);
  if (diff < 0) return `overdue · ${exact}`;
  if (mins < 60) return `in ${mins}m · ${exact}`;
  if (hours < 24) return `in ${hours}h · ${exact}`;
  return `in ${days}d · ${exact}`;
}

function formatHistoryWhen(reminder: Reminder): string {
  const completedAt = reminder.completedAt ?? reminder.dueAt;
  return `${formatAgo(completedAt)} done · due ${formatExact(reminder.dueAt)}`;
}

function formatAgo(ms: number): string {
  const abs = Math.abs(Date.now() - ms);
  const mins = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatExact(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatInputDate(ms: number): string {
  const date = new Date(ms);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(ms - offsetMs).toISOString().slice(0, 16);
}
