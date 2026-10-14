# Settings and files

This page lists every saved setting of Archipelago YAML Editor, every file the app keeps in its data folder, the environment variables it reads, and how it finds Archipelago and Python.

Contents:

1. Saved settings
2. The data folder and its files
3. Environment variables
4. How Archipelago and Python are found
5. Where seeds are written

For the settings screen itself see [settings and appearance](../guide/settings-and-appearance.md); for saving your YAML files see [files and saving](../guide/files-and-saving.md).

## 1. Saved settings

Settings live in `settings.json` in the data folder (section 2). The file holds folder paths and on/off switches only; keys and tokens are never stored in it. A missing, unreadable, over-size (more than 64 KB) or damaged file means defaults, and the app always starts. Nothing is written until you change a setting. When the file is read, each part that is the wrong type or fails its check falls back to its default on its own.

The file looks like this (these are the defaults):

```json
{
  "version": 1,
  "archipelago": { "sourceRoot": null, "pythonPath": null, "customWorldsDir": null },
  "integrations": {
    "claudeCode": { "enabled": false, "model": null },
    "codex": { "enabled": false, "model": null },
    "openRouter": { "enabled": false, "model": null },
    "jev": { "enabled": false }
  },
  "appearance": { "theme": "system" }
}
```

| Setting | Type | Default | Meaning |
|---|---|---|---|
| `version` | number | `1` | Format version of the file. |
| `archipelago.sourceRoot` | string or null | `null` | An Archipelago source folder (the one with `ModuleUpdate.py`). Used by the check-count engine and the seed generator. `null` means look for one (section 4). |
| `archipelago.pythonPath` | string or null | `null` | A Python to run the engine with. `null` means use the source folder's own `.venv` or `venv`. The file name must look like a Python program: `python`, `python3`, `python3.11`, optionally with `.exe` (pattern `^python[\d.]*(\.exe)?$`, any case); any other name is dropped to `null`. |
| `archipelago.customWorldsDir` | string or null | `null` | A folder of custom `.apworld` files whose games are added to the editor. `null` means none. Changing or clearing it discards the previous scan (the `custom-worlds` folder). See [custom worlds](../guide/custom-worlds.md). |
| `integrations.claudeCode.enabled` | boolean | `false` | Allow the optional helper to ask your own Claude Code. |
| `integrations.claudeCode.model` | string or null | `null` | Model name to ask for; `null` lets the program choose. |
| `integrations.codex.enabled` | boolean | `false` | Allow the optional helper to ask your own Codex. |
| `integrations.codex.model` | string or null | `null` | Model name to ask for; `null` lets the program choose. |
| `integrations.openRouter.enabled` | boolean | `false` | Allow the optional helper to ask OpenRouter with your own key. |
| `integrations.openRouter.model` | string or null | `null` | Model name; `null` uses `anthropic/claude-haiku-4.5`. |
| `integrations.jev.enabled` | boolean | `false` | A stored on/off switch. It has no `model` field. Apart from tests, nothing in `src/main` or `src/renderer` reads it yet. |
| `appearance.theme` | `"system"`, `"light"` or `"dark"` | `"system"` | Follow the computer's light or dark setting, or always use one. Any other value becomes `"system"`. |

Value checks:

- A path (`sourceRoot`, `pythonPath`, `customWorldsDir`) is trimmed; an empty string, a non-string, a path over 1024 characters or one containing a NUL character becomes `null`.
- A model name must match `^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$` (letters, digits and `. _ : / -`, at most 100 characters, not starting with `-`); anything else becomes `null`.
- Only an `enabled` value of `true` turns an integration on when reading the file.

The optional helpers use only what you set up: Claude Code and Codex are found as `claude` and `codex` programs on `PATH` (on Windows only a real `.exe` counts), and before they run the variables `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_ORG_ID`, `CODEX_API_KEY`, `OPENROUTER_API_KEY` and `GEMINI_API_KEY` are removed from their environment, so they use only the login you already have. No account, login or key is needed for the editor itself. See [the helper](../guide/helper.md).

## 2. The data folder and its files

The data folder is Electron's `userData` folder for the app. On Windows that is normally `%APPDATA%\Archipelago YAML Editor` (the app's `productName` in `package.json`); the exact name is chosen by Electron and was not confirmed by reading the code, so check it from the app if you need certainty. Every file below is created only when first needed.

| File or folder | Holds | Notes |
|---|---|---|
| `settings.json` | The saved settings (section 1). | Limit 64 KB. |
| `recent.json` | `{"files":[{"path","at"}]}`: the YAML files you opened or saved lately, newest first. `at` is an ISO date. | At most 10 entries, no duplicates (compared ignoring case), limit 64 KB. Only paths returned by the app's own file dialogs are stored. |
| `presets.json` | `{"presets":[{id,name,game,values,savedAt}]}`: presets you saved, a game's option values under a name. | At most 200 presets, name up to 60 characters, each preset's values up to 100,000 characters, file limit 8 MB. Damaged presets are dropped one at a time. |
| `recommender.json` | What the idea recommender remembers on this computer: `version`, `launches`, `shown`, `pins`, `dismissed`, `thumbs`, `weights`, `nudges`, `mood` (`similar`, `balanced` or `opposites`), `picks`, `favourites`, `dislikes`. | Limit 1 MB. Entries for pairs not shown for 60 launches are dropped. Never leaves the machine. |
| `secrets.json` | Encrypted secrets, a map from name to base64 of the encrypted bytes. The only name the app uses is `openRouter` (your OpenRouter key). | Encrypted with Electron's `safeStorage` (the operating system's own protection). The window can set or remove a key and ask whether one exists but never reads one back. If the system cannot protect a secret, saving it is refused. Limit 64 KB, at most 20 names. |
| `custom-worlds/schema.json` | The options of games found in your custom worlds folder, merged with the bundled game data when the editor loads. | Written by the custom worlds scan; limit 120 MB. Deleted when the folder setting changes. |
| `custom-worlds/summary.json` | `{folder, scannedAt, games:[{name,file}], problems:[{file,error}]}`: what the last scan found and which files could not be added. | Deleted when the folder setting changes. |
| `backups/` | Copies of files just before they were replaced. | See below. |

All JSON files are written by saving to a temporary file (`<name>.<pid>.tmp`) and renaming it into place, one save at a time in the order asked, so a half-written file is not left behind. A save that would exceed the file's limit fails ("Too large to save.") and the old value stays.

`backups/` receives a copy of the old contents whenever the app overwrites an existing file it is saving for you: a YAML saved with Save or Save As, YAML files saved to a folder, and Archipelago's `host.yaml` when you edit it from the app. The backup is named `<file name>.<ISO time with : and . replaced by ->.bak` (with `-1`, `-2`, ... added if that name is taken). The app does not delete backups. A new file with nothing to replace makes no backup. A YAML limit applies to every YAML the app handles: 2 MB each; a folder save accepts at most 300 files and 32 MB in total; `host.yaml` edits are limited to 1 MB.

Other places the app writes:

- Your own YAML files go where you choose in the save dialogs (the default location for Save As is your Documents folder).
- The seed generator uses a temporary folder named `apyaml-gen-...` in the system temp folder, removed when the run ends.
- Seeds go to the seeds folder (section 5).

## 3. Environment variables

| Variable | Read by | Meaning |
|---|---|---|
| `ARCHIPELAGO_AP_ROOT` | App and `apyaml` | The Archipelago source folder. Used when no source folder is set in Settings (section 4). For `apyaml schema-refresh` it is the default for `--ap-root`. |
| `ARCHIPELAGO_YAML_SCHEMA` | App and `apyaml` | Path to the game schema file. Default: `data/schema.json` inside the app (for `apyaml`, inside the project folder). |
| `ARCHIPELAGO_YAML_SEEDS` | App | Folder that receives seeds you make. Default in section 5. |
| `ARCHIPELAGO_ENGINE_IDLE_MS` | App | How long the check-count engine may sit idle, in milliseconds, before it is stopped. Used only when it is a positive number; otherwise the default of 5 minutes applies. |
| `APYAML_ROOT` | `apyaml` | The project folder. Default: two levels above `apyaml.mjs`. |
| `ELECTRON_RENDERER_URL` | App (development) | Set by the development server so the window loads from it. Not for users. |
| `PATH` | App | Searched for `claude` and `codex` for the optional helpers. |
| `ProgramData`, `LOCALAPPDATA`, `ProgramFiles` | App (Windows) | Searched for a normal Archipelago install (section 4). |

## 4. How Archipelago and Python are found

All of this only looks; it never changes an Archipelago folder.

**Source folder.** The first of these that is set is the only one looked at:

1. `archipelago.sourceRoot` in Settings (origin `settings`).
2. `ARCHIPELAGO_AP_ROOT`, if not blank (origin `env`).
3. `archipelago-dev/Archipelago` next to the project folder (origin `sibling`, the layout a developer uses).

A folder that is set but wrong is reported, not silently replaced by the next one. A folder counts as an Archipelago source folder when it contains `ModuleUpdate.py` and a `worlds` folder. If it does not exist, or is not a source folder, the check count is unavailable and the settings screen says why; the rest of the editor still works.

**Python.** If `archipelago.pythonPath` is set, that file must exist. Otherwise the source folder's own virtual environment is used: `.venv` then `venv`, inside it `Scripts\python.exe` on Windows or `bin/python` elsewhere. If neither exists the check count is unavailable.

**Check engine.** It is started on first use as `<python> -B -X utf8 -W ignore engine/seed_engine.py --ap-root <source folder>`, with the source folder as working directory. It stops after being idle (default 5 minutes; `ARCHIPELAGO_ENGINE_IDLE_MS`), each request has 30 seconds, startup has 90 seconds, and after 3 unexpected exits within 60 seconds it is switched off for a minute.

**Installed Archipelago.** On Windows these are checked in order for a folder containing `ArchipelagoLauncher.exe`: `%ProgramData%\Archipelago`, `%LOCALAPPDATA%\Archipelago`, `%ProgramFiles%\Archipelago`. An installed Archipelago is not used for check counts. It is used by the seed generator when there is no usable source folder (section 5).

**Seed generator.** Making a seed or checking a YAML with the generator uses, in this order:

1. The source folder with its Python, running `Generate.py` (needs `Generate.py` and a `host.yaml` in the source folder).
2. Otherwise the installed `ArchipelagoGenerate.exe` (needs a `host.yaml` next to it).

If `host.yaml` does not exist the app does not create it; it asks you to open the Archipelago launcher once. Each run has a 5 minute limit. See [Archipelago's settings (host.yaml)](../guide/archipelago-settings-host-yaml.md).

## 5. Where seeds are written

When you make a seed (not only check), the app creates a folder named by the start time, `YYYY-MM-DDTHH-MM-SS` (UTC, from the ISO date with `:` and `.` replaced by `-`), inside the seeds folder, and passes it to the generator as `--outputpath`. The seeds folder is `ARCHIPELAGO_YAML_SEEDS` if set, otherwise `<Documents>\Archipelago YAML Editor\Seeds`. The app looks for the `AP_*.zip` seed file and the `*Spoiler.txt` file in that folder. If the run fails or produces no seed, an empty folder is removed again. A check-only run (`--skip_output`) writes its output to a temporary folder that is deleted.
