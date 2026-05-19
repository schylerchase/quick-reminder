import {
  Plugin,
  PluginSettingTab,
  App,
  Setting,
  Editor,
  MarkdownView,
  Notice,
  TFile,
  TFolder,
  WorkspaceLeaf,
  normalizePath,
} from "obsidian";
import { ReminderStore } from "./store";
import { Scheduler } from "./scheduler";
import { QuickCaptureModal, ReminderListModal } from "./modal";
import { DEFAULT_MIRROR_FILE_PATH, PluginData, Reminder } from "./types";
import { parseReminder } from "./parser";
import { saveScheduledReminder } from "./reminderTransaction";
import { ReminderView, VIEW_TYPE_REMINDER } from "./view";
import {
  buildCheckboxTaskId,
  extractCheckboxTaskText,
  TaskScanner,
} from "./taskScanner";
import {
  openMainViewLeaf,
  isMainPaneLeaf,
  isSidebarLeaf,
  isRightSidebarLeaf as isRightSidebarLeafHelper,
  collapseRightSidebar,
  expandRightSidebar,
} from "./workspace";
import { removeManagedBlock } from "./lib/managedTasksBlock";
import {
  insertManagedBlockIfNeeded,
  regenerateManagedBlock,
} from "./lib/managedTasksOps";
import {
  getRibbonIconIndex,
  restoreRibbonIconIndex,
} from "./lib/ribbon-order";

export default class QuickReminderPlugin extends Plugin {
  store!: ReminderStore;
  scheduler!: Scheduler;
  taskScanner!: TaskScanner;
  private selectedTaskFolderPath: string | null = null;
  /** True after onunload; guards async onLayoutReady callbacks. */
  private isUnloaded = false;
  /**
   * Subscribers (currently the ReminderView) that want to know when an
   * internal taskScanner write is about to fire — used to suppress the
   * resulting "modify" event without a fragile time-window.
   */
  private selfModifySubscribers: Set<(path: string) => void> = new Set();

  registerSelfModifySubscriber(fn: (path: string) => void): () => void {
    this.selfModifySubscribers.add(fn);
    return () => this.selfModifySubscribers.delete(fn);
  }

  private notifySelfModify = (path: string): void => {
    for (const fn of this.selfModifySubscribers) {
      try {
        fn(path);
      } catch (err) {
        console.error("Quick Reminder self-modify subscriber failed", err);
      }
    }
  };

  async onload(): Promise<void> {
    // Register view FIRST — before any await — so Obsidian's workspace
    // restore can place leaves at their saved sidebar positions. Registering
    // after `await store.init()` lets layout restore beat the registration:
    // Obsidian then renders our leaves as deferred placeholders at the END
    // of the sidebar (the visible "tabs land at the end" bug). The factory
    // closure resolves this.store / this.scheduler / this.taskScanner
    // lazily — view construction happens on tab activation, which is
    // always AFTER onload completes.
    this.registerView(
      VIEW_TYPE_REMINDER,
      (leaf) =>
        new ReminderView(
          leaf,
          this.store,
          this.scheduler,
          this.taskScanner,
          (fn) => this.registerSelfModifySubscriber(fn),
          (file, transform) => this.applyManagedBlockTransform(file, transform),
        ),
    );

    this.store = new ReminderStore(
      this.app,
      async () => (await this.loadData()) as PluginData | null,
      async (data) => {
        await this.saveData(data);
      },
    );
    await this.store.init();
    this.taskScanner = new TaskScanner(this.app, this.notifySelfModify);
    this.scheduler = new Scheduler(this.store, async (reminder) => {
      await this.store.markNotified(reminder.id);
    }, this);
    // Defer ribbon icon registration to layoutReady. Adding to the ribbon
    // synchronously during onload triggers a workspace re-layout on iPad
    // which dismisses any open settings modal (the "instant close menu"
    // bug). onLayoutReady fires AFTER the user finishes interacting with
    // the toggle, so the modal stays open.
    this.app.workspace.onLayoutReady(() => {
      if (this.isUnloaded) return;
      const ribbonIcon = this.addRibbonIcon("list-checks", "Quick Reminder: open manager", () => {
        void this.activateView();
      });
      this.restoreRibbonPosition(ribbonIcon);
      this.trackRibbonPosition(ribbonIcon);
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
      id: "open-task-dashboard",
      name: "Open task dashboard",
      callback: () => {
        void this.openTaskDashboard();
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
      id: "convert-selection",
      name: "Convert selection to reminder",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        void this.convertSelectionToReminder(editor, view);
      },
    });

    this.addCommand({
      id: "insert-task-sections",
      name: "Insert task sections",
      editorCallback: (editor: Editor) => {
        insertTaskSections(editor, this.store.settings.taskSectionHeadings);
      },
    });

    this.addCommand({
      id: "insert-managed-tasks-block",
      name: "Insert managed tasks block here",
      editorCallback: (_editor: Editor, view: MarkdownView) => {
        const file = view.file;
        if (!file) return;
        void this.applyManagedBlockTransform(file, insertManagedBlockIfNeeded);
      },
    });

    this.addCommand({
      id: "remove-managed-tasks-block",
      name: "Remove managed tasks block",
      editorCallback: (_editor: Editor, view: MarkdownView) => {
        const file = view.file;
        if (!file) return;
        void this.applyManagedBlockTransform(file, removeManagedBlock);
      },
    });

    this.addCommand({
      id: "regenerate-managed-tasks-block",
      name: "Regenerate managed tasks block",
      editorCallback: (_editor: Editor, view: MarkdownView) => {
        const file = view.file;
        if (!file) return;
        void this.applyManagedBlockTransform(file, regenerateManagedBlock);
      },
    });

    // NOTE: auto-regenerate on file modify is intentionally disabled.
    // The managed block is canonical when users edit tasks inside it; an
    // unconditional regen would clobber those edits with above-block content.
    // Users invoke `regenerate-managed-tasks-block` explicitly when they want
    // scattered tasks pulled into the block.

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        const sel = editor.getSelection().trim();
        menu.addItem((item) => {
          item
            .setTitle(
              sel ? "Create reminder from selection" : "Create reminder",
            )
            .setIcon("calendar-plus")
            .onClick(() => {
              new QuickCaptureModal(
                this.app,
                this.store,
                this.scheduler,
                this.getEditorTaskSeed(editor),
                null,
                null,
                false,
              ).open();
            });
        });
        if (this.isTasksIntegrationAvailable()) {
          menu.addItem((item) => {
            item
              .setTitle("Add task reminder")
              .setIcon("list-plus")
              .onClick(() => {
                void this.addTaskReminderFromEditor(
                  editor,
                  view as MarkdownView,
                );
              });
          });
        } else {
          menu.addItem((item) => {
            item
              .setTitle("Add task reminder")
              .setIcon("list-plus")
              .onClick(() => {
                new QuickCaptureModal(
                  this.app,
                  this.store,
                  this.scheduler,
                  this.getEditorTaskSeed(editor),
                  null,
                  null,
                  false,
                ).open();
              });
          });
        }
      }),
    );

    this.addSettingTab(new QuickReminderSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(async () => {
      // Plugin could have been disabled while Obsidian was still loading
      // a large vault. Bail out so we don't schedule timers on a dead
      // scheduler instance or fire notifications for a disabled plugin.
      if (this.isUnloaded) return;
      await this.scheduler.scanOverdue();
      if (this.isUnloaded) return;
      this.scheduler.scheduleAll();
      // Intentionally NOT auto-revealing on layoutReady: the user-facing
      // setting promises reveal "when you switch files", and firing
      // leftSplit.expand() / the file-explorer command on every plugin
      // enable dismisses any open settings modal.
    });

    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        this.clearSelectedTaskFolderHighlight();
        if (this.store.settings.autoRevealActiveFile) {
          void this.revealActiveFileInExplorer(false);
        }
      }),
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && file.extension === "md") {
          menu.addItem((item) => {
            item
              .setTitle("Show file tasks in Quick Reminder")
              .setIcon("list-checks")
              .onClick(() => {
                void this.showTasksForFile(file);
              });
          });
          return;
        }

        if (file instanceof TFolder) {
          menu.addItem((item) => {
            item
              .setTitle("Show folder tasks in Quick Reminder")
              .setIcon("list-checks")
              .onClick(() => {
                void this.showTasksForFolder(file.path);
              });
          });
        }
      }),
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile) {
          this.maybeAutoInsertTaskSections(file);
        }
      }),
    );

    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file instanceof TFile) {
          void this.maybeAutoInsertManagedBlock(file);
        }
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
    this.isUnloaded = true;
    this.scheduler?.cancelAll();
  }

  private restoreRibbonPosition(ribbonIcon: HTMLElement): void {
    const restore = () =>
      restoreRibbonIconIndex(ribbonIcon, this.store.settings.ribbonIconIndex);
    restore();
    window.setTimeout(restore, 250);
    window.setTimeout(restore, 1000);
    window.setTimeout(restore, 2000);
  }

  private trackRibbonPosition(ribbonIcon: HTMLElement): void {
    let canSave = false;
    let lastSaved = this.store.settings.ribbonIconIndex;
    const scheduleSave = () => {
      if (!canSave) return;
      window.setTimeout(() => {
        const index = getRibbonIconIndex(ribbonIcon);
        if (index === null || index === lastSaved) return;
        lastSaved = index;
        this.store
          .updateSettings({ ribbonIconIndex: index })
          .catch((error) => console.error("Quick Reminder: failed to save ribbon order", error));
      }, 150);
    };

    window.setTimeout(() => {
      canSave = true;
    }, 2500);

    this.registerDomEvent(ribbonIcon, "mouseup", scheduleSave);
    this.registerDomEvent(ribbonIcon, "touchend", scheduleSave);
    this.registerDomEvent(ribbonIcon, "dragend", scheduleSave);
    this.registerDomEvent(ribbonIcon, "keyup", scheduleSave);
    const parent = ribbonIcon.parentElement;
    if (parent) {
      const observer = new MutationObserver(scheduleSave);
      observer.observe(parent, { childList: true });
      this.register(() => observer.disconnect());
    }
  }

  async applyManagedBlockTransform(
    file: TFile,
    transform: (content: string) => string,
  ): Promise<void> {
    try {
      await this.app.vault.process(file, (content) => {
        const next = transform(content);
        if (next === content) return content;
        this.notifySelfModify(file.path);
        return next;
      });
    } catch (error) {
      console.error("Quick Reminder managed block transform failed", error);
      new Notice("Quick Reminder: failed to update managed tasks block");
    }
  }

  private async maybeAutoInsertManagedBlock(file: TFile): Promise<void> {
    const settings = this.store.settings;
    if (!settings.autoInsertManagedBlock || file.extension !== "md") return;
    if (!isPathInFolders(file.path, settings.managedBlockAutoInsertFolders)) return;
    if (this.isUnloaded) return;
    try {
      await this.applyManagedBlockTransform(
        file,
        insertManagedBlockIfNeeded,
      );
    } catch (error) {
      console.error("Quick Reminder managed block auto-insert failed", error);
    }
  }

  private maybeAutoInsertTaskSections(file: TFile): void {
    const settings = this.store.settings;
    if (!settings.autoInsertTaskSections || file.extension !== "md") {
      return;
    }
    if (!isPathInFolders(file.path, settings.taskSectionAutoInsertFolders)) {
      return;
    }

    const handle = window.setTimeout(async () => {
      if (this.isUnloaded) return;
      try {
        await this.app.vault.process(file, (content) => {
          if (content.trim().length > 0 || hasTaskSection(content)) {
            return content;
          }
          return buildTaskSectionBlock(settings.taskSectionHeadings);
        });
      } catch (error) {
        console.error("Quick Reminder task section auto-insert failed", error);
      }
    }, 500);
    this.registerInterval(handle);
  }

  async activateView(
    reveal = true,
    placement: "sidebar" | "tab" = "sidebar",
  ): Promise<ReminderView | null> {
    const { workspace } = this.app;
    const existing =
      placement === "sidebar"
        ? workspace
            .getLeavesOfType(VIEW_TYPE_REMINDER)
            .filter((leaf) => isSidebarLeaf(leaf))
        : workspace
            .getLeavesOfType(VIEW_TYPE_REMINDER)
            .filter((leaf) => isMainWorkspaceLeaf(leaf));
    let leaf: WorkspaceLeaf | null;

    if (placement === "tab") {
      leaf = existing[0] ?? workspace.getLeaf("split", "vertical");
      if (leaf.view.getViewType() !== VIEW_TYPE_REMINDER) {
        await leaf.setViewState({ type: VIEW_TYPE_REMINDER, active: reveal });
      }
    } else {
      // Reuse the restored leaf in its restored position.
      // Detaching + recreating would push the tab to the end of the sidebar
      // on every reactivation, destroying the user's tab order across reloads.
      if (existing.length > 0) {
        leaf = existing[0];
        if (leaf.view.getViewType() !== VIEW_TYPE_REMINDER) {
          await leaf.setViewState({ type: VIEW_TYPE_REMINDER, active: reveal });
        }
        await leaf.loadIfDeferred();
        // Detach any stale duplicates from prior buggy reactivations.
        for (let i = 1; i < existing.length; i += 1) existing[i].detach();
      } else {
        leaf = await openReminderSidebarLeaf(workspace, reveal);
      }
    }

    if (placement === "tab") {
      collapseRightSidebar(workspace);
    }
    if (reveal && leaf) {
      await workspace.revealLeaf(leaf);
      if (placement === "sidebar" && isRightSidebarLeaf(leaf)) {
        expandRightSidebar(workspace);
      }
    }
    return leaf?.view instanceof ReminderView ? leaf.view : null;
  }

  async showTasksForFolder(folderPath: string): Promise<void> {
    this.selectedTaskFolderPath = folderPath;
    this.highlightSelectedTaskFolder();
    const view = await this.activateView(
      true,
      this.getCurrentManagerPlacement(),
    );
    view?.showFolder(folderPath);
    window.setTimeout(() => this.highlightSelectedTaskFolder(), 0);
    window.setTimeout(() => this.highlightSelectedTaskFolder(), 100);
  }

  async showTasksForFile(file: TFile): Promise<void> {
    this.clearSelectedTaskFolderHighlight();
    const view = await this.activateView(
      true,
      this.getCurrentManagerPlacement(),
    );
    view?.showActiveFile(file.path, file.parent?.path ?? "");
  }

  private getCurrentManagerPlacement(): "sidebar" | "tab" {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_REMINDER);
    // Need the leaf identity to compare against the reminder leaf list,
    // not a view. getActiveViewOfType does not give us the leaf.
    const activeLeaf = this.app.workspace.activeLeaf;
    if (activeLeaf && leaves.includes(activeLeaf)) {
      return isMainWorkspaceLeaf(activeLeaf) ? "tab" : "sidebar";
    }
    if (leaves.some((leaf) => isMainWorkspaceLeaf(leaf))) {
      return "tab";
    }
    return "sidebar";
  }

  private async moveMainDashboardAsideForFile(file: TFile): Promise<void> {
    const mainManagerLeaf = this.app.workspace
      .getLeavesOfType(VIEW_TYPE_REMINDER)
      .find((leaf) => isMainWorkspaceLeaf(leaf));
    if (!mainManagerLeaf) return;

    // Need the leaf to pass to setActiveLeaf and to compare identity
    // against mainManagerLeaf.
    const activeLeaf = this.app.workspace.activeLeaf;
    if (
      activeLeaf &&
      activeLeaf !== mainManagerLeaf &&
      isMainWorkspaceLeaf(activeLeaf)
    ) {
      await this.activateView(true, "sidebar");
      mainManagerLeaf.detach();
      this.app.workspace.setActiveLeaf(activeLeaf, { focus: true });
      this.closeDuplicateMainFileLeaves(file, activeLeaf, [0, 100, 300]);
      return;
    }

    await this.activateView(true, "sidebar");
    await mainManagerLeaf.openFile(file, { active: true });
    this.app.workspace.setActiveLeaf(mainManagerLeaf, { focus: true });
    this.closeDuplicateMainFileLeaves(file, mainManagerLeaf, [0, 100, 300]);
  }

  private closeDuplicateMainFileLeaves(
    file: TFile,
    keepLeaf: WorkspaceLeaf,
    delays = [0],
  ): void {
    for (const delay of delays) {
      window.setTimeout(() => {
        this.closeDuplicateMainFileLeavesNow(file, keepLeaf);
      }, delay);
    }
  }

  private closeDuplicateMainFileLeavesNow(
    file: TFile,
    keepLeaf: WorkspaceLeaf,
  ): void {
    const duplicates: WorkspaceLeaf[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf === keepLeaf) return;
      if (!isMainWorkspaceLeaf(leaf)) return;
      if (!(leaf.view instanceof MarkdownView)) return;
      if (leaf.view.file?.path !== file.path) return;
      duplicates.push(leaf);
    });

    for (const leaf of duplicates) {
      leaf.detach();
    }
  }

  private async openTaskDashboard(): Promise<void> {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = activeView?.file ?? this.app.workspace.getActiveFile();
    if (!(file instanceof TFile) || file.extension !== "md") {
      const view = await this.activateView(true, "tab");
      view?.setScope("vault");
      return;
    }

    const managerLeaf = await openMainViewLeaf(this.app.workspace, VIEW_TYPE_REMINDER);
    if (!managerLeaf) {
      new Notice("Quick Reminder could not find a note pane.");
      return;
    }

    if (managerLeaf.view instanceof ReminderView) {
      managerLeaf.view.showActiveFile(file.path, file.parent?.path ?? "");
    }
    this.closeOtherMainManagerLeaves(managerLeaf);
  }

  private closeOtherMainManagerLeaves(keepLeaf: WorkspaceLeaf): void {
    window.setTimeout(() => {
      for (const leaf of this.app.workspace.getLeavesOfType(
        VIEW_TYPE_REMINDER,
      )) {
        if (leaf === keepLeaf) continue;
        if (isMainWorkspaceLeaf(leaf)) {
          leaf.detach();
        }
      }
    }, 0);
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
      (folderEl instanceof HTMLElement
        ? folderEl.getAttribute("data-path")
        : null);
    if (folderPath === null) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void this.showTasksForFolder(folderPath);
  }

  private highlightSelectedTaskFolder(): void {
    this.clearSelectedTaskFolderHighlight(false);
    if (this.selectedTaskFolderPath === null) return;

    for (const folderTitle of Array.from(
      document.querySelectorAll<HTMLElement>(".nav-folder-title"),
    )) {
      const folderEl = folderTitle.closest(".nav-folder");
      const folderPath =
        folderTitle.getAttribute("data-path") ??
        (folderEl instanceof HTMLElement
          ? folderEl.getAttribute("data-path")
          : null);
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
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>(".qr-selected-task-folder"),
    )) {
      el.removeClass("qr-selected-task-folder");
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

    try {
      await saveScheduledReminder(
        this.store,
        this.scheduler,
        reminder,
        () => editor.replaceSelection(toReminderMarkdown(selection, reminder.dueAt)),
        (rollbackErr) =>
          console.error("Quick Reminder selection rollback failed", rollbackErr),
      );
    } catch (err) {
      console.error("Quick Reminder selection reminder failed", err);
      new Notice("Quick Reminder: could not save reminder - see console");
      return;
    }

    new Notice(
      `Reminder: ${reminder.text} - ${new Date(reminder.dueAt).toLocaleString()}`,
    );
  }

  private async addTaskReminderFromEditor(
    editor: Editor,
    view: MarkdownView,
  ): Promise<void> {
    const initialText = this.getEditorTaskSeed(editor);
    const api = this.getEnabledTasksPluginApi();
    if (api) {
      const initialLine = toTaskLine(initialText);
      const nextLine = await api.editTaskLineModal(initialLine);
      if (!nextLine) return;
      const markdownLine = sanitizeTaskPluginLine(nextLine);
      this.insertTaskLine(editor, markdownLine);
      await this.addReminderFromTaskLine(
        markdownLine,
        view.file?.path ?? null,
        editor.getCursor().line + 1,
      );
      return;
    }

    new QuickCaptureModal(
      this.app,
      this.store,
      this.scheduler,
      initialText,
      null,
      async (reminder, rawInput) => {
        const line = toTaskLine(toReminderMarkdown(rawInput, reminder.dueAt));
        this.insertTaskLine(editor, line);
        // Re-read view.file at INSERT time, not modal-open time: the user
        // can switch files between open and save, and the editor follows
        // the view's current file. Snapshotting earlier would link the
        // reminder to file A while the task lands in file B.
        const filePath = view.file?.path ?? null;
        if (filePath) {
          const checkboxText = extractCheckboxTaskText(line);
          if (checkboxText !== null) {
            await this.store.setReminderSourceTaskId(
              reminder.id,
              buildCheckboxTaskId(filePath, checkboxText),
            );
          }
        }
        await this.activateView(false);
      },
      false,
    ).open();
  }

  isTasksIntegrationAvailable(): boolean {
    return (
      this.store.settings.tasksIntegrationEnabled &&
      this.getEnabledTasksPluginApi() !== null
    );
  }

  getTasksPluginStatus(): "available" | "disabled" | "missing" {
    const plugin = getTasksPluginRecord(this.app);
    if (!plugin) return "missing";
    return getTasksPluginApi(this.app) ? "available" : "disabled";
  }

  private getEnabledTasksPluginApi(): TasksPluginApi | null {
    if (!this.store.settings.tasksIntegrationEnabled) return null;
    return getTasksPluginApi(this.app);
  }

  private getEditorTaskSeed(editor: Editor): string {
    const selection = editor.getSelection().trim();
    if (selection) return cleanMarkdownTaskLine(selection);

    const cursor = editor.getCursor();
    return cleanMarkdownTaskLine(editor.getLine(cursor.line).trim());
  }

  private insertTaskLine(editor: Editor, line: string): void {
    const selection = editor.getSelection();
    if (selection.trim()) {
      editor.replaceSelection(line);
      return;
    }

    const cursor = editor.getCursor();
    const currentLine = editor.getLine(cursor.line);
    if (isMarkdownTaskLine(currentLine) || currentLine.trim() === "") {
      editor.replaceRange(
        line,
        { line: cursor.line, ch: 0 },
        { line: cursor.line, ch: currentLine.length },
      );
      return;
    }

    editor.replaceRange(`\n${line}`, {
      line: cursor.line,
      ch: currentLine.length,
    });
  }

  private async addReminderFromTaskLine(
    line: string,
    filePath: string | null,
    _lineNumber: number,
  ): Promise<void> {
    const parsed = parseReminder(cleanMarkdownTaskLine(line));
    if (!parsed.dueAt || parsed.dueAt <= Date.now()) {
      new Notice("Task added. Add a date or time to show it as a reminder.");
      return;
    }

    const reminder: Reminder = {
      id: `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      text: parsed.text,
      rawInput: line,
      dueAt: parsed.dueAt,
      createdAt: Date.now(),
      notified: false,
    };
    if (filePath) {
      // Build the id from the raw checkbox text (same normalization the
      // scanner uses) so the next scan recognizes this task and shows the
      // "added" badge / blocks duplicate reminder creation.
      const checkboxText = extractCheckboxTaskText(line);
      if (checkboxText !== null) {
        reminder.sourceTaskId = buildCheckboxTaskId(filePath, checkboxText);
      }
    }

    await saveScheduledReminder(this.store, this.scheduler, reminder);
    new Notice(`Task reminder added: ${reminder.text}`);
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
      new Notice(
        "Could not reveal file. Make sure the Files core plugin is enabled.",
      );
    }
  }
}

function isMainWorkspaceLeaf(leaf: WorkspaceLeaf): boolean {
  return isMainPaneLeaf(leaf);
}

function isRightSidebarLeaf(leaf: WorkspaceLeaf): boolean {
  return isRightSidebarLeafHelper(leaf);
}

function getPreferredMainLeaf(
  workspace: App["workspace"],
): WorkspaceLeaf | null {
  // Workspace placement helper, needs the leaf, not a view.
  const activeLeaf = getMainWorkspaceLeaf(workspace.activeLeaf);
  if (activeLeaf) return activeLeaf;

  const recentLeaf = getMainWorkspaceLeaf(
    workspace.getMostRecentLeaf(workspace.rootSplit),
  );
  if (recentLeaf) return recentLeaf;

  let result: WorkspaceLeaf | null = null;
  workspace.iterateAllLeaves((leaf) => {
    if (result) return;
    if (isMainWorkspaceLeaf(leaf)) {
      result = leaf;
    }
  });
  return result;
}

function getMainMarkdownLeafForFile(
  workspace: App["workspace"],
  filePath: string,
): WorkspaceLeaf | null {
  let result: WorkspaceLeaf | null = null;
  workspace.iterateAllLeaves((leaf) => {
    if (result) return;
    if (!isMainWorkspaceLeaf(leaf)) return;
    if (
      leaf.view instanceof MarkdownView &&
      leaf.view.file?.path === filePath
    ) {
      result = leaf;
    }
  });
  return result;
}

function getMainWorkspaceLeaf(
  leaf: WorkspaceLeaf | null,
): WorkspaceLeaf | null {
  if (!leaf) return null;
  return isMainWorkspaceLeaf(leaf) ? leaf : null;
}

async function openReminderSidebarLeaf(
  workspace: App["workspace"],
  reveal: boolean,
): Promise<WorkspaceLeaf | null> {
  expandRightSidebar(workspace);

  const leaf = workspace.getRightLeaf(false) ?? workspace.getRightLeaf(true);
  if (!leaf) return null;
  await leaf.setViewState({ type: VIEW_TYPE_REMINDER, active: reveal });
  await leaf.loadIfDeferred();
  return leaf;
}

interface TasksPluginApi {
  editTaskLineModal(line: string): Promise<string>;
}

function getTasksPluginApi(app: unknown): TasksPluginApi | null {
  const tasksPlugin = getTasksPluginRecord(app);
  const api = tasksPlugin?.apiV1 as Partial<TasksPluginApi> | undefined;
  return typeof api?.editTaskLineModal === "function"
    ? (api as TasksPluginApi)
    : null;
}

function getTasksPluginRecord(app: unknown): { apiV1?: unknown } | null {
  return (
    ((
      app as {
        plugins?: { plugins?: Record<string, unknown> };
      }
    ).plugins?.plugins?.["obsidian-tasks-plugin"] as
      | { apiV1?: unknown }
      | undefined) ?? null
  );
}

type FileExplorerApi = {
  revealInFolder?: (file: unknown) => void | Promise<void>;
  revealFile?: (file: unknown) => void | Promise<void>;
  revealFileInFolder?: (file: unknown) => void | Promise<void>;
};

async function revealFileInExplorer(app: App, file: unknown): Promise<boolean> {
  const internalPlugins = (
    app as {
      internalPlugins?: {
        plugins?: Record<
          string,
          { enabled?: boolean; instance?: FileExplorerApi }
        >;
        getPluginById?: (
          id: string,
        ) => { enabled?: boolean; instance?: FileExplorerApi } | undefined;
      };
      commands?: { executeCommandById?: (id: string) => boolean };
      workspace?: { leftSplit?: { collapsed?: boolean; expand?: () => void } };
    }
  ).internalPlugins;

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

  return (
    (
      app as { commands?: { executeCommandById?: (id: string) => boolean } }
    ).commands?.executeCommandById?.("file-explorer:reveal-active-file") ===
    true
  );
}

function cleanMarkdownTaskLine(value: string): string {
  return value
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX-]\]\s+/, "")
    .replace(/\[due::\s*([^\]]+)\]/gi, "due $1")
    .replace(/\s+/g, " ")
    .trim();
}

function isMarkdownTaskLine(value: string): boolean {
  return /^\s*(?:[-*+]|\d+[.)])\s+\[[ xX-]\]\s+/.test(value);
}

function toTaskLine(value: string): string {
  const trimmed = value.trim();
  if (isMarkdownTaskLine(trimmed)) {
    return trimmed;
  }
  return `- [ ] ${trimmed}`;
}

function toReminderMarkdown(value: string, dueAt: number): string {
  const parsed = parseReminder(value);
  const text = parsed.text || value.trim();
  return `${text} [due:: ${formatMarkdownDateTime(dueAt)}]`;
}

function sanitizeTaskPluginLine(value: string): string {
  return value
    .replace(/\u{1F4C5}\s*(\d{4}-\d{2}-\d{2})/gu, "[due:: $1]")
    .replace(/\u{23F3}\s*(\d{4}-\d{2}-\d{2})/gu, "[scheduled:: $1]")
    .replace(/\u{1F6EB}\s*(\d{4}-\d{2}-\d{2})/gu, "[start:: $1]")
    .replace(/\u{2705}\s*(\d{4}-\d{2}-\d{2})/gu, "[done:: $1]")
    .replace(/\u{2795}\s*(\d{4}-\d{2}-\d{2})/gu, "[created:: $1]")
    .trim();
}

function formatMarkdownDateTime(ms: number): string {
  const date = new Date(ms);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  if (hh === "00" && min === "00") {
    return `${yyyy}-${mm}-${dd}`;
  }
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function getTasksIntegrationDescription(
  status: "available" | "disabled" | "missing",
): string {
  if (status === "available") {
    return "Tasks is installed and available. When enabled, editor right-click uses the Tasks modal for task reminders.";
  }
  if (status === "disabled") {
    return "Tasks appears to be installed but its API is not available. Enable or reload the Tasks plugin to use this integration.";
  }
  return "Tasks is not installed. Quick Reminder will use its own reminder capture unless Tasks is installed and this integration is enabled.";
}

function openCommunityPlugins(app: App): void {
  const settings = (
    app as {
      setting?: {
        open?: () => void;
        openTabById?: (id: string) => void;
      };
    }
  ).setting;
  settings?.open?.();
  settings?.openTabById?.("community-plugins");
}

function insertTaskSections(editor: Editor, headings: string[]): void {
  const current = editor.getValue();
  if (hasTaskSection(current)) {
    new Notice("This note already has a Tasks section.");
    return;
  }

  const block = buildTaskSectionBlock(headings);
  const cursor = editor.getCursor();
  const prefix = current.trim().length > 0 ? "\n\n" : "";
  editor.replaceRange(`${prefix}${block}`, cursor);
  new Notice("Task sections inserted.");
}

function buildTaskSectionBlock(headings: string[]): string {
  const sections = normalizeTaskSectionHeadings(headings);
  return (
    ["## Tasks", "", ...sections.flatMap((heading) => [`### ${heading}`, ""])]
      .join("\n")
      .trimEnd() + "\n"
  );
}

function normalizeTaskSectionHeadings(headings: string[]): string[] {
  const clean = headings.map((heading) => heading.trim()).filter(Boolean);
  return clean.length > 0 ? clean : ["In Progress", "To Do", "Completed"];
}

function hasTaskSection(content: string): boolean {
  return /^\s{0,3}##\s+Tasks\s*#*\s*$/im.test(content);
}

function isPathInFolders(path: string, folders: string[]): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedFolders = folders
    .map((folder) => normalizePath(folder.trim()))
    .filter(Boolean);
  if (normalizedFolders.length === 0) {
    return false;
  }
  return normalizedFolders.some(
    (folder) =>
      normalizedPath === folder || normalizedPath.startsWith(`${folder}/`),
  );
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
      .setDesc(
        "Keep a Reminders.md file in your vault synced with current reminders.",
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.store.settings.mirrorToMarkdown)
          .onChange(async (v) => {
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
            await this.plugin.store.updateSettings({
              mirrorFilePath: v || DEFAULT_MIRROR_FILE_PATH,
            });
          }),
      );

    new Setting(containerEl).setName("Default snooze (minutes)").addText((t) =>
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
      .setDesc(
        "If Obsidian was closed when a reminder was due, show it when you reopen.",
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.store.settings.fireMissedOnLaunch)
          .onChange(async (v) => {
            await this.plugin.store.updateSettings({ fireMissedOnLaunch: v });
          }),
      );

    new Setting(containerEl).setName("Sound on notify").addToggle((t) =>
      t
        .setValue(this.plugin.store.settings.soundOnNotify)
        .onChange(async (v) => {
          await this.plugin.store.updateSettings({ soundOnNotify: v });
        }),
    );

    new Setting(containerEl)
      .setName("Reveal active file in file explorer")
      .setDesc(
        "Automatically expand and highlight the active note in the Files pane when you switch files.",
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.store.settings.autoRevealActiveFile)
          .onChange(async (v) => {
            await this.plugin.store.updateSettings({ autoRevealActiveFile: v });
            if (v) {
              await this.plugin.revealActiveFileInExplorer(true);
            }
          }),
      );

    const tasksStatus = this.plugin.getTasksPluginStatus();
    new Setting(containerEl)
      .setName("Tasks plugin integration")
      .setDesc(getTasksIntegrationDescription(tasksStatus))
      .addToggle((t) =>
        t
          .setValue(this.plugin.store.settings.tasksIntegrationEnabled)
          .onChange(async (v) => {
            await this.plugin.store.updateSettings({
              tasksIntegrationEnabled: v,
            });
            this.display();
          }),
      )
      .addButton((button) =>
        button.setButtonText("Open community plugins").onClick(() => {
          openCommunityPlugins(this.app);
        }),
      );

    containerEl.createEl("h3", { text: "Task sections" });

    new Setting(containerEl)
      .setName("Task section headings")
      .setDesc(
        "One heading per line. Used by the insert command and optional new-note template.",
      )
      .addTextArea((t) =>
        t
          .setPlaceholder("In Progress\nTo Do\nCompleted")
          .setValue(this.plugin.store.settings.taskSectionHeadings.join("\n"))
          .onChange(async (v) => {
            await this.plugin.store.updateSettings({
              taskSectionHeadings: normalizeTaskSectionHeadings(
                v.split(/\r?\n/),
              ),
            });
          }),
      );

    new Setting(containerEl)
      .setName("Auto-insert task sections in new notes")
      .setDesc(
        "Disabled by default. Only applies to empty new markdown notes inside the folders below.",
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.store.settings.autoInsertTaskSections)
          .onChange(async (v) => {
            await this.plugin.store.updateSettings({
              autoInsertTaskSections: v,
            });
          }),
      );

    new Setting(containerEl)
      .setName("Auto-insert folders")
      .setDesc(
        "One vault-relative folder per line. Example: Projects or Daily.",
      )
      .addTextArea((t) =>
        t
          .setPlaceholder("Projects\nDaily")
          .setValue(
            this.plugin.store.settings.taskSectionAutoInsertFolders.join("\n"),
          )
          .onChange(async (v) => {
            await this.plugin.store.updateSettings({
              taskSectionAutoInsertFolders: v
                .split(/\r?\n/)
                .map((folder) => normalizePath(folder.trim()))
                .filter(Boolean),
            });
          }),
      );

    new Setting(containerEl)
      .setName("Auto-insert managed tasks block on file open")
      .setDesc(
        "TOC-style. When a note in the folders below has tasks but no managed block, automatically insert one and keep it regenerated on each open.",
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.store.settings.autoInsertManagedBlock)
          .onChange(async (v) => {
            await this.plugin.store.updateSettings({
              autoInsertManagedBlock: v,
            });
          }),
      );

    new Setting(containerEl)
      .setName("Managed block folders")
      .setDesc(
        "One vault-relative folder per line. Notes inside these folders get auto-managed.",
      )
      .addTextArea((t) =>
        t
          .setPlaceholder("Projects\nWork")
          .setValue(
            this.plugin.store.settings.managedBlockAutoInsertFolders.join("\n"),
          )
          .onChange(async (v) => {
            await this.plugin.store.updateSettings({
              managedBlockAutoInsertFolders: v
                .split(/\r?\n/)
                .map((folder) => normalizePath(folder.trim()))
                .filter(Boolean),
            });
          }),
      );

    new Setting(containerEl)
      .setName("Insert task sections")
      .setDesc(
        "Adds a Tasks section with your configured headings to the active note.",
      )
      .addButton((button) =>
        button.setButtonText("Insert now").onClick(() => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (!view) {
            new Notice("Open a markdown note first.");
            return;
          }
          insertTaskSections(
            view.editor,
            this.plugin.store.settings.taskSectionHeadings,
          );
        }),
      );

  }
}
