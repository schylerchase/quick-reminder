import {
  App,
  EventRef,
  ItemView,
  MarkdownView,
  Menu,
  Modal,
  Notice,
  TAbstractFile,
  TFile,
  WorkspaceLeaf,
  normalizePath,
} from "obsidian";
import {
  Reminder,
  ScrapedTask,
  TaskDashboardScope,
  TaskDashboardSort,
  TaskDashboardSourceFilter,
  TaskDashboardState,
} from "./types";
import { ReminderStore } from "./store";
import { Scheduler } from "./scheduler";
import { QuickCaptureModal } from "./modal";
import { parseReminder } from "./parser";
import { TaskScanner } from "./taskScanner";

export const VIEW_TYPE_REMINDER = "quick-reminder-view";
type ReminderViewState = {
  taskScope: TaskDashboardScope;
  selectedFolderPath: string | null;
  lastMarkdownPath: string | null;
  lastFolderPath: string | null;
  sourceFilter: TaskDashboardSourceFilter;
  taskSort: TaskDashboardSort;
  taskSearch: string;
};

export class ReminderView extends ItemView {
  private refreshHandler = () => {
    void this.render();
  };
  private collapsedSections = new Set<string>(["Completed vault tasks", "Ignored", "History"]);
  private editingId: string | null = null;
  private scrapedTasks: ScrapedTask[] = [];
  private hasScannedTasks = false;
  private isScanningTasks = false;
  private taskSearch = "";
  private taskScope: TaskDashboardScope = "vault";
  private selectedFolderPath: string | null = null;
  private lastMarkdownPath: string | null = null;
  private lastFolderPath: string | null = null;
  private sourceFilter: TaskDashboardSourceFilter = "all";
  private taskSort: TaskDashboardSort = "page";
  private fileOpenRef: EventRef | null = null;
  private scanDebounceHandle: number | null = null;
  private highlightedTaskId: string | null = null;
  private highlightTimeoutHandle: number | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private store: ReminderStore,
    private scheduler: Scheduler,
    private taskScanner: TaskScanner,
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
    this.applyDashboardState(this.store.settings.taskDashboardState);
    this.captureActiveMarkdownContext();
    this.ensureUsableDefaultScope();
    this.fileOpenRef = this.app.workspace.on("file-open", (file) => {
      const previousFolderPath = this.getScopedFolderPath();
      this.captureActiveMarkdownContext();
      void this.persistDashboardState();
      if (
        this.taskScope === "folder" &&
        this.selectedFolderPath !== null &&
        this.lastMarkdownPath !== null &&
        !isInFolder(this.lastMarkdownPath, this.selectedFolderPath)
      ) {
        this.selectedFolderPath = null;
      }
      if (this.taskScope === "active" || previousFolderPath !== this.getScopedFolderPath()) {
        void this.render(true);
      } else if (file?.extension === "md" && this.taskScope === "folder" && this.selectedFolderPath === null) {
        void this.render(true);
      }
    });
    this.registerEvent(this.app.vault.on("modify", (file) => this.queueTaskRefreshForFile(file)));
    this.registerEvent(this.app.vault.on("create", (file) => this.queueTaskRefreshForFile(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.queueTaskRefreshForFile(file)));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (this.shouldRefreshForVaultFile(file) || this.isScannedMarkdownPath(oldPath)) {
          this.queueTaskRefresh();
        }
      }),
    );
    await this.render(true);
  }

  async onClose(): Promise<void> {
    this.store.offChange(this.refreshHandler);
    if (this.fileOpenRef) {
      this.app.workspace.offref(this.fileOpenRef);
      this.fileOpenRef = null;
    }
    if (this.scanDebounceHandle !== null) {
      window.clearTimeout(this.scanDebounceHandle);
      this.scanDebounceHandle = null;
    }
    if (this.highlightTimeoutHandle !== null) {
      window.clearTimeout(this.highlightTimeoutHandle);
      this.highlightTimeoutHandle = null;
    }
  }

  private async render(scanVaultTasks = false): Promise<void> {
    if ((scanVaultTasks || !this.hasScannedTasks) && !this.isScanningTasks) {
      await this.refreshScrapedTasks();
    }

    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("qr-view");
    container.toggleClass("qr-view-dashboard", this.isMainWorkspaceView());

    const pending = this.store.pending;
    const now = Date.now();
    const overdue = pending.filter((r) => r.dueAt <= now);
    const upcoming = pending.filter((r) => r.dueAt > now);
    const allDone = this.store.all.filter((r) => r.notified);
    const done = allDone.slice(-30).reverse();
    this.captureActiveMarkdownContext();
    const activeFilePath = this.lastMarkdownPath;
    const folderPath = this.getScopedFolderPath();
    const scraped = this.getScopedScrapedTasks(activeFilePath, folderPath);
    const ignoredTaskIds = this.store.ignoredTaskIds;
    const ignoredTaskNotes = this.store.ignoredTaskNotes;
    const unignoredScraped = scraped.filter((task) => !ignoredTaskIds.has(task.id));
    const filteredScraped = this.getFilteredScrapedTasks(unignoredScraped);
    const activeScraped = this.sortScrapedTasks(filteredScraped.filter((task) => !task.completed));
    const completedScraped = this.sortScrapedTasks(filteredScraped.filter((task) => task.completed));
    const scopedIgnoredScraped = scraped.filter((task) => ignoredTaskIds.has(task.id));
    const ignoredScraped = this.sortScrapedTasks(this.getFilteredScrapedTasks(scopedIgnoredScraped));

    const header = container.createDiv({ cls: "qr-view-header" });
    const title = header.createDiv({ cls: "qr-view-title" });
      title.createEl("h3", { text: "Task Manager" });
    title.createDiv({
      text: getSummaryText(overdue.length, upcoming.length, activeScraped.length, this.taskScope, activeFilePath, folderPath),
      cls: "qr-view-summary",
    });

    const headerActions = header.createDiv({ cls: "qr-view-header-actions" });
    const scanBtn = headerActions.createEl("button", { text: "Scan", cls: "qr-view-secondary-btn" });
    scanBtn.onclick = async () => {
      await this.refreshScrapedTasks();
      await this.render();
      new Notice(`Found ${this.scrapedTasks.length} vault tasks`);
    };

    if (this.isMainWorkspaceView()) {
      const sidebarBtn = headerActions.createEl("button", { text: "Sidebar", cls: "qr-view-secondary-btn" });
      sidebarBtn.onclick = async () => {
        await this.openAsSidebar();
      };
    } else {
      const dashboardBtn = headerActions.createEl("button", { text: "Dashboard", cls: "qr-view-secondary-btn" });
      dashboardBtn.onclick = async () => {
        await this.openAsDashboard();
      };
    }

    const addBtn = headerActions.createEl("button", { text: "New", cls: "qr-view-add-btn" });
    addBtn.onclick = () => {
      this.openNewItemModal();
    };

    this.renderStats(
      container as HTMLElement,
      overdue.length,
      upcoming.length,
      activeScraped.length,
      ignoredScraped.length,
    );
    this.renderTaskToolbar(container as HTMLElement, unignoredScraped, filteredScraped.length);

    if (overdue.length > 0) {
      this.renderSection(container as HTMLElement, "Overdue", overdue, false);
    }
    this.renderSection(container as HTMLElement, "Upcoming", upcoming, false);
    this.renderScrapedSection(container as HTMLElement, "Vault tasks", activeScraped, unignoredScraped.filter((task) => !task.completed).length);
    this.renderScrapedSection(container as HTMLElement, "Completed vault tasks", completedScraped, unignoredScraped.filter((task) => task.completed).length);
    this.renderScrapedSection(container as HTMLElement, "Ignored", ignoredScraped, scopedIgnoredScraped.length, true, ignoredTaskNotes);
    this.renderSection(container as HTMLElement, "History", done, true);
  }

  private async refreshScrapedTasks(): Promise<void> {
    this.isScanningTasks = true;
    try {
      this.scrapedTasks = await this.taskScanner.scan([this.store.settings.mirrorFilePath]);
      this.hasScannedTasks = true;
    } catch (error) {
      console.error("Quick Reminder task scan failed", error);
      new Notice("Quick Reminder could not scan vault tasks.");
    } finally {
      this.isScanningTasks = false;
    }
  }

  private queueTaskRefreshForFile(file: TAbstractFile): void {
    if (this.shouldRefreshForVaultFile(file)) {
      this.queueTaskRefresh();
    }
  }

  private shouldRefreshForVaultFile(file: TAbstractFile): boolean {
    return file instanceof TFile && this.isScannedMarkdownPath(file.path);
  }

  private isScannedMarkdownPath(path: string): boolean {
    const normalizedPath = normalizePath(path);
    return normalizedPath.endsWith(".md") && normalizedPath !== normalizePath(this.store.settings.mirrorFilePath);
  }

  private queueTaskRefresh(): void {
    if (this.scanDebounceHandle !== null) {
      window.clearTimeout(this.scanDebounceHandle);
    }

    this.scanDebounceHandle = window.setTimeout(async () => {
      this.scanDebounceHandle = null;
      await this.refreshScrapedTasks();
      await this.render();
    }, 800);
  }

  private renderStats(
    parent: HTMLElement,
    overdueCount: number,
    upcomingCount: number,
    scrapedCount: number,
    ignoredCount: number,
  ): void {
    const stats = parent.createDiv({ cls: "qr-view-stats" });
    this.renderStat(stats, "Overdue", overdueCount, overdueCount > 0);
    this.renderStat(stats, "Upcoming", upcomingCount);
    this.renderStat(stats, "Visible tasks", scrapedCount);
    this.renderStat(stats, "Ignored", ignoredCount);
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
    const collapsed = this.isSectionCollapsed(title);
    this.renderSectionHead(section, title, String(items.length), collapsed);
    if (collapsed) return;

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
    const renderActions = isHistory ? this.renderHistoryReminderActions : this.renderPendingReminderActions;
    renderActions.call(this, actions, r);
    this.renderDeleteReminderAction(actions, r);
  }

  private renderPendingReminderActions(actions: HTMLElement, reminder: Reminder): void {
    actions.createEl("button", { text: "Done", cls: "qr-row-btn qr-done-btn" }).onclick = async () => {
      this.scheduler.cancel(reminder.id);
      await this.store.complete(reminder.id);
      new Notice("Marked done");
    };

    const snoozeMinutes = this.store.settings.defaultSnoozeMinutes;
    const snoozeBtn = actions.createEl("button", {
      text: `Snooze ${snoozeMinutes}m`,
      cls: "qr-row-btn",
    });
    snoozeBtn.setAttr("aria-label", `Snooze ${snoozeMinutes} minutes`);
    snoozeBtn.onclick = async () => {
      await this.store.snooze(reminder.id, snoozeMinutes);
      this.scheduler.scheduleAll();
      new Notice(`Snoozed ${snoozeMinutes}m`);
    };

    actions.createEl("button", { text: "Edit", cls: "qr-row-btn" }).onclick = () => {
      this.editingId = reminder.id;
      void this.render();
    };
  }

  private renderHistoryReminderActions(actions: HTMLElement, reminder: Reminder): void {
    actions.createEl("button", { text: "Restore", cls: "qr-row-btn" }).onclick = async () => {
      await this.store.restore(reminder.id);
      this.scheduler.scheduleAll();
      new Notice("Reminder restored");
    };

    actions.createEl("button", { text: "Re-add", cls: "qr-row-btn" }).onclick = () => {
      this.openCaptureWithText(reminder.text);
    };
  }

  private renderDeleteReminderAction(actions: HTMLElement, reminder: Reminder): void {
    const delBtn = actions.createEl("button", {
      text: "Delete",
      cls: "qr-row-btn qr-view-del",
    });
    delBtn.setAttr("aria-label", "Delete");
    delBtn.onclick = async () => {
      this.scheduler.cancel(reminder.id);
      await this.store.remove(reminder.id);
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
      void this.render();
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

  private renderTaskToolbar(
    parent: HTMLElement,
    tasks: ScrapedTask[],
    visibleCount: number,
  ): void {
    const toolbar = parent.createDiv({ cls: "qr-task-toolbar" });
    const search = toolbar.createEl("input", {
      type: "search",
      cls: "qr-task-search",
      placeholder: "Filter tasks or files",
    });
    search.value = this.taskSearch;
    search.oninput = () => {
      this.taskSearch = search.value;
      void this.persistDashboardState();
      void this.render();
    };

    const scopeSelect = toolbar.createEl("select", { cls: "qr-task-select" });
    scopeSelect.createEl("option", { text: "Current file", value: "active" });
    scopeSelect.createEl("option", { text: "Current folder", value: "folder" });
    scopeSelect.createEl("option", { text: "Whole vault", value: "vault" });
    scopeSelect.value = this.taskScope;
    scopeSelect.onchange = () => {
      this.taskScope = scopeSelect.value as TaskDashboardScope;
      this.selectedFolderPath = null;
      void this.persistDashboardState();
      void this.render(true);
    };

    const sourceSelect = toolbar.createEl("select", { cls: "qr-task-select" });
    sourceSelect.createEl("option", { text: "All sources", value: "all" });
    sourceSelect.createEl("option", { text: "Checkboxes", value: "checkbox" });
    sourceSelect.createEl("option", { text: "Markers", value: "marker" });
    sourceSelect.value = this.sourceFilter;
    sourceSelect.onchange = () => {
      this.sourceFilter = sourceSelect.value as TaskDashboardSourceFilter;
      void this.persistDashboardState();
      void this.render();
    };

    const sortSelect = toolbar.createEl("select", { cls: "qr-task-select" });
    sortSelect.createEl("option", { text: "Page order", value: "page" });
    sortSelect.createEl("option", { text: "Priority", value: "priority" });
    sortSelect.value = this.taskSort;
    sortSelect.onchange = () => {
      this.taskSort = sortSelect.value as TaskDashboardSort;
      void this.persistDashboardState();
      void this.render();
    };

    toolbar.createDiv({
      text: `${visibleCount} of ${tasks.length}`,
      cls: "qr-task-filter-count",
    });
  }

  private renderScrapedSection(
    parent: HTMLElement,
    title: string,
    tasks: ScrapedTask[],
    totalCount: number,
    isIgnored = false,
    ignoredTaskNotes: Readonly<Record<string, string>> = {},
  ): void {
    const section = parent.createDiv({ cls: "qr-view-section" });
    const collapsed = this.isSectionCollapsed(title);
    this.renderSectionHead(section, title, `${tasks.length}/${totalCount}`, collapsed);
    if (collapsed) return;

    if (tasks.length === 0) {
      section.createDiv({
        text: getEmptyScrapedText(title, totalCount),
        cls: "qr-view-empty",
      });
      return;
    }

    const visibleTasks = tasks.slice(0, 150);
    for (const note of groupTasksForDisplay(visibleTasks)) {
      section.createDiv({ text: note.filePath, cls: "qr-task-note-title" });

      for (const status of note.statuses) {
        section.createDiv({ text: status.title, cls: "qr-task-group-title" });
        for (const category of status.categories) {
          if (category.title) {
            section.createDiv({ text: category.title, cls: "qr-task-category-title" });
          }
          for (const task of category.tasks) {
            this.renderScrapedRow(section, task, isIgnored, ignoredTaskNotes[task.id] ?? "", false);
          }
        }
      }
    }

    if (tasks.length > 150) {
      section.createDiv({
        text: `${tasks.length - 150} more tasks hidden. Use filters to narrow this dashboard.`,
        cls: "qr-view-empty",
      });
    }
  }

  private renderSectionHead(parent: HTMLElement, title: string, count: string, collapsed: boolean): void {
    const head = parent.createDiv({ cls: "qr-view-section-head" });
    head.toggleClass("is-collapsed", collapsed);
    head.setAttr("role", "button");
    head.setAttr("tabindex", "0");
    head.setAttr("aria-expanded", String(!collapsed));

    const label = head.createSpan({ cls: "qr-view-section-label" });
    label.createSpan({ text: collapsed ? ">" : "v", cls: "qr-view-section-caret" });
    label.createSpan({ text: title, cls: "qr-view-section-title" });
    head.createSpan({ text: count, cls: "qr-view-section-count" });

    const toggle = () => {
      if (this.collapsedSections.has(title)) {
        this.collapsedSections.delete(title);
      } else {
        this.collapsedSections.add(title);
      }
      void this.render();
    };
    head.onclick = toggle;
    head.onkeydown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggle();
    };
  }

  private isSectionCollapsed(title: string): boolean {
    return this.collapsedSections.has(title);
  }

  private renderScrapedRow(
    parent: HTMLElement,
    task: ScrapedTask,
    isIgnored = false,
    ignoredNote = "",
    showFilePath = true,
  ): void {
    const row = parent.createDiv({ cls: "qr-view-row qr-scraped-row" });
    row.toggleClass("qr-view-row-done", task.completed);
    row.toggleClass("qr-view-row-ignored", isIgnored);
    row.toggleClass("qr-view-row-highlight", task.id === this.highlightedTaskId);
    const body = row.createDiv({ cls: "qr-view-row-body" });
    const badges = body.createDiv({ cls: "qr-task-badges" });
    badges.createSpan({ text: getTaskBadgeText(task), cls: "qr-task-badge" });
    if (isIgnored) {
      badges.createSpan({ text: "Ignored", cls: "qr-task-badge qr-task-muted-badge" });
    }
    body.createDiv({ text: task.text, cls: "qr-view-row-text" });
    const source = task.kind === "marker" && task.marker ? `${task.marker} - ` : "";
    body.createDiv({
      text: showFilePath ? `${source}${task.filePath}:${task.line}` : `${source}Line ${task.line}`,
      cls: "qr-view-row-when",
    });
    if (isIgnored && ignoredNote) {
      body.createDiv({ text: ignoredNote, cls: "qr-view-row-note" });
    }

    const actions = row.createDiv({ cls: "qr-view-row-actions" });
    actions.createEl("button", { text: "Show", cls: "qr-row-btn" }).onclick = async () => {
      await this.openTaskSource(task);
    };

    if (isIgnored) {
      this.addScrapedRowContextMenu(row, task, isIgnored);
      actions.createEl("button", { text: "Unignore", cls: "qr-row-btn" }).onclick = async () => {
        await this.store.unignoreTask(task.id);
        await this.render();
        new Notice("Task unignored");
      };
      actions.createEl("button", { text: "Delete", cls: "qr-row-btn qr-view-del" }).onclick = async () => {
        await this.deleteTask(task);
      };
      return;
    }

    if (task.kind === "checkbox") {
      if (!task.completed) {
        const progressLabel = task.status === "in-progress" ? "To do" : "In progress";
        const progressStatus = task.status === "in-progress" ? "todo" : "in-progress";
        actions.createEl("button", { text: progressLabel, cls: "qr-row-btn qr-progress-btn" }).onclick = async () => {
          await this.updateTaskStatus(task, progressStatus, `Task marked ${progressLabel.toLowerCase()}`);
        };
      }

      const doneBtn = actions.createEl("button", {
        text: task.completed ? "To do" : "Done",
        cls: "qr-row-btn qr-done-btn",
      });
      doneBtn.onclick = async () => {
        await this.updateTaskStatus(task, task.completed ? "todo" : "completed", task.completed ? "Task marked to do" : "Task marked done");
      };

      actions.createEl("button", { text: "Edit", cls: "qr-row-btn" }).onclick = async () => {
        await this.editWithTasksPlugin(task);
      };
    }

    this.addScrapedRowContextMenu(row, task, isIgnored);

    actions.createEl("button", { text: "Delete", cls: "qr-row-btn qr-view-del" }).onclick = async () => {
      await this.deleteTask(task);
    };

    if (task.completed) {
      return;
    }

    actions.createEl("button", { text: "Ignore", cls: "qr-row-btn qr-ignore-btn" }).onclick = () => {
      this.openIgnoreTaskModal(task);
    };

    if (this.hasPendingReminderForTask(task)) {
      const addedBtn = actions.createEl("button", {
        text: "Added",
        cls: "qr-row-btn",
      });
      addedBtn.disabled = true;
      addedBtn.setAttr("aria-label", "Reminder already added for this task");
      return;
    }

    const parsed = parseReminder(task.text);
    const dueAt = parsed.dueAt;
    if (!hasFutureDueAt(dueAt)) {
      const noTimeBtn = actions.createEl("button", {
        text: "No completion time set",
        cls: "qr-row-btn",
      });
      noTimeBtn.disabled = true;
      noTimeBtn.setAttr("aria-label", "Task exists, but no future reminder time was detected");
      return;
    }

    const remindBtn = actions.createEl("button", {
      text: "Add reminder",
      cls: "qr-row-btn",
    });
    remindBtn.onclick = async () => {
      const reminder: Reminder = {
        id: `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        text: parsed.text,
        rawInput: task.text,
        dueAt,
        createdAt: Date.now(),
        notified: false,
        sourceTaskId: task.id,
      };
      await this.store.add(reminder);
      this.scheduler.schedule(reminder);
      new Notice(`Reminder added from ${task.filePath}:${task.line}`);
    };
  }

  private hasPendingReminderForTask(task: ScrapedTask): boolean {
    return this.store.pending.some((reminder) => reminder.sourceTaskId === task.id);
  }

  private openIgnoreTaskModal(task: ScrapedTask): void {
    new IgnoreTaskModal(this.app, task, async (note) => {
      await this.store.ignoreTask(task.id, note);
      await this.render();
      new Notice("Task ignored");
    }).open();
  }

  private addScrapedRowContextMenu(row: HTMLElement, task: ScrapedTask, isIgnored: boolean): void {
    row.oncontextmenu = (event) => {
      event.preventDefault();
      const menu = new Menu();

      menu.addItem((item) => {
        item
          .setTitle("Show task")
          .setIcon("file-search")
          .onClick(() => {
            void this.openTaskSource(task);
          });
      });

      if (!task.completed && !this.hasPendingReminderForTask(task)) {
        menu.addItem((item) => {
          item
            .setTitle("Create reminder")
            .setIcon("calendar-plus")
            .onClick(() => {
              this.openCaptureWithText(task.text, task.id);
            });
        });
      }

      if (!isIgnored && task.kind === "checkbox") {
        menu.addItem((item) => {
          item
            .setTitle("Edit task")
            .setIcon("pencil")
            .onClick(() => {
              void this.editWithTasksPlugin(task);
            });
        });
      }

      if (isIgnored) {
        menu.addItem((item) => {
          item
            .setTitle("Unignore task")
            .setIcon("eye")
            .onClick(() => {
              void this.store.unignoreTask(task.id).then(() => this.render());
            });
        });
      } else if (!task.completed) {
        menu.addItem((item) => {
          item
            .setTitle("Ignore task")
            .setIcon("eye-off")
            .onClick(() => {
              this.openIgnoreTaskModal(task);
            });
        });
      }

      menu.addItem((item) => {
        item
          .setTitle("Delete task")
          .setIcon("trash")
          .setWarning(true)
          .onClick(() => {
            void this.deleteTask(task);
          });
      });

      menu.showAtMouseEvent(event);
    };
  }

  private openCaptureWithText(text: string, sourceTaskId: string | null = null): void {
    new QuickCaptureModal(this.app, this.store, this.scheduler, text, sourceTaskId, null, false).open();
  }

  private openNewItemModal(): void {
    new NewItemModal(
      this.app,
      () => this.openNewTaskModal(false),
      () => this.openNewTaskModal(true),
    ).open();
  }

  private openNewTaskModal(withReminder: boolean): void {
    const filePath = this.getTaskCreationFilePath();
    if (!filePath) {
      if (withReminder) {
        new QuickCaptureModal(this.app, this.store, this.scheduler).open();
      } else {
        new Notice("Select Current file or open a markdown note before creating a task.");
      }
      return;
    }
    new NewTaskModal(this.app, withReminder, async (rawInput) => {
      await this.createTaskFromInput(filePath, rawInput, withReminder);
    }).open();
  }

  private getTaskCreationFilePath(): string | null {
    if (this.taskScope === "active" && this.lastMarkdownPath) {
      return this.lastMarkdownPath;
    }
    if (this.lastMarkdownPath) {
      return this.lastMarkdownPath;
    }
    const file = this.app.workspace.getActiveFile();
    return file instanceof TFile && file.extension === "md" ? file.path : null;
  }

  private async createTaskFromInput(filePath: string, rawInput: string, withReminder: boolean): Promise<void> {
    const parsed = parseReminder(rawInput);
    const taskText = withReminder ? parsed.text : rawInput.trim();
    if (!taskText) {
      new Notice("Task needs text.");
      return;
    }
    if (withReminder && (!parsed.dueAt || parsed.dueAt <= Date.now())) {
      new Notice("Reminder needs a future time, like 'tomorrow 3pm'.");
      return;
    }

    const task = await this.taskScanner.appendTask(filePath, taskText);
    if (!task) {
      new Notice("Could not add task to the source note.");
      return;
    }

    if (withReminder && parsed.dueAt) {
      const reminder: Reminder = {
        id: genReminderId(),
        text: taskText,
        rawInput,
        dueAt: parsed.dueAt,
        createdAt: Date.now(),
        notified: false,
        sourceTaskId: task.id,
      };
      await this.store.add(reminder);
      this.scheduler.schedule(reminder);
    }

    await this.refreshScrapedTasks();
    await this.render();
    new Notice(withReminder ? "Task and reminder created" : "Task created");
  }

  private async updateTaskStatus(
    task: ScrapedTask,
    status: "todo" | "in-progress" | "completed",
    successMessage: string,
  ): Promise<void> {
    const updated = await this.taskScanner.setCheckboxStatus(task, status);
    if (!updated) {
      new Notice("Could not update task. Open the note and update it manually.");
      return;
    }
    await this.refreshScrapedTasks();
    this.flashTask(task.id);
    await this.render();
    new Notice(successMessage);
  }

  private flashTask(taskId: string): void {
    this.highlightedTaskId = taskId;
    if (this.highlightTimeoutHandle !== null) {
      window.clearTimeout(this.highlightTimeoutHandle);
    }
    this.highlightTimeoutHandle = window.setTimeout(() => {
      this.highlightedTaskId = null;
      this.highlightTimeoutHandle = null;
      void this.render();
    }, 1600);
  }

  private async openTaskSource(task: ScrapedTask): Promise<void> {
    await this.app.workspace.openLinkText(task.filePath, "", false);
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view) {
      view.editor.setCursor({ line: task.line - 1, ch: 0 });
      view.editor.focus();
      this.closeDuplicateMainFileLeaves(view.file, view.leaf, [0, 100, 300]);
    }
  }

  private closeDuplicateMainFileLeaves(file: TFile | null, keepLeaf: WorkspaceLeaf, delays = [0]): void {
    if (!file) return;
    for (const delay of delays) {
      window.setTimeout(() => {
        this.closeDuplicateMainFileLeavesNow(file, keepLeaf);
      }, delay);
    }
  }

  private closeDuplicateMainFileLeavesNow(file: TFile, keepLeaf: WorkspaceLeaf): void {
    const duplicates: WorkspaceLeaf[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf === keepLeaf) return;
      if (!this.isMainWorkspaceLeaf(leaf)) return;
      if (!(leaf.view instanceof MarkdownView)) return;
      if (leaf.view.file?.path !== file.path) return;
      duplicates.push(leaf);
    });

    for (const leaf of duplicates) {
      leaf.detach();
    }
  }

  private isMainWorkspaceLeaf(leaf: WorkspaceLeaf): boolean {
    return !leaf.view.containerEl.closest(".mod-left-split, .mod-right-split");
  }

  private async editWithTasksPlugin(task: ScrapedTask): Promise<void> {
    const api = getTasksPluginApi(this.app);
    if (!api) {
      new Notice("Tasks plugin API is not available. Reload or enable Tasks.");
      return;
    }

    const currentLine = await this.taskScanner.readTaskLine(task);
    if (!currentLine) {
      new Notice("Could not read task line.");
      return;
    }

    const nextLine = await api.editTaskLineModal(currentLine);
    if (!nextLine || nextLine === currentLine) return;

    const updated = await this.taskScanner.replaceTaskLine(task, nextLine);
    if (!updated) {
      new Notice("Could not update task line. Open the note and edit it manually.");
      return;
    }

    await this.refreshScrapedTasks();
    await this.render();
    new Notice("Task updated");
  }

  private async deleteTask(task: ScrapedTask): Promise<void> {
    const confirmed = window.confirm(`Delete this task from ${task.filePath}:${task.line}?`);
    if (!confirmed) return;

    const deleted = await this.taskScanner.deleteTaskLine(task);
    if (!deleted) {
      new Notice("Could not delete task. Open the note and update it manually.");
      return;
    }

    await this.store.unignoreTask(task.id);
    await this.refreshScrapedTasks();
    await this.render();
    new Notice("Task deleted");
  }

  private getFilteredScrapedTasks(tasks: ScrapedTask[]): ScrapedTask[] {
    const query = this.taskSearch.trim().toLowerCase();
    return tasks.filter((task) => {
      if (this.sourceFilter !== "all" && task.kind !== this.sourceFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [task.text, task.filePath, task.category, task.project, task.status, task.marker ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }

  private sortScrapedTasks(tasks: ScrapedTask[]): ScrapedTask[] {
    return [...tasks].sort((a, b) => {
      if (this.taskSort === "priority") {
        const priorityDiff = getTaskPriorityRank(a.text) - getTaskPriorityRank(b.text);
        if (priorityDiff !== 0) return priorityDiff;
      }
      return compareTaskPageOrder(a, b);
    });
  }

  showFolder(folderPath: string): void {
    this.taskScope = "folder";
    this.selectedFolderPath = folderPath;
    this.lastFolderPath = folderPath;
    void this.persistDashboardState();
    void this.render(true);
  }

  showActiveFile(filePath: string, folderPath: string): void {
    this.taskScope = "active";
    this.selectedFolderPath = null;
    this.lastMarkdownPath = filePath;
    this.lastFolderPath = folderPath;
    void this.persistDashboardState();
    void this.render(true);
  }

  setScope(scope: TaskDashboardScope): void {
    this.taskScope = scope;
    if (scope !== "folder") {
      this.selectedFolderPath = null;
    }
    void this.persistDashboardState();
    void this.render();
  }

  private getScopedScrapedTasks(activeFilePath: string | null, folderPath: string | null): ScrapedTask[] {
    if (this.taskScope === "vault") {
      return this.scrapedTasks;
    }
    if (this.taskScope === "folder") {
      if (folderPath === null) {
        return [];
      }
      return this.scrapedTasks.filter((task) => isInFolder(task.filePath, folderPath));
    }
    if (!activeFilePath) {
      return [];
    }
    return this.scrapedTasks.filter((task) => task.filePath === activeFilePath);
  }

  private getScopedFolderPath(): string | null {
    if (this.taskScope !== "folder") {
      return null;
    }
    if (this.selectedFolderPath !== null) {
      return this.selectedFolderPath;
    }
    return this.lastFolderPath;
  }

  private captureActiveMarkdownContext(): void {
    const file = this.app.workspace.getActiveFile();
    if (file?.extension === "md") {
      this.lastMarkdownPath = file.path;
      this.lastFolderPath = file.parent?.path ?? "";
    }
  }

  private async openAsDashboard(): Promise<void> {
    const file = this.getDashboardSourceFile();
    if (!file) {
      await this.openVaultDashboard();
      return;
    }

    const noteLeaf = this.getMainMarkdownLeafForFile(file.path) ?? this.getPreferredMainLeaf();
    if (!noteLeaf) {
      new Notice("Quick Reminder could not find a note pane.");
      return;
    }

    await noteLeaf.setViewState({ type: VIEW_TYPE_REMINDER, active: true });
    await noteLeaf.loadIfDeferred();
    this.app.workspace.setActiveLeaf(noteLeaf, { focus: true });
    const noteTab = this.app.workspace.getLeaf("tab");
    await noteTab.openFile(file, { active: false });

    const managerLeaf = noteLeaf;
    await managerLeaf.setViewState({ type: VIEW_TYPE_REMINDER, active: true });
    await managerLeaf.loadIfDeferred();
    if (managerLeaf.view instanceof ReminderView) {
      managerLeaf.view.showActiveFile(file.path, file.parent?.path ?? "");
    }
    this.app.workspace.rightSplit.collapse();
    await this.app.workspace.revealLeaf(managerLeaf);
    this.app.workspace.setActiveLeaf(managerLeaf, { focus: true });
    this.closeMainManagerLeaves(managerLeaf);
  }

  private async openVaultDashboard(): Promise<void> {
    const leaf = this.getExistingMainLeaf() ?? this.app.workspace.getLeaf("split", "vertical");
    const state = {
      ...this.getViewState(),
      taskScope: "vault" as TaskDashboardScope,
      selectedFolderPath: null,
    };
    if (leaf.view.getViewType() !== VIEW_TYPE_REMINDER) {
      await leaf.setViewState({ type: VIEW_TYPE_REMINDER, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    this.app.workspace.rightSplit.collapse();
    if (leaf.view instanceof ReminderView) {
      leaf.view.applyViewState(state);
      void leaf.view.render(true);
    }
    this.closeMainManagerLeaves(leaf);
  }

  private getDashboardSourceFile(): TFile | null {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (activeLeaf && this.getMainMarkdownLeaf(activeLeaf)) {
      const file = activeLeaf.view instanceof MarkdownView ? activeLeaf.view.file : null;
      if (file instanceof TFile && file.extension === "md") {
        return file;
      }
    }

    if (this.lastMarkdownPath) {
      const file = this.app.vault.getAbstractFileByPath(this.lastMarkdownPath);
      if (file instanceof TFile && file.extension === "md") {
        return file;
      }
    }

    const file = this.app.workspace.getActiveFile();
    return file instanceof TFile && file.extension === "md" ? file : null;
  }

  private async openAsSidebar(): Promise<void> {
    const state = this.getViewState();

    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_REMINDER)) {
      if (leaf.view.containerEl.closest(".mod-right-split")) {
        leaf.detach();
      }
    }

    const leaf = await this.openSidebarLeaf();
    if (!leaf) {
      new Notice("Quick Reminder could not open the right sidebar.");
      return;
    }
    this.app.workspace.rightSplit.expand();
    await this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof ReminderView) {
      leaf.view.applyViewState(state);
      void leaf.view.render(true);
    }
    this.closeOtherManagerLeaves(leaf);
  }

  private getViewState(): ReminderViewState {
    return {
      taskScope: this.taskScope,
      selectedFolderPath: this.selectedFolderPath,
      lastMarkdownPath: this.lastMarkdownPath,
      lastFolderPath: this.lastFolderPath,
      sourceFilter: this.sourceFilter,
      taskSort: this.taskSort,
      taskSearch: this.taskSearch,
    };
  }

  private applyViewState(state: ReminderViewState): void {
    this.taskScope = state.taskScope;
    this.selectedFolderPath = state.selectedFolderPath;
    this.lastMarkdownPath = state.lastMarkdownPath;
    this.lastFolderPath = state.lastFolderPath;
    this.sourceFilter = state.sourceFilter;
    this.taskSort = state.taskSort ?? "page";
    this.taskSearch = state.taskSearch;
    void this.persistDashboardState();
  }

  private applyDashboardState(state: TaskDashboardState): void {
    this.taskScope = state.scope ?? "vault";
    this.selectedFolderPath = state.selectedFolderPath ?? null;
    this.lastMarkdownPath = state.lastMarkdownPath ?? null;
    this.lastFolderPath = state.lastFolderPath ?? null;
    this.sourceFilter = state.sourceFilter ?? "all";
    this.taskSort = state.sort ?? "page";
    this.taskSearch = state.search ?? "";
  }

  private ensureUsableDefaultScope(): void {
    if (this.taskScope === "active" && !this.lastMarkdownPath) {
      this.taskScope = "vault";
    }
    if (this.taskScope === "folder" && this.getScopedFolderPath() === null) {
      this.taskScope = "vault";
    }
  }

  private async persistDashboardState(): Promise<void> {
    await this.store.updateSettings({
      taskDashboardState: {
        scope: this.taskScope,
        selectedFolderPath: this.selectedFolderPath,
        lastMarkdownPath: this.lastMarkdownPath,
        lastFolderPath: this.lastFolderPath,
        sourceFilter: this.sourceFilter,
        sort: this.taskSort,
        search: this.taskSearch,
      },
    });
  }

  private getExistingMainLeaf(): WorkspaceLeaf | null {
    return this.app.workspace
      .getLeavesOfType(VIEW_TYPE_REMINDER)
      .find((leaf) => !leaf.view.containerEl.closest(".mod-left-split, .mod-right-split")) ?? null;
  }

  private getPreferredMainLeaf(): WorkspaceLeaf | null {
    const activeLeaf = this.getMainMarkdownLeaf(this.app.workspace.activeLeaf);
    if (activeLeaf) {
      return activeLeaf;
    }
    const recentLeaf = this.getMainMarkdownLeaf(this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit));
    if (recentLeaf) {
      return recentLeaf;
    }
    return this.getAnyMainLeaf();
  }

  private getMainMarkdownLeaf(leaf: WorkspaceLeaf | null): WorkspaceLeaf | null {
    if (!leaf) return null;
    if (leaf.view.containerEl.closest(".mod-left-split, .mod-right-split")) return null;
    return leaf.view instanceof MarkdownView ? leaf : null;
  }

  private getMainMarkdownLeafForFile(filePath: string): WorkspaceLeaf | null {
    let result: WorkspaceLeaf | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (result) return;
      if (!this.getMainMarkdownLeaf(leaf)) return;
      if (leaf.view instanceof MarkdownView && leaf.view.file?.path === filePath) {
        result = leaf;
      }
    });
    return result;
  }

  private getAnyMainLeaf(): WorkspaceLeaf | null {
    let result: WorkspaceLeaf | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (result) return;
      if (!leaf.view.containerEl.closest(".mod-left-split, .mod-right-split")) {
        result = leaf;
      }
    });
    return result;
  }

  private getExistingSidebarLeaf(): WorkspaceLeaf | null {
    return this.app.workspace
      .getLeavesOfType(VIEW_TYPE_REMINDER)
      .find((leaf) => leaf.view.containerEl.closest(".mod-right-split")) ?? null;
  }

  private closeMainManagerLeaves(keepLeaf: WorkspaceLeaf): void {
    window.setTimeout(() => {
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_REMINDER)) {
        if (leaf === keepLeaf) continue;
        if (leaf.view.containerEl.closest(".mod-right-split")) continue;
        leaf.detach();
      }
    }, 0);
  }

  private closeOtherManagerLeaves(keepLeaf: WorkspaceLeaf): void {
    window.setTimeout(() => {
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_REMINDER)) {
        if (leaf !== keepLeaf) {
          leaf.detach();
        }
      }
    }, 0);
  }

  private async openSidebarLeaf(): Promise<WorkspaceLeaf | null> {
    this.app.workspace.rightSplit.expand();

    const leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getRightLeaf(true);
    if (!leaf) return null;
    await leaf.setViewState({ type: VIEW_TYPE_REMINDER, active: true });
    await leaf.loadIfDeferred();
    return leaf;
  }

  private isMainWorkspaceView(): boolean {
    return !this.containerEl.closest(".mod-left-split, .mod-right-split");
  }
}

interface TasksPluginApi {
  editTaskLineModal(line: string): Promise<string>;
}

class IgnoreTaskModal extends Modal {
  private noteEl!: HTMLTextAreaElement;

  constructor(
    app: App,
    private task: ScrapedTask,
    private onSubmit: (note: string) => void | Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("qr-modal");

    const header = contentEl.createDiv({ cls: "qr-modal-header" });
    header.createEl("h2", { text: "Ignore task" });

    contentEl.createDiv({ text: this.task.text, cls: "qr-ignore-task-text" });

    const field = contentEl.createDiv({ cls: "qr-field" });
    field.createEl("label", {
      text: "Note",
      cls: "qr-field-label",
      attr: { for: "qr-ignore-note" },
    });
    this.noteEl = field.createEl("textarea", {
      attr: { id: "qr-ignore-note" },
      cls: "qr-ignore-note-input",
    });
    this.noteEl.rows = 4;
    this.noteEl.placeholder = "Optional reason";

    const actions = contentEl.createDiv({ cls: "qr-modal-actions" });
    actions.createEl("button", { text: "Cancel", cls: "qr-secondary-btn" }).onclick = () => {
      this.close();
    };
    actions.createEl("button", { text: "Ignore", cls: "qr-primary-btn" }).onclick = () => {
      void this.submit();
    };

    window.setTimeout(() => this.noteEl.focus(), 0);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async submit(): Promise<void> {
    const note = this.noteEl.value.trim();
    await this.onSubmit(note);
    this.close();
  }
}

class NewItemModal extends Modal {
  constructor(
    app: App,
    private onTask: () => void,
    private onReminder: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("qr-modal");
    this.contentEl.createEl("h2", { text: "New" });
    const actions = this.contentEl.createDiv({ cls: "qr-choice-actions" });
    actions.createEl("button", { text: "Task", cls: "qr-primary-btn" }).onclick = () => {
      this.close();
      this.onTask();
    };
    actions.createEl("button", { text: "Reminder", cls: "qr-secondary-btn" }).onclick = () => {
      this.close();
      this.onReminder();
    };
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class NewTaskModal extends Modal {
  private inputEl!: HTMLInputElement;

  constructor(
    app: App,
    private withReminder: boolean,
    private onSubmit: (rawInput: string) => void | Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("qr-modal");
    this.contentEl.createEl("h2", { text: this.withReminder ? "New reminder task" : "New task" });

    const field = this.contentEl.createDiv({ cls: "qr-field" });
    field.createEl("label", {
      text: this.withReminder ? "Task and time" : "Task",
      cls: "qr-field-label",
    });
    this.inputEl = field.createEl("input", {
      type: "text",
      cls: "qr-input",
      placeholder: this.withReminder ? "e.g. call Alex tomorrow 3pm" : "e.g. follow up with Alex",
    });
    this.inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void this.submit();
      }
    });

    const actions = this.contentEl.createDiv({ cls: "qr-modal-actions" });
    actions.createEl("button", { text: "Cancel", cls: "qr-secondary-btn" }).onclick = () => this.close();
    actions.createEl("button", {
      text: this.withReminder ? "Create task + reminder" : "Create task",
      cls: "qr-primary-btn",
    }).onclick = () => {
      void this.submit();
    };
    window.setTimeout(() => this.inputEl.focus(), 0);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async submit(): Promise<void> {
    const value = this.inputEl.value.trim();
    if (!value) {
      new Notice("Enter a task.");
      return;
    }
    await this.onSubmit(value);
    this.close();
  }
}

function getTasksPluginApi(app: unknown): TasksPluginApi | null {
  const tasksPlugin = (app as {
    plugins?: { plugins?: Record<string, unknown> };
  }).plugins?.plugins?.["obsidian-tasks-plugin"] as { apiV1?: unknown } | undefined;
  const api = tasksPlugin?.apiV1 as Partial<TasksPluginApi> | undefined;
  return typeof api?.editTaskLineModal === "function" ? (api as TasksPluginApi) : null;
}

function getSummaryText(
  overdueCount: number,
  upcomingCount: number,
  scrapedCount: number,
  taskScope: TaskDashboardScope,
  activeFilePath: string | null,
  folderPath: string | null,
): string {
  const taskLabel = getTaskScopeLabel(taskScope, activeFilePath, folderPath);
  if (overdueCount > 0) {
    return `${overdueCount} overdue - ${upcomingCount} upcoming - ${scrapedCount} ${taskLabel}`;
  }
  if (upcomingCount > 0) {
    return `${upcomingCount} upcoming - ${scrapedCount} ${taskLabel}`;
  }
  if (scrapedCount > 0) {
    return `${scrapedCount} ${taskLabel}`;
  }
  if (taskScope === "active" && !activeFilePath) {
    return "No active markdown file";
  }
  if (taskScope === "folder" && folderPath === null) {
    return "No active folder";
  }
  return "Nothing pending";
}

function getTaskScopeLabel(
  taskScope: TaskDashboardScope,
  activeFilePath: string | null,
  folderPath: string | null,
): string {
  if (taskScope === "folder" && folderPath !== null) {
    return "folder tasks";
  }
  if (taskScope === "active" && activeFilePath) {
    return "current file tasks";
  }
  return "vault tasks";
}

function isInFolder(filePath: string, folderPath: string): boolean {
  if (folderPath === "" || folderPath === "/" || folderPath === ".") {
    return !filePath.includes("/");
  }
  const normalizedFolder = folderPath.replace(/^\/+|\/+$/g, "");
  if (!normalizedFolder) {
    return !filePath.includes("/");
  }
  return filePath === normalizedFolder || filePath.startsWith(`${normalizedFolder}/`);
}

type TaskDisplayNoteGroup = {
  filePath: string;
  statuses: Array<{
    title: string;
    categories: Array<{
      title: string;
      tasks: ScrapedTask[];
    }>;
  }>;
};

function groupTasksForDisplay(tasks: ScrapedTask[]): TaskDisplayNoteGroup[] {
  const statusOrder: Array<ScrapedTask["status"]> = ["in-progress", "todo", "marker", "completed"];
  const notes: TaskDisplayNoteGroup[] = [];

  for (const task of tasks) {
    let note = notes.find((candidate) => candidate.filePath === task.filePath);
    if (!note) {
      note = { filePath: task.filePath, statuses: [] };
      notes.push(note);
    }

    const statusTitle = getTaskStatusTitle(task.status);
    let status = note.statuses.find((candidate) => candidate.title === statusTitle);
    if (!status) {
      status = { title: statusTitle, categories: [] };
      note.statuses.push(status);
    }

    const categoryTitle = getTaskCategoryTitle(task, statusTitle);
    let category = status.categories.find((candidate) => candidate.title === categoryTitle);
    if (!category) {
      category = { title: categoryTitle, tasks: [] };
      status.categories.push(category);
    }
    category.tasks.push(task);
  }

  for (const note of notes) {
    note.statuses.sort((a, b) => statusOrder.indexOf(getStatusFromTitle(a.title)) - statusOrder.indexOf(getStatusFromTitle(b.title)));
  }

  return notes;
}

function getTaskStatusTitle(status: ScrapedTask["status"]): string {
  if (status === "in-progress") {
    return "In Progress";
  }
  if (status === "completed") {
    return "Completed";
  }
  if (status === "marker") {
    return "Markers";
  }
  return "To Do";
}

function getTaskCategoryTitle(task: ScrapedTask, statusTitle: string): string {
  const category = task.category?.trim() || "Uncategorized";
  return category.toLowerCase() === statusTitle.toLowerCase() ? "" : category;
}

function getStatusFromTitle(title: string): ScrapedTask["status"] {
  if (title === "In Progress") {
    return "in-progress";
  }
  if (title === "Completed") {
    return "completed";
  }
  if (title === "Markers") {
    return "marker";
  }
  return "todo";
}

function compareTaskPageOrder(a: ScrapedTask, b: ScrapedTask): number {
  return a.filePath.localeCompare(b.filePath) || a.line - b.line;
}

function getTaskPriorityRank(text: string): number {
  const normalized = text.toLowerCase();
  if (hasPriorityEmoji(text, "\u{1F53A}") || hasInlinePriority(normalized, "(?:highest|urgent|critical)") || /\b(?:priority|prio)\s*[:=]\s*(?:highest|urgent|critical)\b/.test(normalized) || /#(?:priority|prio)\/(?:highest|urgent|critical)\b/.test(normalized) || /\bp0\b/.test(normalized) || /!!!/.test(text)) {
    return 0;
  }
  if (hasPriorityEmoji(text, "\u{23EB}") || hasInlinePriority(normalized, "high") || /\b(?:priority|prio)\s*[:=]\s*high\b/.test(normalized) || /#(?:priority|prio)\/high\b/.test(normalized) || /\bp1\b/.test(normalized) || /!!/.test(text)) {
    return 1;
  }
  if (hasPriorityEmoji(text, "\u{1F53C}") || hasInlinePriority(normalized, "medium") || /\b(?:priority|prio)\s*[:=]\s*medium\b/.test(normalized) || /#(?:priority|prio)\/medium\b/.test(normalized) || /\bp2\b/.test(normalized)) {
    return 2;
  }
  if (hasPriorityEmoji(text, "\u{1F53D}") || hasInlinePriority(normalized, "low") || /\b(?:priority|prio)\s*[:=]\s*low\b/.test(normalized) || /#(?:priority|prio)\/low\b/.test(normalized) || /\bp3\b/.test(normalized)) {
    return 3;
  }
  if (hasPriorityEmoji(text, "\u{23EC}") || hasInlinePriority(normalized, "lowest") || /\b(?:priority|prio)\s*[:=]\s*lowest\b/.test(normalized) || /#(?:priority|prio)\/lowest\b/.test(normalized) || /\bp4\b/.test(normalized)) {
    return 4;
  }
  return 5;
}

function hasInlinePriority(normalizedText: string, valuePattern: string): boolean {
  return new RegExp(`\\[\\s*(?:priority|prio)::\\s*${valuePattern}\\s*\\]`).test(normalizedText);
}

function hasPriorityEmoji(text: string, emoji: string): boolean {
  return text.includes(emoji);
}

function getEmptyScrapedText(title: string, totalCount: number): string {
  if (totalCount > 0) {
    return "No tasks match the current filters.";
  }
  if (title === "Completed vault tasks") {
    return "No completed vault tasks found.";
  }
  if (title === "Ignored") {
    return "No ignored tasks.";
  }
  return "No unchecked tasks or TODO markers found.";
}

function getTaskBadgeText(task: ScrapedTask): string {
  return task.kind === "checkbox" ? "Task" : task.marker ?? "Marker";
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
  if (diff < 0) return `overdue - ${exact}`;
  if (mins < 60) return `in ${mins}m - ${exact}`;
  if (hours < 24) return `in ${hours}h - ${exact}`;
  return `in ${days}d - ${exact}`;
}

function formatHistoryWhen(reminder: Reminder): string {
  const completedAt = reminder.completedAt ?? reminder.dueAt;
  return `${formatAgo(completedAt)} done - due ${formatExact(reminder.dueAt)}`;
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

function hasFutureDueAt(dueAt: number | null): dueAt is number {
  return dueAt !== null && dueAt > Date.now();
}

function genReminderId(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
