# Problem checker rules

This page lists everything the problem checker of Yammel looks for, which findings are errors or warnings, and which come with a one-click fix.

Contents:

1. How the checker works
2. Summary table of every kind of problem
3. The player name and game lines
4. Options and values
5. Switches, choices and numbers
6. Weighted values and lists
7. Item and location names
8. Fixes and "apply all"
9. What is not checked

The rules are in `src/validate/validate.ts` (helpers in `src/validate/text.ts`, types in `src/validate/types.ts`) and were checked against Archipelago's own option code, with the project's tests (`src/validate/validate.test.ts`, which runs the rules over all 80 bundled games, and `src/validate/validate.review.test.ts`). See [checking your work](../guide/checking-your-work.md) for how the findings appear in the app.

## 1. How the checker works

- It reads the YAML the way Archipelago will and needs only the option data that ships with the app. It does not need Python or Archipelago.
- A YAML that cannot be parsed gives no findings from this checker (the parse problems are shown separately). A file too odd to read, such as one with a circular anchor, is left to Archipelago and produces no findings rather than an error.
- Every finding has: a severity (`error` or `warning`), a `code`, the game and option it concerns (or none), a plain sentence saying what is wrong and what Archipelago will do, a list of fixes (possibly empty) and a source.
- Severity: an error means Archipelago would stop or reject the file; a warning means Archipelago accepts it but the result is probably not what you meant (for example a value is ignored or cut).
- A finding's id is stable for the same problem; repeats get `#2`, `#3`, and so on.
- Source `rules` means found by reading the YAML. Source `engine` is the one extra finding described in section 2, `WORLD_REFUSES`.
- An option whose value is exactly the option's own default is always accepted, even if it lies outside the stated range (a few games use such a value, for example -1, to mean automatic). An option set to nothing (`null`) is not checked.

## 2. Summary table of every kind of problem

| Code | Severity | What it means | Fix offered |
|---|---|---|---|
| `NAME_RESERVED` | error | The player is named "Archipelago". | Yes: call the player "Player". |
| `NAME_TOO_LONG` | warning | The name is longer than 16 characters and will be cut. | Yes: use the cut name. |
| `NO_GAME` | error | No `game:` line. | None. |
| `BAD_GAME_WEIGHT` | error | A game's weight in a game mix is not a number of 0 or more. | None. |
| `GAME_WEIGHTS_ZERO` | error | Every game in a mix has weight 0. | Yes: give the first game a weight of 50. |
| `UNKNOWN_GAME` | error | The game is not in this version of Archipelago's data. | Only in a mix of several games: remove it from the list (destructive). |
| `NEEDS_NEWER_VERSION` | warning | The YAML's `requires: version:` is newer than the option data. | None. |
| `MISSING_BLOCK` | error | A game that can be picked has no `<game>:` section. | Yes: add an empty section. |
| `BLOCK_NOT_MAP` | error | The `<game>:` section is a single value, not a list of options. | None. |
| `UNKNOWN_OPTION` | warning | The key is not an option of the game, so Archipelago ignores it. | Rename to the closest option (when it keeps a valid value), and remove it (destructive). |
| `BAD_VALUE` | error (warning for a number used as a switch) | A single value is not valid for its option. | A suggested value where there is one, and "Go back to the default". |
| `EMPTY_WEIGHTS` | error | A weights map with no entries. | Yes: remove it (use the default). |
| `BAD_WEIGHT` | error | A weight is not a number of 0 or more. | None. |
| `BAD_WEIGHTED_VALUE` | error (warning for a number used as a switch) | A value being weighted is not valid for its option. | Change it to the suggestion; remove it (destructive, only if another weight stays above 0). |
| `ALL_WEIGHTS_ZERO` | error | Every weight is 0. | None. |
| `EMPTY_LIST` | error | An empty list of values. | Yes: remove it (use the default). |
| `BAD_LIST_VALUE` | error (warning for a number used as a switch) | An entry of a list of values is not valid, or is not a single value. | None. |
| `WRONG_SHAPE` | error | A names option got something that is neither a list nor a map. | None. |
| `UNKNOWN_NAME` | warning if only capitals differ, otherwise error | An item or location name is not in the game. | Replace with the closest valid names; remove them (destructive). |
| `TRIGGERS_NOT_LIST` | error | `triggers` is not a list. | None. |
| `TRIGGER_NOT_MAP` | error | An entry of the trigger list is not a block. | Remove it (destructive, game blocks only). |
| `TRIGGER_MISSING` | error | A trigger has no `option_name` or no `options`. | None. |
| `TRIGGER_NO_RESULT` | warning | A trigger has no `option_result`, so it only fires when the watched option has no value. | None. |
| `TRIGGER_BAD_CATEGORY` | error | `option_category` names a section that is not in the file. | Use the closest section (game blocks only). |
| `TRIGGER_NO_CATEGORY` | warning | A trigger inside a game block has no `option_category`, so it looks at the top of the file and never fires. | Look in the game (game blocks only). |
| `TRIGGER_UNKNOWN_OPTION` | warning | The watched option is not an option of the game. | Watch the closest option (game blocks only). |
| `TRIGGER_WATCHED_NOT_SET` | error | The watched option is a real option but the game section does not write it, so Archipelago stops. | Write the option with its default (game blocks only). |
| `TRIGGER_NEVER_FIRES` | warning | The value the trigger waits for is not one the watched option can have, including a switch (`true`) against the text `"true"`, or different capitals. | Wait for the matching value (game blocks only). |
| `TRIGGER_PERCENT` | error | `percentage` is not a number. | Use 100 (game blocks only). |
| `TRIGGER_PERCENT_RANGE` | warning | `percentage` is below 0 or above 100. | Use 0 or 100 (game blocks only). |
| `TRIGGER_OPTIONS_SHAPE` | error | A trigger's `options` is not a block. | None. |
| `TRIGGER_CHANGE_BAD_CATEGORY` | error | A trigger changes options in a section that is not in the file. | None. |
| `TRIGGER_CHANGES_SHAPE` | error | The changes for one section are not a list of options with values. | None. |
| `TRIGGER_CHANGE_UNKNOWN_OPTION` | warning | A trigger changes an option the game does not have, so Archipelago ignores it. | None. |
| `TRIGGER_MERGE_KIND` | error | `+` or `-` is used on an option that holds a single value. | Set it instead (game blocks only). |
| `TRIGGER_MERGE_VALUE` | error | `+` or `-` is used with a single value instead of a list or map. | None. |
| `TRIGGER_BAD_VALUE` | error or warning | A value a trigger would set is not valid for its option (same rules as section 5). | A suggested value where there is one (game blocks only). |
| `PLANDO_NOT_LIST` | error | Item or connection plando is not a list. | None. |
| `PLANDO_ENTRY_NOT_MAP` | error | A placement or connection is not a block. | Remove it (destructive). |
| `PLANDO_NO_ITEM` | error | An item placement does not say which item. | None. |
| `PLANDO_ITEMS_SHAPE` | error | The items are not a name, a list or a map. | None. |
| `PLANDO_UNKNOWN_ITEM` | error | An item name is not an item or item group of the game. | Use the closest name. |
| `PLANDO_UNKNOWN_LOCATION` | warning (error when `force` is true) | A location name is not a location or group of the game (only checked for items placed in your own world). Archipelago quietly places nothing there. | Use the closest name. |
| `PLANDO_LOCATION_SHAPE` | error | `location` or `locations` is not a name or a list of names. | None. |
| `PLANDO_PERCENT` | error | `percentage` is not a whole number from 0 to 100 (for connections, not a number). | Use the nearest valid number. |
| `PLANDO_FORCE` | error | `force` is not true, false or silent. | Use silent. |
| `PLANDO_FROM_POOL` | error | `from_pool` is not true or false. | Use true. |
| `PLANDO_COUNT` | warning (error when `force` is true) | `count` is more than the items named. | Use the number of items. |
| `PLANDO_COUNT_RANGE` | error | A count range has a fewest above its most. | Swap them. |
| `PLANDO_TEXT_NO_PLACE` | error | A text has no `at`. | None. |
| `PLANDO_TEXT_UNKNOWN_PLACE` | error | The `at` is not one of the game's text places (capitals matter). Archipelago stops when it writes the game. | Use the closest place. |
| `PLANDO_TEXT_SHAPE` | error | The `text` is not words or a list of lines. | None. |
| `PLANDO_TEXT_EMPTY` | warning | A text has no words in it. | None. |
| `PLANDO_CONNECTION_MISSING` | error | A connection has no entrance or no exit. | None. |
| `PLANDO_DIRECTION` | error | `direction` is not both, entrance or exit. | Use both. |
| `PLANDO_DUPLICATE` | error | An entrance, or an exit (unless the game allows repeats), is used twice. | None. |
| `PLANDO_UNKNOWN_CONNECTION` | error | An entrance or exit name is not one the game accepts (capitals are ignored). | Use the closest name. |
| `WORLD_REFUSES` | error | The check engine's world refused the settings. The message begins "The game itself refused these settings:". Shown only when the live check count is running and reports a world error. | None. |

## 3. The player name and game lines

**Name.** A missing or blank name is fine: Archipelago uses the file's name. The checker resolves the placeholders `{number}` to 1, `{NUMBER}` to nothing, `{player}` to 1 and `{PLAYER}` to nothing, trims the result and cuts it to 16 characters.

- If the result is exactly `Archipelago`: `NAME_RESERVED`.
- If the resolved name (before cutting) is longer than 16 characters: `NAME_TOO_LONG`. The message shows what the name will become.

**Game line.**

- No game at all: `NO_GAME`.
- A game mix (a map of game to weight): each weight must be a finite number of 0 or more (`BAD_GAME_WEIGHT`), and at least one must be above 0 (`GAME_WEIGHTS_ZERO`).
- Each game name is looked up exactly (capitals matter). An unknown one gives `UNKNOWN_GAME` with a "Did you mean" suggestion taken from the visible (not hidden) games. A game list may also be a list of names.
- Each known game that can be picked needs its own section, even an empty one, or Archipelago stops with "No game options" (`MISSING_BLOCK`). A game in a mix with a weight of 0 does not need one. A section that is empty (`null`) is accepted; a section that is anything other than a map gives `BLOCK_NOT_MAP`.
- `requires: version:` newer than the version of the bundled option data gives `NEEDS_NEWER_VERSION`.

## 4. Options and values

Inside a game's section, each key is checked:

- The keys `triggers` (for every game) and, for A Link to the Past, `sprite`, `sprite_pool` and `random_sprite_on_event`, are valid although they are not options. They are skipped and their contents are not checked.
- A key that is not an option of the game gives `UNKNOWN_OPTION`. The message suggests the nearest option, which is found by ignoring capitals first and then by a closeness test (edit distance, ignoring case, spaces, dashes and underscores; a name that contains the typed word also counts when the word is at least 4 characters, and the typed word also counts when it contains a name of at least 5 characters).
- Otherwise the value is checked by the kind of option (sections 5 to 7). Kinds that are not checked: see section 9.

## 5. Switches, choices and numbers

A single value (not a weights map or list) is checked as follows. "Suggestion" means the problem comes with a one-click fix to that value, and every `BAD_VALUE` also offers "Go back to the default".

**Switch (toggle)**

| Value | Result |
|---|---|
| `true`, `false` | Accepted. |
| `random` exactly in lowercase | Accepted. |
| `Random`, `RANDOM` or another capitalisation | Error: a switch only accepts "random" in lowercase; Archipelago rejects the other spelling. Suggestion: `random`. |
| A word from `on`, `1`, `true`, `yes`, `enabled`, `off`, `0`, `false`, `none`, `null`, `no`, `disabled` (any capitalisation) | Accepted. |
| Any other word (for example `ture`) | Error: not on or off, so Archipelago will stop. Suggestion: `true` or `false` for the nearest of those words, when one is close enough. |
| The number 0 or 1 | Accepted. |
| Any other number | Warning: Archipelago accepts it but it is probably a mistake. Suggestion: `true`. |
| Anything else (a map or list as a single value is handled in section 6) | Error. |

**Choice**

- A number is always accepted (numbers can name a choice and the schema does not list them).
- `random` in any capitalisation (after trimming) is accepted.
- A string or boolean must resolve to one of the option's choices, using the editor's own lookup (`resolveChoiceKey`, which also handles aliases). Otherwise the error lists the first 8 choices and suggests the nearest choice if one is close.
- Any other type is an error.

**Number (range and named range)**

- A whole number inside the option's minimum and maximum is accepted. A number that is not whole is an error with a rounded suggestion. A number below the minimum or above the maximum is an error with a suggestion of the limit.
- For a named range, the number behind any of its names (for example `none`) is always accepted, even outside the range.
- A boolean is an error, unless the minimum is 0 and the default is not 0 (Archipelago reads `true` as the default and `false` as 0 there).
- A text value is trimmed and lower-cased, then: a random word is checked as below; `high`, `low` and `default` are accepted; a name of a named range is accepted; `true`/`false` follow the boolean rule; a string of digits with an optional sign is checked as a number; anything else is an error ("not a number"), with a suggestion of the nearest name (or `high`/`low`) when one is close.
- Anything that is not a number, boolean or string is an error.

**Random words for numbers**

| Value | Result |
|---|---|
| `random`, `random-low`, `random-middle`, `random-high` | Accepted. |
| `random-range-A-B`, `random-range-low-A-B`, `random-range-middle-A-B`, `random-range-high-A-B` with whole numbers A and B | Accepted when inside the option's range (A and B may be in either order). If not: error that the range is outside what the option allows, with a suggestion `random-range-<lo>-<hi>` clamped to the option's range when any overlap exists. |
| A random range with a minus sign (for example `random-range--5-5`, `random-range-5--3`) | Error, the "minus-sign trap": Archipelago cannot read negative numbers in a random range, so it would quietly drop the minus and use different numbers. No automatic fix is offered for the range itself (only "Go back to the default"). |
| Any other word starting `random-` | Error: not a random value Archipelago knows. The message lists the valid forms. |

The word is matched in lowercase here, so `Random-Low` is read as `random-low`. A switch is the one place where capitals in `random` are rejected.

## 6. Weighted values and lists

Options of kind toggle, choice, text_choice, range, named_range and free_text can be written as a map of value to weight, or as a list. (Names options are in section 7.)

**Weights map (value: weight)**

- A map with no entries: `EMPTY_WEIGHTS`.
- Each weight must be a finite number of 0 or more, otherwise `BAD_WEIGHT` for that entry.
- If all weights are numbers and none is above 0: `ALL_WEIGHTS_ZERO`.
- Each key is checked as a value of the option with the rules in section 5. A bad one gives `BAD_WEIGHTED_VALUE`, whose message begins "In the weighted values:". Fixes: change the key to the suggestion (offered only when the suggestion is not already a key; the weight is kept), and "Remove" that entry (destructive; offered only when another entry would still have a weight above 0).

**List**

Archipelago picks one entry of a list at random, so each entry must be a good value.

- An empty list: `EMPTY_LIST`.
- Each of the first 50 entries is checked as a value. A bad one, or an entry that is itself a list or map, gives `BAD_LIST_VALUE`, whose message begins "In the list of values:". No fix is offered.

## 7. Item and location names

Options whose kind is set, list, dict or counter and that take item or location names are checked against the game's names.

- Sets and lists accept item or location group names as well as plain names. Counters and dicts (a start inventory, for instance) accept only plain names.
- A value that is neither a list nor a map: `WRONG_SHAPE`.
- Each name must match exactly, capitals included. All the wrong names of one option are reported together in one `UNKNOWN_NAME` finding (the first 6 are listed, then "and N more").
- If every wrong name differs from a real one only by capitals, the finding is a warning ("Archipelago compares capitals exactly here"). Otherwise it is an error ("will stop with an error").
- Fixes: "Use the closest valid names" (or `Use "<name>"` for a single name) replaces each wrong name with the same name in the right capitals, or the closest name when one is close enough. It is offered only when every wrong name has a replacement and there are no more than 30 wrong names. The second fix removes the wrong names and is destructive. Both keep the weights or counts of the other entries.

## 8. Fixes and "apply all"

A fix is a set of edits applied as one undo step. A fix marked destructive throws away something the person wrote. Destructive fixes are offered one at a time and are never included in "apply all". For each finding, "apply all" uses the first fix that is not destructive.

| Fix | Destructive |
|---|---|
| Call the player "Player"; use the cut name | No |
| Give the first game a weight of 50 | No |
| Add an empty `<game>:` section | No |
| Rename an unknown option to the closest option (only when that option is not already set and the value is valid for it) | No |
| Remove an unknown option | Yes |
| Use a suggested value; change a weighted value to the suggestion | No |
| Go back to the default (`BAD_VALUE`) | No (it resets the option, so the wrong value is lost; because it is not marked destructive, "apply all" uses it when a finding has no suggestion) |
| Remove an empty weights map or empty list (use the default) | No |
| Replace wrong names with the closest valid names | No |
| Remove wrong names | Yes |
| Remove one weighted value | Yes |
| Remove an unknown game from a game mix | Yes |

Findings with no fix are left for you: `NO_GAME`, `BAD_GAME_WEIGHT`, `NEEDS_NEWER_VERSION`, `BLOCK_NOT_MAP`, `BAD_WEIGHT`, `ALL_WEIGHTS_ZERO`, `BAD_LIST_VALUE`, `WRONG_SHAPE`, `WORLD_REFUSES`. A value problem with no believable replacement (such as the minus-sign trap) gets only "Go back to the default".

## 9. What is not checked

- Item and connection plando are checked as listed in section 2. Text plando (A Link to the Past) is checked the same way; its place-name rule comes from reading the game's own code (`Rom.py`) rather than from running it. Not checked: whether an item can be placed at a location, whether an entrance may be joined to an exit (each game decides), item names in another player's world, and plando-like options that are ordinary options of one game. Each rule was confirmed with Archipelago's own `Options.py` and `Fill.py`, and by running its generator.
- Other structured option kinds, and option kinds other than those in sections 5 to 7, are not checked (any value is accepted by this checker).
- Free text and text-choice values are not checked as values; only the shape of a weights map or list around them is.
- Triggers are checked as listed in section 2. Not checked: whether a `-` change removes something that is really in the list, item and location names inside a trigger's changes, and how a trigger's changes interact with another trigger beyond one trigger firing on a value another trigger sets. Each trigger rule was confirmed by running Archipelago's own `Generate.py` on a small YAML.
- Anything only the world itself can judge (whether a combination of settings works) is not covered by these rules. When the live check count is running, a world's own refusal is shown as `WORLD_REFUSES`.
