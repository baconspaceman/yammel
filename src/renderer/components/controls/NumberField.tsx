import { useEffect, useState } from 'react';
import { parseWholeNumber } from '../../state/options';

export interface NumberFieldProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit(value: number): void;
}

/** A whole-number box that only writes a value once it is valid: on Enter or when focus leaves. */
export function NumberField({ id, label, value, min, max, onCommit }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(String(value));
    setError(null);
  }, [value]);

  const commit = () => {
    const parsed = parseWholeNumber(draft, min, max);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);
    if (parsed.value !== value) onCommit(parsed.value);
  };

  return (
    <div className="numfield">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        className="input input--number"
        aria-label={label}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : `${id}-error`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(String(value));
            setError(null);
          }
        }}
      />
      {error !== null && (
        <span id={`${id}-error`} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
