# Phase 15 — Archive vs Hard Delete

**Prerequisites:** Phase 13 (schema-2 ignoredTaskNotes with `archivedAt`).

**Goal:** Replace red `Delete` button on non-completed rows with `Archive`. Hard delete via context menu only with confirm modal showing line content. Phase 10 keybind `Delete` → archive, `Shift+Delete` → hard delete.

**Files:** `src/types.ts` (extend `IgnoredEntry` with `archived: boolean`), `src/store.ts` (archive method), `src/view.ts:520` (replace button + context menu), `src/keyboardController.ts` (already supports archive vs delete-hard).

---

### Task 1: archive method on store

- [ ] **Step 1:** Add to `src/types.ts`:

```typescript
export interface IgnoredEntry {
  text: string;
  note: string;
  archivedAt?: number; // present when archived (vs user-ignored)
}
```

- [ ] **Step 2:** `ReminderStore.archiveTask`:

```typescript
async archiveTask(id: string, text: string): Promise<void> {
  if (!this.data.ignoredTaskIds.includes(id)) this.data.ignoredTaskIds.push(id);
  this.data.ignoredTaskNotes.entries[id] = {
    text,
    note: "archived",
    archivedAt: Date.now(),
  };
  await this.persist();
}

async unarchiveTask(id: string): Promise<void> {
  await this.unignoreTask(id); // delegates to existing
}
```

- [ ] **Step 3:** Tests: archive sets archivedAt, unarchive removes entry.

- [ ] **Step 4:** Commit `feat: archive/unarchive methods on store`.

---

### Task 2: Replace Delete button with Archive

- [ ] **Step 1:** In `renderScrapedRow` (`view.ts:520`), the existing `Delete` button on non-completed rows becomes `Archive`:

```typescript
actions.createEl("button", { text: "Archive", cls: "qr-row-btn qr-archive-btn" }).onclick = async () => {
  await this.store.archiveTask(task.id, task.text);
  await this.render();
  new Notice("Task archived");
};
```

- [ ] **Step 2:** Hard delete moves to context menu. Update `addScrapedRowContextMenu`:

```typescript
menu.addItem((item) => {
  item.setTitle("Hard delete (remove from source)").setIcon("trash-2").onClick(() => {
    void this.confirmHardDelete(task);
  });
});
```

- [ ] **Step 3:** Confirm modal:

```typescript
private async confirmHardDelete(task: ScrapedTask): Promise<void> {
  if (!this.store.settings.deleteRequiresConfirm) {
    return this.deleteTask(task);
  }
  const ok = confirm(`Delete this line from ${task.filePath}?\n\n${task.text}`);
  if (ok) await this.deleteTask(task);
}
```

- [ ] **Step 4:** Setting `deleteRequiresConfirm: boolean` (default true) on Safety tab.

- [ ] **Step 5:** Commit `feat: archive replaces delete; hard delete via context menu`.

---

### Task 3: Ignored section shows archived separately

- [ ] **Step 1:** In `renderScrapedSection` for "Ignored", split into "Ignored" and "Archived" by checking `archivedAt`. Reuse the same row renderer but with a different badge.

- [ ] **Step 2:** Commit `feat: separate Archived from Ignored in dashboard`.

---

### Task 4: Phase 10 keybind alignment

- [ ] **Step 1:** No code change here — Phase 10's `resolveKeyAction` already returns `"archive"` for Delete and `"delete-hard"` for Shift+Delete. Wire `dispatchKeyAction` to call `archiveTask` and `confirmHardDelete` respectively.

- [ ] **Step 2:** Commit `feat: keyboard archive/delete-hard dispatch`.

---

### Task 5: Bulk Archive (Phase 11 update)

- [ ] **Step 1:** Phase 11 already lists `archive` as a bulk action. Ensure `bulkApply` for `action === "archive"` calls `store.archiveTask(task.id, task.text)` per task. Sequential per-file ordering still applies.

- [ ] **Step 2:** Commit `feat: bulk archive`.

---

### Task 6: Version + CHANGELOG + README

- [ ] **Step 1:** Bump patch.
- [ ] **Step 2:** CHANGELOG.
- [ ] **Step 3:** README: archive vs delete semantics, Shift+Delete keybind.
- [ ] **Step 4:** Commit.

## Verification

- [ ] Tests: archive sets archivedAt.
- [ ] Manual: Archive button moves task to Ignored/Archived list.
- [ ] Manual: Hard delete via context menu shows line content in confirm.
- [ ] Manual: keyboard Delete archives, Shift+Delete hard-deletes.
- [ ] Manual: bulk archive works.
