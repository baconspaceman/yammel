import { useEffect, useState } from 'react';
import type { ChoiceEntry } from '../../../schema/types';

export interface TextControlProps {
  id: string;
  label: string;
  value: string;
  /** Suggestions for a text-choice option; any text is still allowed. */
  suggestions?: ChoiceEntry[];
  onCommit(value: string): void;
}

/** A text box that writes on Enter or when focus leaves, never on every keystroke. */
export function TextControl({ id, label, value, suggestions, onCommit }: TextControlProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  const listId = suggestions && suggestions.length > 0 ? `${id}-list` : undefined;
  return (
    <>
      <input
        id={id}
        type="text"
        className="input"
        aria-label={label}
        list={listId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setDraft(value);
        }}
      />
      {listId !== undefined && (
        <datalist id={listId}>
          {suggestions?.map((s) => (
            <option key={s.key} value={s.key} label={s.label} />
          ))}
        </datalist>
      )}
    </>
  );
}
