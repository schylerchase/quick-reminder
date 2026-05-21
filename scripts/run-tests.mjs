import esbuild from "esbuild";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";

const testEntries = [
  "tests/dashboard.test.ts",
  "tests/parser.test.ts",
  "tests/scheduler.test.ts",
  "tests/store.test.ts",
  "tests/taskScanner.test.ts",
  "tests/reminderTransaction.test.ts",
  "tests/phaseActions.test.ts",
  "tests/taskSearch.test.ts",
  "tests/taskTarget.test.ts",
  "tests/managedTasksBlock.test.ts",
  "tests/managedTasksOps.test.ts",
  "tests/ribbonOrder.test.ts",
  "tests/starterBoard.test.ts",
  "tests/projectPlanner.test.ts",
];

const outdir = ".tmp-tests";

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await esbuild.build({
  entryPoints: testEntries,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outdir,
  outbase: "tests",
  outExtension: { ".js": ".mjs" },
  plugins: [
    {
      name: "obsidian-test-stub",
      setup(build) {
        build.onResolve({ filter: /^obsidian$/ }, () => ({
          path: path.resolve("tests/support/obsidian.ts"),
        }));
      },
    },
  ],
});

const bundledTests = testEntries.map((entry) =>
  path.join(outdir, path.basename(entry).replace(/\.ts$/, ".mjs")),
);

const child = spawn(process.execPath, ["--test", ...bundledTests], {
  stdio: "inherit",
});

const exitCode = await new Promise((resolve) => {
  child.on("exit", (code) => resolve(code ?? 1));
});

process.exit(exitCode);
