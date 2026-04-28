import { App, Modal, Notice, Setting } from "obsidian";
import { parseReminder } from "./parser";
import { Reminder } from "./types";
import { ReminderStore } from "./store";
import { Scheduler } from "./scheduler";

export class QuickCaptureModal extends Modal {
  private inputEl!: HTMLInputElement;
  private previewEl!: HTMLDivElement;
  private currentParse = parseReminder("");

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
    contentEl.addClass("qr-modal");

    contentEl.createEl("h2", { text: "Quick Reminder" });

    this.inputEl = contentEl.createEl("input", {
      type: "text",
      placeholder: "e.g. call mom tomorrow at 3pm",
      cls: "qr-input",
    });
    this.inputEl.focus();

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

    const hint = contentEl.createDiv({ cls: "qr-hint" });
    hint.setText("Enter to save · Esc to cancel");
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderPreview(): void {
    this.previewEl.empty();
    const { text, dueAt, matchedText } = this.currentParse;

    if (!text && !dueAt) {
      this.previewEl.createSpan({ text: "Type a reminder…", cls: "qr-preview-muted" });
      return;
    }

    const taskRow = this.previewEl.createDiv({ cls: "qr-preview-row" });
    taskRow.createSpan({ text: "Task: ", cls: "qr-preview-label" });
    taskRow.createSpan({ text: text || "(empty)" });

    const whenRow = this.previewEl.createDiv({ cls: "qr-preview-row" });
    whenRow.createSpan({ text: "When: ", cls: "qr-preview-label" });
    if (dueAt) {
      const d = new Date(dueAt);
      whenRow.createSpan({ text: d.toLocaleString() + `  (matched: "${matchedText}")` });
    } else {
      whenRow.createSpan({ text: "⚠ no time detected — add a date/time phrase", cls: "qr-preview-warn" });
    }
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

    await this.store.add(reminder);
    this.scheduler.schedule(reminder);

    new Notice(`Reminder set: ${text} — ${new Date(dueAt).toLocaleString()}`);
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

    contentEl.createEl("h2", { text: "Pending Reminders" });

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
            .setButtonText("Snooze 10m")
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
