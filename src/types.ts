export const REMINDER_CONFIG_DIR = ".reminder-config";
export const DEFAULT_MIRROR_FILE_PATH = `${REMINDER_CONFIG_DIR}/Reminders.md`;
export const LEGACY_MIRROR_FILE_PATH = "Reminders.md";

export interface Reminder {
  id: string;
  text: string;
  rawInput: string;
  dueAt: number;
  createdAt: number;
  notified: boolean;
  completedAt?: number;
  snoozedFrom?: number;
  sourceTaskId?: string;
}

export interface ScrapedTask {
  id: string;
  legacyIds: string[];
  text: string;
  contextNotes: string[];
  contextNoteLines: string[];
  filePath: string;
  line: number;
  kind: "checkbox" | "marker";
  status: "todo" | "in-progress" | "completed" | "cancelled" | "marker";
  completed: boolean;
  category: string;
  project: string;
  marker?: string;
}

export type TaskDashboardScope = "active" | "folder" | "vault";
export type TaskDashboardSort = "page" | "priority";
export type TaskDashboardSourceFilter = "all" | "checkbox" | "marker";

export interface TaskDashboardState {
  scope: TaskDashboardScope;
  selectedFolderPath: string | null;
  lastMarkdownPath: string | null;
  lastFolderPath: string | null;
  sourceFilter: TaskDashboardSourceFilter;
  sort: TaskDashboardSort;
  search: string;
}

export interface PluginData {
  reminders: Reminder[];
  ignoredTaskIds: string[];
  ignoredTaskNotes?: Record<string, string>;
  settings: Settings;
}

export interface Settings {
  mirrorToMarkdown: boolean;
  mirrorFilePath: string;
  defaultSnoozeMinutes: number;
  fireMissedOnLaunch: boolean;
  soundOnNotify: boolean;
  checkForUpdatesOnLaunch: boolean;
  autoRevealActiveFile: boolean;
  tasksIntegrationEnabled: boolean;
  taskSectionHeadings: string[];
  autoInsertTaskSections: boolean;
  taskSectionAutoInsertFolders: string[];
  taskDashboardState: TaskDashboardState;
}

export const DEFAULT_SETTINGS: Settings = {
  mirrorToMarkdown: true,
  mirrorFilePath: DEFAULT_MIRROR_FILE_PATH,
  defaultSnoozeMinutes: 10,
  fireMissedOnLaunch: true,
  soundOnNotify: true,
  checkForUpdatesOnLaunch: true,
  autoRevealActiveFile: true,
  tasksIntegrationEnabled: true,
  taskSectionHeadings: ["In Progress", "To Do", "Completed"],
  autoInsertTaskSections: false,
  taskSectionAutoInsertFolders: [],
  taskDashboardState: {
    scope: "vault",
    selectedFolderPath: null,
    lastMarkdownPath: null,
    lastFolderPath: null,
    sourceFilter: "all",
    sort: "page",
    search: "",
  },
};
