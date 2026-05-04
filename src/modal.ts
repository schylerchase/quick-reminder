import { App, Modal, Notice, Setting } from "obsidian";
import { parseReminder } from "./parser";
import { Reminder } from "./types";
import { ReminderStore } from "./store";
import { Scheduler } from "./scheduler";

export class QuickCaptureModal extends Modal {
  private inputEl!: HTMLInputElement;
  private previewEl!: HTMLDivElement;
  private saveButtonEl!: HTMLButtonElement;
  private currentParse = parseReminder("");

  constructor(
    app: App,
    private store: ReminderStore,
    private scheduler: Scheduler,
    private initialInput = "",
    private sourceTaskId: string | null = null,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("qr-modal");

    const header = contentEl.createDiv({ cls: "qr-modal-header" });
    header.createEl("h2", { text: "New reminder" });

    const field = contentEl.createDiv({ cls: "qr-field" });
    field.createEl("label", {
      text: "Reminder",
      cls: "qr-field-label",
      attr: { for: "qr-reminder-input" },
    });

    this.inputEl = field.createEl("input", {
      type: "text",
      attr: { id: "qr-reminder-input" },
      placeholder: "e.g. call mom tomorrow at 3pm",
      cls: "qr-input",
    });
    this.setInput(this.initialInput);
    this.inputEl.focus();
    if (this.initialInput) {
      this.inputEl.select();
    }

    this.previewEl = contentEl.createDiv({ cls: "qr-preview" });
    this.renderPreview();

    this.inputEl.addEventListener("input", () => {
      this.currentParse = parseReminder(this.inputEl.value);
      this.renderPreview();
    });

    this.inputEl.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        void this.save();
      }
    });

    const actions = contentEl.createDiv({ cls: "qr-modal-actions" });
    actions.createEl("button", { text: "Cancel", cls: "qr-secondary-btn" }).onclick = () => {
      this.close();
    };
    this.saveButtonEl = actions.createEl("button", {
      text: "Create reminder",
      cls: "qr-primary-btn",
    });
    this.saveButtonEl.onclick = () => {
      void this.save();
    };
    this.updateSaveState();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderPreview(): void {
    this.previewEl.empty();
    const { text, dueAt, matchedText } = this.currentParse;

    if (!text && !dueAt) {
      this.previewEl.createDiv({
        text: "Waiting for a reminder",
        cls: "qr-preview-status qr-preview-muted",
      });
      this.updateSaveState();
      return;
    }

    const status = this.previewEl.createDiv({
      text: dueAt ? "Ready to create" : "Add a date or time",
      cls: `qr-preview-status ${dueAt ? "is-ready" : "needs-time"}`,
    });
    status.setAttr("aria-live", "polite");

    this.renderPreviewRow("Task", text || "(empty)");

    if (dueAt) {
      this.renderPreviewRow("Time", formatDateTime(dueAt));
      if (matchedText) {
        this.previewEl.createDiv({
          text: `Detected "${matchedText}"`,
          cls: "qr-preview-meta",
        });
      }
    } else {
      this.renderPreviewRow("Time", "No time detected", "qr-preview-warn");
    }

    this.updateSaveState();
  }

  private renderPreviewRow(label: string, value: string, cls = ""): void {
    const row = this.previewEl.createDiv({ cls: "qr-preview-row" });
    row.createSpan({ text: label, cls: "qr-preview-label" });
    row.createSpan({ text: value, cls });
  }

  private setInput(value: string): void {
    this.inputEl.value = value;
    this.currentParse = parseReminder(value);
  }

  private updateSaveState(): void {
    if (!this.saveButtonEl) return;
    const { text, dueAt } = this.currentParse;
    this.saveButtonEl.disabled = !text || !dueAt || dueAt <= Date.now();
  }

  private async save(): Promise<void> {
    const { text, dueAt } = this.currentParse;

    if (!text) {
      new Notice("Need a task description.");
      return;
    }
    if (!dueAt) {
      new Notice("No time detected. Try 'tomorrow 3pm' or 'in 10 minutes'.");
      return;
    }
    if (dueAt <= Date.now()) {
      new Notice("That time is in the past.");
      return;
    }

    const reminder: Reminder = {
      id: genId(),
      text,
      rawInput: this.inputEl.value,
      dueAt,
      createdAt: Date.now(),
      notified: false,
    };
    if (this.sourceTaskId) {
      reminder.sourceTaskId = this.sourceTaskId;
    }

    await this.store.add(reminder);
    this.scheduler.schedule(reminder);

    new Notice(`Reminder set: ${text} — ${formatDateTime(dueAt)}`);
    this.close();
  }
}

export class ReminderListModal extends Modal {
  constructor(
    app: App,
    private store: ReminderStore,
    private scheduler: Scheduler,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("qr-list-modal");

    contentEl.createEl("h2", { text: "Pending reminders" });

    const pending = this.store.pending;
    if (pending.length === 0) {
      contentEl.createEl("p", { text: "No pending reminders.", cls: "qr-preview-muted" });
      return;
    }

    for (const r of pending) {
      const row = contentEl.createDiv({ cls: "qr-list-row" });
      const text = row.createDiv({ cls: "qr-list-text" });
      text.createDiv({ text: r.text, cls: "qr-list-title" });
      text.createDiv({
        text: new Date(r.dueAt).toLocaleString(),
        cls: "qr-list-when",
      });

      new Setting(row)
        .addButton((b) =>
          b
            .setButtonText(`Snooze ${this.store.settings.defaultSnoozeMinutes}m`)
            .onClick(async () => {
              await this.store.snooze(r.id, this.store.settings.defaultSnoozeMinutes);
              this.scheduler.scheduleAll();
              this.onOpen();
            }),
        )
        .addButton((b) =>
          b
            .setButtonText("Delete")
            .setWarning()
            .onClick(async () => {
              this.scheduler.cancel(r.id);
              await this.store.remove(r.id);
              this.onOpen();
            }),
        );
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

function genId(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
