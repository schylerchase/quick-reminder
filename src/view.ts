import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import { Reminder } from "./types";
import { ReminderStore } from "./store";
import { Scheduler } from "./scheduler";
import { QuickCaptureModal } from "./modal";

export const VIEW_TYPE_REMINDER = "quick-reminder-view";

export class ReminderView extends ItemView {
  private refreshHandler = () => this.render();

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
    return "alarm-clock";
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

    const header = container.createDiv({ cls: "qr-view-header" });
    header.createEl("h3", { text: "Reminders" });
    const addBtn = header.createEl("button", {
      text: "+ New",
      cls: "qr-view-add-btn",
    });
    addBtn.onclick = () => {
      new QuickCaptureModal(this.app, this.store, this.scheduler).open();
    };

    const pending = this.store.pending;
    const done = this.store.all.filter((r) => r.notified).slice(-30).reverse();

    this.renderSection(container as HTMLElement, "Pending", pending, false);
    this.renderSection(container as HTMLElement, "History", done, true);
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
        text: isHistory ? "No past reminders." : "No pending reminders.",
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

    const body = row.createDiv({ cls: "qr-view-row-body" });
    body.createDiv({ text: r.text, cls: "qr-view-row-text" });

    const whenLabel = formatWhen(r.dueAt, isHistory);
    body.createDiv({ text: whenLabel, cls: "qr-view-row-when" });

    const actions = row.createDiv({ cls: "qr-view-row-actions" });

    if (!isHistory) {
      const snoozeBtn = actions.createEl("button", { text: "Snooze" });
      snoozeBtn.onclick = async () => {
        await this.store.snooze(r.id, this.store.settings.defaultSnoozeMinutes);
        this.scheduler.scheduleAll();
        new Notice(`Snoozed ${this.store.settings.defaultSnoozeMinutes}m`);
      };
    } else {
      const reuseBtn = actions.createEl("button", { text: "Re-add" });
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
      text: "✕",
      cls: "qr-view-del",
    });
    delBtn.setAttr("aria-label", "Delete");
    delBtn.onclick = async () => {
      this.scheduler.cancel(r.id);
      await this.store.remove(r.id);
    };
  }
}

function formatWhen(ms: number, isHistory: boolean): string {
  const now = Date.now();
  const diff = ms - now;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);

  const exact = new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  if (isHistory) {
    if (mins < 60) return `${mins}m ago · ${exact}`;
    if (hours < 24) return `${hours}h ago · ${exact}`;
    return `${days}d ago · ${exact}`;
  }
  if (diff < 0) return `overdue · ${exact}`;
  if (mins < 60) return `in ${mins}m · ${exact}`;
  if (hours < 24) return `in ${hours}h · ${exact}`;
  return `in ${days}d · ${exact}`;
}
