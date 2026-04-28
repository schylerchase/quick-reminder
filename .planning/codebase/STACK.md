# Technology Stack

**Analysis Date:** 2026-04-18

## Languages

**Primary:**
- TypeScript `^5.3.3` - All plugin source code in `src/*.ts` (7 files: `src/main.ts`, `src/modal.ts`, `src/parser.ts`, `src/scheduler.ts`, `src/store.ts`, `src/types.ts`, `src/view.ts`)

**Secondary:**
- JavaScript (ESM) - Build configuration only in `esbuild.config.mjs`
- CSS - Plugin styles in `styles.css` (loaded by Obsidian at runtime)
- JSON - Manifest (`manifest.json`) and config (`package.json`, `tsconfig.json`)

## Runtime

**Environment:**
- Electron - Obsidian desktop runs on Electron; plugin executes in the Electron renderer process with Node.js integration
- Node.js (via Electron) - Available for built-in modules, but this plugin uses no Node APIs directly
- Web platform APIs - `Notification` (Electron), `setTimeout`, `HTMLElement` DOM APIs used throughout (`src/scheduler.ts:78-102`, `src/modal.ts`, `src/view.ts`)

**Target Platform:**
- Desktop only - Enforced via `manifest.json:8` (`"isDesktopOnly": true`)
- `manifest.json:5` declares `"minAppVersion": "1.4.0"`

**Package Manager:**
- npm - Lockfile `package-lock.json` present (lockfileVersion 3, 19.1K)
- No `yarn.lock` or `pnpm-lock.yaml` detected

## Frameworks

**Core:**
- Obsidian Plugin API `^1.4.11` (devDependency + peer-style; external at bundle time) - Extends `Plugin` base class in `src/main.ts:18`; uses `Modal`, `ItemView`, `PluginSettingTab`, `Setting`, `Notice`, `App`, `TFile`, `Editor`, `MarkdownView`, `WorkspaceLeaf` throughout

**Testing:**
- None detected - No test framework, no `*.test.ts`/`*.spec.ts` files, no `tests/` directory

**Build/Dev:**
- esbuild `^0.20.0` - Bundler, entry `src/main.ts`, output `main.js` (`esbuild.config.mjs:8,31`)
- TypeScript `^5.3.3` - Type-checking only, no emit (`package.json:8-9`)
- tslib `^2.6.2` - Runtime helpers enabled via `"importHelpers": true` (`tsconfig.json:11`)
- builtin-modules `^3.3.0` - Supplies Node.js built-in module list to esbuild's `external` array (`esbuild.config.mjs:3,24`)

## Key Dependencies

**Runtime (production):**
- chrono-node `^2.7.5` - Natural-language date/time parser; wrapped in `src/parser.ts:1,15` via `chrono.parse(trimmed, ref, { forwardDate: true })`; sole runtime dependency

**Dev / Type definitions:**
- `@types/node` `^20.11.0` - Node type definitions for editor tooling
- `obsidian` `^1.4.11` - Provides the Obsidian Plugin API types and module (marked `external` in the bundler so it resolves from Obsidian at load time — `esbuild.config.mjs:11`)

**Bundle Externals (not bundled, resolved by Obsidian host):**
Declared in `esbuild.config.mjs:10-25`:
- `obsidian`
- `electron`
- CodeMirror 6 modules: `@codemirror/autocomplete`, `@codemirror/collab`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/lint`, `@codemirror/search`, `@codemirror/state`, `@codemirror/view`
- Lezer parser modules: `@lezer/common`, `@lezer/highlight`, `@lezer/lr`
- All Node.js built-in modules (via `builtin-modules`)

## Configuration

**TypeScript (`tsconfig.json`):**
- `target`: `ES2020` (`tsconfig.json:7`)
- `module`: `ESNext` (`tsconfig.json:6`)
- `moduleResolution`: `node` (`tsconfig.json:10`)
- `lib`: `["DOM", "ES2020"]` (`tsconfig.json:14`)
- `strictNullChecks`: `true` (`tsconfig.json:13`)
- `noImplicitAny`: `true` (`tsconfig.json:9`)
- `isolatedModules`: `true` (`tsconfig.json:12`)
- `importHelpers`: `true` (`tsconfig.json:11`) - delegates TS helpers to `tslib`
- `inlineSourceMap` + `inlineSources`: `true` (`tsconfig.json:4-5`) - for in-editor debugging
- `allowJs`: `true` (`tsconfig.json:8`)
- `include`: `["src/**/*.ts"]` (`tsconfig.json:16`)
- No `outDir` / `noEmit` enforced at build time via CLI (`tsc -noEmit -skipLibCheck` in `package.json:8`)

**esbuild (`esbuild.config.mjs`):**
- Entry: `src/main.ts` (`esbuild.config.mjs:8`)
- Output: `main.js` (`esbuild.config.mjs:31`)
- Format: `cjs` (`esbuild.config.mjs:26`) - Obsidian plugins require CommonJS
- Target: `es2020` (`esbuild.config.mjs:27`)
- Bundling: `bundle: true`, `treeShaking: true` (`esbuild.config.mjs:9,30`)
- Sourcemap: `inline` in dev, `false` in production (`esbuild.config.mjs:29`)
- Minify: `true` only in production (`esbuild.config.mjs:32`)
- Dev mode: `context.watch()` for HMR-like rebuild loop (`esbuild.config.mjs:39`)
- Prod mode: `context.rebuild()` one-shot, then `process.exit(0)` (`esbuild.config.mjs:36-37`)

**Environment:**
- No `.env` files, no environment variable usage - plugin is fully self-contained within the vault
- User-facing config stored via `Plugin.saveData()` / `loadData()` (see `INTEGRATIONS.md`)

**Build Artifacts (gitignored per `.gitignore`):**
- `main.js` - Built bundle (57.3K)
- `main.js.map` - Sourcemap
- `node_modules/`
- `.DS_Store`, `*.log`

## Scripts

From `package.json:6-10`:
```
npm run dev        # node esbuild.config.mjs                     — watch-mode bundle
npm run build      # tsc -noEmit -skipLibCheck && node esbuild.config.mjs production
npm run typecheck  # tsc -noEmit -skipLibCheck
```

## Plugin Manifest

From `manifest.json`:
- `id`: `quick-reminder`
- `name`: `Quick Reminder`
- `version`: `0.1.0` (matches `package.json:3`)
- `minAppVersion`: `1.4.0`
- `isDesktopOnly`: `true`
- `author`: `schylerryan`

## Platform Requirements

**Development:**
- Node.js (for esbuild/tsc — version not pinned; no `.nvmrc` or `engines` field)
- npm
- Obsidian `>= 1.4.0` for local testing

**Production (end-user):**
- Obsidian desktop `>= 1.4.0` on macOS, Windows, or Linux
- Electron Notification permission granted by the OS (macOS/Windows prompt on first fire — `src/main.ts:99-101`)
- Mobile (iOS/Android) **not supported** — `manifest.json:8`

## Distribution

- No `dist/` directory — plugin is installed by copying three files into the vault's `.obsidian/plugins/quick-reminder/` folder:
  - `main.js` (built bundle)
  - `manifest.json`
  - `styles.css`
- Manual install only (per `README.md:14-29`); not yet listed in Obsidian's community plugin registry

---

*Stack analysis: 2026-04-18*
