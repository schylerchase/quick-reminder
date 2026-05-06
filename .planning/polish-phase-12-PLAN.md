# Phase 12 — Stale Task Detection

**Prerequisites:** Phase 6 (chips render).

**Goal:** Flag tasks whose source file hasn't been modified in N days. Mtime read at render time (live), not scan time.

**Files:** `src/types.ts` (setting), `src/main.ts` (Display tab), `src/view.ts` (chip + filter).

---

### Task 1: Setting

- [ ] **Step 1:** Add `staleTaskDays: number` (default 14) to `Settings`.

- [ ] **Step 2:** Display tab UI:

```typescript
new Setting(parent)
  .setName("Stale task threshold (days)")
  .setDesc("Tasks in files unmodified for this many days get a Stale chip. File-level, not task-level.")
  .addText((t) => t.setValue(String(this.plugin.store.settings.staleTaskDays)).onChange(async (v) => {
    const n = parseInt(v, 10);
    if (!Number.isNaN(n) && n > 0) await this.plugin.store.updateSettings({ staleTaskDays: n });
  }));
```

- [ ] **Step 3:** Commit `feat: staleTaskDays setting`.

---

### Task 2: Render-time stale chip

- [ ] **Step 1:** In `renderScrapedRow` (`view.ts:520`), after priority/due chips:

```typescript
const file = this.app.vault.getAbstractFileByPath(task.filePath);
if (file instanceof TFile && !task.completed) {
  const ageMs = Date.now() - file.stat.mtime;
  const thresholdMs = this.store.settings.staleTaskDays * 24 * 60 * 60 * 1000;
  if (ageMs > thresholdMs) {
    const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    badges.createSpan({
      text: "Stale",
      cls: "qr-task-badge qr-task-badge--stale",
      attr: { title: `File last modified ${days} days ago. Staleness is file-level, not task-level.` },
    });
  }
}
```

CSS:

```css
.qr-task-badge--stale { background: var(--background-modifier-error-hover, #fef3c7); color: var(--text-warning, #92400e); }
```

- [ ] **Step 2:** Commit `feat: render-time stale chip with file-level mtime`.

---

### Task 3: Stale-only filter

- [ ] **Step 1:** Extend due-filter dropdown with `Stale only` option. Filter logic:

```typescript
if (this.dueFilter === "stale") {
  result = result.filter((t) => {
    const file = this.app.vault.getAbstractFileByPath(t.filePath);
    if (!(file instanceof TFile)) return false;
    return Date.now() - file.stat.mtime > this.store.settings.staleTaskDays * 86400000;
  });
}
```

- [ ] **Step 2:** Commit `feat: stale-only filter option`.

---

### Task 4: Version + CHANGELOG + README

- [ ] **Step 1:** Bump patch.
- [ ] **Step 2:** CHANGELOG: "Phase 12: stale task detection."
- [ ] **Step 3:** README: explicitly note staleness is file-level.
- [ ] **Step 4:** Commit.

## Verification

- [ ] Manual: untouched-90-days note → tasks show Stale chip.
- [ ] Manual: tooltip wording is honest about file-level.
- [ ] Manual: stale filter hides non-stale tasks.
