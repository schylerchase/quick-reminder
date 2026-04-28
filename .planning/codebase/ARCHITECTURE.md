# Architecture

**Analysis Date:** 2026-04-18

## Pattern Overview

**Overall:** Layered plugin architecture with dependency injection and observer pattern for UI refresh.

**Key Characteristics:**
- Strict separation of concerns: UI (modals/view) → Plugin orchestrator → Domain services (Store, Scheduler) → Platform APIs (Obsidian, Electron/Web Notification).
- Single bidirectional data owner (`ReminderStore`) — all mutations flow through it, all reads are served from it.
- Observer pattern: `ReminderStore` emits change events after every mutation; `ReminderView` subscribes and re-renders.
- Scheduler is stateful but not the source of truth: it holds only in-memory `setTimeout` handles keyed by reminder id; rebuilds its state from the store on demand.
- No framework (React/Vue/etc.) — plain DOM construction via Obsidian's `createEl`/`createDiv` helpers.

## Layers

**UI Layer — Modals:**
- Purpose: Short-lived, focused user interactions (capture input, list pending).
- Location: `src/modal.ts`
- Contains: `QuickCaptureModal` (text input with live parse preview, Enter-to-save), `ReminderListModal` (legacy list with snooze/delete buttons).
- Depends on: `ReminderStore`, `Scheduler`, `parseReminder`, Obsidian `Modal`/`Setting`/`Notice`.
- Used by: `QuickReminderPlugin` (ribbon/command callbacks), `ReminderView` ("+ New" button and "Re-add" button).

**UI Layer — Sidebar View:**
- Purpose: Persistent right-sidebar panel showing Pending + History reminders with inline actions.
- Location: `src/view.ts`
- Contains: `ReminderView extends ItemView`, `VIEW_TYPE_REMINDER` constant, `formatWhen` helper for relative time labels.
- Depends on: `ReminderStore` (reads + change subscription), `Scheduler` (cancel/reschedule on snooze), `QuickCaptureModal` (for "+ New" / "Re-add").
- Used by: `QuickReminderPlugin.registerView()` and `activateView()`.
- Lifecycle: `onOpen()` registers a `refreshHandler` with `store.onChange()`; `onClose()` unregisters via `store.offChange()`.

**Plugin Orchestrator:**
- Purpose: Owns the plugin lifecycle, wires all dependencies, registers Obsidian hooks (commands, ribbon icons, events, settings tab, view).
- Location: `src/main.ts`
- Contains: `QuickReminderPlugin extends Plugin` (default export), `QuickReminderSettingTab extends PluginSettingTab`.
- Depends on: Every other module — `ReminderStore`, `Scheduler`, `QuickCaptureModal`, `ReminderListModal`, `ReminderView`, `parseReminder`, types.
- Used by: Obsidian plugin loader (via `manifest.json` → bundled `main.js`).

**Domain — Store:**
- Purpose: Single source of truth for reminders + settings. Handles persistence (JSON via `plugin.loadData`/`saveData`), markdown mirror file, and change notification.
- Location: `src/store.ts`
- Contains: `ReminderStore`, private `data: PluginData`, `listeners: Set<() => void>`, markdown rendering helpers.
- Depends on: Obsidian `App`/`TFile`/`normalizePath`, types. Does NOT depend on Scheduler or any UI.
- Used by: `main.ts`, `modal.ts`, `view.ts`, `scheduler.ts` (reads `store.pending`, `store.settings`).

**Domain — Scheduler:**
- Purpose: Translates due-time data from the store into timed callbacks; fires native OS notifications on due; scans for overdue reminders at launch.
- Location: `src/scheduler.ts`
- Contains: `Scheduler`, `timers: Map<string, Timeout>`, `showNativeNotification()` helper.
- Depends on: `ReminderStore` (read pending + settings), Obsidian `Notice` (fallback), global `Notification` API.
- Used by: `main.ts` (owns the instance), `modal.ts` (schedule/cancel on save/delete), `view.ts` (rescheduleAll on snooze, cancel on delete).

**Domain — Parser:**
- Purpose: Pure function wrapping `chrono-node` to extract a `dueAt` timestamp and remaining task text from a natural-language string.
- Location: `src/parser.ts`
- Contains: `parseReminder(input, ref?)`, `ParseResult` interface, `stripMatchedPhrase()` helper.
- Depends on: `chrono-node` only. No Obsidian imports, no side effects.
- Used by: `modal.ts` (live preview + save), `main.ts` (editor selection → reminder conversion).

**Types:**
- Purpose: Shared TypeScript interfaces and default settings object.
- Location: `src/types.ts`
- Contains: `Reminder`, `PluginData`, `Settings`, `DEFAULT_SETTINGS`.
- Depends on: Nothing.
- Used by: Every other source file except `parser.ts`.

## Data Flow

**Capture flow (modal):**

1. User invokes hotkey/ribbon → `QuickReminderPlugin` opens `QuickCaptureModal` with injected `store` + `scheduler`.
2. User types → `input` event handler calls `parseReminder()` → updates `currentParse` → `renderPreview()` shows task text + parsed time.
3. User presses Enter → `save()` validates (non-empty text, `dueAt` exists, `dueAt > Date.now()`).
4. `save()` constructs a `Reminder` object with a generated id → `store.add(reminder)`.
5. `store.add()` pushes to `data.reminders` → `persist()` → `saveData()` + markdown mirror + `notify()` listeners.
6. `scheduler.schedule(reminder)` computes `delay = dueAt - Date.now()`, clamps to 32-bit max, registers `setTimeout` in `timers` map.
7. Modal closes, `Notice` confirms.

**Fire flow (timer fires):**

1. `setTimeout` callback → `Scheduler.fire(reminder)` → `showNativeNotification()` creates a `new Notification(...)` with `silent`, `tag`, `requireInteraction`.
2. On permission denied or API unavailable → falls back to Obsidian `Notice`.
3. `onFire` callback (wired in `main.ts`) → `store.markNotified(id)` → sets `r.notified = true` → `persist()` → mirror + listeners.
4. `ReminderView` refreshHandler fires → `render()` → reminder moves from Pending section to History.

**Launch flow:**

1. `onload()` instantiates `ReminderStore` (with bound `loadData`/`saveData` closures) → `store.init()` hydrates from disk.
2. Instantiates `Scheduler` with `store` + `markNotified` callback.
3. Registers view, ribbon icons, commands, editor-menu event, settings tab.
4. `workspace.onLayoutReady()` → requests Notification permission if `default` → `scheduler.scanOverdue()` fires any reminders whose `dueAt <= now` (gated by `fireMissedOnLaunch` setting) → `scheduler.scheduleAll()` arms timers for all future pending → `activateView(false)` opens the sidebar without stealing focus.

**Unload flow:**

1. Obsidian calls `onunload()` → `scheduler.cancelAll()` clears all active timers. Store data is already persisted; nothing else to do.

**State Management:**
- All mutations go through `ReminderStore` methods (`add`, `markNotified`, `snooze`, `remove`, `updateSettings`).
- Every mutation calls private `persist()` which (a) writes JSON to Obsidian plugin data, (b) optionally writes the markdown mirror file, (c) invokes all registered change listeners.
- Reads are served from getters (`all`, `pending`, `settings`) which return sorted/filtered copies.

## Key Abstractions

**Reminder (data object):**
- Purpose: Represents one scheduled notification.
- Examples: Constructed in `src/modal.ts:96-103` and `src/main.ts:151-158`.
- Shape: `{ id, text, rawInput, dueAt (ms epoch), createdAt, notified, snoozedFrom? }`.
- Identity: String id of form `r_<base36-timestamp>_<base36-random>` (see `genId` in `src/modal.ts:172`).

**ReminderStore (domain service):**
- Purpose: Persistence + query + change notification.
- Pattern: Facade over Obsidian's `loadData`/`saveData` + vault file API, with an in-memory cache and observer list.
- Key property: Constructor takes `load`/`save` closures (not the `Plugin` instance) — makes it theoretically testable with in-memory fakes. See `src/main.ts:23-29` for wiring.

**Scheduler (domain service):**
- Purpose: Timer lifecycle + notification firing.
- Pattern: Keyed timer map + injected `onFire` callback (avoids a direct dependency from Scheduler back to Store for writes).
- Key detail: `schedule()` clamps delays to `2_147_483_000` ms (~24.8 days) to avoid `setTimeout` 32-bit overflow. Reminders past that horizon will not fire until `scheduleAll()` is re-invoked (currently only called on launch and on snooze).

**ParseResult (value object):**
- Purpose: Immutable output of `parseReminder`.
- Shape: `{ text, dueAt: number | null, matchedText: string | null }`.
- Example: `src/parser.ts:3-7`.

## Entry Points

**Plugin bootstrap:**
- Location: `src/main.ts:18` (`QuickReminderPlugin` default export).
- Triggers: Obsidian loads `main.js` (bundled from `src/main.ts` per `esbuild.config.mjs:8`) when the plugin is enabled.
- Responsibilities: Everything in `onload()` — instantiate services, register UI hooks, schedule existing reminders.

**Ribbon icons:**
- `src/main.ts:41` — "alarm-clock" icon opens `QuickCaptureModal`.
- `src/main.ts:45` — "list" icon calls `activateView()`.

**Commands (Obsidian command palette):**
- `quick-capture` (`src/main.ts:49`) — opens capture modal.
- `list-pending` (`src/main.ts:57`) — opens legacy pending list modal.
- `open-view` (`src/main.ts:65`) — reveals sidebar view.
- `convert-selection` (`src/main.ts:73`) — editor-scoped, parses the current selection and creates a reminder, decorating the selected text with `⏰`.

**Editor context menu:**
- `src/main.ts:81-94` — adds "Create reminder from selection" item when text is selected.

**Sidebar view:**
- `src/view.ts:9` — `ReminderView`, registered via `this.registerView(VIEW_TYPE_REMINDER, …)` at `src/main.ts:36`.

## Error Handling

**Strategy:** Best-effort with user-visible feedback. Errors at platform boundaries are caught, logged to console, and surfaced via Obsidian `Notice` or a fallback path. No exceptions propagate across layers.

**Patterns:**
- Validation before mutation: `QuickCaptureModal.save()` and `convertSelectionToReminder()` check empty text, missing time, and past time before touching the store. Each failure surfaces a `Notice`.
- Notification fallback: `Scheduler.fire()` wraps `showNativeNotification` in try/catch; failures log and fall back to an Obsidian `Notice` (`src/scheduler.ts:66-74`).
- Listener isolation: `ReminderStore.notify()` wraps each listener call in try/catch so a throwing subscriber can't prevent other subscribers from firing (`src/store.ts:25-31`).
- Markdown mirror is non-fatal: `persist()` attaches `.catch()` to `mirrorToMarkdown()` so a vault write failure does not block persistence (`src/store.ts:89-91`).
- Permission handling: `showNativeNotification` branches on `Notification.permission` (`granted` / `denied` / default) and requests permission lazily.

## Cross-Cutting Concerns

**Logging:** `console.error` only, at failure points in `Scheduler.fire`, `ReminderStore.notify`, and `ReminderStore.persist` (mirror failure). No structured logger or log levels.

**Validation:** Input validation lives in the UI layer (modals + `convertSelectionToReminder` in `src/main.ts:131`). The store performs no validation — it trusts callers to pass well-formed `Reminder` objects.

**Authentication:** Not applicable (local-only plugin, no network calls).

**Persistence boundary:** `ReminderStore` is the only module that reads or writes plugin data or vault files. All other modules interact with data through its getters and mutator methods.

**Notification permissions:** Requested once at launch in `src/main.ts:98-101` when `Notification.permission === "default"`. Re-requested opportunistically by `showNativeNotification` at fire time if still ungranted.

---

*Architecture analysis: 2026-04-18*
