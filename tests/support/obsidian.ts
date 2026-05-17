export interface NoticeEntry {
  message: string;
  timeout?: number;
}

export class Notice {
  static entries: NoticeEntry[] = [];

  constructor(message: string, timeout?: number) {
    Notice.entries.push({ message, timeout });
  }

  static reset(): void {
    Notice.entries = [];
  }
}

export class TFile {}

export const Platform = {
  isMobileApp: false,
  isDesktopApp: true,
  isMobile: false,
  isDesktop: true,
};

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}
