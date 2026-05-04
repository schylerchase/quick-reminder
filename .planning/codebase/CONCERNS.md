# Codebase Concerns

**Analysis Date:** 2026-04-18
**Scope:** Quick Reminder v0.1.0 (Obsidian plugin, ~23KB TypeScript across 7 files)

## Tech Debt

**Zero test coverage [High]:**
- Issue: No test files, no test framework, no `test` script in `package.json`. Parser, store, scheduler, modal, view are all untested.
- Files: All of `src/*.ts` — no corresponding `*.test.ts` or `*.spec.ts` exist.
- Impact: Regressions are silent. A chrono-node behavior change, timer math bug, or store mutation regression would only surface when a user notices a reminder didn't fire — which is the worst failure mode for a reminder app.
- Fix approach: Add Vitest (already common in Obsidian plugins). Start with `parser.test.ts` (pure function, high ROI), then `store.test.ts` (mock `load`/`save`), then `scheduler.test.ts` (use fake timers). View/modal DOM tests are lower priority.

**Markdown mirror is write-only [Medium]:**
- Issue: `store.ts:95-104` writes `Reminders.md` on every persist, but nothing reads it back. Users editing the file directly have zero effect on actual reminders — edits are silently overwritten on next change.
- Files: `src/store.ts` (lines 95-131, `mirrorToMarkdown` and `renderMarkdown`).
- Impact: Violates the principle of least surprise. The auto-generated banner (`"Do not edit directly"`) mitigates but doesn't prevent user confusion. Also: every reminder add/edit/snooze writes the full file, which is wasteful on large lists.
- Fix approach: Either (a) make it truly read-only — add a watch-and-warn if user edits, or (b) add round-trip parsing where `- [x]` checkbox edits mark reminders as notified. Option (a) is simpler and matches the current intent.

**Re-add flow relies on DOM query + `setTimeout` [Medium]:**
- Issue: `view.ts:113-124` opens a modal, then `setTimeout(50ms)` + `querySelector(".qr-input")` to find the input and populate it.
- Files: `src/view.ts` lines 110-125.
- Impact: Fragile. Breaks if: modal DOM structure changes, multiple modals open simultaneously, Obsidian renders async and 50ms is insufficient on slow machines, or another plugin adds an element with class `qr-input`.
- Fix approach: Add a `prefilledText` constructor arg to `QuickCaptureModal` and set it directly in `onOpen()`. Eliminates the DOM query and the timing guess.

**ID generation uses `Math.random()` [Low]:**
- Issue: `modal.ts:172-174` and `main.ts:152` both generate IDs as `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`. Not cryptographically unique.
- Files: `src/modal.ts` (line 173), `src/main.ts` (line 152).
- Impact: Collision probability is low in single-device use but non-zero across synced vaults (Obsidian Sync, iCloud, Git). Two devices creating reminders in the same millisecond with the same 4-byte random suffix would collide. Very unlikely but theoretically possible.
- Fix approach: Use `crypto.randomUUID()` (available in Obsidian's Electron environment). Also: duplicate `genId` logic in two files — extract to a single helper in `types.ts` or a new `id.ts`.

**Notified reminders accumulate unbounded [Low]:**
- Issue: `store.ts` never rotates or caps the `reminders` array. Every fired reminder stays in `data.json` forever, only filtered out of the UI (`view.ts:57` shows last 30).
- Files: `src/store.ts` (no pruning logic anywhere).
- Impact: Over years of use, `data.json` grows linearly. Unlikely to cause perf issues until thousands of entries, but it's ugly. Also makes the markdown mirror writes increasingly expensive.
- Fix approach: Add a setting `historyCap: number` (default 200). On `persist()`, slice `notified` reminders to keep only the most recent N. Alternatively, auto-delete notified reminders older than 90 days.

## Known Bugs

**No corrupt-data recovery on load [High]:**
- Symptoms: If `data.json` is corrupt (malformed JSON, wrong shape, missing fields), plugin crashes during `onload()` because `store.init()` propagates errors.
- Files: `src/store.ts` (lines 34-42, `init()` has no try/catch), `src/main.ts` (line 30, `await this.store.init()` has no fallback).
- Trigger: Reproducible by manually editing `.obsidian/plugins/quick-reminder/data.json` to invalid JSON, or if Obsidian Sync conflict produces a merge artifact.
- Workaround: User must manually delete `data.json` — destroying all reminders.
- Fix approach: Wrap `load()` in try/catch inside `init()`. On failure, back up the corrupt file to `data.json.corrupt-{timestamp}`, log to console, and start with `DEFAULT_SETTINGS` + empty reminders. Show a `Notice` to the user.

**Notified reminders dropped after `setTimeout` clamp [Medium]:**
- Symptoms: Reminders scheduled more than ~24.8 days out (`2_147_483_000ms` clamp at `scheduler.ts:28`) fire at the clamp time, not the actual due time. They then get marked `notified: true` — permanently.
- Files: `src/scheduler.ts` lines 22-34.
- Trigger: Create a reminder with a due date > 24.8 days from now. At the clamp expiry, `fire()` runs even though `dueAt > Date.now()`.
- Workaround: Restart Obsidian before clamp expiry (re-schedules with new delay from current time). `scanOverdue` at `scheduler.ts:49-64` only catches `dueAt <= now`, so if fired early, it won't re-fire.
- Fix approach: When delay exceeds clamp, set a chained re-schedule timer: on clamp expiry, check if `Date.now() >= dueAt`; if not, call `schedule(reminder)` again. Do NOT call `fire()` until actually due.

**Notification permission denial has no user-visible fallback warning [Medium]:**
- Symptoms: If user denies browser notification permission (macOS: "Don't allow"), `showNativeNotification` in `scheduler.ts:77-102` silently no-ops (condition `Notification.permission !== "denied"` is false). No Notice shown. No error thrown.
- Files: `src/scheduler.ts` lines 95-101.
- Trigger: Deny notification permission in OS prompt. Create a reminder. When it fires, nothing happens.
- Workaround: User must manually re-enable in System Settings > Notifications.
- Fix approach: In `fire()` at `scheduler.ts:66-74`, detect `Notification.permission === "denied"` and fall back to `new Notice()` with long duration. On `onload()`, if permission is denied, show a persistent Notice explaining reduced functionality and link to settings.

## Security Considerations

**Markdown mirror writes to vault root by default [Low]:**
- Risk: `settings.mirrorFilePath` defaults to `"Reminders.md"` (vault root). `normalizePath` prevents path traversal (`../`), but a user could set it to overwrite an important note if they happen to have one named the same.
- Files: `src/store.ts` lines 95-104, `src/types.ts` line 26.
- Current mitigation: `normalizePath` sanitizes path; default filename is a reasonable convention.
- Recommendations: On first write, if file exists and was NOT created by the plugin (check for the auto-gen banner), abort and warn the user. Add a confirmation when the user changes `mirrorFilePath` to an existing file.

**No validation on loaded JSON shape [Low]:**
- Risk: `store.ts:34-42` uses `loaded.reminders ?? []` and spread settings — assumes types are correct. A hand-edited or migrated `data.json` with wrong types (e.g., `dueAt` as string) would break downstream code silently.
- Files: `src/store.ts` lines 34-42.
- Current mitigation: None — TypeScript types are erased at runtime.
- Recommendations: Add a runtime validator (zod or hand-rolled) in `init()`. Coerce or discard invalid entries. Tie this to the corrupt-data recovery fix above.

## Performance Bottlenecks

**Full file rewrite on every change [Low]:**
- Problem: Every `add`/`remove`/`snooze`/`markNotified` triggers `persist()` → `save(fullData)` + full markdown mirror rewrite.
- Files: `src/store.ts` (`persist` at lines 87-93).
- Cause: No batching, no debouncing. Firing 10 overdue reminders on launch (`scheduler.scanOverdue`) produces 10 full-data writes + 10 markdown rewrites in quick succession.
- Improvement path: Debounce `persist()` by ~100ms, or batch the overdue-fire sequence to persist once at the end. Not urgent unless users report disk/sync churn.

**Markdown mirror renders from full dataset [Low]:**
- Problem: `renderMarkdown` at `store.ts:106-131` rebuilds the entire markdown body from scratch each persist.
- Files: `src/store.ts` lines 106-131.
- Cause: Simpler than diffing, but wasteful at scale.
- Improvement path: Not worth optimizing until reminder count > 500. Current implementation is fine for MVP.

## Fragile Areas

**Scheduler timer clamp behavior [High]:**
- Files: `src/scheduler.ts` lines 22-34.
- Why fragile: Silent behavior change at the 24.8-day boundary. No test coverage. No log/warn when clamping.
- Safe modification: Any change to `schedule()` must preserve (a) idempotent re-scheduling (current `cancel(id)` at line 23 handles this), (b) delay <= 0 short-circuit (line 25-27), and (c) clamp guard (line 28). Add a console.warn when clamped so users can spot long-horizon reminders in the console.
- Test coverage: Zero. Highest-priority test file to write.

**View re-add + modal interaction [Medium]:**
- Files: `src/view.ts` lines 110-125.
- Why fragile: See "Re-add flow relies on DOM query" above. The `.qr-input` selector is a string literal that could be renamed in `modal.ts` (line 28) with no type or runtime error.
- Safe modification: Do NOT rename `.qr-input` class in `modal.ts:28` without updating `view.ts:116`. Ideally, replace with a constructor arg (see fix approach above).
- Test coverage: Zero.

**Scheduler `fire()` → `onFire` callback coupling [Low]:**
- Files: `src/scheduler.ts` line 73, `src/main.ts` lines 32-34.
- Why fragile: `onFire` is wired to `store.markNotified(reminder.id)`. If `markNotified` throws (e.g., disk full), the scheduler silently ignores it — no try/catch, and it's synchronous-looking but returns a Promise that's discarded at line 73.
- Safe modification: Make `fire()` await the callback, or explicitly `.catch()` it. Currently the void-return creates an unhandled promise rejection opportunity.

## Scaling Limits

**setTimeout precision and max delay [High]:**
- Current capacity: Reliable for reminders within ~24.8 days (`Math.min(delay, 2_147_483_000)` at `scheduler.ts:28`).
- Limit: Beyond 24.8 days, fires early (bug above). Also: `setTimeout` drift can be seconds-to-minutes over long delays on low-power devices.
- Scaling path: Replace one-shot `setTimeout` with either (a) a periodic tick every 60s that scans for due reminders, or (b) chained re-scheduling as described in the clamp bug fix. Option (b) has better precision but more complexity.

**Obsidian-must-be-running constraint [High]:**
- Current capacity: Reminders only fire while Obsidian is open (plus `scanOverdue` catch-up on launch if `fireMissedOnLaunch: true`).
- Limit: Inherent architectural choice — no background process, no OS-level scheduler integration.
- Scaling path: Either (a) accept as MVP limitation (`manifest.json` declares `isDesktopOnly: true`, documented in README), or (b) add a cloud relay (push notification service) for mobile + offline delivery. Option (b) requires server infrastructure, auth, and violates the "local-first" Obsidian ethos. Not recommended for v0.1.

**Data file growth [Low]:**
- Current capacity: `data.json` at `.obsidian/plugins/quick-reminder/data.json` grows unbounded. Each reminder is ~150-250 bytes.
- Limit: ~10,000 reminders = ~2MB JSON. Obsidian's `loadData`/`saveData` would still work, but slower.
- Scaling path: History cap (see "Notified reminders accumulate" above).

## Dependencies at Risk

**chrono-node [Medium]:**
- Files: `package.json` line 23 (`"chrono-node": "^2.7.5"`), `src/parser.ts` line 1.
- Risk: Sole dependency for natural-language date parsing — the core USP of this plugin. Breaking changes in chrono would silently alter parse results (e.g., "next Friday" interpretation).
- Impact: Users see unexpected reminder times or "no time detected" for phrases that previously worked.
- Migration plan: `^2.7.5` allows minor/patch updates. Pin exact version if chrono history shows breaking changes in minors. Add parser tests with a fixed reference date to catch drift (`parseReminder("tomorrow 3pm", new Date("2025-01-01"))` should always produce the same result).

**Obsidian API surface [Low]:**
- Files: `package.json` line 18 (`"obsidian": "^1.4.11"`).
- Risk: `ItemView`, `Modal`, `Notice`, `Plugin.loadData/saveData`, `workspace.on("editor-menu")` — all used. Obsidian has generally stable API but occasionally removes/renames.
- Impact: `minAppVersion: "1.4.0"` in `manifest.json` — plugin declines to load on older versions.
- Migration plan: Monitor Obsidian changelog. Add CI to typecheck against latest `obsidian` types.

## Missing Critical Features

**No recurring reminders [Medium]:**
- Problem: All reminders are one-shot. No daily/weekly/monthly option.
- Blocks: "standup every weekday 9am", "pay rent 1st of month", "take meds every 8 hours". Common reminder use cases unmet.
- Implementation note: Would need `Reminder.recurrence?: { type: "daily" | "weekly" | "monthly" | "cron", ... }` and scheduler logic to re-schedule after fire. Chrono-node supports some recurrence patterns; a full cron expression might be overkill.

**No schema migration strategy [Medium]:**
- Problem: If `Reminder` or `Settings` shape changes in v0.2+, existing `data.json` could break silently (missing fields default via `DEFAULT_SETTINGS` spread, but type changes don't migrate).
- Blocks: Any future field rename, field type change, or reminder-shape refactor.
- Implementation note: Add `PluginData.schemaVersion: number`. In `store.init()`, run migration chain if loaded version < current. Document versioning policy in README.

**No desktop notification actions (snooze/dismiss) [Low]:**
- Problem: `showNativeNotification` at `scheduler.ts:77-102` uses basic `Notification` API. No action buttons. User must open Obsidian to snooze.
- Blocks: Quick-snooze from notification without context-switching.
- Implementation note: HTML5 Notifications API supports `actions` in service-worker notifications only. Native-feeling action buttons require Electron's `Notification` API directly, which needs `require("electron").remote.Notification` — more complex and Electron version-dependent.

**No mobile support [Medium]:**
- Problem: `manifest.json` declares `isDesktopOnly: true`. Obsidian mobile users cannot install.
- Blocks: Mobile reminders entirely.
- Implementation note: Would need (a) web `Notification` API on mobile (limited, OS-dependent), (b) cloud push relay, or (c) integration with iOS Reminders / Android alarms via Capacitor plugin. All non-trivial. Accept MVP limitation.

## Test Coverage Gaps

**Parser [High]:**
- What's not tested: All of `parseReminder` — edge cases, chrono output shapes, the `stripMatchedPhrase` regex, empty input, no-time input, past-time input.
- Files: `src/parser.ts`.
- Risk: Silent regression on chrono update. Core feature.
- Priority: High. Pure function, easy to test, highest ROI.

**Scheduler [High]:**
- What's not tested: `schedule()` clamp behavior, `cancel()` idempotency, `scanOverdue` with multiple/zero overdue, `fire()` error fallback to Notice, timer cleanup on `cancelAll()`.
- Files: `src/scheduler.ts`.
- Risk: Reminders firing wrong time (clamp bug above) would go unnoticed until user complains.
- Priority: High.

**Store [High]:**
- What's not tested: `init()` with null/partial/corrupt data, `snooze` math, `markNotified` on missing ID, settings merge, markdown mirror output shape, listener `notify()` error isolation.
- Files: `src/store.ts`.
- Risk: Data corruption or loss.
- Priority: High.

**Modal save flow [Medium]:**
- What's not tested: Enter-to-save keybinding, past-time rejection, empty-text rejection, `rawInput` preservation.
- Files: `src/modal.ts` lines 80-110.
- Risk: UX regressions.
- Priority: Medium — harder to test (DOM-dependent), lower ROI than pure logic.

**View re-add + DOM interactions [Low]:**
- What's not tested: `renderRow` output, re-add flow modal population, snooze button wiring.
- Files: `src/view.ts`.
- Risk: UI-only bugs. Users will notice and report.
- Priority: Low. Integration-test territory, not worth mocking the full Obsidian API.

**End-to-end reminder lifecycle [Medium]:**
- What's not tested: Create → persist → restart plugin → load → fire → mark notified → survive restart.
- Files: Cross-module (`main.ts` + `store.ts` + `scheduler.ts`).
- Risk: Regressions at module boundaries.
- Priority: Medium. One or two integration tests with a fake `loadData`/`saveData` pair would cover the critical path.

---

*Concerns audit: 2026-04-18*
