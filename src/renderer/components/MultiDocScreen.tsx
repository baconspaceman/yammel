import type { DocPart } from '../../model/multiDoc';

export interface MultiDocScreenProps {
  fileName: string;
  parts: DocPart[];
  /** Open one player's YAML for editing (it is a new document; the original file is not changed). */
  onEdit(index: number): void;
  /** Save every player as its own file in a folder the person picks. Resolves to a sentence saying what happened. */
  onSaveEach(): Promise<string>;
  onCancel(): void;
  message: string | null;
}

/** A file with several players (---) is not edited as one block: pick a player, or split it into one file each. */
export function MultiDocScreen({ fileName, parts, onEdit, onSaveEach, onCancel, message }: MultiDocScreenProps) {
  return (
    <main className="start multidoc">
      <div className="start__panel">
        <h1 className="start__title">This file has {parts.length} players</h1>
        <p className="start__lead">
          <strong>{fileName}</strong> holds several YAMLs one after another (separated by <code>---</code>). Archipelago reads it as {parts.length} players. Pick one to edit, or split it into one file per player. The original file is never changed.
        </p>
        <ul className="multidoc__list" aria-label="Players in this file">
          {parts.map((part, index) => (
            <li key={index} className="multidoc__item">
              <span className="multidoc__who">
                <span className="multidoc__name">{part.name === '' ? `Player ${index + 1}` : part.name}</span>
                <span className="multidoc__game">{part.game === '' ? 'no game set' : part.game}</span>
              </span>
              <button type="button" className="button" onClick={() => onEdit(index)}>
                Edit this one
              </button>
            </li>
          ))}
        </ul>
        {message !== null && (
          <p className="settings__status settings__status--ok" role="status">
            {message}
          </p>
        )}
        <p className="multidoc__actions">
          <button type="button" className="button button--primary" onClick={() => void onSaveEach()}>
            Save each player as its own file&hellip;
          </button>
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
        </p>
      </div>
    </main>
  );
}
