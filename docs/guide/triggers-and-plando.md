# Triggers and plando

Two advanced ways to shape a seed: **triggers** change options depending on how another option rolls, and **plando** places items or connects doors by hand. Both have their own tab in the side panel (**Triggers** and **Plando**), so you never have to write the YAML yourself.

Contents:

1. Plando in plain words
2. Before you start: is plando switched on?
3. Item plando
4. Connection plando
5. Triggers
6. Problems the checker finds
7. What is not covered here

## 1. Plando in plain words

A randomizer decides by itself where every item goes. **Plando** (short for "planned randomization") lets you overrule that for the things you care about.

- "Put a Sword in the Bottom Left Chest." (**item plando**)
- "Make this door lead to that room." (**connection plando**)
- "Give me two of these three items somewhere in the first few locations, but only half the time." (item plando with a count and a chance)

Everything else is still random. You can plando one single thing and leave the rest to the generator, or plan a lot. It is allowed in multiworlds too: you can even place an item in another player's world.

## 2. Before you start: is plando switched on?

Plando is allowed or not by whoever **makes the seed**, through the `plando_options` line in Archipelago's own `host.yaml`. In Archipelago's own default file that line is `bosses, connections, texts`, which leaves **items out**. When item plando is off, Archipelago does not stop: it quietly ignores your placements and only prints a warning.

At the top of each plando section Yammel says what it can tell:

- If it can read your Archipelago `host.yaml`, it says whether items (or connections) plando is switched on or **off** on this computer, and when it is off it tells you what to add. You can change that line in **Settings, Archipelago's own settings**.
- If it cannot find a host.yaml, it explains who decides. If you send your YAML to someone else, ask them to check their `plando_options` line.

## 3. Item plando

Open the **Plando** tab and press **Add an item placement**. Each placement is a card:

| Setting | What it does |
|---|---|
| **Items** | The item or items to place. Search by name and press Enter. Item groups work too. Choose **items with how many of each** to say, for example, 2 Arrow Upgrades and 1 Bow. |
| **Where to put them** | The locations to choose from. Leave it empty to mean "anywhere". Besides the game's own location names and groups you can use `Everywhere`, `early_locations` (spots you can reach right at the start) and `non_early_locations`. |
| **In whose world** | **My own world** (the default), **Any other player's world**, **Everyone's world, mine too**, or **One player**, by number (1 is the first player in the multiworld) or by name. |
| **Take them from the normal item pool** | On by default: the item is taken out of the normal pool, so nothing is duplicated. Turn it off to add brand new copies. |
| **If it goes wrong** | What happens when the generator cannot place the items: carry on quietly (the default, "silent"), carry on but warn, or stop the whole generation. |
| **How many to place** | How many of the chosen items to place. Empty means as many as the items and locations allow. |
| **Chance (%)** | The chance that the whole placement is used. Empty means always. |

How it fits together:

- One item and one location is simply "put this there".
- Several items and several locations means "put these items in some of these locations, chosen by the generator".
- With a **How many to place** number, the generator picks that many of the items.

Examples:

- *Always put a Sword in the Bottom Left Chest.* Items: Sword. Where: Bottom Left Chest.
- *Hide a Hammer or a Shield somewhere in the early game.* Items: Hammer, Shield. Where: `early_locations`. How many: 1.
- *Give another player a Key, but only half the time.* Items: Key. In whose world: any other player's. Chance: 50.

Notes:

- Names are compared exactly, with the same capitals as the game uses. The problem list offers the nearest real name when you mistype one.
- An unknown **item** name stops Archipelago. An unknown **location** name is skipped quietly (the item is simply not placed), unless **If it goes wrong** is set to stop the generation. Yammel shows the first as an error and the second as a warning.
- If you write a placement in the **Raw** tab that this editor cannot show (a count range such as `min`/`max`, or a list of worlds), the card says so and keeps it exactly as it is.

## 4. Connection plando

Only some games have connection plando: A Link to the Past, Kirby's Dream Land 3, Ocarina of Time, TUNIC and The Messenger. Where a game has it, the **Plando** tab shows a **Connections** section.

Each connection has an **Entrance** and an **Exit**. Start typing and the box suggests the real names the game accepts. Archipelago ignores capitals in these names, so `Sanctuary` and `sanctuary` are the same. **Which way** says whether the way back is joined too: both ways (the default), entrance to exit only, or exit to entrance only. **Chance (%)** works as above.

Archipelago stops with an error for:

- an entrance or exit that is not one of the game's names,
- an entrance used twice, and an exit used twice (TUNIC allows the same exit more than once),
- a missing entrance or exit, or a direction that is not one of the three above.

Some games add their own rules about which entrances may join which exits. Those are not checked here, so a pair that looks fine can still be refused when the seed is made.

## 5. Triggers

A **trigger** says: *when this option comes out as this value, change these other options.* It is decided when the seed is made, after any random rolls.

Open the **Triggers** tab and press **Add a trigger**. A card reads like a sentence:

- **When** [an option] **is** [a value]: the option to watch, and the value that fires the trigger.
- **Chance (%)**: how often it fires when the value matches. Empty means every time.
- **Then change**: one or more changes. Each change picks an option and one of **set to**, **add to** or **take from**. The last two work on lists, sets and maps (for example a starting inventory) and add or remove entries instead of replacing the whole thing.

Things that matter, each confirmed by running Archipelago itself:

- **The watched option must be written in the YAML.** If it is not, Archipelago stops. When you add a trigger for an option that is not written yet, Yammel writes that option for you with the value the trigger waits for.
- **The value has to match exactly.** The switch value `true` is not the same as the text `"true"`, and `ganon` is not `Ganon`. Pick the value from the list in the trigger card and you will always match.
- **A trigger inside a game's section must say which section to look in** (`option_category`). Without it Archipelago looks at the top of the file, finds nothing, and the trigger never fires. Yammel always writes it for you and flags a trigger that lacks it.
- **If the watched option is weighted** (for example 50% one value, 50% another), the trigger looks at the value that was rolled.
- A trigger can fire on a value that **another trigger** sets, so you can chain them.
- Comments you wrote inside the trigger list are not kept when you edit the list here. The rest of the file is untouched.
- A trigger that is not at the game's level (for example one at the very top of the file) or uses things this editor does not show is listed read-only and kept exactly as it is. Edit it in the **Raw** tab.

## 6. Problems the checker finds

The problem checker reads triggers and plando too, and each finding appears in the strip at the top and in the tab itself, with a button for the fix when there is one. The full list, with severities, is in [Problem checker rules](../reference/validator-rules.md).

## 7. What is not covered here

- **Other plando-like options.** Some games have their own: A Link to the Past's `plando_texts`, Mega Man's weakness plando, Hollow Knight's charm costs and similar. These stay where they were: ordinary option cards where the game's options allow it, and the **Raw** tab otherwise.
- **Whether a placement really works.** Whether an item can sit at a place, or whether an entrance may lead to an exit, is up to the game and is only known when the seed is made. Use **Make a seed** in the Seed tab to try it.
- **Item and location names inside a trigger's changes.** The names a trigger changes are not checked.

Back to [the guide index](../README.md).
