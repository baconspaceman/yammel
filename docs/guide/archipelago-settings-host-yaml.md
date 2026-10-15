# Archipelago's own settings (host.yaml)

The host.yaml editor shows Archipelago's own settings file as a form, so you can change it without a text editor. Every change is shown to you first, and the old file is kept as a backup.

Contents:

- [What host.yaml is](#what-hostyaml-is)
- [Opening the editor](#opening-the-editor)
- [Changing a setting](#changing-a-setting)
- [Reviewing and saving](#reviewing-and-saving)
- [Backups, line endings and comments](#backups-line-endings-and-comments)
- [When a save is refused](#when-a-save-is-refused)
- [What this editor does not change](#what-this-editor-does-not-change)

## What host.yaml is

`host.yaml` is the settings file that Archipelago itself reads. It holds things such as where seeds are written, which port the server uses, and where it finds your games' files. Nothing on this page is needed to make a YAML.

## Opening the editor

1. Open **Settings**.
2. Under **Archipelago's own settings**, press **Open host.yaml settings**.

The editor looks for the host.yaml of an installed Archipelago and of an Archipelago source folder. If none is found, the page says so and suggests choosing the source folder in Settings or installing Archipelago. If Archipelago was found but has never made a host.yaml, the page says to run its launcher once.

If both files exist, a **Which host.yaml** menu lets you choose:

- **Installed Archipelago** is the host.yaml in the folder where Archipelago is installed.
- **Archipelago source folder** is the host.yaml in the source folder you chose.

The line **Editing [path]** shows which file is open.

## Changing a setting

Settings are grouped under headings. Use **Find a setting** to narrow the list. It matches the setting's name, its key, or the file's own explanation.

Each setting shows its name, the explanation written in the file, and a control that fits the kind of value:

- **On or Off** for yes-or-no settings. Tick the box.
- **A menu** where the file lists its choices. Each choice shows its value and its label.
- **A text or number box.** A typed value is applied when you leave the box or press Enter, so half-typed numbers never reach the file. A number box that does not hold a number says "Type a number."
- **Path settings** have a box and two buttons, **Pick a file…** and **Pick a folder…**. If what the box names is not on this computer, a quiet note under it says "Not found on this computer. Archipelago only asks for it if you play that game." Relative paths are looked for next to the host.yaml. The note is only information: it never stops you from saving, and it is normal for games you do not play. A line above the save bar counts them, and **Check again** looks once more, for example after you create a folder.

The footer counts your changes: "No changes yet." or "[number] changes waiting." **Discard changes** puts the form back to the file as it was.

![The host.yaml settings form](../images/20-host-settings-form.jpg)

## Reviewing and saving

1. Press **Review and save…**. The page shows **Review the changes**, with each changed line marked with a plus or a minus.
2. Read the lines. Only those lines will change.
3. Press **Save to host.yaml**, or **Keep editing** to go back.

After a save, the page says "Saved. The old file was kept as [backup path]."

![Reviewing the changed lines before saving](../images/21-host-settings-review.jpg)

If you press **Back** with unsaved changes, the page asks **Leave without saving** or **Stay**.

## Backups, line endings and comments

- **Before every save,** the current file is copied to a backup. Backups are kept in a folder in the app's own data folder. Each backup is named after the file with a time stamp and ends in `.bak`.
- **You can go back.** Press **Restore an earlier version…** above the save bar to list the backups, newest first, with their date and size. **Load it** fills the form with that version; nothing is written until you press **Review and save**, so you see exactly which lines change first (and saving makes a new backup, as always). The list is of backups of any host.yaml this app changed, so if you have both an installed Archipelago and a source folder, check the date and the review before saving.
- **The new file is written safely.** The text is written to a temporary copy and then swapped in, so the file is never left half-written.
- **Only the changed lines change.** Comments and the file's byte-order mark are kept as they were. If the file mixes Windows and plain line endings, the review warns you that saving makes them all one kind.

## When a save is refused

The save is refused, and nothing is written, in these cases:

- **The file was changed by something else since you opened it.** The message says: "host.yaml was changed by something else since you opened it. Reload it, then make your change again." Press **Reload the file** and make the change again.
- **The new text could not be read back as settings.** The message is "The changed host.yaml could not be read back, so nothing was written."
- **The file is too large to be a real host.yaml.**
- **Another program is using the file.** The message says to close Archipelago and try again.
- **Windows does not allow the change.** The message says that if Archipelago is installed in a protected folder, you can close this app and open it as administrator, or make the change in a text editor.
- **The file is no longer there.** The message says "is not there any more."

## What this editor does not change

- **Lists and nested groups of settings are not editable here.** A setting whose value is a list, or a group inside a section, is shown by name under its section: "Also in this section, to change in a text editor: ...". Make those changes in a text editor, and keep a copy of the file first.
- **Nothing is written until you press Save to host.yaml.** Looking at the file never changes it.
