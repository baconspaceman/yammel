# Ideas and shortcuts

Four ways to get a starting point quickly: roll some or all options at random, let the app pick games for you, get pairs of games to mix, or apply a preset. Each one changes your YAML in a way you can undo.

## Randomize

Randomize rolls new values for options, either for one option or for all of them at once.

Open it with the **Randomize…** button next to the search box above the option list. The panel says how many options it will re-roll, how many are locked, and how many weighted options it will leave alone.

![The Randomize panel open above the option list](../images/07-randomize-panel.jpg)

### Randomize everything

1. Lock any option you want to keep (see **Lock** below).
2. If you want to keep the difficulty in a range, tick **Keep the difficulty between** and type the low and high ends. They start at 3 and 7, on a scale from 0 to 10. This box is only available for games that have a difficulty rating.
3. Press **Randomize everything**.

Undo puts everything back in one step.

If you asked for a difficulty range, the app tries different rolls until the difficulty estimate lands inside it. If no roll fits after its tries, nothing changes and the panel says so. Try a wider range, or unlock more options. A game with no difficulty rating shows "This game has no difficulty rating, so there is no band to keep."

**What is left alone:**

- Options you have locked.
- Options that already have weighted values (a table of chances, or a list). You chose those on purpose.
- Number options with more than 1,000 possible values, such as starting money. **Roll now** still works on them.
- Options that are not part of the game's simple option list, and options that cannot take a random value.
- Some games refuse some combinations. If the **Checks** bar says so, randomize again.

### One option at a time

Each option has its own row of controls:

- **Roll now** picks a real value for that one option and writes it.
- The menu **How ... is decided** chooses between **Fixed value**, **Random**, **Random, leaning low**, **Random, leaning middle**, **Random, leaning high**, **Random between two numbers** (which shows **random from** and **random to** boxes), and **Weighted values** where the option allows it. The random choices are written as Archipelago's own random values, so Archipelago picks the value when it makes the seed.
- **Lock** keeps the option as it is when you press **Randomize everything**. A locked option shows as pressed.

Two buttons in the panel work on locks:

- **Lock the options I have set** locks every option this YAML already sets.
- **Clear all locks** removes every lock. It is greyed out when nothing is locked.

## Game roulette

Game roulette picks games for you, at random, and makes a YAML for each one.

1. On the start screen, press **Game roulette**.
2. Under **What should it make?**, choose one of:
   - **Games only**: just the names of the games.
   - **Games and YAMLs** (the default): the names, and a YAML file name for each.
   - **YAMLs only**: the YAML files. If you ask for one game, **Spin** opens it straight in the editor.
3. Use **How many games** to choose from 1 to 10. The default is 3.
4. Press **Spin**.

Each result has a number, its name, and buttons:

- **Re-roll** picks a new game for that place. It never picks a game that is already in the list.
- **Open in editor** opens that game's YAML. In **Games only** mode the button says **Start a YAML for this game** instead.

When the results are YAMLs, **Save all YAMLs to a folder…** saves one file per game into a folder you choose. If a file with the same name is already there, the new one is saved as, for example, "name (2).yaml" and the old one is left alone.

Each YAML is a starter file with the game's defaults. It is a place to begin, not a finished player file.

![The roulette result list](../images/15-game-roulette.jpg)

## Games to mix

Games to mix suggests pairs of games that go well together in one YAML. You do not have to tell it anything. Ten suggestions show up, and new ones appear each time you start the app.

1. On the start screen, press **Games to mix**.
2. Read the pairs. Each one has a score out of 100, a short label (**Alike**, **Different** or **Easy to run together**), some reasons, and a bar for each part of the score.
3. Press **Use these games** on a pair you like. The app opens a new YAML that mixes the two games, each at the same weight.

![Games to mix suggestions with their reasons and score bars](../images/14-games-to-mix.jpg)

### Groups of three or more

Playing with friends who each bring a different game? Switch **Pairs** to **Groups of three or more** at the top of the screen.

1. Choose **How many games** (3 to 8).
2. Optionally add games to **Must include** (they are in every group) or **Leave out** (they are in none). A game cannot be on both lists.
3. Read the groups. Each has one score out of 100, the best pair inside it, and a warning naming the **weakest link** when two of the games do not suit each other. **How each pair scores** lists every pair's score.
4. Press **Use these games** to start a YAML that mixes all of them at the same weight. **Leave these games out** puts a whole group on the leave-out list, **Try different groups** looks again, and **Give me ten more** adds ten new groups below.

A group's score is mostly the average of every pair inside it, pulled down by its weakest pair, because a group is only as good as its worst match. The mood choice ("Similar vibes", "Balanced", "Opposites attract") and the scoring weights under **Tune the scoring** apply to groups too. No game appears in more than three of the first ten groups, so the list has variety. The same choices give the same first ten groups.

Each part of the score has a source label:

- **Scanned** numbers were measured from each game's own code.
- **Drafted** numbers are judgement calls written by an AI from general knowledge of the games. They can be wrong.
- **Guessed** means there was no profile for that game at all, so the pair is marked **Guessed** too.

### Choosing what you want

- Under **What kind of pairing?**, choose **Similar vibes**, **Balanced**, or **Opposites attract**. The ten are drawn again.
- **What goes well with** lists the games. Pick one to see the games that pair with it. Choose **(my ten ideas)** to go back.
- **Give me ten more** adds ten more pairs. It is hidden while you are looking at one game's partners.
- **Tune the scoring** opens six sliders: **Easy to set up**, **Length balance**, **Difficulty fit**, **No dead starts**, **Vibe match** and **Contrast**. 1 is normal, 0 switches that part off, and 2 counts it double. Thumbs up and down on a card move these a little, and the changes they made are listed. **Reset weights** puts the sliders back. **Clear recommendation history** forgets which pairs you have seen.

### On each card

- **Pin** (shows **Pinned** when on) keeps the pair in the list when new ideas are drawn.
- **Good idea** and **Not for me** are thumbs. They tune the scoring a little.
- **Add to my picks** (shows **In my picks** when on) adds the pair to your picks, which count towards future suggestions.
- **Never show this pair** removes the pair for good and fills its place with a new one.

A pair you have seen does not come back until more than five app starts have passed.

## Presets

Presets are sets of option values you can apply in one click. Each game can come with its own presets, and you can save your own.

Open the **Presets** tab in the side panel next to the YAML.

- **Presets that come with [game]** lists the game's own presets, with how many options each one sets. Press **Apply**. Some games ship none.
- **Your presets for [game]** lists the presets you saved for that game. Press **Apply** to use one, or **Delete** to remove it.
- **Save what is set in this YAML as a preset** saves the options this YAML sets as a named preset for this game. Type a name (up to 60 characters) and press **Save preset**, or press Enter.

Some things to know:

- Applying a preset changes only the options it mentions. Everything else stays as it is. The message says how many options were set, and Undo puts them all back.
- Saving a preset with the same name as one you already have (capital letters do not matter) replaces the old one.
- Saving needs at least one option set in the YAML. The preset holds only the options from this YAML, not the whole file.
- Deleting a preset removes it from your list. It does not change your YAML, so Undo does not bring it back.

## Related guides

- [Getting started](getting-started.md)
- [Editing options](editing-options.md)
- [Checking your work](checking-your-work.md)
- [Files and saving](files-and-saving.md)
