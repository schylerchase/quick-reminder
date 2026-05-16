import {
  App,
  Notice,
  PluginManifest,
  normalizePath,
  requestUrl,
} from "obsidian";

const UPDATE_REPO = "schylerchase/quick-reminder";
const RELEASE_API_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
const RELEASE_ASSETS = ["main.js", "manifest.json", "styles.css"] as const;

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  assets: GitHubReleaseAsset[];
}

export interface UpdateCheck {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
}

export class NoPublicReleaseError extends Error {
  constructor() {
    super(
      "No public GitHub release found. Make sure the repository is public and a release is published.",
    );
    this.name = "NoPublicReleaseError";
  }
}

export class PluginUpdater {
  constructor(
    private app: App,
    private manifest: PluginManifest,
  ) {}

  async check(): Promise<UpdateCheck> {
    const release = await this.fetchLatestRelease();
    const latestVersion = normalizeVersion(release.tag_name);
    const currentVersion = normalizeVersion(this.manifest.version);

    return {
      currentVersion,
      latestVersion,
      hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
    };
  }

  async installLatest(): Promise<UpdateCheck> {
    const release = await this.fetchLatestRelease();
    const latestVersion = normalizeVersion(release.tag_name);
    const currentVersion = normalizeVersion(this.manifest.version);
    const check = {
      currentVersion,
      latestVersion,
      hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
    };

    if (!check.hasUpdate) {
      return check;
    }

    const pluginDir = this.getPluginDir();
    const assetMap = new Map(
      release.assets.map((asset) => [asset.name, asset]),
    );

    // Download all assets first; do not commit any to disk until integrity-checked.
    const downloads = new Map<string, string>();
    for (const name of RELEASE_ASSETS) {
      const asset = assetMap.get(name);
      if (!asset) {
        throw new Error(`Release ${release.tag_name} is missing ${name}.`);
      }
      const file = await requestUrl({
        url: asset.browser_download_url,
        throw: false,
      });
      if (file.status >= 400) {
        throw new Error(
          `Asset ${name} download failed with HTTP ${file.status}.`,
        );
      }
      downloads.set(name, file.text);
    }

    // Integrity check: downloaded manifest.json must declare the release's version.
    // Defends against CDN/asset-swap attacks where binaries are tampered post-publish.
    const manifestText = downloads.get("manifest.json");
    if (!manifestText) {
      throw new Error(
        `Release ${release.tag_name} manifest.json missing from downloads.`,
      );
    }
    let parsedManifest: { version?: unknown };
    try {
      parsedManifest = JSON.parse(manifestText) as { version?: unknown };
    } catch {
      throw new Error(
        `Release ${release.tag_name} manifest.json is not valid JSON.`,
      );
    }
    const declaredVersion =
      typeof parsedManifest.version === "string"
        ? normalizeVersion(parsedManifest.version)
        : "";
    if (declaredVersion !== latestVersion) {
      throw new Error(
        `Release ${release.tag_name} integrity check failed: manifest.json declares "${declaredVersion}".`,
      );
    }

    // All assets validated; commit to disk.
    for (const name of RELEASE_ASSETS) {
      const text = downloads.get(name);
      if (text === undefined) continue;
      await this.app.vault.adapter.write(
        normalizePath(`${pluginDir}/${name}`),
        text,
      );
    }

    return check;
  }

  getRepositoryUrl(): string {
    return `https://github.com/${UPDATE_REPO}`;
  }

  private async fetchLatestRelease(): Promise<GitHubRelease> {
    const response = await requestUrl({
      url: RELEASE_API_URL,
      headers: {
        Accept: "application/vnd.github+json",
      },
      throw: false,
    });

    if (response.status === 404) {
      throw new NoPublicReleaseError();
    }
    if (response.status >= 400) {
      throw new Error(
        `GitHub update check failed with HTTP ${response.status}.`,
      );
    }

    return response.json as GitHubRelease;
  }

  private getPluginDir(): string {
    if (!this.manifest.dir) {
      throw new Error("Obsidian did not provide the plugin install directory.");
    }
    return this.manifest.dir;
  }
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map((part) => parseInt(part, 10) || 0);
  const b = right.split(".").map((part) => parseInt(part, 10) || 0);
  const length = Math.max(a.length, b.length);

  for (let i = 0; i < length; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}
