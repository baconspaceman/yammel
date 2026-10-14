# Building and running

How to set up a development copy of Archipelago YAML Editor, run it, build it, regenerate its data and run the Python tests.

Contents:

- [Requirements](#requirements)
- [Install](#install)
- [npm scripts](#npm-scripts)
- [Running in development](#running-in-development)
- [Building and running the built output](#building-and-running-the-built-output)
- [Command line tool](#command-line-tool)
- [Regenerating the data files](#regenerating-the-data-files)
- [Python tests](#python-tests)
- [Windows installer](#windows-installer)

## Requirements

- **Node.js 22 or newer.** `package.json` sets `"engines": { "node": ">=22" }`.
- **npm**, which comes with Node.
- **Optional: an Archipelago source clone with its own Python virtual environment.** It is needed only for the live check count, the seed generator, custom world scanning, regenerating `data/schema.json` and `data/world-features.json`, the Python tests, and the Playwright tests that use the real engine. Everything else works without it.
  - Clone `https://github.com/ArchipelagoMW/Archipelago`.
  - In that folder create a virtual environment named `.venv` and install Archipelago's `requirements.txt` into it. The app looks for the Python inside that folder's `.venv` (on Windows `.venv\Scripts\python.exe`).
  - Tell the app where it is in one of three ways, checked in this order: the folder chosen in the app's Settings, the `ARCHIPELAGO_AP_ROOT` environment variable, or a folder named `archipelago-dev/Archipelago` placed next to the project folder (that is, `<project folder>/../archipelago-dev/Archipelago`). The tests also expect this sibling layout unless told otherwise.
  - The installed Archipelago (the one with the launcher) is not a source folder and cannot be used for check counts.

The shipped schema (`data/schema.json`) is already in the repository, so there is nothing else to download to run the editor.

## Install

From the project folder:

```bash
npm install
```

## npm scripts

These are all the scripts in `package.json`.

| Script | Runs | What it does |
|---|---|---|
| `npm test` | `vitest run` | Runs every unit test under `src/` once (`src/**/*.test.ts` and `.tsx`). Tests that need an Archipelago clone or `data/schema.json` skip themselves when it is missing. |
| `npm run typecheck` | `tsc --noEmit` | Type-checks the project (strict mode; includes `src`, the build configs, `playwright.config.ts` and `tests/e2e`). |
| `npm run dev` | `electron-vite dev` | Starts the app in development mode with hot reload for the renderer. |
| `npm run bundle` | `electron-vite build` | Builds main, preload and renderer into `out/`. |
| `npm start` | `electron-vite preview` | Runs the built output from `out/` (run `npm run bundle` first). |
| `npm run e2e` | `electron-vite build && playwright test` | Builds, then runs the whole Playwright end-to-end suite. See [testing.md](testing.md). |
| `npm run cli:build` | `vite build --config vite.cli.config.ts` | Builds the `apyaml` command line and MCP tool into `out/cli/apyaml.mjs`. |
| `npm run dist` | `electron-vite build && electron-builder --win` | Builds the Windows installer and portable exe into `dist/`. See [Windows installer](#windows-installer). |
| `npm run dist:dir` | `electron-vite build && electron-builder --win --dir` | Builds only an unpacked app in `dist/win-unpacked`. |

There is no lint script and no formatter script in `package.json`. The screenshot configuration `playwright.portfolio.config.ts` (for the `portfolio/` folder) has no npm script; it is not part of the normal test run.

## Running in development

```bash
npm run dev
```

This opens the editor window. In development the renderer is served from a local dev server (`ELECTRON_RENDERER_URL`, set by electron-vite); the main process and the preload script are rebuilt when you restart.

Useful environment variables, all read in `src/main` and used by the tests:

| Variable | Effect |
|---|---|
| `ARCHIPELAGO_AP_ROOT` | The Archipelago source folder to use when none is chosen in Settings. |
| `ARCHIPELAGO_YAML_SCHEMA` | Use this schema file instead of `data/schema.json` (the tests use `tests/fixtures/mini-schema.json`). |
| `ARCHIPELAGO_YAML_SEEDS` | Where "Make the seed" writes seeds (default: a folder in Documents). |
| `ARCHIPELAGO_ENGINE_IDLE_MS` | How long the check engine may sit idle before it is stopped. |

## Building and running the built output

```bash
npm run bundle
npm start
```

`npm run bundle` writes `out/main/index.cjs`, `out/preload/index.cjs` and the renderer under `out/renderer/`. `package.json` points `main` at `./out/main/index.cjs`, and the Playwright tests launch the app from the project folder, so a fresh `npm run bundle` is what they test.

## Command line tool

```bash
npm run cli:build
node out/cli/apyaml.mjs games
```

This builds `out/cli/apyaml.mjs` (one file for Node 22, with the `yaml` library bundled in). `scripts/apyaml.cmd` is a Windows wrapper that runs that file. For the commands and flags, see the command line reference in `docs/reference/command-line-and-mcp.md`.

## Regenerating the data files

All three scripts below read an Archipelago source folder and never change it. The default `-ApRoot` is the sibling `archipelago-dev/Archipelago` folder; pass `-ApRoot` to use another.

**`data/schema.json`** (every game's options):

```powershell
pwsh scripts/extract-schema.ps1 -ApRoot "<path to Archipelago source>"
```

The script runs the extractor with that folder's Python. The equivalent direct command, from the project folder, is:

```powershell
<path to Archipelago source>\.venv\Scripts\python.exe -W ignore extractor\schema_extract.py --ap-root <path to Archipelago source> --out data\schema.json
```

The extractor's arguments (from `extractor/schema_extract.py`) are `--ap-root` (required), `--out` (required), `--custom-worlds <folder>` (also load `.apworld` files from that folder) and `--only-custom` (write only the games that came from `--custom-worlds`). The app uses the last two itself when scanning custom worlds.

**`data/world-features.json`** (check counts, how much is open at the start, which games need a file, emulator systems; takes about a minute):

```powershell
pwsh scripts/scan-worlds.ps1 -ApRoot "<path to Archipelago source>"
```

This runs `engine/seed_engine.py --scan-all data\world-features.json`.

**`data/feel-profiles.json`** (drafted game profiles for the Games to mix recommender):

```bash
python scripts/make-feel-profiles.py
```

Edit the table in that script to correct a game, then re-run it. Difficulty profiles in `data/difficulty/` are plain JSON files edited by hand (see [CONTRIBUTING.md](../../CONTRIBUTING.md)).

After regenerating the schema, run `npm test`: the tests that check the real schema (for example `src/schema/real-schema.test.ts` and `src/difficulty/profiles.real.test.ts`) confirm that it still loads, and that each shipped difficulty profile still matches it and the Archipelago version.

## Python tests

The Python tests are in `extractor/tests` (`test_schema_extract.py`, `test_custom_worlds.py`) and `engine/tests` (`test_seed_engine.py`). They use `unittest` and import Archipelago's own code, so run them with the Archipelago source folder's Python, from the project folder:

```powershell
<path to Archipelago source>\.venv\Scripts\python.exe -m unittest discover -s extractor\tests
<path to Archipelago source>\.venv\Scripts\python.exe -m unittest discover -s engine\tests
```

Each test file finds Archipelago through the `AP_ROOT` environment variable, or else the sibling `archipelago-dev/Archipelago` folder. Note that this is `AP_ROOT`, a different name from the app's `ARCHIPELAGO_AP_ROOT`. Some engine tests also look for `.venv\Scripts\python.exe` inside that folder, so a Windows layout is assumed.

You can also run a single file directly, for example `python extractor\tests\test_schema_extract.py` with the Archipelago Python.

## Windows installer

The installer is built with `electron-builder`, configured in the `build` section of `package.json`. Windows is the only target configured.

```bash
npm run dist:dir   # an unpacked app in dist/win-unpacked, for a quick check
npm run dist       # the installer and the portable exe in dist/
```

Both scripts run `electron-vite build` first. `npm run dist` produces, in `dist/`, `Archipelago-YAML-Editor-Setup-<version>.exe` (an NSIS installer that lets the person choose the install folder and installs per user) and `Archipelago-YAML-Editor-Portable-<version>.exe`. The packaged files are `out/`, `data/`, `engine/`, `extractor/`, `assets/icon/`, `package.json` and `LICENSE`; the Python tests and `__pycache__` folders are left out. `asar` is turned off, so the Python scripts in `engine/` and `extractor/` sit in the package as ordinary files and can be run by the Archipelago Python.

To check a packaged build, run `npm run dist:dir` and then the Playwright test `tests/e2e/packaged.spec.ts`; it skips itself when `dist/win-unpacked` does not exist.

The release workflow (`.github/workflows/release.yml`) builds the same two downloads on Windows when a tag starting with `v` is pushed, and attaches them with a SHA-256 checksum list to a GitHub release. The CI workflow (`.github/workflows/ci.yml`) runs `npm run typecheck`, `npm test`, `npm run cli:build` and `npm run bundle` on Windows with Node 24, plus `npm audit --omit=dev --audit-level=moderate`.
