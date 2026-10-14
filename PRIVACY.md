# Privacy policy

Yammel is a program that runs on your own computer. This page says what it stores, what it can send, and what it never does.

## The short version

- Yammel has **no account, no login, no analytics, no telemetry, no crash reporting and no automatic update check**.
- Editing, checking and saving a YAML all happen on your computer.
- The only way anything leaves your computer is if **you switch on an optional AI helper** and then send a question. Everything else works with no internet connection.

## What Yammel stores on your computer

| What | Where | Why |
|---|---|---|
| Settings (theme, folder choices, helper choices) | `%APPDATA%\Yammel` | So the app remembers your choices. |
| Your presets and recent-file list | `%APPDATA%\Yammel` | So they are there next time. |
| Backups of files before they are overwritten | `%APPDATA%\Yammel\backups` | So a save can be undone. |
| An OpenRouter key, only if you add one | `%APPDATA%\Yammel`, encrypted by Windows | Needed to call OpenRouter. Never shown again in the window, never written to settings. |
| Seeds you generate | `Documents\Yammel\Seeds` | The output you asked for. |
| The YAMLs you save | Wherever you choose | Your files. |

Nothing in that list is uploaded. You can delete the folders at any time; the app starts fresh.

## What can leave your computer, and only when you ask

The Helper chat has a built-in guide that works fully offline and sends nothing. You may optionally switch on one of three helpers in Settings. Each one asks you to confirm the first time.

- **OpenRouter**: when you send a question, your current YAML and descriptions of the game's options are sent to OpenRouter using your own key. OpenRouter's own privacy policy then applies.
- **Claude Code** and **Codex**: Yammel runs the program already installed on your computer, under your own login. What that program sends is governed by its own terms and privacy policy, not by Yammel.

If you never switch a helper on, Yammel makes no network requests of its own.

## What Yammel never does

- It never collects or sends usage statistics.
- It never reads your files except the ones you open or point it at (a YAML, your Archipelago folder, your custom worlds folder).
- It never writes to your Archipelago install without showing you the change first and keeping a backup.
- It never includes a key, account or token of its own.

## Downloads

Release files are published on GitHub. GitHub's own privacy policy applies to downloading them. Each release lists checksums so you can verify your download.

## Changes and questions

If this policy changes, the change is written in [CHANGELOG.md](CHANGELOG.md). Questions can be asked as a GitHub issue; privacy or security problems should be reported privately as described in [SECURITY.md](SECURITY.md).
