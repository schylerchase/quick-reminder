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
  setIcon,
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
import { saveScheduledReminder } from "./reminderTransaction";
import { QuickCaptureModal } from "./modal";
import { ProjectPlannerModal } from "./projectPlannerModal";
import { parseReminder } from "./parser";
import { TaskScanner } from "./taskScanner";
import {
  addTaskUnderHeading,
  appendHeading,
  renameHeadingInContent,
} from "./lib/managedTasksOps";
import { getPhaseEditAction } from "./lib/phase-actions";
import {
  getDashboardOpenFailedNotice,
  getDashboardScanSuccessNotice,
  getDashboardRefreshFailedNotice,
  getDashboardScanFailedNotice,
  getDashboardScanRefreshFailedNotice,
  getScopedEmptyTaskAction,
  shouldShowFirstRunActions,
  type ScopedEmptyTaskAction,
} from "./lib/dashboardState";
import { runDashboardOpenWorkflow } from "./lib/dashboardOpenWorkflow";
import { runDashboardScanWorkflow } from "./lib/dashboardScanWorkflow";
import { renderReminderEditRow } from "./lib/reminderEditRow";
import { getStarterBoardOpenFailedNotice } from "./lib/starterBoardMessages";
import { runStarterBoardEntryAction } from "./lib/starterBoardWorkflow";
import { filterTasksByQuery, getTaskSearchText } from "./lib/task-search";
import { runInlineAddWorkflow } from "./lib/inlineAddWorkflow";
import {
  getTaskDeleteFailedNotice,
  getTaskDeleteRefreshFailedNotice,
} from "./lib/taskDeleteMessages";
import { runTaskDeleteWorkflow } from "./lib/taskDeleteWorkflow";
import {
  getTaskAddedNotice,
  getTaskAndNotesUpdatedNotice,
  getTaskCategoryAddedNotice,
  getTaskCategoryRenamedNotice,
  getTaskDeletedNotice,
  getTaskIgnoreFailedNotice,
  getTaskIgnoreRefreshFailedNotice,
  getTaskIgnoredNotice,
  getTaskInlineAddCategoryFailedNotice,
  getTaskInlineAddFailedNotice,
  getTaskAppendFailedNotice,
  getTaskCreateReminderTimeMissingNotice,
  getTaskCreateRefreshFailedNotice,
  getTaskCreateStatusFailedNotice,
  getTaskCreateStatusRefreshFailedNotice,
  getTaskCreateTextMissingNotice,
  getTaskContextRefreshFailedNotice,
  getTaskHeadingRenameFailedNotice,
  getTaskHeadingRenameRefreshFailedNotice,
  getTaskLineEditFailedNotice,
  getTaskLineReadFailedNotice,
  getTasksPluginUnavailableNotice,
  getTaskLineUpdateFailedNotice,
  getTaskLineUpdateRefreshFailedNotice,
  getTaskNotesSavedNotice,
  getTaskNotesUpdateFailedNotice,
  getTaskSourcePathMissingNotice,
  getTaskSourceMissingNotice,
  getTaskSourceOpenFailedNotice,
  getTaskSourcePaneMissingNotice,
  getTaskReminderCreateFailedNotice,
  getTaskStatusChangedNotesFailedNotice,
  getTaskStatusChangedRefreshFailedNotice,
  getTaskStatusUpdateFailedNotice,
  getTaskTargetCreateFailedNotice,
  getTaskTargetUnavailableNotice,
  getTaskTextUpdateRefreshFailedNotice,
  getTaskUpdatedNotice,
  getTaskUnignoreFailedNotice,
  getTaskUnignoreRefreshFailedNotice,
  getTaskUnignoredNotice,
} from "./lib/taskEditMessages";
import { runTaskIgnoreWorkflow } from "./lib/taskIgnoreWorkflow";
import { runTaskSourceOpenWorkflow } from "./lib/taskSourceWorkflow";
import { runTaskContextNoteWorkflow } from "./lib/taskContextNoteWorkflow";
import {
  runTaskStatusUpdateWorkflow,
  writeTaskStatusChange,
} from "./lib/taskStatusWrite";
import { runTaskHeadingRenameWorkflow } from "./lib/taskHeadingRenameWorkflow";
import { runTaskLineEditWorkflow } from "./lib/taskLineEditWorkflow";
import { runTaskTextEditWorkflow } from "./lib/taskTextEditWorkflow";
import { getTaskReminderActionState } from "./lib/taskReminderAction";
import {
  runExistingTaskReminderWorkflow,
  saveTaskBackedReminder,
} from "./lib/taskReminderWorkflow";
import { runReminderActionWorkflow } from "./lib/reminderActionWorkflow";
import {
  getReminderActionFailedNotice,
  getReminderActionRefreshFailedNotice,
  getReminderEditInvalidNotice,
  getReminderPastTimeNotice,
  getReminderSaveFailedNotice,
  getTaskReminderCreatedNotice,
  getTaskReminderDuplicateNotice,
  getTaskReminderRefreshFailedNotice,
} from "./lib/reminderMessages";
import {
  DEFAULT_CATEGORY_FILE_PATH,
  getCategoryInputInitialPath,
} from "./lib/taskTarget";
import {
  ProjectPlan,
  validateProjectPlan,
} from "./lib/projectPlanner";
import {
  getProjectCreateFailedNotice,
  getProjectCreateRefreshFailedNotice,
  getProjectCreatedNotice,
  getProjectTargetExistsNotice,
} from "./lib/projectPlannerMessages";
import { runProjectNoteCreateWorkflow } from "./lib/projectPlannerWorkflow";
import {
  getModalSubmitButtonPresentation,
  runSingleModalSubmit,
  shouldCloseAfterSubmit,
  type ModalSubmitResult,
} from "./lib/modalSubmit";
import {
  getSingleActionButtonState,
  runKeyedSingleOpen,
  runSingleAction,
} from "./lib/singleAction";
import {
  openMainViewLeaf,
  openSidebarViewLeaf,
  findOrReuseMainPaneLeaf,
  isMainPaneLeaf,
  isSidebarLeaf,
  isRightSidebarLeaf,
  isSidebarContainer,
  expandRightSidebar,
  collapseRightSidebar,
} from "./workspace";
import {
  PHASE_PAGE_SIZE,
  compareTaskPageOrder,
  formatHistoryWhen,
  formatWhen,
  genReminderId,
  getCurrentFolderScopePath,
  getDashboardSectionClassNames,
  getEmptyScrapedText,
  getEmptyText,
  getPathBasename,
  getPhaseAccentHue,
  getSummaryText,
  getTaskContextSummaryText,
  getTaskKindBadgeText,
  getTaskPriorityRank,
  getTaskSourceLineLabel,
  getTaskStatusClassName,
  getTaskStatusTitle,
  getTasksPluginApi,
  groupTasksByPhase,
  hasFutureDueAt,
  isInFolder,
  normalizeContextNoteLines,
  shouldUseNativeTaskEditingSurface,
  shouldUseMobileTaskViewport,
  splitTaskInput,
  type TaskPhaseGroup,
} from "./lib/viewHelpers";
import { IgnoreTaskModal } from "./modals/IgnoreTaskModal";
import { DeleteTaskModal } from "./modals/DeleteTaskModal";
import { TaskContextNoteModal } from "./modals/TaskContextNoteModal";
import { NewItemModal } from "./modals/NewItemModal";
import { NewTaskModal } from "./modals/NewTaskModal";

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
  private collapsedPhases = new Set<string>();
  private expandedTaskCards = new Set<string>();
  private phasePageLimits = new Map<string, number>();
  private phaseSearchQueries = new Map<string, string>();
  private activePhaseSearchKey: string | null = null;
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
  /**
   * Paths accumulated across one debounce window for incremental refresh
   * (F06). `pendingRescanPaths` are re-read via taskScanner.scanFile and
   * spliced into the cached task list; `pendingRemovePaths` are deleted files
   * whose tasks are dropped without a (dead-file) read. Cleared on each fire.
   */
  private pendingRescanPaths = new Set<string>();
  private pendingRemovePaths = new Set<string>();
  /** Per-path in-flight organize promise so callers can await completion. */
  private organizingPromises = new Map<string, Promise<void>>();
  /**
   * Counts pending self-modify events per path. TaskScanner notifies the
   * plugin BEFORE each vault.process; the plugin forwards here. The next
   * modify event for that path decrements and is skipped — replacing the
   * fragile 800ms time-window suppression that could swallow real user edits.
   */
  private expectedSelfModifies: Map<string, number> = new Map();
  private unsubscribeSelfModify: (() => void) | null = null;
  private highlightedTaskId: string | null = null;
  private highlightTimeoutHandle: number | null = null;
  private openTaskModalKeys = new Set<string>();
  private openEntryModalKeys = new Set<string>();

  constructor(
    leaf: WorkspaceLeaf,
    private store: ReminderStore,
    private scheduler: Scheduler,
    private taskScanner: TaskScanner,
    /**
     * Subscribe to TaskScanner self-modify notifications. Returns an
     * unsubscribe function. Defaults to a no-op so callers/tests that
     * don't need the suppression behavior still construct cleanly.
     */
    private subscribeToSelfModifies: (
      fn: (path: string) => void,
    ) => () => void = () => () => {},
    /**
     * Apply a pure transform to a file's content via vault.process while
     * suppressing the self-modify event. Plugin supplies this; view uses it
     * for managed-block source rewrites.
     */
    private applyManagedBlockTransform: (
      file: TFile,
      transform: (content: string) => string,
    ) => Promise<void> = async () => {},
    private openStarterBoard: () => Promise<boolean | void> = async () => true,
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
    this.unsubscribeSelfModify = this.subscribeToSelfModifies((path) => {
      this.expectedSelfModifies.set(
        path,
        (this.expectedSelfModifies.get(path) ?? 0) + 1,
      );
    });
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
    this.registerEvent(this.app.vault.on("delete", (file) => this.queueTaskRemoveForFile(file)));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        const newScanned = this.shouldRefreshForVaultFile(file);
        const oldScanned = this.isScannedMarkdownPath(oldPath);
        if (!newScanned && !oldScanned) return;
        // Drop the old path's cached tasks; re-scan the new path so its tasks
        // re-appear under the renamed file (mirrors a full scan of both).
        // Keys are the raw file.path strings, matching ScrapedTask.filePath
        // exactly (taskScanner stores filePath: file.path, unnormalized).
        if (oldScanned) this.markPathForRemove(oldPath);
        if (newScanned) this.markPathForRescan((file as TFile).path);
        this.queueTaskRefresh();
      }),
    );
    await this.render(true);
  }

  async onClose(): Promise<void> {
    this.store.offChange(this.refreshHandler);
    this.unsubscribeSelfModify?.();
    this.unsubscribeSelfModify = null;
    this.expectedSelfModifies.clear();
    this.pendingRescanPaths.clear();
    this.pendingRemovePaths.clear();
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
    if (this.dashboardStateDebounceHandle !== null) {
      window.clearTimeout(this.dashboardStateDebounceHandle);
      this.dashboardStateDebounceHandle = null;
    }
  }

  private async render(scanVaultTasks = false): Promise<void> {
    if ((scanVaultTasks || !this.hasScannedTasks) && !this.isScanningTasks) {
      await this.refreshScrapedTasks();
    }

    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("qr-view");
    const isMainWorkspaceView = this.isMainWorkspaceView();
    container.toggleClass("qr-view-dashboard", isMainWorkspaceView);
    container.toggleClass("qr-view-sidebar", !isMainWorkspaceView);
    container.toggleClass("qr-mobile-compact-tasks", this.shouldUseMobileTaskLayout());

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
    container.toggleClass("qr-view-has-active-tasks", activeScraped.length > 0);
    const completedScraped = this.sortScrapedTasks(filteredScraped.filter((task) => task.completed));
    const vaultActiveTaskCount = this.getFilteredScrapedTasks(
      this.scrapedTasks.filter((task) => !ignoredTaskIds.has(task.id)),
    ).filter((task) => !task.completed).length;
    const scopedEmptyTaskAction = getScopedEmptyTaskAction({
      scope: this.taskScope,
      scopedActiveTaskCount: activeScraped.length,
      vaultActiveTaskCount,
      search: this.taskSearch,
      sourceFilter: this.sourceFilter,
    });
    const scopedIgnoredScraped = scraped.filter((task) => ignoredTaskIds.has(task.id));
    const ignoredScraped = this.sortScrapedTasks(this.getFilteredScrapedTasks(scopedIgnoredScraped));

    const header = container.createDiv({ cls: "qr-view-header" });
    const title = header.createDiv({ cls: "qr-view-title" });
    title.createEl("h3", { text: "Today" });
    title.createDiv({
      text: getSummaryText(overdue.length, upcoming.length, activeScraped.length, this.taskScope, activeFilePath, folderPath),
      cls: "qr-view-summary",
    });

    const headerActions = header.createDiv({ cls: "qr-view-header-actions" });
    const scanBtn = headerActions.createEl("button", { text: "Scan", cls: "qr-view-secondary-btn" });
    this.wireHeaderActionButton(scanBtn, {
      busyText: "Scanning...",
      action: () => this.scanDashboardTasks(),
    });

    if (isMainWorkspaceView) {
      const sidebarBtn = headerActions.createEl("button", { text: "Sidebar", cls: "qr-view-secondary-btn" });
      this.wireHeaderActionButton(sidebarBtn, {
        busyText: "Opening...",
        action: () => this.openAsSidebar(),
      });
    } else {
      const dashboardBtn = headerActions.createEl("button", { text: "Dashboard", cls: "qr-view-secondary-btn" });
      this.wireHeaderActionButton(dashboardBtn, {
        busyText: "Opening...",
        action: () => this.openAsDashboard(),
      });
    }

    const addBtn = headerActions.createEl("button", { text: "New", cls: "qr-view-add-btn" });
    addBtn.onclick = () => {
      this.openNewItemModal();
    };

    const shouldShowFirstRunPanel = shouldShowFirstRunActions({
      pendingCount: pending.length,
      activeTaskCount: activeScraped.length,
      completedTaskCount: completedScraped.length,
      ignoredTaskCount: ignoredScraped.length,
      search: this.taskSearch,
      sourceFilter: this.sourceFilter,
    });

    const currentFileActiveTasks = activeFilePath
      ? this.scrapedTasks.filter((task) =>
        task.filePath === activeFilePath &&
        !task.completed &&
        !ignoredTaskIds.has(task.id),
      )
      : [];
    this.renderDailyConsole(
      container as HTMLElement,
      activeFilePath,
      folderPath,
      currentFileActiveTasks,
      activeScraped,
      overdue.length,
      upcoming.length,
    );

    if (shouldShowFirstRunPanel) {
      this.renderFirstRunActions(container as HTMLElement);
    }

    if (overdue.length > 0) {
      this.renderSection(container as HTMLElement, "Overdue", overdue, false);
    }
    this.renderScrapedSection(container as HTMLElement, "Now / Next", activeScraped, unignoredScraped.filter((task) => !task.completed).length, false, {}, scopedEmptyTaskAction);
    this.renderTaskToolbar(container as HTMLElement, unignoredScraped, filteredScraped.length);
    this.renderStats(
      container as HTMLElement,
      overdue.length,
      upcoming.length,
      activeScraped.length,
      ignoredScraped.length,
    );
    this.renderSection(container as HTMLElement, "Upcoming", upcoming, false);
    this.renderScrapedSection(container as HTMLElement, "Completed vault tasks", completedScraped, unignoredScraped.filter((task) => task.completed).length);
    this.renderScrapedSection(container as HTMLElement, "Ignored", ignoredScraped, scopedIgnoredScraped.length, true, ignoredTaskNotes);
    this.renderSection(container as HTMLElement, "History", done, true);
  }

  private renderDailyConsole(
    parent: HTMLElement,
    activeFilePath: string | null,
    folderPath: string | null,
    currentFileTasks: ScrapedTask[],
    activeTasks: ScrapedTask[],
    overdueCount: number,
    upcomingCount: number,
  ): void {
    const consoleEl = parent.createDiv({ cls: "qr-daily-console" });
    this.renderDailyFocus(consoleEl, activeTasks, overdueCount, upcomingCount);
    this.renderCurrentContext(consoleEl, activeFilePath, folderPath, currentFileTasks);
  }

  private renderDailyFocus(
    parent: HTMLElement,
    activeTasks: ScrapedTask[],
    overdueCount: number,
    upcomingCount: number,
  ): void {
    const panel = parent.createDiv({ cls: "qr-daily-panel qr-daily-panel-primary" });
    panel.createDiv({ text: overdueCount > 0 ? "Now" : "Next", cls: "qr-daily-kicker" });
    const firstTask = activeTasks[0] ?? null;
    const title = overdueCount > 0
      ? `${overdueCount} overdue reminder${overdueCount === 1 ? "" : "s"}`
      : firstTask?.text ?? (upcomingCount > 0 ? `${upcomingCount} upcoming reminder${upcomingCount === 1 ? "" : "s"}` : "Nothing needs action");
    panel.createDiv({ text: title, cls: "qr-daily-title" });
    panel.createDiv({
      text: firstTask ? getTaskSourceLineLabel(firstTask) : "Open source notes stay as the truth.",
      cls: "qr-daily-meta",
    });
    if (firstTask) {
      const source = panel.createEl("button", { text: "Show source", cls: "qr-row-btn qr-daily-action" });
      source.onclick = () => void this.openTaskSource(firstTask);
    }
  }

  private renderCurrentContext(
    parent: HTMLElement,
    activeFilePath: string | null,
    folderPath: string | null,
    currentFileTasks: ScrapedTask[],
  ): void {
    const panel = parent.createDiv({ cls: "qr-daily-panel" });
    panel.createDiv({ text: "Current note", cls: "qr-daily-kicker" });
    panel.createDiv({ text: getPathBasename(activeFilePath), cls: "qr-daily-title" });
    panel.createDiv({
      text: activeFilePath ? `${currentFileTasks.length} active task${currentFileTasks.length === 1 ? "" : "s"} here` : "Open a note to focus its tasks.",
      cls: "qr-daily-meta",
    });
    if (activeFilePath && this.taskScope !== "active") {
      const focus = panel.createEl("button", { text: "Focus note", cls: "qr-row-btn qr-daily-action" });
      focus.onclick = () => this.showActiveFile(activeFilePath, folderPath ?? "");
    }
  }

  private renderFirstRunActions(parent: HTMLElement): void {
    const panel = parent.createDiv({ cls: "qr-first-run-panel" });
    panel.createDiv({ text: "Start here", cls: "qr-first-run-title" });

    const actions = panel.createDiv({ cls: "qr-first-run-actions" });
    const starterBtn = actions.createEl("button", {
      text: "Start with template",
      cls: "qr-primary-btn",
    });
    starterBtn.onclick = async () => {
      const result = await runStarterBoardEntryAction({
        openStarterBoard: this.openStarterBoard,
        setBusy: (busy) => {
          starterBtn.disabled = busy;
        },
        onError: (error) =>
          console.error("Quick Reminder starter board failed", error),
      });

      if (!result.ok && !result.handled) {
        new Notice(getStarterBoardOpenFailedNotice());
      }
    };

    actions.createEl("button", { text: "New reminder", cls: "qr-secondary-btn" }).onclick = () => {
      this.openCaptureWithText("");
    };
    actions.createEl("button", { text: "New task", cls: "qr-secondary-btn" }).onclick = () => {
      this.openNewTaskModal(false);
    };
    actions.createEl("button", { text: "Project Planner", cls: "qr-secondary-btn" }).onclick = () => {
      this.openProjectPlannerModal();
    };
  }

  private scrapedTasksRefresh: Promise<boolean> | null = null;

  private async refreshScrapedTasks(showFailureNotice = true): Promise<boolean> {
    // Coalesce concurrent callers (vault events, scan button, render bootstrap)
    // onto a single in-flight scan. Without this, two scans race against
    // store.relinkTaskReferences mutating data.reminders in place.
    if (this.scrapedTasksRefresh) return this.scrapedTasksRefresh;
    this.scrapedTasksRefresh = (async () => {
      this.isScanningTasks = true;
      try {
        this.scrapedTasks = await this.taskScanner.scan([this.store.settings.mirrorFilePath]);
        await this.store.relinkTaskReferences(this.scrapedTasks);
        this.hasScannedTasks = true;
        return true;
      } catch (error) {
        console.error("Quick Reminder task scan failed", error);
        if (showFailureNotice) new Notice(getDashboardScanFailedNotice());
        return false;
      } finally {
        this.isScanningTasks = false;
        this.scrapedTasksRefresh = null;
      }
    })();
    return this.scrapedTasksRefresh;
  }

  private async scanDashboardTasks(): Promise<void> {
    const result = await runDashboardScanWorkflow({
      scan: async () => {
        const scanned = await this.refreshScrapedTasks(false);
        return scanned ? this.scrapedTasks.length : null;
      },
      refresh: () => this.render(),
      onScanError: (error) =>
        console.error("Quick Reminder dashboard scan failed", error),
      onRefreshError: (error) =>
        console.error("Quick Reminder dashboard scan refresh failed", error),
    });

    if (!result.ok) {
      new Notice(
        result.scanned
          ? getDashboardScanRefreshFailedNotice(result.taskCount)
          : getDashboardScanFailedNotice(),
      );
      return;
    }

    new Notice(getDashboardScanSuccessNotice(result.taskCount));
  }

  private wireHeaderActionButton(
    button: HTMLButtonElement,
    options: {
      busyText: string;
      action: () => void | Promise<void>;
    },
  ): void {
    const idleText = button.textContent ?? "";
    let isRunning = false;
    button.onclick = async () => {
      await runSingleAction({
        isRunning: () => isRunning,
        setRunning: (running) => {
          isRunning = running;
          const state = getSingleActionButtonState(
            running,
            idleText,
            options.busyText,
          );
          button.disabled = state.disabled;
          button.setText(state.text);
          if (state.ariaBusy) {
            button.setAttr("aria-busy", "true");
          } else {
            button.removeAttribute("aria-busy");
          }
        },
        run: options.action,
      });
    };
  }

  private queueTaskRefreshForFile(file: TAbstractFile): void {
    if (!this.shouldRefreshForVaultFile(file)) return;
    // Suppress exactly one modify event per pending self-write. Replaces
    // the prior 800ms time-window heuristic which could swallow real user
    // edits typed within that window (e.g. manual `[-]` cancellation).
    const path = (file as TFile).path;
    const remaining = this.expectedSelfModifies.get(path) ?? 0;
    if (remaining > 0) {
      if (remaining === 1) this.expectedSelfModifies.delete(path);
      else this.expectedSelfModifies.set(path, remaining - 1);
      // Our self-writes already placed lines in the right section, so we
      // just need the dashboard to re-scan this file and re-render.
      this.markPathForRescan(path);
      this.queueTaskRefresh();
      return;
    }
    void this.organizeAndRefreshTasks(file as TFile);
  }

  /** Queue a deleted file's tasks for removal without reading the dead file. */
  private queueTaskRemoveForFile(file: TAbstractFile): void {
    if (!(file instanceof TFile) || !this.isScannedMarkdownPath(file.path)) {
      return;
    }
    this.markPathForRemove(file.path);
    this.queueTaskRefresh();
  }

  /** Mark a path to be re-scanned (and any prior pending removal cancelled). */
  private markPathForRescan(path: string): void {
    this.pendingRemovePaths.delete(path);
    this.pendingRescanPaths.add(path);
  }

  /** Mark a path's tasks for removal (and cancel any pending re-scan). */
  private markPathForRemove(path: string): void {
    this.pendingRescanPaths.delete(path);
    this.pendingRemovePaths.add(path);
  }

  private async organizeAndRefreshTasks(file: TFile): Promise<void> {
    // If an organize is already running for this path (user edit landed
    // mid-organize), share its promise rather than running concurrent
    // vault.process calls that would stomp each other's intermediate state.
    const inFlight = this.organizingPromises.get(file.path);
    if (inFlight) {
      await inFlight;
      return;
    }

    const promise = (async () => {
      try {
        await this.taskScanner.organizeTopLevelTaskSections(
          file.path,
          this.store.settings.taskSectionHeadings,
        );
      } catch (error) {
        console.error("Quick Reminder task auto-organization failed", error);
      }
    })();
    this.organizingPromises.set(file.path, promise);
    try {
      await promise;
    } finally {
      this.organizingPromises.delete(file.path);
      // Organize may have rewritten this file in place; re-scan it so the
      // dashboard reflects the post-organize content (read at fire time).
      this.markPathForRescan(file.path);
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
      await this.refreshScrapedTasksIncremental();
      await this.render();
    }, 800);
  }

  /**
   * F06: re-scan ONLY the files changed during the debounce window and splice
   * their tasks into the cached list, instead of re-reading and re-parsing
   * every markdown file in the vault on each edit. Behavior-preserving: the
   * result equals a full scan() for the same vault state because the splice
   * re-sorts with the identical (filePath, line) comparator scan() uses, and
   * relinkTaskReferences is re-run on the rebuilt array just like a full scan.
   */
  private async refreshScrapedTasksIncremental(): Promise<boolean> {
    const rescanPaths = [...this.pendingRescanPaths];
    const removePaths = new Set(this.pendingRemovePaths);
    this.pendingRescanPaths.clear();
    this.pendingRemovePaths.clear();

    if (rescanPaths.length === 0 && removePaths.size === 0) {
      // No accumulated deltas (e.g. fired purely for a re-render). Fall back to
      // the existing single-flight so a concurrent caller still coalesces.
      return this.refreshScrapedTasks();
    }

    // Serialize behind any in-flight full/incremental refresh: both mutate
    // this.scrapedTasks and relinkTaskReferences (which edits data.reminders in
    // place). Re-applying our deltas after a full scan is idempotent — the
    // total-order splice reproduces the same array — so correctness holds even
    // when a full scan superseded these same files.
    const previous = this.scrapedTasksRefresh;
    const run = (async (): Promise<boolean> => {
      if (previous) await previous.catch(() => undefined);
      this.isScanningTasks = true;
      try {
        const rescanned = new Map<string, ScrapedTask[]>();
        for (const path of rescanPaths) {
          const file = this.app.vault.getAbstractFileByPath(path);
          // The file may have been deleted/renamed between event and fire; if
          // it no longer resolves, treat it as a removal instead of reading.
          if (file instanceof TFile) {
            rescanned.set(path, await this.taskScanner.scanFile(file));
          } else {
            removePaths.add(path);
          }
        }
        this.scrapedTasks = spliceScrapedTasks(
          this.scrapedTasks,
          rescanned,
          removePaths,
        );
        await this.store.relinkTaskReferences(this.scrapedTasks);
        this.hasScannedTasks = true;
        return true;
      } catch (error) {
        console.error("Quick Reminder task scan failed", error);
        new Notice(getDashboardScanFailedNotice());
        return false;
      } finally {
        this.isScanningTasks = false;
      }
    })();
    this.scrapedTasksRefresh = run;
    // Clear the in-flight handle once settled, but only if a newer refresh
    // hasn't already replaced it. Attached after assignment so the closure
    // doesn't reference `run` before it is initialized.
    void run.finally(() => {
      if (this.scrapedTasksRefresh === run) this.scrapedTasksRefresh = null;
    });
    return run;
  }

  private renderStats(
    parent: HTMLElement,
    overdueCount: number,
    upcomingCount: number,
    scrapedCount: number,
    ignoredCount: number,
  ): void {
    const stats = parent.createDiv({ cls: "qr-view-stats" });
    this.renderStat(stats, "Overdue", overdueCount, "overdue", overdueCount > 0);
    this.renderStat(stats, "Upcoming", upcomingCount, "upcoming");
    this.renderStat(stats, "Visible tasks", scrapedCount, "visible");
    this.renderStat(stats, "Ignored", ignoredCount, "ignored");
  }

  private renderStat(parent: HTMLElement, label: string, count: number, slug: string, warn = false): void {
    const stat = parent.createDiv({ cls: `qr-view-stat qr-view-stat-${slug} ${warn ? "is-warning" : ""}` });
    stat.createDiv({ text: String(count), cls: "qr-view-stat-number" });
    stat.createDiv({ text: label, cls: "qr-view-stat-label" });
  }

  private renderSection(
    parent: HTMLElement,
    title: string,
    items: Reminder[],
    isHistory: boolean,
  ): void {
    const section = parent.createDiv({ cls: getDashboardSectionClassNames(title, items.length === 0) });
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
    const row = parent.createDiv({ cls: "qr-view-row qr-reminder-row" });
    row.toggleClass("qr-view-row-done", isHistory);

    if (this.editingId === r.id && !isHistory) {
      this.renderEditRow(row, r);
      return;
    }

    const layout = row.createDiv({ cls: "qr-reminder-layout" });
    const body = layout.createDiv({ cls: "qr-view-row-body" });
    body.createDiv({ text: r.text, cls: "qr-view-row-text" });

    const whenLabel = isHistory ? formatHistoryWhen(r) : formatWhen(r.dueAt);
    body.createDiv({ text: whenLabel, cls: "qr-view-row-when" });

    const actions = layout.createDiv({ cls: "qr-view-row-actions" });
    const renderActions = isHistory ? this.renderHistoryReminderActions : this.renderPendingReminderActions;
    renderActions.call(this, actions, r);
    this.renderDeleteReminderAction(actions, r);
  }

  private renderPendingReminderActions(actions: HTMLElement, reminder: Reminder): void {
    const doneBtn = actions.createEl("button", { text: "Done", cls: "qr-row-btn qr-done-btn" });
    this.wireReminderActionButton(doneBtn, {
      busyText: "Saving...",
      description: "mark this reminder done",
      successMessage: "Marked done",
      action: async () => {
        this.scheduler.cancel(reminder.id);
        await this.store.complete(reminder.id);
      },
    });

    const snoozeMinutes = this.store.settings.defaultSnoozeMinutes;
    const snoozeBtn = actions.createEl("button", {
      text: `Snooze ${snoozeMinutes}m`,
      cls: "qr-row-btn",
    });
    snoozeBtn.setAttr("aria-label", `Snooze ${snoozeMinutes} minutes`);
    this.wireReminderActionButton(snoozeBtn, {
      busyText: "Snoozing...",
      description: "snooze this reminder",
      successMessage: `Snoozed ${snoozeMinutes}m`,
      action: async () => {
        await this.store.snooze(reminder.id, snoozeMinutes);
        this.scheduler.scheduleAll();
      },
    });

    actions.createEl("button", { text: "Edit", cls: "qr-row-btn" }).onclick = () => {
      this.editingId = reminder.id;
      void this.render();
    };
  }

  private renderHistoryReminderActions(actions: HTMLElement, reminder: Reminder): void {
    const restoreBtn = actions.createEl("button", { text: "Restore", cls: "qr-row-btn" });
    this.wireReminderActionButton(restoreBtn, {
      busyText: "Restoring...",
      description: "restore this reminder",
      successMessage: "Reminder restored",
      action: async () => {
        await this.store.restore(reminder.id);
        this.scheduler.scheduleAll();
      },
    });

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
    this.wireReminderActionButton(delBtn, {
      busyText: "Deleting...",
      description: "delete this reminder",
      successMessage: "Reminder deleted",
      action: async () => {
        this.scheduler.cancel(reminder.id);
        await this.store.remove(reminder.id);
      },
    });
  }

  private renderEditRow(parent: HTMLElement, r: Reminder): void {
    const { textInput, dueInput, saveButton } = renderReminderEditRow(
      parent,
      r,
      {
        onCancel: () => {
          this.editingId = null;
          void this.render();
        },
      },
    );
    const idleText = saveButton.textContent ?? "";
    let isRunning = false;
    saveButton.onclick = async () => {
      const text = textInput.value.trim();
      const dueAt = new Date(dueInput.value).getTime();
      if (!text || Number.isNaN(dueAt)) {
        new Notice(getReminderEditInvalidNotice());
        return;
      }
      if (dueAt <= Date.now()) {
        new Notice(getReminderPastTimeNotice());
        return;
      }

      await this.runReminderAction(
        "update this reminder",
        "Reminder updated",
        async () => {
          await this.store.updateReminder(r.id, text, dueAt);
          this.scheduler.scheduleAll();
          this.editingId = null;
        },
        {
          isRunning: () => isRunning,
          setRunning: (running) => {
            isRunning = running;
            saveButton.disabled = running;
            saveButton.setText(running ? "Saving..." : idleText);
          },
        },
      );
    };
  }

  private wireReminderActionButton(
    button: HTMLButtonElement,
    options: {
      busyText: string;
      description: string;
      successMessage: string;
      action: () => Promise<void>;
    },
  ): void {
    const idleText = button.textContent ?? "";
    let isRunning = false;
    button.onclick = async () => {
      await this.runReminderAction(
        options.description,
        options.successMessage,
        options.action,
        {
          isRunning: () => isRunning,
          setRunning: (running) => {
            isRunning = running;
            button.disabled = running;
            button.setText(running ? options.busyText : idleText);
          },
        },
      );
    };
  }

  private async runReminderAction(
    description: string,
    successMessage: string,
    action: () => Promise<void>,
    runningState?: {
      isRunning: () => boolean;
      setRunning: (running: boolean) => void;
    },
  ): Promise<boolean> {
    const result = await runReminderActionWorkflow({
      isRunning: runningState?.isRunning,
      setRunning: runningState?.setRunning,
      run: action,
      onError: (error) =>
        console.error("Quick Reminder dashboard reminder action failed", error),
      refresh: () => this.render(),
      onRefreshError: (error) =>
        console.error("Quick Reminder dashboard reminder refresh failed", error),
    });
    if (!result.ok) {
      if ("ignored" in result) return false;
      new Notice(
        result.actionCompleted
          ? getReminderActionRefreshFailedNotice()
          : getReminderActionFailedNotice(description),
      );
      return result.actionCompleted;
    }

    new Notice(successMessage);
    return true;
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
      this.applyTaskSearchFilter();
    };
    search.onblur = () => {
      void this.persistDashboardState();
    };
    search.onchange = () => {
      void this.persistDashboardState();
    };

    const scopeSelect = toolbar.createEl("select", { cls: "qr-task-select" });
    scopeSelect.createEl("option", { text: "Current file", value: "active" });
    scopeSelect.createEl("option", { text: "Current folder", value: "folder" });
    scopeSelect.createEl("option", { text: "Whole vault", value: "vault" });
    scopeSelect.value = this.taskScope;
    scopeSelect.onchange = () => {
      const next = scopeSelect.value as TaskDashboardScope;
      // Only forget the user's explicit folder pick when they leave folder
      // scope. Previously every scope change wiped it, so flipping to
      // "Current folder" silently dropped a folder the user opened via
      // "Show folder tasks in Quick Reminder".
      if (next !== "folder") this.selectedFolderPath = null;
      this.taskScope = next;
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

    const count = toolbar.createDiv({
      text: `${visibleCount} of ${tasks.length}`,
      cls: "qr-task-filter-count",
    });
    count.dataset.qrDefaultText = count.getText();
  }

  private applyTaskSearchFilter(): void {
    const query = this.taskSearch.trim().toLowerCase();
    const rows = Array.from(this.containerEl.querySelectorAll<HTMLElement>(".qr-scraped-row"));
    let visibleCount = 0;

    for (const row of rows) {
      const haystack = row.dataset.qrTaskSearch ?? row.textContent?.toLowerCase() ?? "";
      const visible = !query || haystack.includes(query);
      row.toggleClass("qr-task-search-hidden", !visible);
      if (visible) {
        visibleCount += 1;
      }
    }

    const count = this.containerEl.querySelector<HTMLElement>(".qr-task-filter-count");
    if (count) {
      count.setText(query ? `${visibleCount} matching` : count.dataset.qrDefaultText ?? count.getText());
    }
  }

  private renderScrapedSection(
    parent: HTMLElement,
    title: string,
    tasks: ScrapedTask[],
    totalCount: number,
    isIgnored = false,
    ignoredTaskNotes: Readonly<Record<string, string>> = {},
    emptyTaskAction: ScopedEmptyTaskAction | null = null,
  ): void {
    const isEmpty = tasks.length === 0 && totalCount === 0 && emptyTaskAction === null;
    const section = parent.createDiv({ cls: getDashboardSectionClassNames(title, isEmpty) });
    const collapsed = this.isSectionCollapsed(title);
    this.renderSectionHead(section, title, `${tasks.length}/${totalCount}`, collapsed);
    if (collapsed) return;

    if (tasks.length === 0) {
      this.renderEmptyScrapedSection(section, title, totalCount, emptyTaskAction);
      return;
    }

    const visibleTasks = tasks.slice(0, 150);
    if (this.taskSort === "priority") {
      for (const task of visibleTasks) {
        this.renderScrapedRow(section, task, isIgnored, ignoredTaskNotes[task.id] ?? "", true);
      }
    } else {
      for (const note of groupTasksByPhase(visibleTasks)) {
        this.renderTaskNoteHead(section, note.filePath);
        for (const phase of note.phases) {
          this.renderPhaseCard(section, note.filePath, phase, isIgnored, ignoredTaskNotes);
        }
        this.renderAddCategoryRow(section, note.filePath);
      }
    }

    if (tasks.length > 150) {
      section.createDiv({
        text: `${tasks.length - 150} more tasks hidden. Use filters to narrow this dashboard.`,
        cls: "qr-view-empty",
      });
    }
  }

  private renderEmptyScrapedSection(
    parent: HTMLElement,
    title: string,
    totalCount: number,
    emptyTaskAction: ScopedEmptyTaskAction | null,
  ): void {
    if (!emptyTaskAction) {
      parent.createDiv({
        text: getEmptyScrapedText(title, totalCount),
        cls: "qr-view-empty",
      });
      return;
    }

    const empty = parent.createDiv({ cls: "qr-view-empty qr-view-empty-action" });
    empty.createSpan({ text: emptyTaskAction.text });
    const actionBtn = empty.createEl("button", {
      text: emptyTaskAction.label,
      cls: "qr-row-btn",
    });
    actionBtn.onclick = () => {
      this.setScope(emptyTaskAction.nextScope);
    };
  }

  private renderSectionHead(parent: HTMLElement, title: string, count: string, collapsed: boolean): void {
    const head = parent.createDiv({ cls: "qr-view-section-head" });
    head.toggleClass("is-collapsed", collapsed);
    head.setAttr("role", "button");
    head.setAttr("tabindex", "0");
    head.setAttr("aria-expanded", String(!collapsed));

    const label = head.createSpan({ cls: "qr-view-section-label" });
    const caret = label.createSpan({ cls: "qr-view-section-caret" });
    setIcon(caret, collapsed ? "chevron-right" : "chevron-down");
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

  private renderTaskNoteHead(parent: HTMLElement, filePath: string): void {
    const head = parent.createDiv({ cls: "qr-task-note-head" });
    head.createDiv({ text: filePath, cls: "qr-task-note-title" });
    this.renderAddCategoryButton(head, filePath, true);
  }

  private isSectionCollapsed(title: string): boolean {
    return this.collapsedSections.has(title);
  }

  private phaseKey(filePath: string, phaseName: string): string {
    return `${filePath}::${phaseName}`;
  }

  private renderPhaseCard(
    parent: HTMLElement,
    filePath: string,
    phase: TaskPhaseGroup,
    isIgnored: boolean,
    ignoredTaskNotes: Readonly<Record<string, string>>,
  ): void {
    const key = this.phaseKey(filePath, phase.name);
    const collapsed = this.collapsedPhases.has(key);
    const accent = phase.isInbox ? null : getPhaseAccentHue(phase.name);
    const card = parent.createDiv({ cls: "qr-phase-card" });
    card.toggleClass("qr-phase-card-inbox", phase.isInbox);
    card.toggleClass("is-collapsed", collapsed);
    if (accent !== null) {
      card.style.setProperty("--phase-accent", `hsl(${accent}, 70%, 55%)`);
      card.style.setProperty(
        "--phase-accent-soft",
        `hsl(${accent}, 70%, 55% / 0.18)`,
      );
    }

    const total = phase.tasks.length;
    const done = phase.tasks.filter((t) => t.completed).length;
    const inProg = phase.tasks.filter((t) => t.status === "in-progress").length;
    const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

    const head = card.createDiv({ cls: "qr-phase-head" });
    head.setAttr("role", "button");
    head.setAttr("tabindex", "0");
    head.setAttr("aria-expanded", String(!collapsed));

    const caret = head.createSpan({ cls: "qr-phase-caret" });
    setIcon(caret, collapsed ? "chevron-right" : "chevron-down");

    const title = head.createSpan({ text: phase.name, cls: "qr-phase-title" });
    title.toggleClass("qr-phase-title-inbox", phase.isInbox);
    if (!phase.isInbox) {
      title.setAttr("title", "Double-click to rename");
      title.ondblclick = (event) => {
        event.stopPropagation();
        this.startInlineRename(title, filePath, phase.name);
      };
    }

    const editAction = getPhaseEditAction(phase);
    if (editAction) {
      const edit = head.createEl("button", {
        cls: "qr-phase-action qr-phase-edit",
        attr: {
          type: "button",
          "aria-label": editAction.ariaLabel,
          title: editAction.title,
        },
      });
      const editIcon = edit.createSpan({ cls: "qr-phase-action-icon" });
      setIcon(editIcon, "pencil");
      edit.createSpan({ text: editAction.label, cls: "qr-phase-action-label" });
      edit.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.startInlineRename(title, filePath, phase.name);
      };
      edit.onkeydown = (event) => {
        event.stopPropagation();
      };
    }

    const pillText =
      total === 0
        ? "Empty"
        : done === total
          ? "Done"
          : inProg > 0
            ? "In progress"
            : "Open";
    const pill = head.createSpan({
      text: pillText,
      cls: `qr-phase-pill qr-phase-pill-${pillText.toLowerCase().replace(/\s+/g, "-")}`,
    });
    void pill;

    const progressWrap = head.createSpan({ cls: "qr-phase-progress" });
    const progressBar = progressWrap.createSpan({ cls: "qr-phase-bar" });
    progressBar.addClass("qr-progress-bar");
    progressBar.style.setProperty("--qr-progress", `${progressPct}%`);

    head.createSpan({
      text: `${done}/${total}`,
      cls: "qr-phase-count",
    });

    const toggle = () => {
      // Toggle visually via classList (no re-render). Re-rendering on every
      // click destroyed the title element between the two clicks of a
      // dblclick, so the browser never fired dblclick → rename never worked.
      const isNowCollapsed = !card.hasClass("is-collapsed");
      card.toggleClass("is-collapsed", isNowCollapsed);
      setIcon(caret, isNowCollapsed ? "chevron-right" : "chevron-down");
      head.setAttr("aria-expanded", String(!isNowCollapsed));
      if (isNowCollapsed) {
        this.collapsedPhases.add(key);
      } else {
        this.collapsedPhases.delete(key);
      }
    };
    head.onclick = (event) => {
      const target = event.target as HTMLElement;
      // Title handles its own dblclick → don't toggle when clicking on it.
      if (target.closest(".qr-phase-title")) return;
      if (target.closest(".qr-phase-action")) return;
      if (target.closest(".qr-phase-search")) return;
      toggle();
    };
    head.onkeydown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggle();
    };

    if (collapsed) return;

    const phaseQuery = this.phaseSearchQueries.get(key) ?? "";
    const searchWrap = card.createDiv({ cls: "qr-phase-filter" });
    const search = searchWrap.createEl("input", {
      type: "search",
      cls: "qr-phase-search",
      placeholder: `Search ${phase.name}`,
    });
    search.value = phaseQuery;
    search.oninput = () => {
      const next = search.value;
      if (next.trim()) {
        this.phaseSearchQueries.set(key, next);
      } else {
        this.phaseSearchQueries.delete(key);
      }
      this.phasePageLimits.delete(key);
      this.activePhaseSearchKey = key;
      void this.render();
    };
    if (this.activePhaseSearchKey === key) {
      window.setTimeout(() => {
        search.focus();
        search.setSelectionRange(search.value.length, search.value.length);
      }, 0);
    }

    const body = card.createDiv({ cls: "qr-phase-body" });
    if (total === 0) {
      body.createDiv({
        text: "No tasks in this phase yet.",
        cls: "qr-phase-empty",
      });
      return;
    }
    const filteredTasks = filterTasksByQuery(phase.tasks, phaseQuery);
    if (phaseQuery.trim()) {
      searchWrap.createSpan({
        text: `${filteredTasks.length}/${total}`,
        cls: "qr-phase-search-count",
      });
    }
    if (filteredTasks.length === 0) {
      body.createDiv({
        text: "No tasks match this category search.",
        cls: "qr-phase-empty",
      });
      this.renderAddTaskRow(body, filePath, phase);
      return;
    }
    const pageLimit = this.phasePageLimits.get(key) ?? PHASE_PAGE_SIZE;
    const visible = phaseQuery.trim()
      ? filteredTasks
      : filteredTasks.slice(0, pageLimit);
    for (const task of visible) {
      this.renderScrapedRow(
        body,
        task,
        isIgnored,
        ignoredTaskNotes[task.id] ?? "",
        false,
      );
    }
    if (!phaseQuery.trim() && total > pageLimit) {
      const more = body.createEl("button", {
        text: `Show ${Math.min(PHASE_PAGE_SIZE, total - pageLimit)} more`,
        cls: "qr-phase-show-more",
      });
      more.onclick = () => {
        this.phasePageLimits.set(key, pageLimit + PHASE_PAGE_SIZE);
        void this.render();
      };
    } else if (!phaseQuery.trim() && total > PHASE_PAGE_SIZE) {
      const less = body.createEl("button", {
        text: "Collapse to 25",
        cls: "qr-phase-show-more",
      });
      less.onclick = () => {
        this.phasePageLimits.delete(key);
        void this.render();
      };
    }

    this.renderAddTaskRow(body, filePath, phase);
  }

  private startInlineRename(
    titleEl: HTMLElement,
    filePath: string,
    oldName: string,
  ): void {
    const original = titleEl.getText();
    const input = document.createElement("input");
    input.type = "text";
    input.value = oldName;
    input.className = "qr-phase-rename-input";
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    const restore = (text: string) => {
      const span = document.createElement("span");
      span.className = titleEl.className;
      span.setText(text);
      span.setAttr("title", "Double-click to rename");
      span.ondblclick = (event) => {
        event.stopPropagation();
        this.startInlineRename(span, filePath, text);
      };
      input.replaceWith(span);
    };

    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      const next = input.value.trim();
      if (next.length === 0 || next === oldName) {
        restore(original);
        return;
      }
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) {
        new Notice(getTaskSourcePathMissingNotice(filePath));
        restore(original);
        return;
      }
      const result = await runTaskHeadingRenameWorkflow({
        renameHeading: async () => {
          await this.applyManagedBlockTransform(file, (content) =>
            renameHeadingInContent(content, oldName, next),
          );
          return true;
        },
        afterRename: () => this.render(),
        onRenameError: (error) =>
          console.error("Quick Reminder category rename failed", error),
        onAfterRenameError: (error) =>
          console.error("Quick Reminder category rename refresh failed", error),
      });

      if (!result.ok) {
        new Notice(
          result.renamed
            ? getTaskHeadingRenameRefreshFailedNotice()
            : getTaskHeadingRenameFailedNotice(),
        );
        restore(result.renamed ? next : original);
        return;
      }

      new Notice(getTaskCategoryRenamedNotice());
    };

    input.onblur = () => void commit();
    input.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void commit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        committed = true;
        restore(original);
      }
    };
  }

  private startInlineTaskEdit(row: HTMLElement, task: ScrapedTask): void {
    const textEl = row.querySelector<HTMLElement>(".qr-task-main-text");
    if (!textEl) return;
    const original = textEl.getText();
    const input = document.createElement("input");
    input.type = "text";
    input.value = task.text;
    input.className = "qr-task-edit-input";
    textEl.replaceWith(input);
    input.focus();
    input.select();

    const restore = (text: string) => {
      const div = document.createElement("div");
      div.className = "qr-view-row-text qr-task-main-text";
      div.setText(text);
      input.replaceWith(div);
    };

    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      const next = input.value.trim();
      if (next.length === 0 || next === task.text) {
        restore(original);
        return;
      }
      const result = await runTaskTextEditWorkflow({
        updateTask: () => this.taskScanner.setCheckboxText(task, next),
        afterUpdate: async (updated) => {
          await this.store.relinkTask(task.id, updated.id);
          await this.refreshScrapedTasks();
          this.flashTask(updated.id);
          await this.render();
        },
        onUpdateError: (error) =>
          console.error("Quick Reminder task text update failed", error),
        onAfterUpdateError: (error) =>
          console.error("Quick Reminder task text refresh failed", error),
      });
      if (!result.ok) {
        new Notice(
          result.updated
            ? getTaskTextUpdateRefreshFailedNotice()
            : getTaskStatusUpdateFailedNotice(),
        );
        if (result.updated) {
          restore(next);
        } else {
          restore(original);
        }
        return;
      }
      new Notice(getTaskUpdatedNotice());
    };

    input.onblur = () => void commit();
    input.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void commit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        committed = true;
        restore(original);
      }
    };
  }

  private renderAddTaskRow(
    parent: HTMLElement,
    filePath: string,
    phase: TaskPhaseGroup,
  ): void {
    const row = parent.createDiv({ cls: "qr-phase-add" });
    const button = row.createEl("button", {
      text: `+ Add task to ${phase.isInbox ? "Inbox" : phase.name}`,
      cls: "qr-phase-add-button",
    });
    button.onclick = () => {
      this.swapForTaskInput(row, button, filePath, phase);
    };
  }

  private renderAddCategoryRow(parent: HTMLElement, filePath: string): void {
    const row = parent.createDiv({ cls: "qr-phase-add-category" });
    this.renderAddCategoryButton(row, filePath);
  }

  private renderAddCategoryButton(parent: HTMLElement, filePath: string, compact = false): void {
    const button = parent.createEl("button", {
      text: compact ? "+ Category" : "+ Add category",
      cls: compact ? "qr-note-add-category-button" : "qr-phase-add-category-button",
      attr: {
        type: "button",
        "aria-label": `Add category to ${filePath}`,
      },
    });
    button.onclick = () => {
      this.swapForCategoryInput(parent, button, getCategoryInputInitialPath(filePath, compact));
    };
  }

  private swapForCategoryInput(
    row: HTMLElement,
    button: HTMLElement,
    selectedFilePath: string,
  ): void {
    button.addClass("qr-hidden");
    row.addClass("is-adding-category");

    const form = row.createDiv({ cls: "qr-category-add-form" });
    const categoryInput = form.createEl("input", {
      type: "text",
      cls: "qr-phase-add-input qr-category-name-input",
    });
    categoryInput.placeholder = "Category name";

    const targetWrap = form.createDiv({ cls: "qr-category-target-row" });
    const targetInput = targetWrap.createEl("input", {
      type: "text",
      cls: "qr-phase-add-input qr-category-file-input",
    });
    targetInput.placeholder = `File path (blank = ${DEFAULT_CATEGORY_FILE_PATH})`;
    targetInput.value = selectedFilePath;
    this.attachMarkdownFileOptions(targetInput);

    const actions = form.createDiv({ cls: "qr-category-add-actions" });
    const save = actions.createEl("button", {
      text: "Add",
      cls: "qr-row-btn qr-category-save-btn",
      attr: { type: "button" },
    });
    const cancel = actions.createEl("button", {
      text: "Cancel",
      cls: "qr-row-btn",
      attr: { type: "button" },
    });

    const restore = () => {
      form.remove();
      row.removeClass("is-adding-category");
      button.removeClass("qr-hidden");
    };

    let isSubmitting = false;
    const setSubmitting = (submitting: boolean) => {
      isSubmitting = submitting;
      save.disabled = submitting;
      save.setText(submitting ? "Adding..." : "Add");
    };

    const submit = async () => {
      const name = categoryInput.value.trim();
      if (name.length === 0) {
        categoryInput.focus();
        return;
      }
      const saved = await runInlineAddWorkflow({
        isSubmitting: () => isSubmitting,
        setSubmitting,
        getTarget: () => this.getManagedTaskTargetFile(targetInput.value),
        write: (file) =>
          this.applyManagedBlockTransform(file, (content) =>
            appendHeading(content, name),
          ),
        restore,
        onWriteError: (error) => {
          console.error("Quick Reminder category add failed", error);
          new Notice(getTaskInlineAddCategoryFailedNotice());
        },
      });
      if (!saved) {
        categoryInput.focus();
        return;
      }
      await this.refreshScrapedTasks();
      await this.render();
      new Notice(getTaskCategoryAddedNotice());
    };

    save.onclick = () => void submit();
    cancel.onclick = restore;
    form.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        restore();
      }
    };
    categoryInput.focus();
  }

  private swapForTaskInput(
    row: HTMLElement,
    button: HTMLElement,
    selectedFilePath: string,
    phase: TaskPhaseGroup,
  ): void {
    button.addClass("qr-hidden");
    row.addClass("is-adding-task");

    const form = row.createDiv({ cls: "qr-task-add-form" });
    const taskInput = form.createEl("input", {
      type: "text",
      cls: "qr-phase-add-input qr-task-name-input",
    });
    taskInput.placeholder = "Task text";

    const targetWrap = form.createDiv({ cls: "qr-task-target-row" });
    const targetInput = targetWrap.createEl("input", {
      type: "text",
      cls: "qr-phase-add-input qr-task-file-input",
    });
    targetInput.placeholder = `File path (blank = ${DEFAULT_CATEGORY_FILE_PATH})`;
    targetInput.value = selectedFilePath;
    this.attachMarkdownFileOptions(targetInput);

    const actions = form.createDiv({ cls: "qr-task-add-actions" });
    const save = actions.createEl("button", {
      text: "Add",
      cls: "qr-row-btn qr-task-save-btn",
      attr: { type: "button" },
    });
    const cancel = actions.createEl("button", {
      text: "Cancel",
      cls: "qr-row-btn",
      attr: { type: "button" },
    });

    const restore = () => {
      form.remove();
      row.removeClass("is-adding-task");
      button.removeClass("qr-hidden");
    };

    let isSubmitting = false;
    const setSubmitting = (submitting: boolean) => {
      isSubmitting = submitting;
      save.disabled = submitting;
      save.setText(submitting ? "Adding..." : "Add");
    };

    const submit = async () => {
      const text = taskInput.value.trim();
      if (text.length === 0) {
        taskInput.focus();
        return;
      }
      const heading = phase.isInbox ? "Inbox" : phase.name;
      const saved = await runInlineAddWorkflow({
        isSubmitting: () => isSubmitting,
        setSubmitting,
        getTarget: () => this.getManagedTaskTargetFile(targetInput.value),
        write: (file) =>
          this.applyManagedBlockTransform(file, (content) =>
            addTaskUnderHeading(content, heading, text),
          ),
        restore,
        onWriteError: (error) => {
          console.error("Quick Reminder inline task add failed", error);
          new Notice(getTaskInlineAddFailedNotice());
        },
      });
      if (!saved) {
        taskInput.focus();
        return;
      }
      await this.refreshScrapedTasks();
      await this.render();
      new Notice(getTaskAddedNotice());
    };

    save.onclick = () => void submit();
    cancel.onclick = restore;
    form.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        restore();
      }
    };
    taskInput.focus();
  }

  private attachMarkdownFileOptions(input: HTMLInputElement): void {
    const list = document.createElement("datalist");
    list.id = `qr-category-files-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    for (const file of this.app.vault
      .getMarkdownFiles()
      .sort((a, b) => a.path.localeCompare(b.path))) {
      const option = document.createElement("option");
      option.value = file.path;
      list.appendChild(option);
    }
    input.setAttr("list", list.id);
    input.after(list);
  }

  private async getManagedTaskTargetFile(rawPath: string): Promise<TFile | null> {
    const path = this.normalizeCategoryFilePath(rawPath);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      return existing;
    }
    if (existing !== null) {
      new Notice(getTaskTargetUnavailableNotice(path));
      return null;
    }

    try {
      await this.ensureCategoryParentFolders(path);
      return await this.app.vault.create(path, this.getCategoryFileScaffold(path));
    } catch (error) {
      console.error("Quick Reminder category target create failed", error);
      new Notice(getTaskTargetCreateFailedNotice(path));
      return null;
    }
  }

  private normalizeCategoryFilePath(rawPath: string): string {
    const target = rawPath.trim() || DEFAULT_CATEGORY_FILE_PATH;
    return normalizePath(/\.md$/i.test(target) ? target : `${target}.md`);
  }

  private async ensureCategoryParentFolders(path: string): Promise<void> {
    const folders = path.split("/").slice(0, -1);
    let current = "";
    for (const folder of folders) {
      current = current ? `${current}/${folder}` : folder;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFile) {
        throw new Error(`${current} is a file`);
      }
      if (existing === null) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  private getCategoryFileScaffold(path: string): string {
    const fileName = path.split("/").pop() ?? DEFAULT_CATEGORY_FILE_PATH;
    const title = fileName.replace(/\.md$/i, "").trim() || "Tasks";
    return `# ${title}\n`;
  }

  private renderScrapedRow(
    parent: HTMLElement,
    task: ScrapedTask,
    isIgnored = false,
    ignoredNote = "",
    showFilePath = true,
  ): void {
    const isMobileTaskLayout = this.shouldUseMobileTaskLayout();
    const isMobileExpanded = isMobileTaskLayout && this.expandedTaskCards.has(task.id);
    const row = parent.createDiv({ cls: "qr-view-row qr-scraped-row" });
    row.dataset.qrTaskSearch = getTaskSearchText(task);
    row.addClass(`qr-task-status-${getTaskStatusClassName(task.status)}`);
    row.toggleClass("qr-view-row-done", task.completed);
    row.toggleClass("qr-view-row-ignored", isIgnored);
    row.toggleClass("qr-view-row-highlight", task.id === this.highlightedTaskId);
    row.toggleClass("qr-mobile-task-collapsed", isMobileTaskLayout && !isMobileExpanded);
    row.toggleClass("qr-mobile-task-expanded", isMobileExpanded);
    const hasPendingReminder = this.hasPendingReminderForTask(task);
    const body = row.createDiv({ cls: "qr-view-row-body" });
    if (isMobileTaskLayout) {
      body.addClass("qr-mobile-task-toggle");
      body.setAttr("role", "button");
      body.setAttr("tabindex", "0");
      body.setAttr("aria-expanded", String(isMobileExpanded));
      body.setAttr("aria-label", `${isMobileExpanded ? "Collapse" : "Expand"} task details: ${task.text}`);
    }
    const mobileCaret = isMobileTaskLayout
      ? body.createSpan({ cls: "qr-task-mobile-caret" })
      : null;
    if (mobileCaret) {
      setIcon(mobileCaret, isMobileExpanded ? "chevron-up" : "chevron-down");
    }
    const badges = body.createDiv({ cls: "qr-task-badges" });
    badges.createSpan({
      text: getTaskStatusTitle(task.status),
      cls: `qr-task-badge qr-task-status-badge qr-task-status-${getTaskStatusClassName(task.status)}`,
    });
    badges.createSpan({ text: getTaskKindBadgeText(task), cls: "qr-task-badge qr-task-kind-badge" });
    if (task.contextNotes.length > 0) {
      badges.createSpan({ text: `${task.contextNotes.length} notes`, cls: "qr-task-badge qr-task-context-badge" });
    }
    const reminderAction = getTaskReminderActionState(hasPendingReminder, false);
    if (reminderAction.badgeText) {
      badges.createSpan({ text: reminderAction.badgeText, cls: "qr-task-badge qr-task-reminder-badge" });
    }
    if (isIgnored) {
      badges.createSpan({ text: "Ignored", cls: "qr-task-badge qr-task-muted-badge" });
    }
    body.createDiv({ text: task.text, cls: "qr-view-row-text qr-task-main-text" });
    if (task.contextNotes.length > 0) {
      this.renderTaskContextDetails(body, task);
    }
    const source = task.kind === "marker" && task.marker ? `${task.marker} - ` : "";
    body.createDiv({
      text: showFilePath ? `${source}${task.filePath}:${task.line}` : `${source}Line ${task.line}`,
      cls: "qr-view-row-when",
    });
    if (isIgnored && ignoredNote) {
      body.createDiv({ text: ignoredNote, cls: "qr-view-row-note" });
    }
    this.wireMobileTaskCardExpansion(row, body, task, mobileCaret);

    const actions = row.createDiv({ cls: "qr-view-row-actions" });
    const showBtn = actions.createEl("button", { text: "Show", cls: "qr-row-btn" });
    this.wireTaskRowActionButton(showBtn, {
      busyText: "Opening...",
      action: () => this.openTaskSource(task),
    });
    actions.createEl("button", { text: "Note", cls: "qr-row-btn" }).onclick = () => {
      this.openTaskContextNoteEditor(task);
    };

    if (isIgnored) {
      this.addScrapedRowContextMenu(row, task, isIgnored);
      const unignoreBtn = actions.createEl("button", { text: "Unignore", cls: "qr-row-btn" });
      this.wireTaskRowActionButton(unignoreBtn, {
        busyText: "Saving...",
        action: () => this.unignoreTask(task.id),
      });
      actions.createEl("button", { text: "Delete", cls: "qr-row-btn qr-view-del" }).onclick = async () => {
        await this.deleteTask(task);
      };
      return;
    }

    if (task.kind === "checkbox") {
      if (!task.completed) {
        const progressLabel = task.status === "in-progress" ? "To do" : "In progress";
        const progressStatus = task.status === "in-progress" ? "todo" : "in-progress";
        const progressBtn = actions.createEl("button", { text: progressLabel, cls: "qr-row-btn qr-progress-btn" });
        this.wireTaskRowActionButton(progressBtn, {
          busyText: "Saving...",
          action: () =>
            this.updateTaskStatus(
              task,
              progressStatus,
              `Task marked ${progressLabel.toLowerCase()}`,
            ),
        });
      }

      const doneBtn = actions.createEl("button", {
        text: task.completed ? "To do" : "Done",
        cls: "qr-row-btn qr-done-btn",
      });
      this.wireTaskRowActionButton(doneBtn, {
        busyText: "Saving...",
        action: () =>
          this.updateTaskStatus(
            task,
            task.completed ? "todo" : "completed",
            task.completed ? "Task marked to do" : "Task marked done",
          ),
      });

      // Inline edit is always available. Desktop can delegate to the Tasks
      // plugin editor, while mobile stays in Quick Reminder native row editor.
      const editBtn = actions.createEl("button", {
        text: "Edit",
        cls: "qr-row-btn",
      });
      this.wireTaskRowActionButton(editBtn, {
        busyText: "Opening...",
        action: async () => {
          if (this.canOpenTasksPluginEditor()) {
            await this.editWithTasksPlugin(task);
          } else {
            this.startInlineTaskEdit(row, task);
          }
        },
      });
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

    if (hasPendingReminder) {
      const addedBtn = actions.createEl("button", {
        text: reminderAction.buttonText,
        cls: "qr-row-btn",
      });
      addedBtn.disabled = true;
      addedBtn.setAttr("aria-label", reminderAction.ariaLabel);
      if (reminderAction.title) {
        addedBtn.setAttr("title", reminderAction.title);
      }
      return;
    }

    const parsed = parseReminder(task.text);
    const dueAt = parsed.dueAt;
    const addReminderAction = getTaskReminderActionState(false, hasFutureDueAt(dueAt));
    if (!addReminderAction.canAddReminder || dueAt === null) {
      const noTimeBtn = actions.createEl("button", {
        text: addReminderAction.buttonText,
        cls: "qr-row-btn qr-no-time-btn",
      });
      noTimeBtn.disabled = true;
      noTimeBtn.setAttr("aria-label", addReminderAction.ariaLabel);
      if (addReminderAction.title) {
        noTimeBtn.setAttr("title", addReminderAction.title);
      }
      return;
    }

    const remindBtn = actions.createEl("button", {
      text: addReminderAction.buttonText,
      cls: "qr-row-btn",
    });
    remindBtn.setAttr("aria-label", addReminderAction.ariaLabel);
    this.wireTaskRowActionButton(remindBtn, {
      busyText: "Adding...",
      action: async () => {
        // Re-parse at click time: the render-time `dueAt` captured above goes
        // stale for relative phrases (e.g. "in 15 minutes"). Clicking later
        // would otherwise persist a now-past dueAt that Scheduler.schedule()
        // drops (delay <= 0), losing the reminder silently. Mirror the
        // modal.ts:183 and createTaskFromInput guards.
        const fresh = parseReminder(task.text);
        if (!fresh.dueAt || fresh.dueAt <= Date.now()) {
          new Notice(getReminderPastTimeNotice());
          return;
        }
        const reminder: Reminder = {
          id: `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          text: fresh.text,
          rawInput: task.text,
          dueAt: fresh.dueAt,
          createdAt: Date.now(),
          notified: false,
          sourceTaskId: task.id,
        };
        const result = await runExistingTaskReminderWorkflow({
          hasExistingReminder: () => this.store.hasPendingReminderForSourceTask(task.id),
          saveReminder: () => saveScheduledReminder(this.store, this.scheduler, reminder),
          afterSave: () => this.render(),
          onDuplicate: () => new Notice(getTaskReminderDuplicateNotice()),
          onSaveError: (error) =>
            console.error("Quick Reminder task reminder create failed", error),
          onAfterSaveError: (error) =>
            console.error("Quick Reminder task reminder refresh failed", error),
        });

        if (!result.ok) {
          if ("duplicate" in result) {
            await this.render();
            return;
          }

          if (!result.reminderSaved) {
            new Notice(getReminderSaveFailedNotice());
            return;
          }

          new Notice(getTaskReminderRefreshFailedNotice());
          return;
        }

        new Notice(getTaskReminderCreatedNotice(reminder.text));
      },
    });
  }

  private wireTaskRowActionButton(
    button: HTMLButtonElement,
    options: {
      busyText: string;
      action: () => void | Promise<void>;
    },
  ): void {
    const idleText = button.textContent ?? "";
    let isRunning = false;
    button.onclick = async () => {
      await runSingleAction({
        isRunning: () => isRunning,
        setRunning: (running) => {
          isRunning = running;
          const state = getSingleActionButtonState(
            running,
            idleText,
            options.busyText,
          );
          button.disabled = state.disabled;
          button.setText(state.text);
          if (state.ariaBusy) {
            button.setAttr("aria-busy", "true");
          } else {
            button.removeAttribute("aria-busy");
          }
        },
        run: options.action,
      });
    };
  }

  private renderTaskContextDetails(body: HTMLElement, task: ScrapedTask): void {
    if (!this.shouldUseMobileTaskLayout()) {
      this.renderDesktopTaskContextNotes(body, task);
      return;
    }

    const details = body.createDiv({ cls: "qr-task-context-details qr-task-context-inline" });
    details.createDiv({
      text: getTaskContextSummaryText(task.contextNotes.length),
      cls: "qr-task-context-summary-label",
    });

    const notes = details.createDiv({ cls: "qr-task-context-notes" });
    for (const note of task.contextNotes) {
      notes.createDiv({ text: note, cls: "qr-task-context-note" });
    }
  }

  private wireMobileTaskCardExpansion(
    row: HTMLElement,
    toggleEl: HTMLElement,
    task: ScrapedTask,
    caret: HTMLElement | null,
  ): void {
    if (!this.shouldUseMobileTaskLayout()) return;

    const setExpanded = (expanded: boolean) => {
      row.toggleClass("qr-mobile-task-expanded", expanded);
      row.toggleClass("qr-mobile-task-collapsed", !expanded);
      toggleEl.setAttr("aria-expanded", String(expanded));
      toggleEl.setAttr("aria-label", `${expanded ? "Collapse" : "Expand"} task details: ${task.text}`);
      if (caret) {
        setIcon(caret, expanded ? "chevron-up" : "chevron-down");
      }
      if (expanded) {
        this.expandedTaskCards.add(task.id);
      } else {
        this.expandedTaskCards.delete(task.id);
      }
    };

    toggleEl.onclick = (event) => {
      if (this.isTaskCardInteractiveTarget(event.target)) return;
      setExpanded(!this.expandedTaskCards.has(task.id));
    };
    toggleEl.onkeydown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (this.isTaskCardInteractiveTarget(event.target)) return;
      event.preventDefault();
      setExpanded(!this.expandedTaskCards.has(task.id));
    };
  }

  private isTaskCardInteractiveTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.closest(
      "button, input, textarea, select, option, a, summary, details, .qr-view-row-actions, .qr-task-context-notes, .qr-view-row-note",
    ) !== null;
  }

  private renderDesktopTaskContextNotes(body: HTMLElement, task: ScrapedTask): void {
    const notes = body.createDiv({ cls: "qr-task-context-notes" });
    const visibleContextNotes = task.contextNotes.slice(0, this.isMainWorkspaceView() ? 5 : 3);
    for (const note of visibleContextNotes) {
      notes.createDiv({ text: note, cls: "qr-task-context-note" });
    }
    if (task.contextNotes.length > visibleContextNotes.length) {
      notes.createDiv({ text: `${task.contextNotes.length - visibleContextNotes.length} more notes`, cls: "qr-task-context-more" });
    }
  }

  private shouldUseMobileTaskLayout(): boolean {
    return shouldUseMobileTaskViewport();
  }

  private hasPendingReminderForTask(task: ScrapedTask): boolean {
    return this.store.hasPendingReminderForSourceTask(task.id);
  }

  private openIgnoreTaskModal(task: ScrapedTask): void {
    this.openManagedTaskModal(task, "ignore", (release) => {
      new IgnoreTaskModal(this.app, task, async (note) => {
        const result = await runTaskIgnoreWorkflow({
          setIgnored: () => this.store.ignoreTask(task.id, note),
          afterSetIgnored: () => this.render(),
          onSetIgnoredError: (error) =>
            console.error("Quick Reminder task ignore failed", error),
          onAfterSetIgnoredError: (error) =>
            console.error("Quick Reminder task ignore refresh failed", error),
        });

        if (!result.ok) {
          new Notice(
            result.changed
              ? getTaskIgnoreRefreshFailedNotice()
              : getTaskIgnoreFailedNotice(),
          );
          return result.changed;
        }

        new Notice(getTaskIgnoredNotice());
        return true;
      }, release).open();
    });
  }

  private openTaskContextNoteEditor(task: ScrapedTask): void {
    const escapeHatch = this.canOpenTasksPluginEditor()
      ? () => {
          void this.editWithTasksPlugin(task);
        }
      : null;
    this.openManagedTaskModal(task, "notes", (release) => {
      new TaskContextNoteModal(
        this.app,
        task,
        async (rawNoteBlock, statusChange) => {
          const result = await runTaskContextNoteWorkflow({
            task,
            changeStatus: statusChange
              ? () => this.taskScanner.setCheckboxStatus(task, statusChange)
              : undefined,
            afterStatusChange: (updated) => this.store.relinkTask(task.id, updated.id),
            saveNotes: (currentTask) =>
              this.taskScanner.replaceTaskContextNoteLines(currentTask, rawNoteBlock),
            afterSave: async (currentTask) => {
              await this.refreshScrapedTasks();
              this.flashTask(currentTask.id);
              await this.render();
            },
            onStatusError: (error) =>
              console.error("Quick Reminder task status update failed", error),
            onAfterStatusError: (error) =>
              console.error("Quick Reminder task status relink failed", error),
            onNotesError: (error) =>
              console.error("Quick Reminder task notes update failed", error),
            onAfterSaveError: (error) =>
              console.error("Quick Reminder task context refresh failed", error),
          });

          if (!result.ok) {
            const notice =
              result.stage === "status"
                ? getTaskStatusUpdateFailedNotice()
                : result.stage === "afterStatus" || result.statusChanged
                  ? result.notesChanged
                    ? getTaskStatusChangedRefreshFailedNotice()
                    : getTaskStatusChangedNotesFailedNotice()
                  : result.stage === "afterSave"
                    ? getTaskContextRefreshFailedNotice()
                    : getTaskNotesUpdateFailedNotice();
            new Notice(notice);
            return result.statusChanged || result.notesChanged;
          }

          if (result.statusChanged && rawNoteBlock.trim() === "") {
            new Notice(getTaskUpdatedNotice());
          } else if (result.statusChanged) {
            new Notice(getTaskAndNotesUpdatedNotice());
          } else {
            new Notice(getTaskNotesSavedNotice(rawNoteBlock.trim() !== ""));
          }
          return true;
        },
        escapeHatch,
        release,
      ).open();
    });
  }

  private openManagedTaskModal(
    task: ScrapedTask,
    action: "delete" | "ignore" | "notes",
    open: (release: () => void) => void,
  ): void {
    runKeyedSingleOpen({
      openKeys: this.openTaskModalKeys,
      key: `${action}:${task.id}`,
      open,
    });
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
            .setTitle("Edit task notes")
            .setIcon("sticky-note")
            .onClick(() => {
              this.openTaskContextNoteEditor(task);
            });
        });

        if (this.canOpenTasksPluginEditor()) {
          menu.addItem((item) => {
            item
              .setTitle("Edit task")
              .setIcon("pencil")
              .onClick(() => {
                void this.editWithTasksPlugin(task);
              });
          });
        }
      }

      if (isIgnored) {
        menu.addItem((item) => {
          item
            .setTitle("Unignore task")
            .setIcon("eye")
            .onClick(() => {
              void this.unignoreTask(task.id);
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
    this.openSingleEntryModal(`capture:${sourceTaskId ?? "manual"}`, (release) => {
      new QuickCaptureModal(
        this.app,
        this.store,
        this.scheduler,
        text,
        sourceTaskId,
        null,
        false,
        release,
      ).open();
    });
  }

  private openNewItemModal(): void {
    this.openSingleEntryModal("new-item", (release) => {
      new NewItemModal(
        this.app,
        () => this.openNewTaskModal(false),
        () => this.openNewTaskModal(true),
        () => this.openProjectPlannerModal(),
        release,
      ).open();
    });
  }

  private openProjectPlannerModal(): void {
    this.openSingleEntryModal("project-planner", (release) => {
      new ProjectPlannerModal(
        this.app,
        (plan, markdown) =>
          this.createProjectFromPlanner(plan, markdown),
        release,
      ).open();
    });
  }

  private openNewTaskModal(withReminder: boolean): void {
    const filePath = this.getTaskCreationFilePath() ?? DEFAULT_CATEGORY_FILE_PATH;
    const key = withReminder ? "new-reminder-task" : "new-task";
    this.openSingleEntryModal(key, (release) => {
      new NewTaskModal(
        this.app,
        withReminder,
        filePath,
        async (request) => {
          return this.createTaskFromInput(
            request.targetFilePath,
            request.rawInput,
            withReminder,
            request.status,
            request.details,
          );
        },
        release,
      ).open();
    });
  }

  private openSingleEntryModal(
    key: string,
    open: (release: () => void) => void,
  ): void {
    runKeyedSingleOpen({
      openKeys: this.openEntryModalKeys,
      key,
      open,
    });
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

  private async createTaskFromInput(
    filePath: string,
    rawInput: string,
    withReminder: boolean,
    status: "todo" | "in-progress" | "completed" = "todo",
    details = "",
  ): Promise<boolean> {
    const parsed = parseReminder(rawInput);
    const taskText = withReminder ? parsed.text : rawInput.trim();
    if (!taskText) {
      new Notice(getTaskCreateTextMissingNotice());
      return false;
    }
    if (withReminder && (!parsed.dueAt || parsed.dueAt <= Date.now())) {
      new Notice(getTaskCreateReminderTimeMissingNotice());
      return false;
    }

    const file = await this.getManagedTaskTargetFile(filePath);
    if (!file) return false;

    const { taskText: plainTaskText, contextNotes: inlineContextNotes } = splitTaskInput(taskText);
    const detailContextNotes = normalizeContextNoteLines(details.split(/\r?\n/));
    const contextNotes = [...inlineContextNotes, ...detailContextNotes];
    const task = await this.taskScanner.appendTask(file.path, plainTaskText, contextNotes);
    if (!task) {
      new Notice(getTaskAppendFailedNotice());
      return false;
    }

    let finalTask = task;
    let statusNotice:
      | ((createdReminder: boolean) => string)
      | null = null;
    if (status !== "todo") {
      const statusResult = await runTaskStatusUpdateWorkflow({
        updateStatus: () => this.taskScanner.setCheckboxStatus(task, status),
        afterUpdate: (updated) => this.store.relinkTask(task.id, updated.id),
        onUpdateError: (error) =>
          console.error("Quick Reminder new task status update failed", error),
        onAfterUpdateError: (error) =>
          console.error("Quick Reminder new task status relink failed", error),
      });
      if (!statusResult.ok) {
        if (statusResult.updated) {
          finalTask = statusResult.task;
          statusNotice = getTaskCreateStatusRefreshFailedNotice;
        } else {
          statusNotice = getTaskCreateStatusFailedNotice;
        }
      } else {
        finalTask = statusResult.task;
      }
    }

    let reminderCreated = false;
    if (withReminder && parsed.dueAt) {
      const reminder: Reminder = {
        id: genReminderId(),
        text: plainTaskText,
        rawInput,
        dueAt: parsed.dueAt,
        createdAt: Date.now(),
        notified: false,
        sourceTaskId: finalTask.id,
      };
      const reminderResult = await saveTaskBackedReminder({
        saveReminder: () => saveScheduledReminder(this.store, this.scheduler, reminder),
        deleteTask: () => this.taskScanner.deleteTaskLine(finalTask),
        onRollbackError: (error) => console.error("Quick Reminder task reminder rollback failed", error),
      });
      if (!reminderResult.ok) {
        await this.refreshScrapedTasks();
        await this.render();
        new Notice(getTaskReminderCreateFailedNotice(reminderResult.rolledBackTask));
        return false;
      }
      reminderCreated = true;
    }

    try {
      await this.refreshScrapedTasks();
      await this.render();
    } catch (error) {
      console.error("Quick Reminder task create refresh failed", error);
      new Notice(getTaskCreateRefreshFailedNotice(reminderCreated));
      return true;
    }

    new Notice(
      statusNotice
        ? statusNotice(reminderCreated)
        : withReminder
          ? "Task and reminder created"
          : "Task created",
    );
    return true;
  }

  private async createProjectFromPlanner(
    plan: ProjectPlan,
    markdown: string,
  ): Promise<boolean> {
    const errors = validateProjectPlan(plan);
    if (errors.length > 0) {
      new Notice(errors[0]);
      return false;
    }

    const path = plan.filePath;
    const result = await runProjectNoteCreateWorkflow({
      targetExists: () => this.app.vault.getAbstractFileByPath(path) !== null,
      createNote: async () => {
        await this.ensureCategoryParentFolders(path);
        return this.app.vault.create(path, markdown);
      },
      afterCreate: async (file) => {
        await this.openProjectNote(file);
        await this.refreshScrapedTasks();
        await this.render();
      },
      onCreateError: (error) =>
        console.error("Quick Reminder project planner create failed", error),
      onAfterCreateError: (error) =>
        console.error("Quick Reminder project planner refresh failed", error),
    });

    if (!result.ok) {
      if ("alreadyExists" in result) {
        new Notice(getProjectTargetExistsNotice(path));
        return false;
      }

      new Notice(
        result.created
          ? getProjectCreateRefreshFailedNotice(path)
          : getProjectCreateFailedNotice(path),
      );
      return result.created;
    }

    new Notice(getProjectCreatedNotice(path));
    return true;
  }

  private async openProjectNote(file: TFile): Promise<void> {
    const leaf = this.getMainMarkdownLeafForFile(file.path) ?? this.getPreferredMainLeaf();
    if (!leaf) return;

    if (!(leaf.view instanceof MarkdownView) || leaf.view.file?.path !== file.path) {
      await leaf.openFile(file, { active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    this.collapseMobileWorkspaceDrawers();
    this.closeDuplicateMainFileLeaves(file, leaf, [0, 100, 300]);
  }

  private async updateTaskStatus(
    task: ScrapedTask,
    status: "todo" | "in-progress" | "completed",
    successMessage: string,
  ): Promise<void> {
    const result = await runTaskStatusUpdateWorkflow({
      updateStatus: () => this.taskScanner.setCheckboxStatus(task, status),
      afterUpdate: async (updated) => {
        await this.store.relinkTask(task.id, updated.id);
        await this.refreshScrapedTasks();
        this.flashTask(updated.id);
        await this.render();
      },
      onUpdateError: (error) =>
        console.error("Quick Reminder task status update failed", error),
      onAfterUpdateError: (error) =>
        console.error("Quick Reminder task status refresh failed", error),
    });

    if (!result.ok) {
      new Notice(
        result.updated
          ? getTaskStatusChangedRefreshFailedNotice()
          : getTaskStatusUpdateFailedNotice(),
      );
      return;
    }

    new Notice(successMessage);
  }

  private async unignoreTask(taskId: string): Promise<void> {
    const result = await runTaskIgnoreWorkflow({
      setIgnored: () => this.store.unignoreTask(taskId),
      afterSetIgnored: () => this.render(),
      onSetIgnoredError: (error) =>
        console.error("Quick Reminder task unignore failed", error),
      onAfterSetIgnoredError: (error) =>
        console.error("Quick Reminder task unignore refresh failed", error),
    });

    if (!result.ok) {
      new Notice(
        result.changed
          ? getTaskUnignoreRefreshFailedNotice()
          : getTaskUnignoreFailedNotice(),
      );
      return;
    }

    new Notice(getTaskUnignoredNotice());
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
    const result = await runTaskSourceOpenWorkflow<TFile, WorkspaceLeaf>({
      getSource: () => {
        const file = this.app.vault.getAbstractFileByPath(task.filePath);
        return file instanceof TFile ? file : null;
      },
      getPane: (file) =>
        this.getMainMarkdownLeafForFile(file.path) ?? this.getPreferredMainLeaf(),
      openPane: async (file, leaf) => {
        const view = leaf.view as { file?: { path?: string } | null };
        if (view.file?.path !== file.path) {
          await leaf.openFile(file, { active: true });
        }
      },
      revealPane: (leaf) => this.app.workspace.revealLeaf(leaf),
      focusPane: (leaf) => {
        this.app.workspace.setActiveLeaf(leaf, { focus: true });
        this.collapseMobileWorkspaceDrawers();
      },
      focusCursor: (file, leaf) => {
        const view = leaf.view as {
          editor?: {
            setCursor: (position: { line: number; ch: number }) => void;
            focus: () => void;
          };
        };
        if (!view.editor) return;
        view.editor.setCursor({ line: task.line - 1, ch: 0 });
        view.editor.focus();
        this.closeDuplicateMainFileLeaves(file, leaf, [0, 100, 300]);
      },
      onError: (stage, error) =>
        console.error(`Quick Reminder task source ${stage} failed`, error),
    });

    if (!result.ok) {
      const notice =
        result.stage === "source"
          ? getTaskSourceMissingNotice()
          : result.stage === "pane"
            ? getTaskSourcePaneMissingNotice()
            : getTaskSourceOpenFailedNotice();
      new Notice(notice);
      return;
    }

    return;
  }

  private collapseMobileWorkspaceDrawers(): void {
    if (!this.shouldUseMobileTaskLayout()) return;
    const workspace = this.app.workspace as App["workspace"] & {
      leftSplit?: { collapse?: () => void };
      rightSplit?: { collapse?: () => void };
    };
    workspace.leftSplit?.collapse?.();
    workspace.rightSplit?.collapse?.();
    window.setTimeout(() => {
      workspace.leftSplit?.collapse?.();
      workspace.rightSplit?.collapse?.();
    }, 80);
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
    return isMainPaneLeaf(leaf);
  }

  private async editWithTasksPlugin(task: ScrapedTask): Promise<void> {
    // Respect the user's "Tasks plugin integration" toggle — without this
    // check the dashboard Edit button still pops Tasks's modal even when
    // the user opted out in settings.
    const api = this.store.settings.tasksIntegrationEnabled
      ? getTasksPluginApi(this.app)
      : null;
    if (!api) {
      new Notice(getTasksPluginUnavailableNotice());
      return;
    }

    const result = await runTaskLineEditWorkflow({
      readTaskLine: () => this.taskScanner.readTaskLine(task),
      editTaskLine: (currentLine) => api.editTaskLineModal(currentLine),
      writeTaskLine: (nextLine) => this.taskScanner.replaceTaskLine(task, nextLine),
      afterWrite: async (updated) => {
        await this.store.relinkTask(task.id, updated.id);
        await this.refreshScrapedTasks();
        this.flashTask(updated.id);
        await this.render();
      },
      onReadError: (error) => console.error("Quick Reminder task line read failed", error),
      onEditError: (error) => console.error("Quick Reminder Tasks edit failed", error),
      onWriteError: (error) => console.error("Quick Reminder task line update failed", error),
      onAfterWriteError: (error) =>
        console.error("Quick Reminder task line refresh failed", error),
    });

    if (!result.ok) {
      const notice =
        result.stage === "read"
          ? getTaskLineReadFailedNotice()
          : result.stage === "edit"
            ? getTaskLineEditFailedNotice()
            : result.stage === "write"
              ? getTaskLineUpdateFailedNotice()
              : getTaskLineUpdateRefreshFailedNotice();
      new Notice(notice);
      return;
    }

    if (!result.changed) return;

    new Notice(getTaskUpdatedNotice());
  }

  private canOpenTasksPluginEditor(): boolean {
    return (
      !shouldUseNativeTaskEditingSurface() &&
      this.store.settings.tasksIntegrationEnabled &&
      getTasksPluginApi(this.app) !== null
    );
  }

  private deleteTask(task: ScrapedTask): void {
    this.openManagedTaskModal(task, "delete", (release) => {
      new DeleteTaskModal(this.app, task, async () => {
        return this.confirmDeleteTask(task);
      }, release).open();
    });
  }

  private async confirmDeleteTask(task: ScrapedTask): Promise<boolean> {
    const result = await runTaskDeleteWorkflow({
      deleteTask: () => this.taskScanner.deleteTaskLine(task),
      afterDelete: async () => {
        await this.store.unignoreTask(task.id);
        await this.refreshScrapedTasks();
        await this.render();
      },
      onDeleteError: (error) => console.error("Quick Reminder task delete failed", error),
      onAfterDeleteError: (error) =>
        console.error("Quick Reminder task delete refresh failed", error),
    });

    if (!result.ok) {
      new Notice(
        result.deleted ? getTaskDeleteRefreshFailedNotice() : getTaskDeleteFailedNotice(),
      );
      return result.deleted;
    }

    new Notice(getTaskDeletedNotice());
    return true;
  }

  private getFilteredScrapedTasks(tasks: ScrapedTask[]): ScrapedTask[] {
    const sourceMatched = tasks.filter((task) => {
      // Previously cancelled tasks were dropped entirely — the user had no
      // way to find or un-cancel them from the dashboard. Show them with
      // their cancelled badge instead; users can toggle status from the row.
      if (this.sourceFilter !== "all" && task.kind !== this.sourceFilter) {
        return false;
      }
      return true;
    });
    return filterTasksByQuery(sourceMatched, this.taskSearch);
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
    return getCurrentFolderScopePath(this.lastMarkdownPath, this.lastFolderPath);
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

    const result = await runDashboardOpenWorkflow({
      open: () => openMainViewLeaf(this.app.workspace, VIEW_TYPE_REMINDER),
      refresh: (managerLeaf) => {
        if (managerLeaf.view instanceof ReminderView) {
          managerLeaf.view.showActiveFile(file.path, file.parent?.path ?? "");
        }
        this.closeMainManagerLeaves(managerLeaf);
      },
      onOpenError: (error) =>
        console.error("Quick Reminder dashboard open failed", error),
      onRefreshError: (error) =>
        console.error("Quick Reminder dashboard refresh failed", error),
    });
    if (!result.ok) {
      new Notice(
        result.opened
          ? getDashboardRefreshFailedNotice("dashboard")
          : getDashboardOpenFailedNotice("dashboard"),
      );
    }
  }

  private async openVaultDashboard(): Promise<void> {
    const state = {
      ...this.getViewState(),
      taskScope: "vault" as TaskDashboardScope,
      selectedFolderPath: null,
    };

    const result = await runDashboardOpenWorkflow({
      open: async () => {
        // Reuses the active note's leaf rather than splitting the workspace.
        // Splitting was producing the side-by-side panes the user pushed back on.
        const leaf = findOrReuseMainPaneLeaf(this.app.workspace, VIEW_TYPE_REMINDER);
        if (leaf.view.getViewType() !== VIEW_TYPE_REMINDER) {
          await leaf.setViewState({ type: VIEW_TYPE_REMINDER, active: true });
        }
        await this.app.workspace.revealLeaf(leaf);
        collapseRightSidebar(this.app.workspace);
        return leaf;
      },
      refresh: async (leaf) => {
        if (leaf.view instanceof ReminderView) {
          leaf.view.applyViewState(state);
          await leaf.view.render(true);
        }
        this.closeMainManagerLeaves(leaf);
      },
      onOpenError: (error) =>
        console.error("Quick Reminder vault dashboard open failed", error),
      onRefreshError: (error) =>
        console.error("Quick Reminder vault dashboard refresh failed", error),
    });
    if (!result.ok) {
      new Notice(
        result.opened
          ? getDashboardRefreshFailedNotice("dashboard")
          : getDashboardOpenFailedNotice("dashboard"),
      );
    }
  }

  private getDashboardSourceFile(): TFile | null {
    // Need the leaf to gate on getMainMarkdownLeaf before reading the view,
    // since we only accept files from leaves in the main split.
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

    const result = await runDashboardOpenWorkflow({
      open: async () => {
        const leaf = await this.openSidebarLeaf();
        if (!leaf) return null;
        if (isRightSidebarLeaf(leaf)) expandRightSidebar(this.app.workspace);
        await this.app.workspace.revealLeaf(leaf);
        return leaf;
      },
      refresh: async (leaf) => {
        if (leaf.view instanceof ReminderView) {
          leaf.view.applyViewState(state);
          await leaf.view.render(true);
        }
        this.closeOtherManagerLeaves(leaf);
      },
      onOpenError: (error) =>
        console.error("Quick Reminder sidebar open failed", error),
      onRefreshError: (error) =>
        console.error("Quick Reminder sidebar refresh failed", error),
    });
    if (!result.ok) {
      new Notice(
        result.opened
          ? getDashboardRefreshFailedNotice("sidebar")
          : getDashboardOpenFailedNotice("sidebar"),
      );
    }
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

  private dashboardStateDebounceHandle: number | null = null;

  private persistDashboardState(): void {
    // Debounce: scope/sort/search changes fire on every keystroke and select
    // change. Each persist writes data.json AND mirrors to the markdown file,
    // which used to amplify into a write-per-keystroke storm under default
    // settings.
    if (this.dashboardStateDebounceHandle !== null) {
      window.clearTimeout(this.dashboardStateDebounceHandle);
    }
    this.dashboardStateDebounceHandle = window.setTimeout(() => {
      this.dashboardStateDebounceHandle = null;
      void this.store.updateSettings({
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
    }, 300);
  }

  private getExistingMainLeaf(): WorkspaceLeaf | null {
    return this.app.workspace
      .getLeavesOfType(VIEW_TYPE_REMINDER)
      .find(isMainPaneLeaf) ?? null;
  }

  private getPreferredMainLeaf(): WorkspaceLeaf | null {
    // Workspace placement helper, needs the leaf, not a view.
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
    if (!isMainPaneLeaf(leaf)) return null;
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
      if (isMainPaneLeaf(leaf)) {
        result = leaf;
      }
    });
    return result;
  }

  private getExistingSidebarLeaf(): WorkspaceLeaf | null {
    return this.app.workspace
      .getLeavesOfType(VIEW_TYPE_REMINDER)
      .find(isSidebarLeaf) ?? null;
  }

  private closeMainManagerLeaves(keepLeaf: WorkspaceLeaf): void {
    window.setTimeout(() => {
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_REMINDER)) {
        if (leaf === keepLeaf) continue;
        if (isSidebarLeaf(leaf)) continue;
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
    return openSidebarViewLeaf(this.app.workspace, VIEW_TYPE_REMINDER, true);
  }

  private isMainWorkspaceView(): boolean {
    return !isSidebarContainer(this.containerEl);
  }
}

/**
 * F06 incremental refresh: produce the cached task list after re-scanning the
 * given files and removing deleted ones, WITHOUT re-scanning the whole vault.
 *
 * Behavior-preserving by construction: every task is dropped if its filePath is
 * in `removePaths` or `rescanned` (the old copies of re-scanned files), then the
 * fresh tasks are concatenated and the whole array is re-sorted with the exact
 * comparator scan() uses (taskScanner.ts:34). Because (filePath, line) is unique
 * per task, that comparator is a strict total order, so the result is identical
 * to a full scan() over the same vault state regardless of insertion order.
 *
 * Exported for unit testing the splice independently of the Obsidian view.
 */
export function spliceScrapedTasks(
  cached: ScrapedTask[],
  rescanned: Map<string, ScrapedTask[]>,
  removePaths: Set<string>,
): ScrapedTask[] {
  const replaced = (path: string): boolean =>
    removePaths.has(path) || rescanned.has(path);
  const next = cached.filter((task) => !replaced(task.filePath));
  for (const tasks of rescanned.values()) {
    next.push(...tasks);
  }
  return next.sort(
    (a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line,
  );
}
