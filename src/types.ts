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
  text: string;
  filePath: string;
  line: number;
  kind: "checkbox" | "marker";
  completed: boolean;
  marker?: string;
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
};
