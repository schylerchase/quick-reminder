export function getStarterBoardOpenFailedNotice(): string {
  return "Quick Reminder could not create or open the starter dashboard. Check the starter board path in settings.";
}

export function getStarterBoardReadyNotice(path: string): string {
  return `Starter dashboard ready: ${path}`;
}

export function getStarterBoardPathInvalidNotice(path: string): string {
  return `Quick Reminder starter board path "${path}" must end in .md. Update the path in settings.`;
}

export function getStarterBoardPathUnavailableNotice(path: string): string {
  return `Quick Reminder cannot use ${path} for the starter dashboard because it is already a folder. Choose another .md path in settings.`;
}

export function getStarterBoardSetupFailedNotice(path: string): string {
  return `Quick Reminder starter dashboard exists at ${path}, but the dashboard could not finish opening. Open it from the vault or reload Obsidian.`;
}
