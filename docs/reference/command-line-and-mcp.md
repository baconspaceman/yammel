# Command line and MCP server (`apyaml`)

`apyaml` is the command line tool of Yammel: it makes, varies, checks and rates player YAMLs without opening the window, and the same commands are available as an MCP server.

Contents:

1. Running it
2. Output, flags and exit codes
3. Commands: games, options, new, fuzz, count, rate, worlds, schema-refresh
4. Seeds and reproducible randomness
5. The MCP server
6. Environment variables the tool reads
7. Custom worlds, development worlds, and simple and advanced mode

## 1. Running it

The tool is built into one Node file, `out/cli/apyaml.mjs` (Node target `node22`, the `yaml` library bundled in). It is built with the `cli:build` script in `package.json`, which runs `vite build --config vite.cli.config.ts` (entry `src/cli/main.ts`).

```
npm run cli:build
node out/cli/apyaml.mjs <command> [argument] [--flag value ...]
```

`scripts/apyaml.cmd` is a Windows wrapper that runs `node <project folder>/out/cli/apyaml.mjs` with the arguments you give it.

| Form | Meaning |
|---|---|
| `apyaml help`, `--help`, `-h`, or no command | Prints usage, the exit codes and every command with its flags. |
| `apyaml <command> --help` (or `-h`) | Prints that command's name, summary, argument and flags. |
| `--pretty` (anywhere on the line) | Prints indented JSON instead of one line. |
| `apyaml mcp` | Starts the MCP server on standard input and output (section 5). |

Flags are written `--name value` or `--name=value`. A boolean flag needs no value (`--check`); to switch one off write `--check=false`. A list flag may be repeated (`--set a=1 --set b=2`). A flag the command does not have is refused with the list of flags it does have. Quote game names that contain spaces. `help` and `schema-refresh` work before a schema exists; every other command needs the game schema (section 6).

## 2. Output, flags and exit codes

Every command prints one JSON object on standard output.

- On success: `{"ok":true, ...fields}`. If the success still needs attention (exit code 2), the object also contains `"exitCode":2`.
- On failure: `{"ok":false,"error":"<message>","exitCode":N, ...extra fields}`.

| Exit code | Meaning |
|---|---|
| 0 | Success. |
| 1 | The request was wrong: unknown game or option, bad value, missing file. |
| 2 | A YAML was refused by its world (a check failed or an option was unusable). The result still lists everything. |
| 3 | The check engine or the Archipelago source folder cannot be used on this machine. A missing game schema also gives 3. |

An unknown command gives exit code 1. If the output pipe is closed by the reader, the tool exits quietly with the exit code the command had.

## 3. Commands

### games

Lists the games in the schema.

| Flag | Type | Meaning |
|---|---|---|
| `--hidden` | boolean | Also list games that hide themselves from menus (worlds under development often do). |

```
apyaml games
apyaml games --hidden
```

Prints `ok`, `apVersion`, `count`, `customCount`, and `games`: a list sorted by name. A shipped game is `{name, source: "bundled", hidden, options, randomizable, rating}`; a custom world found in a usual folder is `{name, source: "custom", file, loaded}` (named from its `.apworld` manifest and not loaded yet, so listing is quick; see section 7). `options` is the option count, `randomizable` the number of options that can be randomized, `rating` the source of the difficulty rating for the game (the `source` field of the rating).

### options

Lists one game's options.

| Argument | Required | Meaning |
|---|---|---|
| `game` | yes | The game name. |

```
apyaml options "Hollow Knight"
```

Prints `ok`, `game`, `count`, and `options`: a list of objects with `key`, `name`, `kind`, `default`, `simple` (true if the option is shown in Archipelago's simple options view), `canBeRandom`, and when they apply `choices` (the choice keys), `min`, `max`, `specialNames` (the names of named-range special values).

Game name matching: exact, then ignoring case, then a single unique partial match. If nothing matches, the error suggests close names. Hidden games are found too.

### new

Makes one player YAML for a game: defaults, explicit `--set` values, and optionally randomized.

| Argument or flag | Type | Meaning |
|---|---|---|
| `game` | argument, required | The game name. |
| `--name` | string | Player name, 1 to 16 plain characters (default `Player`). Must start with a letter or digit, then letters, digits, spaces, `_`, `.`, `-`, and must not end with a space. |
| `--seed` | number | Seed for the dice. Default: a fresh one, reported back. |
| `--randomize` | boolean | Re-roll every option that is not set or locked. |
| `--set` | list | An option to set on purpose, `key=value`, repeatable. Never re-rolled. |
| `--lock` | list | Option keys to keep out of the roll (comma-separated or repeated). |
| `--band` | string | Keep the difficulty estimate inside `low-high` (0 to 10), such as `2-4`. Needs `--randomize`. |
| `--out` | string | Write the YAML to this file. Otherwise it is returned in the result. |
| `--force` | boolean | Overwrite files that already exist. |

```
apyaml new "Hollow Knight" --name Ann --set death_link=on
apyaml new "Hollow Knight" --randomize --seed 12345 --lock death_link --band 2-4 --out yamls/ann.yaml
```

Prints `ok`, `game`, `name`, `seed`, `rolled` (how many options were re-rolled), `difficulty` (`{score, label, source}` with source `rated` or `estimated`, or `null` when there is no rating), `options` (the option values as written), and either `yaml` (the text, when `--out` is not given) or `file` (the absolute path written). Without `--force`, an existing file is not replaced (exit code 1).

Value forms accepted by `--set key=value` (option keys are matched exactly, then ignoring case):

| Option kind | Accepted |
|---|---|
| toggle | `true`, `on`, `yes`, `enabled`, `1`; `false`, `off`, `no`, `disabled`, `0` (any case). |
| choice | A choice key (any case) or a known alias. |
| text_choice | A choice key, an alias, or any safe text. |
| range, named_range | A whole number inside the option's range, or (named_range) one of its special names. |
| free_text | Any text without control or line-separator characters. |
| any option that can be random | Archipelago's own random forms (for example `random`, `random-low`), checked by the same code the editor uses. |
| other kinds | Refused with "cannot be set from the command line yet (Advanced mode covers it)". |

`--band` must look like `2-4` or `2.5-6.5`; the low end must not exceed the high end and neither may pass 10.

### fuzz

Makes N varied YAMLs of one game into a folder; with `--check`, asks the real engine whether the world accepts each.

| Argument or flag | Type | Meaning |
|---|---|---|
| `game` | argument, required | The game name. |
| `--count` | number | How many YAMLs, 1 to 200 (default 5). |
| `--seed` | number | Base seed (default: fresh, reported back). |
| `--out` | string | Required. Folder to write into (created if missing). |
| `--check` | boolean | Count the checks of each YAML with the real engine. |
| `--prefix` | string | Player name prefix (default `Fuzz`, giving `Fuzz1`, `Fuzz2`, ...). |
| `--set`, `--lock`, `--band` | | As for `new`. Every YAML is randomized. |
| `--force` | boolean | Overwrite files that already exist. |

```
apyaml fuzz "My Game" --count 30 --out tests/yamls --check --seed 100
```

Files are named `01-<game-slug>.yaml`, `02-...` (the number is zero-padded to at least 2 digits). If any file exists and `--force` is not given, nothing is written and the exit code is 1.

Prints `ok`, `game`, `seed` (the base seed), `count`, `out` (absolute), `files`, and `summary`. Each entry in `files` has `file`, `seed`, `name`, `difficulty`, `options` (the number of options), and with `--check` a `check` object:

- accepted: `{ok:true, checks, items, unresolved}`
- refused: `{ok:false, reason, message}`, where a failed option check gives `reason:"invalid"` and the world's own error gives the engine's reason.

`summary` is `{written, checked, accepted, refused, unavailable}`.

Exit codes for `fuzz`: 0 when no YAML was refused; 2 when at least one was refused by its world (output still `ok:true`); 3 when the engine could not judge a YAML (timeout, crash, unknown world, no engine). In the exit 3 case the YAMLs were still written and the JSON carries the same data.

### count

Counts a YAML's checks with the real engine (builds the world's locations).

| Argument or flag | Type | Meaning |
|---|---|---|
| `file` | argument, required | Path to the player YAML. |
| `--game` | string | Which game, when the YAML names several. |

```
apyaml count yamls/ann.yaml
```

Prints `ok`, `file`, `game`, `checks`, `items`, `unresolved`, `invalid` (list of `{key, message}`), `ms`. Exit code 2 (still `ok:true`) if `invalid` is not empty. If the world raises its own error, the result is `ok:false` with exit code 2 and fields `file`, `game`, `reason`. Any other engine failure is exit code 3. A file that cannot be read or is not a usable player YAML is exit code 1; so is a YAML with no `game:` line, or one naming several games without `--game`.

### rate

Estimates the difficulty of a YAML (0 to 10). It does not need the engine.

| Argument or flag | Type | Meaning |
|---|---|---|
| `file` | argument, required | Path to the player YAML. |
| `--game` | string | Which game, when the YAML names several. |

```
apyaml rate yamls/ann.yaml
```

Prints `ok`, `file`, `game`, `source`, `status`, `score` (rounded to one decimal, or `null`), `label`, `moved` (up to 10 entries `{option, value, delta}` for what moved the number), `approximated`, `note`.

### schema-refresh

Re-reads every world in an Archipelago source folder into the schema, so a world you are building shows up with its options.

| Flag | Type | Meaning |
|---|---|---|
| `--ap-root` | string | The Archipelago source folder. Default: `ARCHIPELAGO_AP_ROOT`, else the clone `../archipelago-dev/Archipelago` relative to the project folder. |

```
apyaml schema-refresh --ap-root "C:\path\to\Archipelago"
```

It runs `extractor/schema_extract.py` with the Python environment inside the source folder (`.venv\Scripts\python.exe` on Windows, `.venv/bin/python` elsewhere), allows 5 minutes, and writes only the schema file (the path in section 6). Prints `ok`, `summary` (the extractor's last output line) and `errors` (a list of `{game, error}` for worlds that could not be read). Exit code 3 if the folder or its `.venv` is missing, the extractor cannot start, fails, or times out; the schema is not changed in that case. After a successful refresh the tool forgets the cached schema and stops the engine so the next call sees the new worlds.

## 4. Seeds and reproducible randomness

- `new --randomize`: the dice are seeded with `--seed`. The same game, `--set`, `--lock`, `--band`, name and seed give the same YAML.
- `fuzz`: YAML number `i` (counting from 0) uses seed `base + i`, wrapping past 4294967295 back to 0. The base seed and each file's own seed are reported, so one YAML can be remade with `new --randomize --seed <its seed>` and the same other flags.
- A seed is a whole number from 0 to 4294967295; anything else is refused (exit code 1).
- With no `--seed`, a fresh random seed is chosen and reported in the result, so the run can still be repeated.

## 5. The MCP server

`apyaml mcp` serves the Model Context Protocol over standard input and output, one JSON-RPC message per line (newline-delimited, no batches). Replies come back in request order. The server reports `serverInfo` `{name:"apyaml", version:"0.1.0"}`, advertises only the `tools` capability, and answers with the client's requested protocol version (default `2024-11-05`). It handles `initialize`, `ping`, `tools/list` and `tools/call`; `notifications/*` get no reply; any other method gets error `-32601`. A line that is not JSON gets `-32700`; a non-object gets `-32600`.

Every command is one tool, named `apyaml_` plus the command name with dashes turned into underscores. Tool inputs use the same names as the command-line flags, with dashes camel-cased (`--ap-root` becomes `apRoot`). The positional argument is a property of its own name. Lists are arrays of strings, booleans are booleans, numbers are numbers. Unknown or wrongly typed arguments are refused with a plain message.

| Tool | Inputs | Returns |
|---|---|---|
| `apyaml_games` | `hidden` (boolean) | Same as `games`. |
| `apyaml_options` | `game` (string, required) | Same as `options`. |
| `apyaml_new` | `game` (required), `name`, `seed`, `randomize`, `set` (string array), `lock` (string array), `band`, `out`, `force` | Same as `new`. |
| `apyaml_fuzz` | `game` (required), `count`, `seed`, `out`, `check`, `prefix`, `set`, `lock`, `band`, `force` | Same as `fuzz`. |
| `apyaml_count` | `file` (required), `game` | Same as `count`. |
| `apyaml_rate` | `file` (required), `game` | Same as `rate`. |
| `apyaml_schema_refresh` | `apRoot` | Same as `schema-refresh`. |

Each tool description is the command summary followed by the exit codes. A tool call returns `{content:[{type:"text", text:"<the same JSON object the command line prints>"}], isError:<true when ok is false>}`. The exit code is inside that JSON as `exitCode`.

In server mode the engine and schema are kept for the life of the process: the check engine stays up for 2 minutes of idleness (60 seconds for one-off command line runs) and starts only when a tool needs it. The server ends when its input closes.

Example MCP client configuration (adjust the path; `<project folder>` is where the app lives):

```json
{
  "mcpServers": {
    "apyaml": {
      "command": "node",
      "args": ["<project folder>/out/cli/apyaml.mjs", "mcp"]
    }
  }
}
```

The server speaks plain newline-delimited JSON on stdio, so any client that launches a stdio MCP server with a command and arguments can use it.

## 6. Environment variables the tool reads

| Variable | Meaning |
|---|---|
| `APYAML_ROOT` | The project folder. Default: two levels above `apyaml.mjs`, that is the folder holding `out/`. |
| `ARCHIPELAGO_YAML_SCHEMA` | Path to the game schema file. Default: `<project folder>/data/schema.json`. |
| `ARCHIPELAGO_AP_ROOT` | The Archipelago source folder, for `schema-refresh`, for loading custom worlds and for finding the check engine. See [settings and files](settings-and-files.md). |
| `APYAML_WORLDS` | Extra folders of `.apworld` files to search in simple mode too (a list, separated like `PATH`). |
| `APYAML_TEMPLATES` | Extra folders of template YAMLs to read for the fallback (a list). |
| `APYAML_CACHE` | Where the loaded custom worlds are cached. Default: `%APPDATA%\Yammel\apyaml`. |
| `APYAML_NO_CUSTOM` | Set to `1` to search no custom world or template folder unless one is given (used by the tests). |
| `APYAML_PYTHON` | The Python that loads custom worlds and runs the check engine. Default: the **Python program** chosen in the app's Settings, else the source folder's own `.venv`. A world written for Python 3.12 or later needs a Python that new. |
| `YAMMEL_USER_DATA` | The Yammel app's data folder, whose saved Settings and custom-world scan the tool reuses. Default: `%APPDATA%\Yammel`. |
| `APYAML_NO_APP_SETTINGS` | Set to `1` to ignore the app's saved Settings and its scan (used by the tests). |

The same environment variables and the Archipelago detection described in [settings and files](settings-and-files.md) apply to the check engine. The command line tool does not read the app's saved settings; it builds its engine spec from the environment variables and the project folder only.

## 7. Custom worlds, development worlds, and simple and advanced mode

`apyaml` works with the worlds that ship with Archipelago, with custom worlds (`.apworld` files), and with worlds still in development. Ask for a game by name and it tries these in order:

1. **The game data that ships with Yammel.**
2. **A custom world.** A game the Yammel app already loaded in its last custom-world scan is taken from that scan straight away (unless its file changed since). Otherwise it looks in Archipelago's `custom_worlds` folders (`C:\ProgramData\Archipelago\custom_worlds`, the `custom_worlds` folder of the Archipelago source folder, and anything in `APYAML_WORLDS`). Each `.apworld` is a zip file with a manifest that names its game, so only the one file for the game you asked for is loaded, through Archipelago's own loader. The result is cached (see `APYAML_CACHE`) until the file changes. The check engine is given the same file, so `count` and `fuzz --check` work for it too.
3. **A template YAML.** If the world cannot be loaded (for example it was written for a newer Python than the source folder's) or no world file exists, the options are read from a template YAML: the one Archipelago wrote into `Players/Templates` for that game (the launcher's "Generate Template Options"), or one you name. Every option in the template gets its choices, range and description. These games can have YAMLs made and edited; their checks cannot be counted and they have no difficulty estimate, because there is no world behind them.
4. **Otherwise** a plain error says what was tried and what to do.

Every result that names a game says where it came from: `gameFrom` is `bundled`, `custom` or `template`, and a template game adds a `gameNote` that says why (for example the loader's error).

**Simple mode** is the default and needs no setup: the usual folders are searched by themselves, results stay short, and nothing in the shipped game data or in any Archipelago folder is changed.

**Advanced mode** is for people who build and test worlds. Add `--advanced` (MCP: `advanced: true`) to get a `diagnostics` block (what was tried, which file, the cache file) and to use:

| Flag | Meaning |
|---|---|
| `--worlds <folder>` | Search this folder of `.apworld` files too (repeatable). |
| `--template <file>` | Read the game's options from this template YAML (a world still in development, or one that cannot be loaded). |
| `--rescan` | Load the world file again even if it was loaded before. |
| `--no-auto` | Search only the folders given with `--worlds`. |

These four are refused without `--advanced`. The `worlds` command (advanced only) lists the folders searched, every `.apworld` found with its game, and whether it loaded or why not; `--scan` loads them all now (the first time takes a while for a large folder).

Limits of the template fallback: the options are only what the template shows (a template lists the choices of each option, so this is complete for a generated template; a hand-written YAML with plain values gives text and number boxes); item and location names cannot be checked; and `rate` has no profile for the game.
