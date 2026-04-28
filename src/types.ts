export interface Reminder {
  id: string;
  text: string;
  rawInput: string;
  dueAt: number;
  createdAt: number;
  notified: boolean;
  snoozedFrom?: number;
}

export interface PluginData {
  reminders: Reminder[];
  settings: Settings;
}

export interface Settings {
  mirrorToMarkdown: boolean;
  mirrorFilePath: string;
  defaultSnoozeMinutes: number;
  fireMissedOnLaunch: boolean;
  soundOnNotify: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mirrorToMarkdown: true,
  mirrorFilePath: "Reminders.md",
  defaultSnoozeMinutes: 10,
  fireMissedOnLaunch: true,
  soundOnNotify: true,
};
