# Changelog

All notable changes to this project are written here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.1.1] - renamed to Yammel

The project is now called **Yammel**. Nothing else about how it works changed.

- The window, installer, portable file and repository are named Yammel. The downloads are `Yammel-Setup-<version>.exe` and `Yammel-Portable-<version>.exe`.
- The app's data folder is now `%APPDATA%\Yammel` and seeds are written to `Documents\Yammel\Seeds`. If you used 0.1.0, your settings, presets and recent files are in the old `Archipelago YAML Editor` folders; copy them across if you want them.
- The screenshots in the documentation show the new name.
- The repository moved to `github.com/baconspaceman/yammel`; the old address redirects.

## [0.1.0] - first public release (as "Archipelago YAML Editor")

The first release. Everything below is new.

### Making a YAML
- Every option of every bundled game (80 games) as a switch, choice, number or text box, with the game's own descriptions, grouped and searchable, and a live YAML preview.
- Open, edit and save existing YAMLs. Saves back up the old file first. Undo and redo for every change. Recent files on the start screen.
- Files with several players (separated by `---`) ask which player to edit, or split into one file per player.
- Weighted values with percentages, item and location pickers using the game's real names, mixing several games in one YAML, and a Raw tab for everything else (comments are kept).
- Presets: each game's own presets, and your own named presets.
- Custom worlds: choose a folder of `.apworld` files and use those games like any other, including a starter YAML for each.

### Checking your work
- A problem checker that reads the YAML the way Archipelago will, in plain words, with one-click fixes. Checked against Archipelago's own option code.
- A live check count using Archipelago's own world code, and a 0 to 10 difficulty gauge with a "Why this number?" breakdown.
- Aim for a difficulty: drag a slider and see the changes that get close before anything is applied.
- Make a seed: runs Archipelago's real generator, as a test that writes nothing or as a real seed.

### Finding ideas
- Randomize one option or everything, with locks and an optional difficulty band.
- Game roulette, and Games to mix (ten pairings with reasons, tunable scoring).
- A helper chat: a built-in guide that works offline, optional Claude Code, Codex and OpenRouter helpers, and a pop-out window.

### Your setup
- Archipelago's own `host.yaml` as a form, with a reviewed diff and a backup.
- Light, dark or automatic look.
- A command line tool and MCP server (`apyaml`) for scripts and AI agents.
- Windows installer and portable exe.

### Principles
- Everything beyond the basics is optional: no account, login or API key is ever required, and nothing is sent anywhere unless you switch an AI helper on.
