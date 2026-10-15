import { useId, useState } from 'react';
import type { OptionSchema } from '../../schema/types';
import { countOf, suggest, type NameEntries } from '../state/namelist';
import { NumberField } from './controls/NumberField';

export interface NameListEditorProps {
  option: OptionSchema;
  /** Every name the person may pick, or null when the game gives no list (then any text is accepted). */
  pool: readonly string[] | null;
  entries: NameEntries;
  /** What to say when the list is empty. The default speaks of the game's default. */
  emptyText?: string;
  /** Save these names. Fewer than before means something was removed. */
  onChange(entries: NameEntries): void;
}

const MAX_COUNT = 9999;

/** A list of item or location names: search to add, a remove button on each, and a count for the ones that have one. */
export function NameListEditor({ option, pool, entries, emptyText, onChange }: NameListEditorProps) {
  const uid = useId();
  const name = option.displayName;
  const [query, setQuery] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const names = entries.type === 'names' ? entries.names : Object.keys(entries.counts);
  const taken = new Set(names);
  const options = pool === null ? [] : suggest(pool, query, taken);
  const known = pool === null ? null : new Set(pool);

  const withName = (value: string): NameEntries =>
    entries.type === 'names' ? { type: 'names', names: [...entries.names, value] } : { type: 'counts', counts: { ...entries.counts, [value]: 1 } };
  const without = (value: string): NameEntries => {
    if (entries.type === 'names') return { type: 'names', names: entries.names.filter((entry) => entry !== value) };
    const counts = { ...entries.counts };
    delete counts[value];
    return { type: 'counts', counts };
  };

  const add = (value: string) => {
    const clean = value.trim();
    if (clean === '') return;
    if (taken.has(clean)) return setNote(`"${clean}" is already in the list.`);
    if (known !== null && !known.has(clean)) {
      const matches = suggest(pool!, clean, taken, 2);
      if (matches.length === 1) return add(matches[0]!); // one clear match: use it
      return setNote(matches.length === 0 ? `"${clean}" is not a name in this game.` : `More than one name matches "${clean}". Pick one from the list.`);
    }
    setNote(null);
    setQuery('');
    onChange(withName(clean));
  };

  return (
    <div className="names" role="group" aria-label={`${name} list`}>
      {names.length === 0 ? (
        <p className="names__empty">{emptyText ?? "Nothing chosen. The game's default applies."}</p>
      ) : (
        <ul className="names__list" aria-label={`Chosen for ${name}`}>
          {names.map((entry, index) => (
            <li key={entry} className="names__item">
              <span className="names__name">{entry}</span>
              {entries.type === 'counts' && (
                <NumberField
                  id={`${uid}-n${index}`}
                  label={`${name}: how many ${entry}`}
                  value={entries.counts[entry]!}
                  min={0}
                  max={MAX_COUNT}
                  onCommit={(value) => onChange({ type: 'counts', counts: { ...entries.counts, [entry]: value } })}
                />
              )}
              <button type="button" className="button button--small" aria-label={`Remove ${entry} from ${name}`} onClick={() => onChange(without(entry))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="names__add">
        <input
          type="text"
          className="input"
          aria-label={`Add to ${name}`}
          placeholder={pool === null ? 'Type a name and press Enter' : 'Search by name'}
          value={query}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setNote(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(options.length === 1 ? options[0]! : query);
            }
          }}
        />
        <button type="button" className="button button--small" disabled={query.trim() === ''} onClick={() => add(options.length === 1 ? options[0]! : query)}>
          Add
        </button>
        <span className="names__count">{countOf(entries)} chosen</span>
      </div>
      {options.length > 0 && (
        <ul className="names__suggestions" aria-label={`Matching names for ${name}`}>
          {options.map((candidate) => (
            <li key={candidate}>
              <button type="button" className="names__suggestion" onClick={() => add(candidate)}>
                {candidate}
              </button>
            </li>
          ))}
        </ul>
      )}
      {note !== null && (
        <p className="field-error" role="alert">
          {note}
        </p>
      )}
    </div>
  );
}
