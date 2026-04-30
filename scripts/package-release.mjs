import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const releaseDir = join(root, "dist", "release");

const releaseFiles = [
  "main.js",
  "manifest.json",
  "styles.css",
  "installers/install-macos.command",
  "installers/install-windows.ps1",
];

await rm(releaseDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });

for (const file of releaseFiles) {
  const target = join(releaseDir, file.split("/").pop());
  await copyFile(join(root, file), target);
}

await chmod(join(releaseDir, "install-macos.command"), 0o755);

const zip = spawnSync("zip", ["-r", "../quick-reminder.zip", "."], {
  cwd: releaseDir,
  stdio: "inherit",
});

if (zip.error || zip.status !== 0) {
  console.warn("zip was not available; release files were still written.");
}

console.log(`Release files ready in ${releaseDir}`);
