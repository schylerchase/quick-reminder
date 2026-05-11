import { App, TFile, normalizePath } from "obsidian";
import {
  DEFAULT_MIRROR_FILE_PATH,
  DEFAULT_SETTINGS,
  LEGACY_MIRROR_FILE_PATH,
  PluginData,
  REMINDER_CONFIG_DIR,
  Reminder,
  ScrapedTask,
  Settings,
} from "./types";

export class ReminderStore {
  private data: PluginData;
  private listeners: Set<() => void> = new Set();

  constructor(
    private app: App,
    private load: () => Promise<PluginData | null>,
    private save: (data: PluginData) => Promise<void>,
  ) {
    this.data = { reminders: [], ignoredTaskIds: [], ignoredTaskNotes: {}, settings: { ...DEFAULT_SETTINGS } };
  }

  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  offChange(fn: () => void): void {
    this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch (e) {
        console.error("reminder listener failed", e);
      }
    }
  }

  async init(): Promise<void> {
    const loaded = await this.load();
    if (loaded) {
      this.data = {
        reminders: loaded.reminders ?? [],
        ignoredTaskIds: loaded.ignoredTaskIds ?? [],
        ignoredTaskNotes: loaded.ignoredTaskNotes ?? {},
        settings: { ...DEFAULT_SETTINGS, ...(loaded.settings ?? {}) },
      };
    }
    try {
      const changed = await this.migrateConfigFiles();
      if (changed) {
        await this.save(this.data);
      }
      if (this.data.settings.mirrorToMarkdown) {
        await this.mirrorToMarkdown();
      }
    } catch (error) {
      console.warn("Quick Reminder config migration skipped", error);
    }
  }

  get settings(): Settings {
    return this.data.settings;
  }

  get all(): Reminder[] {
    return [...this.data.reminders].sort((a, b) => a.dueAt - b.dueAt);
  }

  get pending(): Reminder[] {
    return this.all.filter((r) => !r.notified);
  }

  get ignoredTaskIds(): Set<string> {
    return new Set(this.data.ignoredTaskIds ?? []);
  }

  get ignoredTaskNotes(): Readonly<Record<string, string>> {
    return this.data.ignoredTaskNotes ?? {};
  }

  async add(reminder: Reminder): Promise<void> {
    this.data.reminders.push(reminder);
    await this.persist();
  }

  async markNotified(id: string): Promise<void> {
    const r = this.data.reminders.find((x) => x.id === id);
    if (!r) return;
    r.notified = true;
    r.notifiedAt = Date.now();
    await this.persist();
  }

  async complete(id: string): Promise<void> {
    const r = this.data.reminders.find((x) => x.id === id);
    if (!r) return;
    r.notified = true;
    r.completedAt = Date.now();
    await this.persist();
  }

  async restore(id: string): Promise<void> {
    const r = this.data.reminders.find((x) => x.id === id);
    if (!r) return;
    r.notified = false;
    delete r.notifiedAt;
    delete r.completedAt;
    await this.persist();
  }

  async updateReminder(id: string, text: string, dueAt: number): Promise<void> {
    const r = this.data.reminders.find((x) => x.id === id);
    if (!r) return;
    r.text = text;
    r.rawInput = `${text} ${new Date(dueAt).toLocaleString()}`;
    r.dueAt = dueAt;
    r.notified = false;
    delete r.notifiedAt;
    delete r.completedAt;
    await this.persist();
  }

  async snooze(id: string, minutes: number): Promise<void> {
    const r = this.data.reminders.find((x) => x.id === id);
    if (!r) return;
    r.snoozedFrom = r.dueAt;
    r.dueAt = Date.now() + minutes * 60_000;
    r.notified = false;
    delete r.notifiedAt;
    delete r.completedAt;
    await this.persist();
  }
  async remove(id: string): Promise<void> {
    this.data.reminders = this.data.reminders.filter((r) => r.id !== id);
    await this.persist();
  }

  async ignoreTask(id: string, note = ""): Promise<void> {
    if (!this.data.ignoredTaskIds.includes(id)) {
      this.data.ignoredTaskIds.push(id);
    }
    this.data.ignoredTaskNotes = this.data.ignoredTaskNotes ?? {};
    const trimmedNote = note.trim();
    if (trimmedNote) {
      this.data.ignoredTaskNotes[id] = trimmedNote;
    } else {
      delete this.data.ignoredTaskNotes[id];
    }
    await this.persist();
  }

  async unignoreTask(id: string): Promise<void> {
    this.data.ignoredTaskIds = this.data.ignoredTaskIds.filter((taskId) => taskId !== id);
    if (this.data.ignoredTaskNotes) {
      delete this.data.ignoredTaskNotes[id];
    }
    await this.persist();
  }

  async relinkTask(oldId: string, newId: string): Promise<void> {
    if (oldId === newId) return;

    for (const reminder of this.data.reminders) {
      if (reminder.sourceTaskId === oldId) {
        reminder.sourceTaskId = newId;
      }
    }

    const ignoredIndex = this.data.ignoredTaskIds.indexOf(oldId);
    if (ignoredIndex !== -1) {
      this.data.ignoredTaskIds[ignoredIndex] = newId;
    }

    if (this.data.ignoredTaskNotes?.[oldId] !== undefined) {
      this.data.ignoredTaskNotes[newId] = this.data.ignoredTaskNotes[oldId];
      delete this.data.ignoredTaskNotes[oldId];
    }

    await this.persist();
  }

  async relinkTaskReferences(tasks: ScrapedTask[]): Promise<void> {
    let changed = false;
    const taskIds = new Set(tasks.map((task) => task.id));
    const legacyIdMap = new Map<string, string>();
    for (const task of tasks) {
      for (const legacyId of task.legacyIds) {
        legacyIdMap.set(legacyId, task.id);
      }
    }

    for (const reminder of this.data.reminders) {
      if (!reminder.sourceTaskId || taskIds.has(reminder.sourceTaskId)) continue;
      const nextTaskId = legacyIdMap.get(reminder.sourceTaskId) ?? findLegacyReminderTask(reminder, tasks)?.id;
      if (!nextTaskId || nextTaskId === reminder.sourceTaskId) continue;
      reminder.sourceTaskId = nextTaskId;
      changed = true;
    }

    for (let index = 0; index < this.data.ignoredTaskIds.length; index += 1) {
      const taskId = this.data.ignoredTaskIds[index];
      if (taskIds.has(taskId)) continue;
      const nextTaskId = legacyIdMap.get(taskId);
      if (!nextTaskId || nextTaskId === taskId) continue;
      this.data.ignoredTaskIds[index] = nextTaskId;
      if (this.data.ignoredTaskNotes?.[taskId] !== undefined) {
        this.data.ignoredTaskNotes[nextTaskId] = this.data.ignoredTaskNotes[taskId];
        delete this.data.ignoredTaskNotes[taskId];
      }
      changed = true;
    }

    if (changed) {
      await this.persist();
    }
  }

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    this.data.settings = { ...this.data.settings, ...patch };
    await this.persist();
  }

  private async persist(): Promise<void> {
    await this.save(this.data);
    if (this.data.settings.mirrorToMarkdown) {
      await this.mirrorToMarkdown().catch((e) => console.error("mirror failed", e));
    }
    this.notify();
  }

  private async mirrorToMarkdown(): Promise<void> {
    const path = normalizePath(this.data.settings.mirrorFilePath);
    const body = this.renderMarkdown();
    await this.ensureConfigFolder(path).catch((error) => {
      console.warn("Quick Reminder could not create config folder", error);
    });
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, body);
    } else {
      await this.app.vault.create(path, body);
    }
  }

  private async migrateConfigFiles(): Promise<boolean> {
    let changed = false;
    const currentPath = normalizePath(this.data.settings.mirrorFilePath || "");
    const legacyPath = normalizePath(LEGACY_MIRROR_FILE_PATH);
    const defaultPath = normalizePath(DEFAULT_MIRROR_FILE_PATH);
    const usesDefaultMirror = !currentPath || currentPath === legacyPath || currentPath === defaultPath;

    if (!currentPath || currentPath === legacyPath) {
      this.data.settings.mirrorFilePath = defaultPath;
      changed = true;
    }

    await this.ensureConfigFolder(defaultPath);

    const legacyFile = this.app.vault.getAbstractFileByPath(legacyPath);
    const targetFile = this.app.vault.getAbstractFileByPath(defaultPath);
    if (usesDefaultMirror && legacyFile instanceof TFile && !(targetFile instanceof TFile)) {
      await this.moveLegacyMirrorFile(legacyFile, defaultPath);
    } else if (usesDefaultMirror && legacyFile instanceof TFile && targetFile instanceof TFile) {
      await this.removeGeneratedLegacyMirror(legacyFile);
    }

    return changed;
  }

  private async moveLegacyMirrorFile(legacyFile: TFile, targetPath: string): Promise<void> {
    try {
      await this.app.vault.rename(legacyFile, targetPath);
      return;
    } catch (error) {
      console.warn("Quick Reminder could not rename legacy Reminders.md; copying instead", error);
    }

    const body = await this.app.vault.read(legacyFile);
    const existing = this.app.vault.getAbstractFileByPath(targetPath);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, body);
    } else {
      await this.app.vault.create(targetPath, body);
    }
    await this.removeGeneratedLegacyMirror(legacyFile);
  }

  private async removeGeneratedLegacyMirror(legacyFile: TFile): Promise<void> {
    const body = await this.app.vault.read(legacyFile);
    if (!body.includes("_Auto-generated by Quick Reminder plugin. Do not edit directly._")) {
      return;
    }
    await this.app.vault.trash(legacyFile, true).catch(async () => {
      await this.app.vault.delete(legacyFile);
    });
  }

  private async ensureConfigFolder(path: string): Promise<void> {
    const normalizedPath = normalizePath(path);
    if (!normalizedPath.startsWith(`${REMINDER_CONFIG_DIR}/`)) {
      return;
    }
    const existing = this.app.vault.getAbstractFileByPath(REMINDER_CONFIG_DIR);
    if (existing) {
      return;
    }
    await this.app.vault.createFolder(REMINDER_CONFIG_DIR);
  }

  private renderMarkdown(): string {
    const lines: string[] = ["# Reminders", "", "_Auto-generated by Quick Reminder plugin. Do not edit directly._", ""];
    const pending = this.pending;
    const done = this.all.filter((r) => r.notified);

    lines.push("## Pending", "");
    if (pending.length === 0) {
      lines.push("_None._", "");
    } else {
      for (const r of pending) {
        lines.push(`- [ ] ${r.text} - **${formatDate(r.dueAt)}**`);
      }
      lines.push("");
    }

    lines.push("## Notified", "");
    if (done.length === 0) {
      lines.push("_None._", "");
    } else {
      for (const r of done.slice(-20).reverse()) {
        const marker = r.completedAt ? "x" : " ";
        lines.push(`- [${marker}] ${r.text} - ${formatDate(r.dueAt)}`);
      }
    }

    return lines.join("\n");
  }
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function findLegacyReminderTask(reminder: Reminder, tasks: ScrapedTask[]): ScrapedTask | null {
  if (!reminder.sourceTaskId) return null;
  const legacy = parseLegacyTaskId(reminder.sourceTaskId);
  if (!legacy) return null;
  const reminderText = normalizeIdentityText(reminder.text);
  return tasks.find((task) => {
    if (task.filePath !== legacy.filePath) return false;
    const taskText = normalizeIdentityText(task.text);
    const legacyText = normalizeIdentityText(legacy.text ?? "");
    return (reminderText !== "" && taskText.includes(reminderText))
      || (legacyText !== "" && taskText.includes(legacyText));
  }) ?? null;
}

function parseLegacyTaskId(id: string): { filePath: string; text: string | null } | null {
  const match = id.match(/^(?<filePath>.+):(?<line>\d+):(?<kind>checkbox|TODO|FIXME|TASK)(?::(?<text>.*))?$/);
  return match?.groups ? { filePath: match.groups.filePath, text: match.groups.text ?? null } : null;
}

function normalizeIdentityText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
