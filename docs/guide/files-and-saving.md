# Files and saving

This guide covers opening and saving YAML files, how the app keeps your old versions safe, recent files, files that hold several players, file limits, and what happens with a damaged file.

Contents:

1. Opening a file
2. Saving a file
3. Backups and safe saving
4. Recent files
5. Files with several players
6. Size and type limits
7. Damaged files

## Opening a file

1. Click **Open** in the toolbar, press Ctrl+O, or click **Open a YAML file** on the start screen.
2. Pick a `.yaml` or `.yml` file. The window is called **Open a player YAML**.
3. If you have unsaved changes in the editor, the app asks first: "You have unsaved changes. Discard them?" Click **Cancel** to keep your work and save it first.

Other files are refused with the message "Only .yaml and .yml files can be opened."

If the file holds several players, the app shows a chooser first. See [files with several players](#files-with-several-players).

To start over with a new YAML, click **New** in the toolbar. This goes back to the start screen. It asks first if you have unsaved changes.

## Saving a file

- **Save** writes the YAML. Press Ctrl+S too.
- If you opened a file, or saved this YAML before, **Save** writes back to the same file.
- If the YAML is new, **Save** opens a save window. It starts in your Documents folder, with a suggested name made from your player name and game.
- **Save as** always opens the save window, so you can write a copy somewhere else or under a new name. Press Ctrl+Shift+S for it.

After a save, the dot beside the file name in the toolbar goes away. While you have unsaved changes, a dot shows, and its label is **Unsaved changes**.

## Backups and safe saving

The app is careful with your files.

- **Backup first.** Before it overwrites a file that already exists, the app copies the old version into a backups folder of its own. That folder is kept inside the app's data, not next to your file. The backup's name is your file name, then the date and time, then `.bak`. If a backup with the same name already exists, a number is added to the new one.
- **Write, check, then replace.** The new text is first written to a temporary file next to your file. The app reads that file back to check it matches. Only then does it replace your file. If the check fails, the message says "The file could not be verified after writing, so the original was left untouched."
- If the app cannot look at the existing file (for example, because of permissions), it stops and does not save over it.

When saving several players as separate files (see below), the same backup and check rules apply to each file.

## Recent files

The start screen lists **Recent files**, the YAML files you opened or saved lately. Click one to open it. If a recent file is no longer where it was, the app removes it from the list.

## Files with several players

Some files hold more than one player, one after another, separated by a line with three dashes (`---`).

![The chooser for a file with three players](../images/16-several-players-in-one-file.jpg)

When you open one of these files, the app shows **This file has N players** and lists each player by name and game. A player with no name shows as "Player 1", "Player 2" and so on. A player with no game shows "no game set".

- **Edit this one** opens that player in the editor. It is a new document. The original file is not changed.
- **Save each player as its own file…** asks you for a folder, then writes one YAML file for each player into it. Nothing in the original file changes.
- **Cancel** goes back without opening anything.

Each separate file is named from the player name and the game, in lower case with dashes, for example `alice-a-link-to-the-past.yaml`. If two players would get the same name, the second one gets `-2` added. If a file with that name already exists in the folder, the new one gets a number in brackets, such as `alice (2).yaml`. Existing files are never overwritten.

If saving stops part way, the message says how many files were written, for example "Saved 2 of 3 files, then it stopped." The files already written are kept.

## Size and type limits

- Only `.yaml` and `.yml` files can be opened or saved.
- A single YAML file can be up to 2 MB. Larger files are refused with the message "That file is too large to be a player YAML."
- When saving each player as its own file, the folder can take up to 300 files, with up to 32 MB in total. Each file still has the 2 MB limit.
- When saving each player as its own file, the names are checked. A name can be up to 81 characters long, including the `.yaml` ending. It must start with a letter or number, and can use letters, numbers, spaces, and the characters `_ . ( ) ' -`. Names that Windows reserves, such as `CON`, are refused.

## Damaged files

A file can be damaged if its text is not valid YAML, for example because of bad spacing or a missing colon. The editor does not guess at the fix.

- The app shows **This file can't be edited yet**. It says: "Nothing has been changed. Fix the problems below in a text editor, then open the file again." Under that, each problem is listed with its line number, such as "Line 12: ...".
- A file with no `game:` line shows **This YAML does not say which game it is for**. It needs a `game:` line, and the file is not changed.
- A file whose game is not in the game list shows **"..." is not in the game list**. Check the spelling of the game name, and the file is not changed.
- In the **Raw** tab, text that is not valid YAML is refused when you press **Apply**. The reason and the line number are shown, and your typed text stays in the box so you can fix it.

To fix a damaged file, open it in a plain text editor, correct the lines the app listed, then open it again here.

## Related guides

- [Getting started](getting-started.md)
- [Editing options](editing-options.md)
- [Checking your work](checking-your-work.md)
- [Troubleshooting](troubleshooting.md)
- [FAQ](faq.md)
