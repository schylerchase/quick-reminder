import {
  Plugin,
  PluginSettingTab,
  App,
  Setting,
  Editor,
  MarkdownView,
  Notice,
  WorkspaceLeaf,
} from "obsidian";
import { ReminderStore } from "./store";
import { Scheduler } from "./scheduler";
import { QuickCaptureModal, ReminderListModal } from "./modal";
import { PluginData, Reminder } from "./types";
import { parseReminder } from "./parser";
import { ReminderView, VIEW_TYPE_REMINDER } from "./view";

export default class QuickReminderPlugin extends Plugin {
  store!: ReminderStore;
  scheduler!: Scheduler;

  async onload(): Promise<void> {
    this.store = new ReminderStore(
      this.app,
      async () => (await this.loadData()) as PluginData | null,
      async (data) => {
        await this.saveData(data);
      },
    );
    await this.store.init();

    this.scheduler = new Scheduler(this.store, async (reminder) => {
      await this.store.markNotified(reminder.id);
    });

    this.registerView(
      VIEW_TYPE_REMINDER,
      (leaf) => new ReminderView(leaf, this.store, this.scheduler),
    );

    this.addRibbonIcon("alarm-clock", "Quick Reminder: capture", () => {
      new QuickCaptureModal(this.app, this.store, this.scheduler).open();
    });

    this.addRibbonIcon("list", "Quick Reminder: open view", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "quick-capture",
      name: "Quick capture reminder",
      callback: () => {
        new QuickCaptureModal(this.app, this.store, this.scheduler).open();
      },
    });

    this.addCommand({
      id: "list-pending",
      name: "Show pending reminders (modal)",
      callback: () => {
        new ReminderListModal(this.app, this.store, this.scheduler).open();
      },
    });

    this.addCommand({
      id: "open-view",
      name: "Open reminders sidebar",
      callback: () => {
        void this.activateView();
      },
    });

    this.addCommand({
      id: "convert-selection",
      name: "Convert selection to reminder",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        void this.convertSelectionToReminder(editor, view);
      },
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        const sel = editor.getSelection().trim();
        if (!sel) return;
        menu.addItem((item) => {
          item
            .setTitle("Create reminder from selection")
            .setIcon("alarm-clock")
            .onClick(() => {
              void this.convertSelectionToReminder(editor, view as MarkdownView);
            });
        });
      }),
    );

    this.addSettingTab(new QuickReminderSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(async () => {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        await Notification.requestPermission();
      }
      await this.scheduler.scanOverdue();
      this.scheduler.scheduleAll();
      await this.activateView(false);
    });
  }

  onunload(): void {
    this.scheduler?.cancelAll();
  }

  async activateView(reveal = true): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_REMINDER);
    let leaf: WorkspaceLeaf | null;

    if (existing.length > 0) {
      leaf = existing[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE_REMINDER, active: reveal });
      }
    }

    if (reveal && leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  private async convertSelectionToReminder(
    editor: Editor,
    _view: MarkdownView,
  ): Promise<void> {
    const selection = editor.getSelection().trim();
    if (!selection) {
      new Notice("No text selected.");
      return;
    }

    const parsed = parseReminder(selection);
    if (!parsed.dueAt) {
      new Notice("No time detected in selection. Add e.g. 'tomorrow 3pm'.");
      return;
    }
    if (parsed.dueAt <= Date.now()) {
      new Notice("Detected time is in the past.");
      return;
    }

    const reminder: Reminder = {
      id: `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      text: parsed.text || selection,
      rawInput: selection,
      dueAt: parsed.dueAt,
      createdAt: Date.now(),
      notified: false,
    };

    await this.store.add(reminder);
    this.scheduler.schedule(reminder);

    const decorated = `⏰ ${selection}`;
    editor.replaceSelection(decorated);

    new Notice(
      `Reminder: ${reminder.text} — ${new Date(reminder.dueAt).toLocaleString()}`,
    );
  }
}

class QuickReminderSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: QuickReminderPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Quick Reminder Settings" });

    new Setting(containerEl)
      .setName("Mirror to markdown")
      .setDesc("Keep a Reminders.md file in your vault synced with current reminders.")
      .addToggle((t) =>
        t.setValue(this.plugin.store.settings.mirrorToMarkdown).onChange(async (v) => {
          await this.plugin.store.updateSettings({ mirrorToMarkdown: v });
        }),
      );

    new Setting(containerEl)
      .setName("Mirror file path")
      .setDesc("Path inside your vault for the mirror file.")
      .addText((t) =>
        t
          .setPlaceholder("Reminders.md")
          .setValue(this.plugin.store.settings.mirrorFilePath)
          .onChange(async (v) => {
            await this.plugin.store.updateSettings({ mirrorFilePath: v || "Reminders.md" });
          }),
      );

    new Setting(containerEl)
      .setName("Default snooze (minutes)")
      .addText((t) =>
        t
          .setValue(String(this.plugin.store.settings.defaultSnoozeMinutes))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (!Number.isNaN(n) && n > 0) {
              await this.plugin.store.updateSettings({ defaultSnoozeMinutes: n });
            }
          }),
      );

    new Setting(containerEl)
      .setName("Fire missed reminders on launch")
      .setDesc("If Obsidian was closed when a reminder was due, show it when you reopen.")
      .addToggle((t) =>
        t.setValue(this.plugin.store.settings.fireMissedOnLaunch).onChange(async (v) => {
          await this.plugin.store.updateSettings({ fireMissedOnLaunch: v });
        }),
      );

    new Setting(containerEl)
      .setName("Sound on notify")
      .addToggle((t) =>
        t.setValue(this.plugin.store.settings.soundOnNotify).onChange(async (v) => {
          await this.plugin.store.updateSettings({ soundOnNotify: v });
        }),
      );
  }
}
