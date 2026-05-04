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
| Open reminder manager | Click the ribbon checklist icon, or command palette -> "Open reminder manager" |
| Open capture modal | Command palette -> "Quick capture reminder", or the manager's New button |
| View/snooze/edit/done reminders | Reminder manager |
| Scan vault tasks | Reminder manager -> Scan |
| Change snooze default, mirror file, etc. | Settings -> Quick Reminder |

### Vault task dashboard

The reminder manager includes a **Vault tasks** section that scrapes your current Obsidian vault for:

- unchecked Markdown tasks like `- [ ] follow up with Alex`
- explicit uppercase marker lines like `TODO: renew license`, `FIXME: update draft`, or `TASK: prep agenda`

Use **Open** to jump to the source note and line. Use **Add reminder** when the task text contains a detectable time, or **Capture** to open the reminder modal prefilled with the task text.

Tasks are grouped by project. Notes under `Projects/<project name>/...` use `<project name>` as the project; other notes use their top-level folder or note name. Use the search box and project/source filters to narrow the dashboard. Checkbox tasks also have a **Done** action that updates the source note from `- [ ]` to `- [x]`.

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
