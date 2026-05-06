# Quick Reminder

Natural-language task capture with native OS notifications for Obsidian. Built because the Tasks plugin is syntax-heavy and Outlook reminders are unreliable.

## What it does

- **Global hotkey -> tiny modal** -> type `call mom tomorrow 3pm` -> saved + scheduled.
- **Native OS notifications** via the Electron notification API (macOS, Windows, Linux).
- **Chrono-node NLP parser** - handles `tomorrow`, `next tuesday at 10am`, `in 2 hours`, `friday morning`, etc.
- **Markdown mirror** - keeps a `Reminders.md` file in your vault synced with pending + notified reminders.
- **Launch-time catch-up** - fires any reminders that went overdue while Obsidian was closed.
- **Reminder manager** - done, snooze, edit, restore, re-add, and delete from one sidebar.
- **Vault task dashboard** - scans notes for unchecked Markdown tasks plus `TODO:`, `FIXME:`, and `TASK:` markers.

## Install

### For friends

1. Download `quick-reminder.zip` from the latest GitHub release.
2. Unzip it.
3. Run the installer:
   - macOS: double-click `install-macos.command`.
   - Windows: right-click `install-windows.ps1` and choose **Run with PowerShell**.
4. Select your Obsidian vault folder.
5. In Obsidian, go to **Settings -> Community plugins** and enable **Quick Reminder**.

### Manual install

Copy these release assets into your vault:

```bash
mkdir -p /path/to/your/vault/.obsidian/plugins/quick-reminder
cp main.js manifest.json styles.css /path/to/your/vault/.obsidian/plugins/quick-reminder/
```

### Updates

Quick Reminder checks GitHub releases on launch and shows a notice when a newer release exists.

To update manually inside Obsidian:

1. Open the command palette.
2. Run **Quick Reminder: Update from latest GitHub release**.
3. Reload the plugin after the update completes.

## Usage

| Action | Command |
|---|---|
| Open reminder manager sidebar | Click the ribbon checklist icon, or command palette -> "Open reminder manager" |
| Open task dashboard | Command palette -> "Open task dashboard", or click **Dashboard** in the sidebar manager |
| Open capture modal | Command palette -> "Quick capture reminder" |
| Create task or task-backed reminder | Manager -> New |
| View/snooze/edit/done reminders | Reminder manager |
| Scan vault tasks | Reminder manager -> Scan |
| Insert task sections | Command palette -> "Insert task sections" |
| Change snooze default, mirror file, etc. | Settings -> Quick Reminder |

### Use guide

Quick Reminder has two related surfaces:

- **Reminder manager** - manages scheduled reminders with due dates and OS notifications.
- **Task dashboard** - scans markdown notes for task lines and lets you update them in place.

Open the sidebar manager when you want a companion panel beside your note. Open **Dashboard** when you want the task manager as a main-screen tab.

Dashboard is adaptive: if a markdown note is active, Quick Reminder becomes the active main tab, filters to that note, and opens the source note as the next tab. If no note is active, it opens in **Whole vault** scope. Use the scope filter inside the dashboard to switch between **Current file**, **Current folder**, and **Whole vault**.

The dashboard remembers the last scope, search, source filter, sort order, and active note. If the remembered file or folder context is missing, it falls back to **Whole vault** so the task list does not open empty by default.

### Create reminders

1. Run **Quick Reminder: Quick capture reminder** or click **New** in the manager.
2. Type a task with a natural-language time, such as `call Alex tomorrow 3pm`.
3. Save it.

The reminder is scheduled using the local desktop notification system. If Obsidian was closed when the reminder became due, Quick Reminder catches it on next launch.

### Work tasks from notes

Quick Reminder scans normal markdown task syntax:

```md
- [ ] To do item
- [/] In progress item
- [x] Completed item
- [ ] In progress item `[inProgress:: 2026-05-05 12:18]`
- [ ] Completed item `[completion:: 2026-05-05 13:09]`
TODO: marker item
FIXME: marker item
TASK: marker item
```

In the task dashboard:

- **New** lets you create a plain markdown task or a reminder task. Reminder tasks are first added to the current/last active source note, then the reminder is linked to that task.
- **Show** jumps to the source note and line.
- **In progress** changes `- [ ]` to `- [/]` and adds `[inProgress:: YYYY-MM-DD HH:mm]`.
- **To do** changes `- [/]` or `- [x]` back to `- [ ]` and removes status timestamps.
- **Done** changes a checkbox task to `- [x]` and adds `[completion:: YYYY-MM-DD HH:mm]`.
- **Edit** opens the Tasks plugin editor when the Tasks plugin API is available.
- **Delete** removes the task line from the source note.
- **Ignore** hides a task from the normal dashboard without deleting it.

The dashboard refreshes while it is open when markdown files are saved, created, deleted, or renamed. Refreshes are debounced so normal typing does not trigger a vault scan on every keystroke.

Quick Reminder does not physically move task lines between headings when status changes. It keeps the source note stable and reorganizes tasks visually in the dashboard.

Status parsing uses both checkbox markers and Tasks-style inline fields. `[completion:: ...]` is treated as completed, and `[inProgress:: ...]` is treated as in progress, even when the checkbox marker is still `[ ]`.

### Choose scope

Use the dashboard scope selector:

- **Current file** shows tasks from the active note.
- **Current folder** shows tasks from the active or selected folder.
- **Whole vault** shows tasks from all markdown notes.

The sidebar is best for current-note or current-folder companion work. The dashboard is best when you want the task manager on the main screen. Right-click a file or folder in Obsidian's file explorer to show tasks for that file or folder in Quick Reminder.

### Vault task dashboard

The reminder manager includes a **Vault tasks** section that scrapes your current Obsidian vault for:

- Markdown tasks like `- [ ] follow up with Alex`, in-progress `- [/]` items, and completed `- [x]` items
- explicit uppercase marker lines like `TODO: renew license`, `FIXME: update draft`, or `TASK: prep agenda`

Use **Show** to jump to the source note and line. Use **Add reminder** when the task text contains a detectable time, or capture a reminder from task text with the context menu.

Tasks are grouped by source note first, then by **In Progress**, **To Do**, **Markers**, and **Completed**, then by the nearest markdown heading above each task. Notes under `Projects/<project name>/...` use `<project name>` as the project; other notes use their top-level folder or note name. Use the search box and source filters to narrow the dashboard.

### Categories

Categories come from markdown headings in the source note. A task inherits the closest heading above it.

```md
## Tasks

### In Progress

- [/] Deploy S1 to remaining DCs

### Completed

- [x] Downloaded Postman

#### DC Deployments Completed

- [x] ELAINE: `192.168.73.104`
```

In the dashboard this appears under the note name, then status, then category. If the heading already matches the status, Quick Reminder avoids repeating the same label.

### Task section templates

Quick Reminder ships with default task section headings:

```md
## Tasks

### In Progress

### To Do

### Completed
```

Use **Insert task sections** to add them to the active note. You can change the headings in settings. Optional auto-insert can add the sections to empty new markdown notes in selected vault folders; it is off by default for new users.

To configure new-note sections:

1. Open **Settings -> Quick Reminder**.
2. Set **Task section headings**, one per line.
3. Optionally enable **Auto-insert task sections in new notes**.
4. Add vault-relative folders under **Auto-insert folders**, one per line.

Auto-insert only runs for empty new markdown notes inside those configured folders. It skips notes that already have content or an existing `## Tasks` section.

### Example inputs

- `call mom tomorrow 3pm`
- `dentist next tuesday at 10am`
- `take out trash in 2 hours`
- `meeting friday morning`
- `pick up groceries saturday 9am`

If no time phrase is detected, the modal warns you. Add something like `in 30 minutes` or `tomorrow 9am`.

## Architecture

```text
src/
  main.ts        # Plugin entry, commands, settings tab
  modal.ts       # Quick-capture UI + pending list UI
  parser.ts      # chrono-node wrapper, strips date phrase from task text
  scheduler.ts   # setTimeout queue + native notification firing
  store.ts       # Plugin data persistence + Reminders.md mirror
  taskScanner.ts # Vault Markdown task/TODO scanner
  types.ts       # Shared types + defaults
  updater.ts     # GitHub release update installer
```

## Release process

1. Update `version` in `manifest.json` and `package.json`.
2. Build release assets:
   ```bash
   npm run release:package
   ```
3. Push a tag:
   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```
4. GitHub Actions publishes a release containing:
   - `main.js`
   - `manifest.json`
   - `styles.css`
   - `quick-reminder.zip`
   - macOS and Windows installer scripts

The in-plugin updater downloads `main.js`, `manifest.json`, and `styles.css` from the latest GitHub release.

## Known limits

- **Desktop only.** Mobile push needs a cloud relay.
- **Requires Obsidian running** for in-session reminders. If Obsidian is closed, reminders fire on next launch.
- **No recurring reminders yet.** One-shot only.
- **No notification actions** (snooze/done from notification itself). Click opens Obsidian; manage via the reminder manager.

## Roadmap ideas

- Recurring reminders (`every monday 9am`)
- Pre-reminder lead time (notify 15 min before)
- Outlook email -> reminder bridge
- Mobile push via a self-hostable relay
- Daily agenda auto-insert into daily note
