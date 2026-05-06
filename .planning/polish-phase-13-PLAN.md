# Phase 13 — Auto-clean Orphaned Reminders + Ignored

**Prerequisites:** Phase 0.

**Goal:** Detect and clean ignored task IDs / reminder source IDs whose source files no longer exist. Subscribe to `vault.on('rename')` so file moves don't generate false orphans. Schema-2 `ignoredTaskNotes` with task text snapshot.

**Files:** `src/types.ts` (`PluginData` schema-2), `src/store.ts` (CRUD + migration + rename handler), `src/main.ts` (vault.on('rename') subscription), `src/orphansModal.ts`, `tests/store-rename.test.ts`, `tests/store-orphans.test.ts`.

---

### Task 1: Schema-2 ignoredTaskNotes

- [ ] **Step 1:** Failing test:

```typescript
import { migrateIgnoredNotes } from "../src/store";

describe("migrateIgnoredNotes", () => {
  it("wraps legacy string map", () => {
    const legacy = { "f.md:1:checkbox": "old plain note" };
    const m = migrateIgnoredNotes(legacy);
    expect(m.schema).toBe(2);
    expect(m.entries["f.md:1:checkbox"]).toEqual({ text: "", note: "old plain note" });
  });
  it("preserves schema-2 input", () => {
    const v2 = { schema: 2, entries: { "x:1:checkbox": { text: "Buy milk", note: "x", archivedAt: 1700000000 } } };
    expect(migrateIgnoredNotes(v2)).toEqual(v2);
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3:** Implement in `src/types.ts`:

```typescript
export interface IgnoredEntry {
  text: string;
  note: string;
  archivedAt?: number;
}
export interface IgnoredNotesV2 {
  schema: 2;
  entries: Record<string, IgnoredEntry>;
}
export type IgnoredNotesPersisted = Record<string, string> | IgnoredNotesV2;
```

In `src/store.ts`:

```typescript
export function migrateIgnoredNotes(input: IgnoredNotesPersisted | undefined): IgnoredNotesV2 {
  if (!input) return { schema: 2, entries: {} };
  if ((input as IgnoredNotesV2).schema === 2) return input as IgnoredNotesV2;
  const entries: Record<string, IgnoredEntry> = {};
  for (const [id, note] of Object.entries(input as Record<string, string>)) {
    entries[id] = { text: "", note };
  }
  return { schema: 2, entries };
}
```

In `ReminderStore.init`, normalize on load:

```typescript
const v2 = migrateIgnoredNotes(loaded.ignoredTaskNotes);
this.data.ignoredTaskNotes = v2;
```

(Update `PluginData.ignoredTaskNotes` to type `IgnoredNotesV2`.)

- [ ] **Step 4:** PASS. Existing tests still pass.

- [ ] **Step 5:** Commit `feat: schema-2 ignoredTaskNotes with migration`.

---

### Task 2: Capture task text on ignore

- [ ] **Step 1:** Update `ReminderStore.ignoreTask` signature to accept the task text snapshot:

```typescript
async ignoreTask(id: string, text: string, note = ""): Promise<void> {
  this.data.ignoredTaskNotes.entries[id] = {
    text,
    note: note.trim(),
  };
  if (!this.data.ignoredTaskIds.includes(id)) this.data.ignoredTaskIds.push(id);
  await this.persist();
}
```

Update all callers in `view.ts` to pass `task.text`.

- [ ] **Step 2:** Commit `feat: capture task text snapshot on ignore`.

---

### Task 3: vault.on('rename') subscription

- [ ] **Step 1:** Failing test in `tests/store-rename.test.ts`:

```typescript
import { rewriteIdsForRename } from "../src/store";

describe("rewriteIdsForRename", () => {
  it("rewrites paths that match old prefix", () => {
    const ids = ["old/note.md:1:checkbox", "other.md:5:checkbox"];
    expect(rewriteIdsForRename(ids, "old/note.md", "new/note.md")).toEqual([
      "new/note.md:1:checkbox", "other.md:5:checkbox",
    ]);
  });
  it("rewrites folder rename", () => {
    const ids = ["old/sub/note.md:1:checkbox", "elsewhere.md:1:checkbox"];
    expect(rewriteIdsForRename(ids, "old", "new")).toEqual([
      "new/sub/note.md:1:checkbox", "elsewhere.md:1:checkbox",
    ]);
  });
});
```

- [ ] **Step 2:** Implement:

```typescript
export function rewriteIdsForRename(ids: string[], oldPath: string, newPath: string): string[] {
  return ids.map((id) => {
    if (id === oldPath || id.startsWith(`${oldPath}:`)) {
      return id.replace(oldPath, newPath);
    }
    if (id.startsWith(`${oldPath}/`)) {
      return id.replace(`${oldPath}/`, `${newPath}/`);
    }
    return id;
  });
}
```

Add `handleVaultRename(oldPath, newPath)` on `ReminderStore`:

```typescript
async handleVaultRename(oldPath: string, newPath: string): Promise<void> {
  this.data.ignoredTaskIds = rewriteIdsForRename(this.data.ignoredTaskIds, oldPath, newPath);
  // Rewrite ignoredTaskNotes entries map keys
  const newEntries: Record<string, IgnoredEntry> = {};
  for (const [id, entry] of Object.entries(this.data.ignoredTaskNotes.entries)) {
    const newId = rewriteIdsForRename([id], oldPath, newPath)[0];
    newEntries[newId] = entry;
  }
  this.data.ignoredTaskNotes.entries = newEntries;
  // Reminders sourceTaskId
  for (const r of this.data.reminders) {
    if (r.sourceTaskId) {
      r.sourceTaskId = rewriteIdsForRename([r.sourceTaskId], oldPath, newPath)[0];
    }
  }
  await this.persist();
}
```

- [ ] **Step 3:** In `main.ts` `onload`, register:

```typescript
this.registerEvent(
  this.app.vault.on("rename", async (file, oldPath) => {
    await this.store.handleVaultRename(oldPath, file.path);
  })
);
```

- [ ] **Step 4:** PASS.

- [ ] **Step 5:** Commit `feat: vault.on('rename') rewrites stored task IDs`.

---

### Task 4: Orphan detection + modal

- [ ] **Step 1:** In `ReminderStore`, add `findOrphans(scannedIds: Set<string>): string[]`:

```typescript
findOrphans(scannedIds: Set<string>): string[] {
  const result: string[] = [];
  for (const id of this.data.ignoredTaskIds) if (!scannedIds.has(id)) result.push(id);
  for (const r of this.data.reminders) {
    if (r.sourceTaskId && !scannedIds.has(r.sourceTaskId)) result.push(r.sourceTaskId);
  }
  return [...new Set(result)];
}
```

- [ ] **Step 2:** `cleanOrphans(ids: string[], options: { reminderAction: "complete" | "delete" })`:

```typescript
async cleanOrphans(ids: string[], options: { reminderAction: "complete" | "delete" }): Promise<void> {
  const set = new Set(ids);
  this.data.ignoredTaskIds = this.data.ignoredTaskIds.filter((id) => !set.has(id));
  for (const id of ids) delete this.data.ignoredTaskNotes.entries[id];
  for (const r of this.data.reminders) {
    if (r.sourceTaskId && set.has(r.sourceTaskId)) {
      if (options.reminderAction === "complete") {
        r.notified = true; r.completedAt = Date.now();
      }
    }
  }
  if (options.reminderAction === "delete") {
    this.data.reminders = this.data.reminders.filter((r) => !r.sourceTaskId || !set.has(r.sourceTaskId));
  }
  await this.persist();
}
```

- [ ] **Step 3:** Create `src/orphansModal.ts` listing orphans with task text snapshots, file path, ignored date, note.

- [ ] **Step 4:** Wire post-scan trigger when `lastScanReport.failures === 0` AND scope was Whole vault: prompt or auto per setting.

- [ ] **Step 5:** Commit `feat: orphan detection + cleanup modal`.

---

### Task 5: Settings + lastScanReport success predicate

- [ ] **Step 1:** Add to `Settings`:

```typescript
autoCleanOrphans: "off" | "prompt" | "auto"; // default "prompt"
orphanedReminderAction: "complete" | "delete"; // default "complete"
```

- [ ] **Step 2:** Safety tab UI for both.

- [ ] **Step 3:** `taskScanner.scan()` returns `{ tasks, report }` with `report.failures: number`. Track read failures.

- [ ] **Step 4:** Commit `feat: orphan cleanup settings + scan success predicate`.

---

### Task 6: Version + CHANGELOG + README

- [ ] **Step 1:** Bump patch.
- [ ] **Step 2:** CHANGELOG.
- [ ] **Step 3:** README.
- [ ] **Step 4:** Commit.

## Verification

- [ ] Tests: rewriteIdsForRename, migrateIgnoredNotes.
- [ ] Manual: rename folder with ignored tasks → no false orphans.
- [ ] Manual: scope-limited scan does NOT trigger cleanup.
- [ ] Manual: prompt mode shows modal with task text snapshots.
