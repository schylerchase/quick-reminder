import esbuild from "esbuild";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";

const testEntries = [
  "tests/dashboard.test.ts",
  "tests/dashboardState.test.ts",
  "tests/dashboardOpenWorkflow.test.ts",
  "tests/dashboardScanWorkflow.test.ts",
  "tests/singleAction.test.ts",
  "tests/parser.test.ts",
  "tests/scheduler.test.ts",
  "tests/store.test.ts",
  "tests/taskScanner.test.ts",
  "tests/reminderTransaction.test.ts",
  "tests/phaseActions.test.ts",
  "tests/taskSearch.test.ts",
  "tests/taskReminderAction.test.ts",
  "tests/taskReminderWorkflow.test.ts",
  "tests/taskSourceWorkflow.test.ts",
  "tests/taskIgnoreWorkflow.test.ts",
  "tests/taskEditMessages.test.ts",
  "tests/taskContextNoteWorkflow.test.ts",
  "tests/taskHeadingRenameWorkflow.test.ts",
  "tests/inlineAddWorkflow.test.ts",
  "tests/taskDeleteMessages.test.ts",
  "tests/taskDeleteWorkflow.test.ts",
  "tests/taskLineEditWorkflow.test.ts",
  "tests/taskTextEditWorkflow.test.ts",
  "tests/taskStatusWrite.test.ts",
  "tests/reminderMessages.test.ts",
  "tests/reminderActionWorkflow.test.ts",
  "tests/reminderEditRow.test.ts",
  "tests/reminderManager.test.ts",
  "tests/modalSubmit.test.ts",
  "tests/taskTarget.test.ts",
  "tests/fileRevealMessages.test.ts",
  "tests/managedTasksBlock.test.ts",
  "tests/taskSectionMessages.test.ts",
  "tests/managedTasksOps.test.ts",
  "tests/mobileViewport.test.ts",
  "tests/viewSectionLayout.test.ts",
  "tests/ribbonOrder.test.ts",
  "tests/starterBoard.test.ts",
  "tests/starterBoardWorkflow.test.ts",
  "tests/projectPlanner.test.ts",
  "tests/projectPlannerWorkflow.test.ts",
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
