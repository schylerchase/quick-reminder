# Troubleshooting

## The dashboard is empty

Try these steps:

1. Click **Scan**.
2. Check the scope filter: Current file, Current folder, or Whole vault.
3. Click **Show whole vault** if it appears in the empty task section.
4. Clear the search box.
5. Use **Start here** if this is a new vault.
6. Confirm your notes contain supported Markdown tasks.

## The dashboard or sidebar did not open

Try the command palette action again. If the dashboard opened but did not refresh, click **Scan** or reload Obsidian.

## Scan did not refresh the task list

Click **Scan** again or reload Obsidian. If Quick Reminder says the scan found tasks but could not refresh, the task data was updated and the visible dashboard is stale.

## The starter board did not appear

Check **Settings -> Quick Reminder -> Starter dashboard**. The path must end in `.md`. If a folder already uses that path, choose a different file path.

If the starter dashboard file exists but did not open, open it from the vault or reload Obsidian. Quick Reminder will open existing starter-board files instead of overwriting them.

## The managed block looks stale

Run **Quick Reminder: Regenerate managed tasks block** from the command palette while the note is active.

## A task was deleted but the dashboard did not refresh

Reopen the dashboard or reload Obsidian. The task line was removed from the source note, but Quick Reminder could not finish refreshing the visible task list.

## A task was ignored or unignored but the dashboard did not refresh

Reopen the dashboard or reload Obsidian. The ignore setting was saved, but Quick Reminder could not finish refreshing the visible task list.

## A task was updated but the dashboard did not refresh

Reopen the dashboard or reload Obsidian. The task line was updated in the source note, but Quick Reminder could not finish refreshing the visible task list.

## A new task was created but the dashboard did not refresh

Reopen the dashboard or reload Obsidian. The task line was added to the source note, but Quick Reminder could not finish refreshing the visible task list.

## A new task was created with the wrong status

Open the source note and review the task. Quick Reminder added the task line, but it could not finish applying the initial status you selected.

## Task status changed but the dashboard did not refresh

Reopen the dashboard or reload Obsidian. The checkbox or status metadata was updated in the source note, but Quick Reminder could not finish refreshing the visible task list.

## Task status changed but notes did not save

Open the source note and review the task. Quick Reminder already changed the checkbox or status metadata, but it could not finish writing the task notes.

## A category was renamed but the dashboard did not refresh

Reopen the dashboard or reload Obsidian. The heading was renamed in the source note, but Quick Reminder could not finish refreshing the visible task list.

## A reminder changed but the view did not refresh

Reopen the dashboard, reopen the reminder manager, or reload Obsidian. The reminder action was saved, but Quick Reminder could not finish refreshing the visible reminder list.

## The Tasks editor did not open or save

Check **Settings -> Quick Reminder -> Tasks plugin integration** and confirm the Tasks plugin is enabled. If the editor still cannot open, edit the source note directly or turn off the integration to use Quick Reminder's inline task editor.

## Show did not open the source note

Open the source note from the file explorer and try again. If the note was moved or deleted, click **Scan** so the dashboard refreshes its task list.

## A reminder did not fire

Quick Reminder schedules reminders while Obsidian is open. If Obsidian was closed, the reminder can appear on next launch when **Fire missed reminders on launch** is enabled.

## Desktop notifications do not show

Check OS notification permissions and Obsidian notification permissions. Unsupported environments fall back to Obsidian notices.

## A task will not become a reminder

Add a future date phrase to the task, such as:

```md
- [ ] send status report tomorrow 9am
```

If the reminder was added but the dashboard did not refresh, reopen the dashboard or reload Obsidian. The linked reminder already exists; do not create a duplicate.

If **Add reminder** is visible but changes to **Added** or the card shows **Reminder set**, the task already has an active linked reminder.

## Project Planner will not create a note

Check that the target path is vault-relative and does not already exist. A full note path should end in `.md`; a folder-style path such as `Projects/` uses the project name for the note file. Project Planner creates parent folders when needed, but it will not overwrite or append to an existing note.

If the project note was created but the dashboard did not refresh, reopen the dashboard or reload Obsidian. The note is already in your vault and can be edited normally.

## Manual install files look incomplete

The plugin folder only needs `main.js`, `manifest.json`, and `styles.css`. The release ZIP also includes `versions.json` and helper installers, but those extra files are not required inside `.obsidian/plugins/quick-reminder`.
