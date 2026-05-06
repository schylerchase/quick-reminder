# Phase 14 — Health Page

**Prerequisites:** Phase 0 (settings tabs), Phase 13 (lastScanReport).

**Goal:** One-screen vault diagnostic. Tab in settings + toolbar button.

**Files:** Create `src/healthPage.ts`, modify `src/main.ts` (5th settings tab), `src/view.ts` (toolbar button), `src/taskScanner.ts` (capture report).

---

### Task 1: lastScanReport on TaskScanner

- [ ] **Step 1:** Update `scan()` to record:

```typescript
export interface ScanReport {
  startedAt: number;
  durationMs: number;
  scannedFiles: number;
  totalTasks: number;
  failures: number;
  parseErrors: { file: string; line: number; reason: string }[];
}

private _lastScanReport: ScanReport | null = null;
get lastScanReport(): ScanReport | null { return this._lastScanReport; }
```

In `scan()`:

```typescript
async scan(ignoredPaths: string[] = []): Promise<ScrapedTask[]> {
  const start = performance.now();
  const startedAt = Date.now();
  const ignored = new Set(ignoredPaths.map(normalizePath));
  const files = this.app.vault.getMarkdownFiles().filter((f) => !ignored.has(normalizePath(f.path)));
  let failures = 0;
  const parseErrors: ScanReport["parseErrors"] = [];

  const results = await Promise.all(files.map(async (file) => {
    try {
      return await this.scanFile(file);
    } catch (e) {
      failures++;
      parseErrors.push({ file: file.path, line: 0, reason: e instanceof Error ? e.message : String(e) });
      return [];
    }
  }));

  const tasks = results.flat().sort((a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line);
  this._lastScanReport = {
    startedAt,
    durationMs: performance.now() - start,
    scannedFiles: files.length,
    totalTasks: tasks.length,
    failures,
    parseErrors,
  };
  return tasks;
}
```

- [ ] **Step 2:** Commit `feat: TaskScanner lastScanReport with timing and failures`.

---

### Task 2: Health page renderer

- [ ] **Step 1:** Create `src/healthPage.ts`:

```typescript
import type QuickReminderPlugin from "./main";

export function renderHealth(parent: HTMLElement, plugin: QuickReminderPlugin): void {
  parent.empty();
  parent.createEl("h3", { text: "Health" });

  const report = plugin.taskScanner.lastScanReport;
  const stats = parent.createDiv();
  stats.createEl("p", { text: `Last scan: ${report ? new Date(report.startedAt).toLocaleString() : "never"}` });
  if (report) {
    stats.createEl("p", { text: `Duration: ${report.durationMs.toFixed(0)}ms` });
    stats.createEl("p", { text: `Scanned ${report.scannedFiles} files, found ${report.totalTasks} tasks` });
    stats.createEl("p", { text: `Failures: ${report.failures}` });
  }

  const counts = plugin.store.all.length;
  parent.createEl("p", { text: `Reminders: ${counts}` });
  parent.createEl("p", { text: `Ignored: ${plugin.store.ignoredTaskIds.size}` });
  parent.createEl("p", { text: `Tasks plugin: ${plugin.getTasksPluginStatus()}` });

  const settings = plugin.store.settings;
  const settingsBox = parent.createEl("pre");
  settingsBox.style.fontSize = "0.85em";
  settingsBox.setText(JSON.stringify(settings, null, 2));

  const copyBtn = parent.createEl("button", { text: "Copy diagnostics" });
  copyBtn.onclick = async () => {
    const blob = {
      version: plugin.manifest.version,
      report,
      remindersCount: counts,
      ignoredCount: plugin.store.ignoredTaskIds.size,
      settings,
    };
    await navigator.clipboard.writeText(JSON.stringify(blob, null, 2));
  };
}
```

- [ ] **Step 2:** Commit `feat: health page renderer`.

---

### Task 3: Wire into 5th settings tab + toolbar

- [ ] **Step 1:** Add `"health"` to `activeTab` union. Render via `renderHealth(parent, this.plugin)`.

- [ ] **Step 2:** Toolbar button in `view.ts`:

```typescript
const healthBtn = headerActions.createEl("button", { text: "Health", cls: "qr-view-secondary-btn" });
healthBtn.onclick = () => {
  const modal = new Modal(this.app);
  modal.onOpen = () => renderHealth(modal.contentEl, this.app.plugins.plugins["quick-reminder"] as QuickReminderPlugin);
  modal.open();
};
```

(Adjust the plugin lookup to whatever the plugin id is in manifest.json.)

- [ ] **Step 3:** Commit `feat: health tab + toolbar button`.

---

### Task 4: Version + CHANGELOG + README

- [ ] **Step 1:** Bump patch.
- [ ] **Step 2:** CHANGELOG.
- [ ] **Step 3:** README mentions Health page for diagnostics.
- [ ] **Step 4:** Commit.

## Verification

- [ ] Manual: counts match dashboard.
- [ ] Manual: copy diagnostics produces valid JSON.
- [ ] Manual: failures count > 0 when a file is unreadable.
