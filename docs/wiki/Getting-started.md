# Getting Started

## Install

The recommended beta install path is BRAT:

1. Install and enable **BRAT** from Obsidian Community Plugins.
2. Run **BRAT: Add a beta plugin for testing**.
3. Enter the Quick Reminder GitHub repository URL.
4. Enable **Quick Reminder** under **Settings -> Community plugins**.

Manual installs copy `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/quick-reminder`.

## First run

Run **Quick Reminder: Start with template dashboard** from the command palette.

You can also click the Quick Reminder ribbon checklist icon to open the manager, or use **Settings -> Quick Reminder -> Starter dashboard -> Create/open starter board**.

The empty reminder manager shows a **Start here** panel with buttons for the starter board, a reminder, a task, and Project Planner.

Quick Reminder will create or open the configured starter-board file, defaulting to:

```text
Quick Reminder Dashboard.md
```

The starter board includes sample headings, sample tasks, and a managed mirror block. Replace the samples with your real tasks.

## Common commands

| Goal | Command |
|---|---|
| Capture a reminder | Quick Reminder: Quick capture reminder |
| Open sidebar manager | Quick Reminder: Open reminder manager |
| Open full dashboard | Quick Reminder: Open task dashboard |
| Plan a project | Manager -> New -> Project Planner |
| Start from a template | Quick Reminder: Start with template dashboard |
| Insert task headings | Quick Reminder: Insert task sections |
| Turn selected text into a reminder | Quick Reminder: Convert selection to reminder |
| Reveal the active note in Files | Quick Reminder: Reveal active file in file explorer |

## First reminder

Try:

```text
send the status update tomorrow 9am
```

Quick Reminder parses the date phrase, stores the reminder locally, and schedules it while Obsidian is open.

Open **Quick Reminder: Open reminders modal** or the sidebar manager to snooze, mark done, edit, restore, re-add, or delete reminders.

## First project plan

Open **Quick Reminder: Open reminder manager**, click **New**, then choose **Project Planner**.

Use `File: Projects/` when you want the note created inside a folder using the project name.

Paste an outline with `Project:`, `File:`, headings, tasks, and indented notes. Quick Reminder creates a normal Markdown note and refreshes the task dashboard. It does not schedule reminders automatically; dated tasks can still use **Add reminder** from the dashboard.
