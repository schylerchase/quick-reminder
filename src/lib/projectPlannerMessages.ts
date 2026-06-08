export function getProjectTargetExistsNotice(path: string): string {
  return `Quick Reminder will not overwrite ${path}. Choose a different target note path.`;
}

export function getProjectCreatedNotice(path: string): string {
  return `Project note created: ${path}`;
}

export function getProjectCreateFailedNotice(path: string): string {
  return `Quick Reminder could not create ${path}. Check the folder path or choose another target note.`;
}

export function getProjectCreateRefreshFailedNotice(path: string): string {
  return `Project note created at ${path}, but Quick Reminder could not refresh the dashboard. Reopen the dashboard or reload Obsidian.`;
}

export function getProjectMarkdownCopiedNotice(): string {
  return "Project markdown copied.";
}

export function getProjectMarkdownCopyFailedNotice(): string {
  return "Quick Reminder could not copy the project markdown. Select the preview text and copy it manually.";
}
