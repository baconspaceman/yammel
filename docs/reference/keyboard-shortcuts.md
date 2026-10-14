# Keyboard shortcuts

This page lists every keyboard shortcut in Yammel and the keys that act inside individual text boxes.

Contents:

1. Window-wide shortcuts
2. Keys inside boxes and sliders
3. Notes

On macOS the Command key works in place of Ctrl (the code accepts either `ctrlKey` or `metaKey`). A shortcut is ignored whenever Alt is also held. Shortcuts are read from the key itself, so Shift does not change which letter is meant, but Shift is checked for S (Save as) and Z (redo).

## 1. Window-wide shortcuts

These are handled in `src/renderer/App.tsx` and work wherever you are in the window, including while typing in a box (except Undo and Redo, see below).

| Shortcut | What it does | When it does nothing |
|---|---|---|
| Ctrl+S | Saves the open YAML to its file. If it has no file yet, it opens the save window. | No YAML is open, or the app is busy with another open or save. |
| Ctrl+Shift+S | Save as: always opens the save window, so you can write a copy somewhere else or under a new name. | Same as Ctrl+S. |
| Ctrl+O | Opens the open-file window to choose a YAML file. | The app is busy with another open or save. It still works when no YAML is open. |
| Ctrl+Z | Undo the last edit. | No YAML is open, or the cursor is in a text box (the box then uses its own undo). |
| Ctrl+Shift+Z | Redo. | Same as Ctrl+Z. |
| Ctrl+Y | Redo. | Same as Ctrl+Z. |

Details:

- Ctrl+S and Ctrl+O first take the focus off whatever you were typing in, so a half-typed value in a text box is committed before the file is saved or you leave the file.
- A text box here means a textarea, or an input of type `text`, `search`, `number`, `email`, `url`, `tel` or `password`. Sliders, switches, check boxes and dropdowns do not count, so Ctrl+Z and Ctrl+Y work while one of those has focus.
- Ctrl+O is also matched when Shift is held.
- When the keys are used on a slider, letting go of Ctrl, Alt, Shift or the Command key does not write the slider's old position back.
- Closing the window with unsaved changes asks first (the window's own "leave site" prompt); the title shows a bullet before the file name while there are unsaved changes.

See [files and saving](../guide/files-and-saving.md) for what saving does, and [ideas and shortcuts](../guide/ideas-and-shortcuts.md).

## 2. Keys inside boxes and sliders

These act only while the cursor is in the named box.

| Where | Key | What it does |
|---|---|---|
| Number box (a number option, and the box beside a slider) | Enter | Commits the typed number now (otherwise it commits when you leave the box). |
| Number box | Escape | Puts back the saved number and clears the error message. |
| Text option box (free text and text-choice options) | Enter | Commits the text now (otherwise it commits when you leave the box). |
| Text option box | Escape | Puts back the saved text. |
| Name list "Add to ..." box (lists and sets of names) | Enter | Adds the typed name, or the only match when the search has exactly one result. |
| Weights editor "Add a number" box | Enter | Adds the typed number as a weight entry. |
| Preset name box (Presets panel) | Enter | Saves the preset. |
| Archipelago settings screen (host.yaml) text and number boxes | Enter | Commits the typed value. |
| Slider | Arrow keys, Home, End, Page Up, Page Down | The browser's own slider keys move it; the new position is saved when you release the key, release the pointer, or leave the slider. |

All other keys behave as in any web page (Tab and Shift+Tab move between controls, Space and Enter press a focused button, and so on).

## 3. Notes

- There are no shortcuts for the toolbar buttons beyond those above, and the app has no application menu shortcuts of its own.
- The shortcuts cannot be changed.
