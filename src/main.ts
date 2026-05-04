import {
  Plugin,
  PluginSettingTab,
  App,
  Setting,
  Editor,
  MarkdownView,
  Notice,
  TFolder,
  WorkspaceLeaf,
} from "obsidian";
import { ReminderStore } from "./store";
import { Scheduler } from "./scheduler";
import { QuickCaptureModal, ReminderListModal } from "./modal";
import { DEFAULT_MIRROR_FILE_PATH, PluginData, Reminder } from "./types";
import { parseReminder } from "./parser";
import { ReminderView, VIEW_TYPE_REMINDER } from "./view";
import { PluginUpdater } from "./updater";
import { TaskScanner } from "./taskScanner";

export default class QuickReminderPlugin extends Plugin {
  store!: ReminderStore;
  scheduler!: Scheduler;
  updater!: PluginUpdater;
  taskScanner!: TaskScanner;
  private selectedTaskFolderPath: string | null = null;

  async onload(): Promise<void> {
    this.store = new ReminderStore(
      this.app,
      async () => (await this.loadData()) as PluginData | null,
      async (data) => {
        await this.saveData(data);
      },
    );
    await this.store.init();
    this.updater = new PluginUpdater(this.app, this.manifest);
    this.taskScanner = new TaskScanner(this.app);
    this.scheduler = new Scheduler(this.store, async (reminder) => {
      await this.store.markNotified(reminder.id);
    });
    this.registerView(
      VIEW_TYPE_REMINDER,
      (leaf) => new ReminderView(leaf, this.store, this.scheduler, this.taskScanner),
    );
    this.addRibbonIcon("list-checks", "Quick Reminder: open manager", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "quick-capture",
      name: "Quick capture reminder",
      callback: () => {
        new QuickCaptureModal(
          this.app,
          this.store,
          this.scheduler,
          this.getActiveMarkdownTaskText(),
        ).open();
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
      name: "Open reminder manager",
      callback: () => {
        void this.activateView();
      },
    });

    this.addCommand({
      id: "open-view-main-tab",
      name: "Open reminder manager as main tab",
      callback: () => {
        void this.activateView(true, "tab");
      },
    });

    this.addCommand({
      id: "reveal-active-file",
      name: "Reveal active file in file explorer",
      callback: () => {
        void this.revealActiveFileInExplorer(true);
      },
    });

    this.addCommand({
      id: "update-from-github",
      name: "Update from latest GitHub release",
      callback: () => {
        void this.installLatestRelease();
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
      void this.notifyIfUpdateAvailable();
      void this.revealActiveFileInExplorer(false);
    });

    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        this.clearSelectedTaskFolderHighlight();
        if (this.store.settings.autoRevealActiveFile) {
          void this.revealActiveFileInExplorer(false);
        }
      }),
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFolder)) return;
        menu.addItem((item) => {
          item
            .setTitle("Show folder tasks in Quick Reminder")
            .setIcon("list-checks")
            .onClick(() => {
              void this.showTasksForFolder(file.path);
            });
        });
      }),
    );

    this.app.workspace.onLayoutReady(() => {
      try {
        this.registerDomEvent(
          document,
          "click",
          (event) => {
            this.handleFileExplorerFolderClick(event);
          },
          true,
        );
      } catch (error) {
        console.warn("Quick Reminder folder click hook skipped", error);
      }
    });
  }

  onunload(): void {
    this.scheduler?.cancelAll();
  }

  async activateView(reveal = true, placement: "sidebar" | "tab" = "sidebar"): Promise<ReminderView | null> {
    const { workspace } = this.app;
    const existing =
      placement === "sidebar"
        ? workspace.getLeavesOfType(VIEW_TYPE_REMINDER).filter((leaf) => isRightSidebarLeaf(leaf))
        : workspace.getLeavesOfType(VIEW_TYPE_REMINDER).filter((leaf) => isMainWorkspaceLeaf(leaf));
    let leaf: WorkspaceLeaf | null;

    if (placement === "tab") {
      leaf = existing[0] ?? workspace.getLeaf("tab");
      if (leaf.view.getViewType() !== VIEW_TYPE_REMINDER) {
        await leaf.setViewState({ type: VIEW_TYPE_REMINDER, active: reveal });
      }
    } else {
      for (const existingLeaf of existing) {
        existingLeaf.detach();
      }
      leaf = await openReminderSidebarLeaf(workspace, reveal);
    }

    if (placement === "tab") {
      workspace.rightSplit.collapse();
    }
    if (reveal && leaf) {
      await workspace.revealLeaf(leaf);
      if (placement === "sidebar") {
        workspace.rightSplit.expand();
      }
    }
    return leaf?.view instanceof ReminderView ? leaf.view : null;
  }

  async showTasksForFolder(folderPath: string): Promise<void> {
    this.selectedTaskFolderPath = folderPath;
    this.highlightSelectedTaskFolder();
    const view = await this.activateView(true, this.getCurrentManagerPlacement());
    view?.showFolder(folderPath);
    window.setTimeout(() => this.highlightSelectedTaskFolder(), 0);
    window.setTimeout(() => this.highlightSelectedTaskFolder(), 100);
  }

  private getCurrentManagerPlacement(): "sidebar" | "tab" {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_REMINDER);
    const activeLeaf = this.app.workspace.activeLeaf;
    if (activeLeaf && leaves.includes(activeLeaf)) {
      return isMainWorkspaceLeaf(activeLeaf) ? "tab" : "sidebar";
    }
    if (leaves.some((leaf) => isMainWorkspaceLeaf(leaf))) {
      return "tab";
    }
    return "sidebar";
  }

  private handleFileExplorerFolderClick(event: MouseEvent): void {
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest(".collapse-icon")) return;

    const folderTitle = target.closest(".nav-folder-title");
    if (!(folderTitle instanceof HTMLElement)) return;
    if (!document.body.contains(folderTitle)) return;

    const folderEl = folderTitle.closest(".nav-folder");
    const folderPath =
      folderTitle.getAttribute("data-path") ??
      (folderEl instanceof HTMLElement ? folderEl.getAttribute("data-path") : null);
    if (folderPath === null) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void this.showTasksForFolder(folderPath);
  }

  private highlightSelectedTaskFolder(): void {
    this.clearSelectedTaskFolderHighlight(false);
    if (this.selectedTaskFolderPath === null) return;

    for (const folderTitle of Array.from(document.querySelectorAll<HTMLElement>(".nav-folder-title"))) {
      const folderEl = folderTitle.closest(".nav-folder");
      const folderPath =
        folderTitle.getAttribute("data-path") ??
        (folderEl instanceof HTMLElement ? folderEl.getAttribute("data-path") : null);
      if (folderPath === this.selectedTaskFolderPath) {
        folderTitle.addClass("qr-selected-task-folder");
        folderTitle.scrollIntoView({ block: "nearest" });
        return;
      }
    }
  }

  private clearSelectedTaskFolderHighlight(clearSelection = true): void {
    if (clearSelection) {
      this.selectedTaskFolderPath = null;
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(".qr-selected-task-folder"))) {
      el.removeClass("qr-selected-task-folder");
    }
  }

  async installLatestRelease(): Promise<void> {
    new Notice("Checking Quick Reminder releases...");
    try {
      const result = await this.updater.installLatest();
      if (!result.hasUpdate) {
        new Notice(`Quick Reminder is already current (${result.currentVersion}).`);
        return;
      }

      new Notice(
        `Quick Reminder ${result.latestVersion} installed. Reload the plugin to finish.`,
        10_000,
      );
    } catch (error) {
      console.error("Quick Reminder update failed", error);
      new Notice(`Quick Reminder update failed: ${getErrorMessage(error)}`, 10_000);
    }
  }

  private async notifyIfUpdateAvailable(): Promise<void> {
    if (!this.store.settings.checkForUpdatesOnLaunch) return;
    try {
      const result = await this.updater.check();
      if (!result.hasUpdate) return;
      new Notice(
        `Quick Reminder ${result.latestVersion} is available. Run "Quick Reminder: Update from latest GitHub release".`,
        12_000,
      );
    } catch (error) {
      console.warn("Quick Reminder update check failed", error);
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

  private getActiveMarkdownTaskText(): string {
    const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
    if (!editor) return "";

    const selection = editor.getSelection().trim();
    if (selection) return cleanMarkdownTaskLine(selection);

    const cursor = editor.getCursor();
    return cleanMarkdownTaskLine(editor.getLine(cursor.line).trim());
  }

  async revealActiveFileInExplorer(showNotice: boolean): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      if (showNotice) new Notice("No active file to reveal.");
      return;
    }

    const revealed = await revealFileInExplorer(this.app, file);
    if (revealed) {
      if (showNotice) new Notice("Revealed active file");
      return;
    }

    if (showNotice) {
      new Notice("Could not reveal file. Make sure the Files core plugin is enabled.");
    }
  }
}

function isMainWorkspaceLeaf(leaf: WorkspaceLeaf): boolean {
  return !leaf.view.containerEl.closest(".mod-left-split, .mod-right-split");
}

function isRightSidebarLeaf(leaf: WorkspaceLeaf): boolean {
  return leaf.view.containerEl.closest(".mod-right-split") !== null;
}

async function openReminderSidebarLeaf(
  workspace: App["workspace"],
  reveal: boolean,
): Promise<WorkspaceLeaf | null> {
  workspace.rightSplit.expand();

  const leaf = workspace.getRightLeaf(false) ?? workspace.getRightLeaf(true);
  if (!leaf) return null;
  await leaf.setViewState({ type: VIEW_TYPE_REMINDER, active: reveal });
  await leaf.loadIfDeferred();
  return leaf;
}

type FileExplorerApi = {
  revealInFolder?: (file: unknown) => void | Promise<void>;
  revealFile?: (file: unknown) => void | Promise<void>;
  revealFileInFolder?: (file: unknown) => void | Promise<void>;
};

async function revealFileInExplorer(app: App, file: unknown): Promise<boolean> {
  const internalPlugins = (app as {
    internalPlugins?: {
      plugins?: Record<string, { enabled?: boolean; instance?: FileExplorerApi }>;
      getPluginById?: (id: string) => { enabled?: boolean; instance?: FileExplorerApi } | undefined;
    };
    commands?: { executeCommandById?: (id: string) => boolean };
    workspace?: { leftSplit?: { collapsed?: boolean; expand?: () => void } };
  }).internalPlugins;

  const fileExplorer =
    internalPlugins?.plugins?.["file-explorer"] ??
    internalPlugins?.getPluginById?.("file-explorer");
  const instance = fileExplorer?.instance;

  app.workspace.leftSplit?.expand?.();

  if (typeof instance?.revealInFolder === "function") {
    await instance.revealInFolder(file);
    return true;
  }
  if (typeof instance?.revealFile === "function") {
    await instance.revealFile(file);
    return true;
  }
  if (typeof instance?.revealFileInFolder === "function") {
    await instance.revealFileInFolder(file);
    return true;
  }

  return (app as { commands?: { executeCommandById?: (id: string) => boolean } })
    .commands?.executeCommandById?.("file-explorer:reveal-active-file") === true;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cleanMarkdownTaskLine(value: string): string {
  return value
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX-]\]\s+/, "")
    .replace(/^⏰\s+/, "")
    .trim();
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
          .setPlaceholder(DEFAULT_MIRROR_FILE_PATH)
          .setValue(this.plugin.store.settings.mirrorFilePath)
          .onChange(async (v) => {
            await this.plugin.store.updateSettings({ mirrorFilePath: v || DEFAULT_MIRROR_FILE_PATH });
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

    new Setting(containerEl)
      .setName("Check for updates on launch")
      .setDesc("Show a notice when a newer GitHub release is available.")
      .addToggle((t) =>
        t.setValue(this.plugin.store.settings.checkForUpdatesOnLaunch).onChange(async (v) => {
          await this.plugin.store.updateSettings({ checkForUpdatesOnLaunch: v });
        }),
      );

    new Setting(containerEl)
      .setName("Reveal active file in file explorer")
      .setDesc("Automatically expand and highlight the active note in the Files pane when you switch files.")
      .addToggle((t) =>
        t.setValue(this.plugin.store.settings.autoRevealActiveFile).onChange(async (v) => {
          await this.plugin.store.updateSettings({ autoRevealActiveFile: v });
          if (v) {
            await this.plugin.revealActiveFileInExplorer(true);
          }
        }),
      );

    new Setting(containerEl)
      .setName("Plugin updates")
      .setDesc(
        `Install the latest release from ${this.plugin.updater.getRepositoryUrl()}. Reload the plugin after updating.`,
      )
      .addButton((button) =>
        button.setButtonText("Install latest").onClick(async () => {
          await this.plugin.installLatestRelease();
        }),
      );
  }
}
