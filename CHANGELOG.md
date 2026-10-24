# Changelog

All notable changes to this project are written here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.5.0] - 2026-10-24

- **The `apyaml` tool (command line and MCP) works with any world.** Ask for a game by name and it tries the game data that ships with Yammel, then a custom world (the `.apworld` in Archipelago's `custom_worlds` folders, found by the game name in its manifest and loaded through Archipelago's own loader, cached until the file changes), then a template YAML (so a world that cannot be loaded, or is still in development, still works). Every result says where the game came from (`gameFrom`). The check engine loads the same custom world file, so `count` and `fuzz --check` work for custom worlds without copying anything into Archipelago.
- **Simple mode (default)** needs no setup. **Advanced mode** (`--advanced`) adds diagnostics, extra world folders (`--worlds`), `--template`, `--rescan`, `--no-auto` and a `worlds` command that lists every world file and whether it loaded.
- `games` now lists custom worlds found in the usual folders.
- The shipped game data (`data/schema.json`) is never changed by any of this.
- **The tool and the app share one setup.** `apyaml` uses the source folder and Python chosen in the app's Settings, and reuses the app's custom-world scan, so a custom world the app has loaded is found at once.
- **Custom worlds written for newer Python.** Choosing a Python 3.13 under Check counts lets the scan read worlds that need Python 3.12 or later (the installed Archipelago runs on 3.13). On one machine this took the scan from 179 to 205 loaded custom games.
- **Simple view is the default.** Each option shows a clear status word (Default, Changed, Random, Chances set) and one control. Chances, Roll now and Lock are in the **Advanced view**, switched with the **Advanced view: off/on** button beside the search box. A weighted value with only one value above 0 shows as that value, since Archipelago always picks it, and a file's chances are never removed in the Simple view.
- `scripts\run-yammel.cmd` opens Yammel from the project folder (it builds first).
- **The live check count works for custom games.** The check engine loads a custom game's own `.apworld` the first time it is counted.
- **Game data for Archipelago 0.6.8:** 82 games (Gauntlet Legends and Yu-Gi-Oh! Forbidden Memories are new), with the new TUNIC and Zelda options. The difficulty ratings and the Games to mix data were checked against it.
- **Fixed:** a value with weight 0 was reported as a problem (Archipelago never picks it; its own templates contain such values, for example a negative random range). 56 of 487 real files showed false errors; now only real problems are shown.
- **Fixed:** changing one weight rewrote the whole list: values like `'2'` moved to the top, their quotes changed and the note after each line was lost. Weights are now changed in place.
- **Fixed:** a world's own default that lies outside the range it states is no longer reported as wrong.
- **Fixed:** reading options from a template: lists of counts (trap weights) were read as choices, choices named like numbers were read as a number range and in the wrong order, and words a number option accepts ("individually-randomized") were refused.
- **Fixed:** the scan stopped on a world with a word-valued name in a number option (Final Fantasy Tactics Advance), left out a world that was also in the source folder's own `custom_worlds`, and kept a capitalised default that matches no choice (Yu-Gi-Oh! Forbidden Memories).
- **Fixed:** anything the check engine started (Archipelago installing a world's requirements) could write into its reply channel and lose an answer.
- Opening a `meta.yaml` says it is a meta file instead of asking for a game line.
- See [Custom worlds, development worlds, and simple and advanced mode](docs/reference/command-line-and-mcp.md#7-custom-worlds-development-worlds-and-simple-and-advanced-mode).

## [0.3.1] - 2026-10-15

- **Any YAML opens.** A YAML for a game Yammel has no data for (a custom world you never scanned, or one the scan cannot load, such as a world written for a newer Python) used to be refused with "is not in the game list". It now opens with every option read from the file itself: choices, ranges, switches, lists, the section headings and the description under each option. All of it is editable, and comments and layout are kept. The check count, difficulty and item or location name checks are not available for such a game, and the screen says so. A misspelled name of a game Yammel does know still gets the "did you mean" message.

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
