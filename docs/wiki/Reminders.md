# Reminders

Quick Reminder turns natural-language text into local reminders.

## Examples

```text
call mom tomorrow 3pm
renew client certificate Friday 9am
take out trash in 2 hours
meeting next Tuesday at 10am
```

## Reminder lifecycle

1. Capture text through the modal, context menu, or task dashboard.
2. Quick Reminder parses the date phrase.
3. The reminder is saved in plugin data.
4. The scheduler fires while Obsidian is open.
5. Missed reminders are caught on next launch if that setting is enabled.

## Notifications

On desktop, Quick Reminder uses browser/OS notifications when available. On mobile and unsupported environments, it falls back to Obsidian notices.

## Task-backed reminders

If a Markdown task contains a future date phrase, the dashboard can attach a reminder to that source task. This helps avoid duplicate reminders for the same task.

## Markdown mirror

When enabled, Quick Reminder keeps a generated reminder note at the configured mirror path. The default is:

```text
.reminder-config/Reminders.md
```

Do not use the mirror file as your main task board. It is generated output.
