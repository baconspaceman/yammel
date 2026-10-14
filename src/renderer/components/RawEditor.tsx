import { useEffect, useMemo, useRef, useState } from 'react';
import { YamlDocument } from '../../model/document';

export interface RawEditorProps {
  /** The YAML as it is now. */
  text: string;
  /** Replace the YAML with this text. Returns a message when it was refused. */
  onApply(text: string): string | null;
}

/** The whole YAML as text, for anything the controls do not cover (triggers, plando, comments). Applying it is one undo step. */
export function RawEditor({ text, onApply }: RawEditorProps) {
  const [draft, setDraft] = useState(text);
  const [message, setMessage] = useState<string | null>(null);
  /** The text the draft started from. If the YAML moves on while there is unapplied typing, this stays behind. */
  const base = useRef(text);

  // Follow changes made elsewhere, unless there is unapplied typing here.
  useEffect(() => {
    if (draft === base.current) {
      setDraft(text);
      base.current = text;
    }
    // draft is read on purpose and not a dependency: this only reacts to the YAML changing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const parsed = useMemo(() => YamlDocument.parse(draft), [draft]);
  const changed = draft !== text;
  const issues = parsed.issues;
  const behind = changed && base.current !== text;

  return (
    <section className="raw" aria-label="Raw YAML">
      <header className="raw__head">
        <h2 className="raw__title">Raw YAML</h2>
        <span className="raw__meta">{changed ? 'Not applied yet' : 'Matches the editor'}</span>
      </header>
      <p className="raw__note">Edit the text directly for anything the controls do not cover, such as triggers or comments. Nothing changes until you press Apply, and undo takes it back.</p>
      <textarea
        className="raw__text"
        aria-label="Raw YAML text"
        spellCheck={false}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setMessage(null);
        }}
      />
      {issues.length > 0 && (
        <ul className="raw__issues" aria-label="Problems in this text">
          {issues.slice(0, 4).map((issue) => (
            <li key={`${issue.line}:${issue.message}`}>
              Line {issue.line}: {issue.message}
            </li>
          ))}
        </ul>
      )}
      {message !== null && (
        <p className="raw__error" role="alert">
          {message}
        </p>
      )}
      {behind && <p className="raw__note">The YAML was changed elsewhere while you were typing. Revert to see the current text.</p>}
      <div className="raw__actions">
        <button
          type="button"
          className="button button--primary"
          disabled={!changed || issues.length > 0}
          onClick={() => {
            const refused = onApply(draft);
            setMessage(refused);
            if (refused === null) base.current = draft;
          }}
        >
          Apply
        </button>
        <button
          type="button"
          className="button"
          disabled={!changed}
          onClick={() => {
            setDraft(text);
            base.current = text;
            setMessage(null);
          }}
        >
          Revert
        </button>
      </div>
    </section>
  );
}
