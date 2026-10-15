# Changelog

All notable changes to this project are written here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-10-14

- **Games to mix groups**: a Pairs / Groups switch. Groups of 3 to 8 games with must-include and leave-out lists, one score for the group that counts its weakest pair, a list of every pair's score, and the same mood and scoring weights as pairs.
- **host.yaml: restore an earlier version**: lists the backups kept when you saved, and loads one into the form to review and save. Nothing is written until you save.
- **More plando**: text plando for A Link to the Past (with its 406 places listed from the game), item placements with a count range and with several players, and checks for them. The option data now lists the text places.

## [0.2.0] - 2026-10-14

- A short welcome card for the first time Yammel opens. It is shown once, and Settings can show it again.
- The host.yaml page now tells you, with a quiet note, when a file or folder setting points at something that is not on the computer. It never blocks saving.
- A **Triggers** tab: build "when this option is this value, change those options" cards with the game's own options and values. New checks for triggers, each confirmed by running Archipelago itself, including the easy-to-miss ones: a watched option that is not written in the YAML (Archipelago stops), a trigger inside a game section with no category (it never fires), and a switch value against the text "true" (never matches).
- A **Plando** tab: item placements (items, locations, whose world, from the pool or new, what to do if it goes wrong, how many, chance) and, for the six games that have them, entrance-to-exit connections with the game's real entrance and exit names. It says whether Archipelago's `host.yaml` has item plando switched on, because Archipelago ignores items plando quietly when it is off. New checks for both.
- The option data now lists each plando-connection game's entrance and exit names.
- A new guide, [Triggers and plando](docs/guide/triggers-and-plando.md).
- **Fixed:** a YAML with plando in it made the live check count read "Unavailable". Plando cannot change how many checks there are, so it is now left out of that request.
- The guides were checked against the program by three helper reads and about ten wrong statements were fixed (for example, an AI helper asks you to confirm every time you switch it on, not only the first time).
- The screenshots and the portfolio were retaken with the new tabs, and the screenshot tour has three new pictures and a welcome card.

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
