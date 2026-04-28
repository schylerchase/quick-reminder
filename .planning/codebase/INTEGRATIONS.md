# External Integrations

**Analysis Date:** 2026-04-18

## Overview

This plugin has **no external network integrations**. It runs entirely within the Obsidian desktop client (Electron) and communicates only with:

1. The **Obsidian Plugin API** (host application)
2. The **Electron / Web Notification API** (OS-native notifications)
3. The local **filesystem via Obsidian's Vault abstraction** (for the Markdown mirror file)

There are no HTTP calls, no authentication, no API keys, no external SDKs beyond `chrono-node` (pure in-process NLP).

## APIs & External Services

**Third-party network APIs:** None.

**External libraries calling out over the network:** None detected. `chrono-node` is a pure-JS date-parsing library with no network usage.

## Data Storage

**Primary (plugin data):**
- Obsidian plugin data store (per-plugin JSON blob, stored by Obsidian at `.obsidian/plugins/quick-reminder/data.json` in the user's vault)
- Access via `Plugin.loadData()` and `Plugin.saveData()` — wired in `src/main.ts:25-29`:
  ```ts
  this.store = new ReminderStore(
    this.app,
    async () => (await this.loadData()) as PluginData | null,
    async (data) => { await this.saveData(data); },
  );
  ```
- Shape defined by `PluginData` in `src/types.ts:11-14` — contains `reminders: Reminder[]` and `settings: Settings`
- Reads on init: `ReminderStore.init()` in `src/store.ts:34-42`
- Writes on every mutation: `ReminderStore.persist()` in `src/store.ts:87-93`

**Secondary (user-visible mirror file):**
- A `Reminders.md` file inside the user's vault, written via the Obsidian Vault API
- Path is user-configurable (`Settings.mirrorFilePath`, default `"Reminders.md"` — `src/types.ts:26`)
- Only written when `Settings.mirrorToMarkdown === true` (default `true` — `src/types.ts:25`)
- Mirror logic: `ReminderStore.mirrorToMarkdown()` in `src/store.ts:95-104`
  - Uses `app.vault.getAbstractFileByPath(path)` to locate, `TFile` instanceof check, then `vault.modify()` or `vault.create()`
- Content rendering: `ReminderStore.renderMarkdown()` in `src/store.ts:106-131`

**Databases:** None.

**File Storage (external):** None. All file I/O is mediated through the Obsidian Vault API, which operates on the user's local vault directory.

**Caching:** None.

## Authentication & Identity

**Auth Provider:** None. The plugin has no user identity, no accounts, no API tokens.

**Permissions requested:**
- **OS notification permission** — requested on first layout ready if `Notification.permission === "default"` (`src/main.ts:99-101`):
  ```ts
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    await Notification.requestPermission();
  }
  ```
- Also re-requested on fire if still ungranted (`src/scheduler.ts:97-101`).

## Monitoring & Observability

**Error Tracking:** None. Errors are logged to the browser/Electron devtools console via `console.error`:
- `src/store.ts:29` — listener failure
- `src/store.ts:90` — mirror-file write failure (non-fatal, caught with `.catch`)
- `src/scheduler.ts:70` — native notification failure (falls back to in-app `Notice`)

**Logs:** `console.error` only. No log files, no log shipping.

**Metrics/Telemetry:** None.

## CI/CD & Deployment

**Hosting:** Not applicable — plugin ships as static files copied into the user's vault (see `README.md:20-26`).

**CI Pipeline:** None detected. No `.github/workflows/`, no `.gitlab-ci.yml`, no CircleCI/Travis config.

**Release Process:** Manual. User runs `npm run build` then copies `main.js`, `manifest.json`, `styles.css` into `.obsidian/plugins/quick-reminder/` (per `README.md:14-29`).

## Environment Configuration

**Required env vars:** None.

**Secrets:** None. The plugin stores no credentials and has no `.env` file.

**User-configurable settings** (stored in plugin data JSON, edited via the settings tab `QuickReminderSettingTab` in `src/main.ts:172-237`):
- `mirrorToMarkdown: boolean` (default `true`)
- `mirrorFilePath: string` (default `"Reminders.md"`)
- `defaultSnoozeMinutes: number` (default `10`)
- `fireMissedOnLaunch: boolean` (default `true`)
- `soundOnNotify: boolean` (default `true`)

Defined in `src/types.ts:16-30`.

## Webhooks & Callbacks

**Incoming:** None.

**Outgoing:** None.

## Obsidian Plugin API Surface

The complete list of Obsidian APIs the plugin depends on:

**Lifecycle & registration** (`src/main.ts`):
- `Plugin` base class — `src/main.ts:18` (class extends `Plugin`)
- `Plugin.onload()` — `src/main.ts:22`
- `Plugin.onunload()` — `src/main.ts:108`
- `Plugin.loadData()` / `Plugin.saveData()` — `src/main.ts:26,28` (persistent plugin data)
- `Plugin.registerView(type, factory)` — `src/main.ts:36-39`
- `Plugin.addRibbonIcon(icon, title, cb)` — `src/main.ts:41,45`
- `Plugin.addCommand({ id, name, callback / editorCallback })` — `src/main.ts:49,57,65,73`
- `Plugin.registerEvent(eventRef)` — `src/main.ts:81`
- `Plugin.addSettingTab(tab)` — `src/main.ts:96`

**Workspace & layout** (`src/main.ts`, `src/view.ts`):
- `App.workspace` — `src/main.ts:82,98,113`
- `Workspace.on("editor-menu", cb)` — `src/main.ts:82-94` (context menu contribution)
- `Workspace.onLayoutReady(cb)` — `src/main.ts:98` (post-init hook)
- `Workspace.getLeavesOfType(type)` — `src/main.ts:114`
- `Workspace.getRightLeaf(split)` — `src/main.ts:120`
- `Workspace.revealLeaf(leaf)` — `src/main.ts:127`
- `WorkspaceLeaf.setViewState({ type, active })` — `src/main.ts:122`
- `ItemView` base class — `src/view.ts:9` (side-panel view)
- `ItemView.getViewType()` / `getDisplayText()` / `getIcon()` / `onOpen()` / `onClose()` — `src/view.ts:20-39`

**Vault (filesystem)** (`src/store.ts`):
- `App.vault.getAbstractFileByPath(path)` — `src/store.ts:98`
- `App.vault.create(path, content)` — `src/store.ts:102`
- `App.vault.modify(file, content)` — `src/store.ts:100`
- `TFile` (instanceof check) — `src/store.ts:99`
- `normalizePath(path)` — `src/store.ts:96`

**Editor** (`src/main.ts`):
- `Editor` type — `src/main.ts:76,132`
- `Editor.getSelection()` — `src/main.ts:83,135`
- `Editor.replaceSelection(text)` — `src/main.ts:164`
- `MarkdownView` type — `src/main.ts:76,90,133`

**UI primitives**:
- `Modal` base class — `src/modal.ts:7,113` (`QuickCaptureModal`, `ReminderListModal`)
- `Modal.contentEl` / `Modal.open()` / `Modal.close()` / `Modal.onOpen()` / `Modal.onClose()` — used throughout `src/modal.ts`
- `PluginSettingTab` base class — `src/main.ts:172`
- `Setting` builder (chainable `.setName().setDesc().addToggle().addText().addButton()`) — `src/main.ts:186-235`, `src/modal.ts:144-163`
- `Notice(msg, duration?)` — `src/main.ts:137,143,147,166`, `src/modal.ts:84,88,92,108`, `src/scheduler.ts:60,71`, `src/view.ts:107`

**Context menu** (`src/main.ts:82-94`):
- `Menu.addItem(cb)` with `MenuItem.setTitle() / setIcon() / onClick()`

All APIs are imported from the `obsidian` module (marked `external` by esbuild, resolved at runtime from the Obsidian host) — see `src/main.ts:1-10`, `src/modal.ts:1`, `src/store.ts:1`, `src/view.ts:1`, `src/scheduler.ts:1`.

## Electron / Web Notification API

The plugin's single non-Obsidian platform integration.

**API:** Browser `Notification` global (Electron exposes the HTML5 Notification API, which hands off to the native OS notification center on macOS / Windows / Linux).

**Feature-detection** (defensive — `src/scheduler.ts:78-80`, `src/main.ts:99`):
```ts
if (typeof Notification === "undefined") {
  throw new Error("Notification API unavailable");
}
```

**Permission flow** (`src/main.ts:99-101`, `src/scheduler.ts:95-101`):
- On `workspace.onLayoutReady`: if `Notification.permission === "default"`, call `Notification.requestPermission()`
- When firing: if still not granted and not denied, re-request; fire only on `granted`
- If firing throws, fall back to in-app `Notice` (`src/scheduler.ts:69-72`)

**Construction** (`src/scheduler.ts:82-93`):
```ts
const n = new Notification("Quick Reminder", {
  body: reminder.text,
  silent: !silent,          // inverted: Settings.soundOnNotify=true ⇒ silent:false
  tag: reminder.id,         // dedupes duplicate notifications per reminder id
  requireInteraction: false,
});
n.onclick = () => {
  window.focus();           // bring Obsidian to front on click
  n.close();
};
```

**Behavioral notes:**
- `tag` is used as the dedup key — re-firing the same reminder id replaces the previous notification
- `requireInteraction: false` — OS may auto-dismiss
- Notification actions (buttons like "Snooze" / "Done") are **not** used; interactions happen back inside Obsidian via the modal / side-panel view
- No notification icon is set — defaults to the Electron app icon (Obsidian)

## Timers / Scheduling

**API:** Standard `setTimeout` / `clearTimeout` (Web platform timers).

**Timer registry** (`src/scheduler.ts:7-47`):
- `Scheduler.timers: Map<string, ReturnType<typeof setTimeout>>` keyed by reminder id
- `schedule(reminder)` — computes `delay = reminder.dueAt - Date.now()`, clamps to `2_147_483_000` ms (`src/scheduler.ts:28`) to stay within the 32-bit signed int limit for `setTimeout` across engines
- `scheduleAll()` — cancels then reschedules every pending reminder; called on init and after any mutation that changes due times
- `cancelAll()` — invoked on `onunload` (`src/main.ts:109`) to avoid leaks
- `scanOverdue()` — on launch, fires any reminder whose `dueAt <= now` if `Settings.fireMissedOnLaunch` (`src/scheduler.ts:49-64`)

No external cron/queue service.

## Input Parsing (chrono-node)

**Library:** `chrono-node` `^2.7.5` — pure in-process NLP, no network.

**Wrapper:** `parseReminder(input, ref)` in `src/parser.ts:9-31`:
- Calls `chrono.parse(trimmed, ref, { forwardDate: true })` — `forwardDate` pushes ambiguous matches into the future (e.g. "friday" → this/next Friday, never last)
- Takes the first match (`results[0]`) and extracts `start.date().getTime()` for the due timestamp
- Strips the matched date phrase from the original input via `stripMatchedPhrase()` (`src/parser.ts:33-37`) so the stored task text is "call mom" rather than "call mom tomorrow 3pm"

No other NLP / LLM / external parsing services.

## Summary

| Integration | Type | Module / API | Called From | Network? |
|---|---|---|---|---|
| Obsidian Plugin API | Host app | `obsidian` (external) | all `src/*.ts` | No |
| Plugin data persistence | Host app | `Plugin.loadData/saveData` | `src/main.ts:26-28`, `src/store.ts:34-42,87-88` | No |
| Vault filesystem | Host app | `App.vault.*`, `TFile`, `normalizePath` | `src/store.ts:95-104` | No |
| OS notifications | Electron / Web | `Notification` global | `src/main.ts:99-101`, `src/scheduler.ts:78-102` | No |
| In-app toasts | Host app | `Notice` | `src/main.ts`, `src/modal.ts`, `src/scheduler.ts`, `src/view.ts` | No |
| NLP date parsing | In-process lib | `chrono-node` | `src/parser.ts:1,15` | No |
| Timer scheduling | Web platform | `setTimeout` / `clearTimeout` | `src/scheduler.ts:29,38` | No |

---

*Integration audit: 2026-04-18*
