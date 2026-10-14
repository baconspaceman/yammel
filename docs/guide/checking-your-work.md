# Checking your work

This guide explains the checks the editor runs on your YAML: the problems bar and its fixes, the check count, the difficulty gauge, and the seed tool that asks Archipelago itself to make a seed.

Contents:

1. The problems bar
2. Errors and warnings
3. One-click fixes
4. The check count
5. The difficulty gauge
6. Aim for a difficulty
7. The Seed tab

## The problems bar

![The YAML with three errors and a warning, and the Apply the suggested fixes button](../images/11-problem-checker.jpg)

The problems bar sits under the header. It reads your YAML the way Archipelago will, and it runs every time you change something. It does not need Archipelago to be installed.

- When nothing is wrong, it says **No problems found. Archipelago should accept this YAML.**
- When something is wrong, it says how many there are, for example "2 errors and 1 warning to look at".
- **Show the list** opens the full list. Each item shows where the problem is, what it is, and its fix buttons. **Show the option** jumps to the option the problem is about.
- Problems also appear on the option card they belong to.

Some of the checks, in plain words:

- A number is outside the range the option allows. The message says the allowed range.
- A switch is set to a word that is not on or off, for example "yes please". Archipelago would stop with an error.
- A choice is not one of the options the game offers. The message lists the valid choices.
- A random range has a minus sign in it. Archipelago would quietly drop the minus and use different numbers.
- An option name is not one the game has. Archipelago would ignore it, and the message suggests the nearest name if there is one.
- The player name is **Archipelago**, which is not allowed.

For the complete list of checks, see [validator rules](../reference/validator-rules.md).

## Errors and warnings

Each problem is either an error or a warning.

- An **error** means Archipelago would stop, or would ignore part of your YAML. The bar says so when there are errors. Fix errors first.
- A **warning** means Archipelago accepts the YAML, but it is probably a mistake, or it will ignore one part. For example, a switch set to the number 2 is accepted, but it is probably meant to be on or off.

## One-click fixes

Most problems come with a fix. The fix is a button with a short description, such as **Use 10**, **Go back to the default** or **Remove it**.

- **Apply the suggested fixes (n)** in the problems bar applies the first suggested fix for every problem that has one. It is one undo step, so **Undo** takes all of them back.
- It never uses a fix that throws away something you wrote. Those fixes, which have names such as **Remove it**, are only offered one at a time.

## The check count

The **Checks** figure in the bar shows how many checks your settings give. A check is one location the randomizer can put an item in. It updates as you edit.

The check count uses Archipelago's own game code, so it needs an Archipelago source folder on your computer, with the Python that goes with it. You set these in **Settings**. If they are missing, the figure says **Unavailable**, with a sentence explaining why. For example:

- "No Archipelago source folder was found. The check count needs one; everything else works without it."
- "The Archipelago folder ... has no Python environment (.venv)." Set one up in that folder, or choose a Python in Settings.
- "The Python you chose ... was not found."
- "The check engine keeps stopping, so it was switched off for a minute."

When the count is being worked out again, the app keeps showing the last number it had. When the count differs from the game's default, the figure shows the default and the difference, for example "default 50 (+4)".

Everything else in the editor works without the check count.

## The difficulty gauge

The **Difficulty** figure is a number from 0 to 10, with a word beside it and a 10-step bar. A higher number means a harder seed.

The label under the number says where it comes from:

- **Rated** means the game has a hand-made rating.
- **Rated · draft** means the rating is still a draft.
- **Estimated**, with a ~ before the number, means the app worked it out roughly from the game's options. It is not a hand rating.
- **Not rated** means there is no rating for this game.

Ratings are drafts, not facts. Treat the number as a guide.

### Why this number?

![The Why this number? explanation open under the difficulty gauge](../images/04-difficulty-why.jpg)

Click **Why this number?** to see the reasons. The list shows the changes you made that move the number away from the game's defaults. If you have changed nothing that matters, it says so: "Nothing you have changed moves the number away from the game's defaults." Click **Hide why** to close it.

## Aim for a difficulty

For rated games, the gauge has an **Aim for a difficulty** button. It is not offered for estimated games.

1. Click **Aim for a difficulty**.
2. Drag the slider to the difficulty you want. It moves from 0 to 10 in half steps. The label beside it shows the difficulty in words.
3. Click **Show the changes**. The app finds a few option changes that get close to your target, and lists them. It says, for example, "This moves it from 4.5 to about 6".
4. Read the list. Click **Apply these changes** to make them. The whole set is one undo step, so **Undo** takes it back.
5. Click **Close** to leave it without changing anything.

Options you have locked are left alone. If you change the YAML in another way, for example with an undo or an edit, the suggestion is dropped, and the slider starts again at the new score.

## The Seed tab

The **Seed** tab runs Archipelago's own generator on your YAML. It is the same generator the Archipelago launcher uses.

![The Seed tab after a successful check](../images/10-make-a-seed.jpg)

The tab has two buttons:

- **Check it** tests that Archipelago accepts the YAML and can place every item. It writes nothing to your computer. When it works, the tab says **It generates.** and the time it took.
- **Make the seed** writes a real seed. It creates a new folder in your Documents folder, inside **Archipelago YAML Editor** and then **Seeds**. Each seed gets its own folder, named with the date and time it was made. The tab shows the file name, the folder path and a **Show in folder** button.

While a check or a seed is running, a **Stop** button appears. It stops the run. A run that takes longer than five minutes is stopped automatically. A check usually takes about ten seconds, and longer for large games.

Other things you will see on this tab:

- **Looking for Archipelago…** appears while the app looks. If Archipelago cannot be used, the tab explains why and has an **Open Settings** button. If it is ready, it says which one it will use: your Archipelago source folder, or your installed Archipelago.
- A warning appears when the checker has found errors: "The problem checker found 2 errors, so Archipelago will probably refuse this YAML. Fix them first, or try anyway."
- **Add other players' YAMLs…** adds more YAML files, so the seed is made for several players at once. The list shows which file is the one you are editing. **Leave out** removes an extra file from the seed. The app reads these files for the seed. It does not change them.
- If a seed includes a spoiler file, the tab says so and warns you not to open it if you want to be surprised.

### When Archipelago refuses a YAML

If Archipelago will not make a seed, the tab says **Archipelago would not make a seed.** It then lists the reasons in plain lines. Use **Show the full log** if you want everything Archipelago printed. Fix the problems in the editor, then check again.

Two other messages can appear instead: **It was stopped.** (you pressed Stop, or the five-minute limit was reached) and **It cannot run here.**

If your game is one of your custom worlds, the tab adds a note. Archipelago can only make a seed for a custom world if its `.apworld` file is also installed in Archipelago's own `custom_worlds` folder. See [custom worlds](custom-worlds.md).

## Related guides

- [Getting started](getting-started.md)
- [Editing options](editing-options.md)
- [Files and saving](files-and-saving.md)
- [Archipelago settings and host.yaml](archipelago-settings-host-yaml.md)
- [Troubleshooting](troubleshooting.md)
- [Validator rules](../reference/validator-rules.md)
