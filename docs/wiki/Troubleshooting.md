# Troubleshooting

## The dashboard is empty

Try these steps:

1. Click **Scan**.
2. Check the scope filter: Current file, Current folder, or Whole vault.
3. Clear the search box.
4. Confirm your notes contain supported Markdown tasks.

## The starter board did not appear

Check **Settings -> Quick Reminder -> Starter dashboard**. The path must end in `.md`. If a folder already uses that path, choose a different file path.

## The managed block looks stale

Run **Quick Reminder: Regenerate managed tasks block** from the command palette while the note is active.

## A reminder did not fire

Quick Reminder schedules reminders while Obsidian is open. If Obsidian was closed, the reminder can appear on next launch when **Fire missed reminders on launch** is enabled.

## Desktop notifications do not show

Check OS notification permissions and Obsidian notification permissions. Unsupported environments fall back to Obsidian notices.

## A task will not become a reminder

Add a future date phrase to the task, such as:

```md
- [ ] send status report tomorrow 9am
```
