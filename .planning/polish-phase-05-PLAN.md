# Phase 5 — Completion Timestamps Implementation Plan

**Prerequisites:** Phase 0 (`inlineFields.ts`), Phase 4 (move-on-status — Phase 5 must run before move).

**Goal:** Auto-add `[completion:: YYYY-MM-DD HH:mm]` when checkbox marked done; strip when un-completed.

**Files:** `src/types.ts` (setting), `src/main.ts` (Metadata tab UI), `src/taskScanner.ts` (pre-move hook), `tests/inlineFields.test.ts`.

---

### Task 1: formatCompletionTimestamp helper

- [ ] **Step 1:** Failing test in `tests/inlineFields.test.ts`:

```typescript
import { formatCompletionTimestamp } from "../src/inlineFields";

describe("formatCompletionTimestamp", () => {
  it("formats current date as YYYY-MM-DD HH:mm", () => {
    const ts = formatCompletionTimestamp(new Date(2026, 4, 5, 14, 30));
    expect(ts).toBe("2026-05-05 14:30");
  });
  it("zero-pads", () => {
    expect(formatCompletionTimestamp(new Date(2026, 0, 1, 9, 5))).toBe("2026-01-01 09:05");
  });
});
```

- [ ] **Step 2:** Run, FAIL.

- [ ] **Step 3:** Implement in `src/inlineFields.ts`:

```typescript
export function formatCompletionTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
```

- [ ] **Step 4:** PASS.

- [ ] **Step 5:** Commit `feat: add formatCompletionTimestamp helper`.

---

### Task 2: Setting addCompletionTimestamp

- [ ] **Step 1:** Add to `Settings` in `src/types.ts`:

```typescript
addCompletionTimestamp: boolean;
```

`DEFAULT_SETTINGS.addCompletionTimestamp = true;`

- [ ] **Step 2:** Add toggle in `renderMetadataTab` (`src/main.ts`):

```typescript
new Setting(parent)
  .setName("Add completion timestamp")
  .setDesc("When you mark a task done, append [completion:: YYYY-MM-DD HH:mm] to the line.")
  .addToggle((t) => t.setValue(this.plugin.store.settings.addCompletionTimestamp).onChange(async (v) => {
    await this.plugin.store.updateSettings({ addCompletionTimestamp: v });
  }));
```

- [ ] **Step 3:** Commit `feat: add addCompletionTimestamp setting`.

---

### Task 3: Pre-move hook in setCheckboxStatus

- [ ] **Step 1:** Failing test in `tests/replaceTaskBody.test.ts` or new `tests/setCheckboxStatus.test.ts`:

```typescript
describe("setCheckboxStatus completion timestamp", () => {
  it("adds completion field when marking done", async () => {
    const lines = ["", "- [ ] Task", ""];
    const env = makeApp(lines.join("\n"));
    const scanner = new TaskScanner(env.app);
    await scanner.setCheckboxStatus(fakeTask(lines, 1), "completed", {
      moveOnChange: false, headingMap: { todo: "T", "in-progress": "I", completed: "C" },
      addCompletionTimestamp: true,
    });
    expect(env.stored()).toMatch(/- \[x\] Task \[completion:: \d{4}-\d{2}-\d{2} \d{2}:\d{2}\]/);
  });
  it("strips completion field when un-completing", async () => {
    const lines = ["", "- [x] Task [completion:: 2026-05-05 12:00]", ""];
    const env = makeApp(lines.join("\n"));
    const scanner = new TaskScanner(env.app);
    await scanner.setCheckboxStatus(fakeTask(lines, 1), "todo", {
      moveOnChange: false, headingMap: { todo: "T", "in-progress": "I", completed: "C" },
      addCompletionTimestamp: true,
    });
    expect(env.stored()).not.toContain("completion::");
  });
});
```

- [ ] **Step 2:** Run, FAIL.

- [ ] **Step 3:** Update `setCheckboxStatus` in `src/taskScanner.ts` to accept `addCompletionTimestamp` option and apply the inline-field update inside the verifyAndWrite mutator BEFORE returning the new line (and before any move):

```typescript
async setCheckboxStatus(task, status, options): Promise<...> {
  if (task.kind !== "checkbox") return "error";
  return this.verifyAndWrite(task, (line) => {
    if (!CHECKBOX_TASK_RE.test(line)) return null;
    let updated = line.replace(/\[[^\]]\]/, `[${getCheckboxStatusMarker(status)}]`);
    if (options.addCompletionTimestamp) {
      if (status === "completed") {
        updated = setInlineField(updated, "completion", formatCompletionTimestamp());
      } else {
        updated = removeInlineField(updated, "completion");
      }
    }
    return updated;
  }).then(async (result) => {
    // ... existing move logic
  });
}
```

Update `view.ts` caller to pass `addCompletionTimestamp: this.store.settings.addCompletionTimestamp`.

- [ ] **Step 4:** PASS.

- [ ] **Step 5:** Commit `feat: pre-write completion timestamp before move`.

---

### Task 4: Version + CHANGELOG + README

- [ ] **Step 1:** Bump patch.
- [ ] **Step 2:** CHANGELOG: "Phase 5: completion timestamps."
- [ ] **Step 3:** README metadata syntax section gets `[completion::]` added.
- [ ] **Step 4:** Commit.

## Verification

- [ ] Test: timestamp added on done.
- [ ] Test: timestamp removed on un-done.
- [ ] Manual: with Phase 4 ON, complete task → moved block has timestamp at expected position.
- [ ] Manual: setting OFF → no timestamp added.
