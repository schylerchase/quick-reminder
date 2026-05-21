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
| Start from a template | Quick Reminder: Start with template dashboard |
| Insert task headings | Quick Reminder: Insert task sections |

## First reminder

Try:

```text
send the status update tomorrow 9am
```

Quick Reminder parses the date phrase, stores the reminder locally, and schedules it while Obsidian is open.
