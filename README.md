# Quick Reminder

Natural-language task capture with native OS notifications for Obsidian. Built because the Tasks plugin is syntax-heavy and Outlook reminders are unreliable.

## What it does

- **Global hotkey → tiny modal** → type `call mom tomorrow 3pm` → saved + scheduled.
- **Native OS notifications** via the Electron notification API (macOS, Windows, Linux).
- **Chrono-node NLP parser** — handles `tomorrow`, `next tuesday at 10am`, `in 2 hours`, `friday morning`, etc.
- **Markdown mirror** — keeps a `Reminders.md` file in your vault synced with pending + notified reminders.
- **Launch-time catch-up** — fires any reminders that went overdue while Obsidian was closed.
- **Snooze + delete** — via the "Show pending reminders" command.

## Install (manual, for now)

1. Build:
   ```bash
   cd quick-reminder
   npm install
   npm run build
   ```
2. Copy the plugin folder into your vault:
   ```bash
   mkdir -p /path/to/your/vault/.obsidian/plugins/quick-reminder
   cp main.js manifest.json styles.css /path/to/your/vault/.obsidian/plugins/quick-reminder/
   ```
3. In Obsidian → Settings → Community plugins → enable **Quick Reminder**.
4. Settings → Hotkeys → search "Quick Reminder" → bind **Quick capture reminder** to whatever you want (e.g. `Cmd+Shift+R`).
5. First time firing a reminder, macOS/Windows will ask for notification permission. Grant it.

## Usage

| Action | Command |
|---|---|
| Open capture modal | Hotkey you bound, or click the ribbon alarm icon |
| View/snooze/delete pending | Command palette → "Show pending reminders" |
| Change snooze default, mirror file, etc. | Settings → Quick Reminder |

### Example inputs

- `call mom tomorrow 3pm`
- `dentist next tuesday at 10am`
- `take out trash in 2 hours`
- `meeting friday morning`
- `pick up groceries saturday 9am`

If no time phrase is detected, the modal warns you — add something like "in 30 minutes" or "tomorrow 9am".

## Architecture

```
src/
  main.ts        # Plugin entry, commands, settings tab
  modal.ts       # Quick-capture UI + pending list UI
  parser.ts      # chrono-node wrapper, strips date phrase from task text
  scheduler.ts   # setTimeout queue + native notification firing
  store.ts       # Plugin data persistence + Reminders.md mirror
  types.ts       # Shared types + defaults
```

## Known limits (MVP)

- **Desktop only.** Mobile push needs a cloud relay (not built).
- **Requires Obsidian running** for in-session reminders. If Obsidian is closed, reminders fire on next launch (configurable).
- **No recurring reminders yet.** One-shot only.
- **No notification actions** (snooze/done from notification itself) — click opens Obsidian; manage via the pending list.

## Roadmap ideas

- Recurring reminders (`every monday 9am`)
- Pre-reminder lead time (notify 15 min before)
- Outlook email → reminder bridge
- Mobile push via a self-hostable relay
- Daily agenda auto-insert into daily note
