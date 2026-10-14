import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EditorApi } from '../../shared/api';
import type { HostFileId, HostFileInfo } from '../../shared/host';
import { diffLines, parseHost, setEntry, type Entry, type ParsedHost } from '../../hostyaml/model';

export type HostApi = Pick<EditorApi, 'hostFiles' | 'readHost' | 'writeHost' | 'pickHostPath'>;

export interface HostScreenProps {
  api: HostApi;
  onBack(): void;
}

type Value = string | number | boolean | null;
type Parsed = Extract<ParsedHost, { ok: true }>;

const idOf = (entry: Pick<Entry, 'section' | 'key'>) => `host-${entry.section}-${entry.key}`.replace(/[^A-Za-z0-9_-]/g, '_');

function valuesOf(parsed: Parsed): Map<string, Value> {
  const out = new Map<string, Value>();
  for (const section of parsed.sections) for (const entry of section.entries) out.set(`${entry.section}\u0000${entry.key}`, entry.value);
  return out;
}

interface FieldProps {
  entry: Entry;
  onCommit(entry: Entry, value: Value): void;
  onPick(entry: Entry, kind: 'file' | 'folder'): void;
}

/** One setting. Typed values apply when you leave the box or press Enter, so half-typed numbers never reach the file. */
function EntryField({ entry, onCommit, onPick }: FieldProps) {
  const shown = entry.value === null ? '' : String(entry.value);
  const [text, setText] = useState(shown);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    setText(shown);
    setProblem(null);
  }, [shown]);
  const id = idOf(entry);

  const commitText = () => {
    if (text === shown) return;
    if (entry.kind === 'number') {
      const number = Number(text);
      if (text.trim() === '' || !Number.isFinite(number)) {
        setProblem('Type a number.');
        return;
      }
      setProblem(null);
      onCommit(entry, number);
    } else {
      setProblem(null);
      // An emptied box on a setting that had text stays text (empty), not null, so Archipelago still gets the kind of value it expects.
      onCommit(entry, text === '' && entry.value === null ? null : text);
    }
  };
  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') commitText();
  };

  if (entry.kind === 'bool') {
    return (
      <label className="host__check">
        <input type="checkbox" id={id} checked={entry.value === true} onChange={(event) => onCommit(entry, event.target.checked)} />
        <span>{entry.value === true ? 'On' : 'Off'}</span>
      </label>
    );
  }
  if (entry.kind === 'choice') {
    const current = String(entry.value);
    const known = entry.choices.some((choice) => choice.value === current);
    return (
      <select
        id={id}
        className="host__select"
        value={current}
        onChange={(event) => {
          const picked = event.target.value;
          onCommit(entry, typeof entry.value === 'number' && /^-?\d+$/.test(picked) ? Number(picked) : picked);
        }}
      >
        {!known && <option value={current}>{current}</option>}
        {entry.choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.value} — {choice.label.replace(/[,.]$/, '')}
          </option>
        ))}
      </select>
    );
  }
  return (
    <span className="host__text">
      <input
        id={id}
        className="host__input"
        type="text"
        inputMode={entry.kind === 'number' ? 'decimal' : 'text'}
        value={text}
        placeholder={entry.value === null ? 'not set' : ''}
        aria-invalid={problem !== null}
        aria-describedby={problem !== null ? `${id}-problem` : undefined}
        onChange={(event) => setText(event.target.value)}
        onBlur={commitText}
        onKeyDown={onKey}
      />
      {entry.kind === 'path' && (
        <>
          <button type="button" className="button button--small" onClick={() => onPick(entry, 'file')}>
            Pick a file&hellip;
          </button>
          <button type="button" className="button button--small" onClick={() => onPick(entry, 'folder')}>
            Pick a folder&hellip;
          </button>
        </>
      )}
      {problem !== null && (
        <span id={`${id}-problem`} className="host__problem" role="alert">
          {problem}
        </span>
      )}
    </span>
  );
}

/** Archipelago's own host.yaml as a form: every setting with the file's own explanation, saved with a backup and a review of exactly what changes. */
export function HostScreen({ api, onBack }: HostScreenProps) {
  const [files, setFiles] = useState<HostFileInfo[] | null>(null);
  const [fileId, setFileId] = useState<HostFileId | null>(null);
  const [loaded, setLoaded] = useState<{ path: string; text: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (id: HostFileId) => {
      setError(null);
      setSaved(null);
      setReviewing(false);
      const reply = await api.readHost(id);
      if (!reply.ok) {
        setLoaded(null);
        setDraft('');
        setError(reply.message);
        return;
      }
      setLoaded({ path: reply.value.path, text: reply.value.text });
      setDraft(reply.value.text);
    },
    [api],
  );

  useEffect(() => {
    let cancelled = false;
    void api.hostFiles().then((reply) => {
      if (cancelled) return;
      if (!reply.ok) {
        setError(reply.message);
        setFiles([]);
        return;
      }
      setFiles(reply.value);
      const first = reply.value.find((file) => file.exists);
      if (first !== undefined) {
        setFileId(first.id);
        void load(first.id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api, load]);

  const original = useMemo(() => (loaded === null ? null : parseHost(loaded.text)), [loaded]);
  const current = useMemo(() => parseHost(draft), [draft]);
  const changed = useMemo(() => {
    if (original === null || !original.ok || !current.ok) return 0;
    const before = valuesOf(original);
    let count = 0;
    for (const [key, value] of valuesOf(current)) if (before.get(key) !== value) count += 1;
    return count;
  }, [original, current]);
  const diff = useMemo(() => (loaded === null ? [] : diffLines(loaded.text, draft, 2)), [loaded, draft]);

  const change = (entry: Entry, value: Value) => {
    if (!current.ok) return;
    setSaved(null);
    setDraft(setEntry(current, entry, value));
  };

  const pick = async (entry: Entry, kind: 'file' | 'folder') => {
    const reply = await api.pickHostPath(kind);
    if (!reply.ok) return setError(reply.message);
    if (reply.value !== null) change(entry, reply.value.replace(/\\/g, '/'));
  };

  const save = async () => {
    if (loaded === null || fileId === null || busy) return;
    setBusy(true);
    try {
      const reply = await api.writeHost({ id: fileId, text: draft, expected: loaded.text });
      if (!reply.ok) {
        setError(reply.message);
        setReviewing(false);
        return;
      }
      setError(null);
      setLoaded({ path: loaded.path, text: draft });
      setReviewing(false);
      setSaved(reply.value.backupPath === null ? 'Saved.' : `Saved. The old file was kept as ${reply.value.backupPath}`);
    } finally {
      setBusy(false);
    }
  };

  const needle = query.trim().toLowerCase();
  const matches = (entry: Entry) => needle === '' || `${entry.label} ${entry.key} ${entry.comment}`.toLowerCase().includes(needle);

  const back = () => {
    if (changed > 0 && !leaving) setLeaving(true);
    else onBack();
  };

  return (
    <main className="start settings host">
      <div className="start__panel">
        <h1 className="start__title">Archipelago&rsquo;s own settings</h1>
        <p className="start__lead">
          This is Archipelago&rsquo;s <code>host.yaml</code>: where it puts seeds, which port the server uses, where it finds your games&rsquo; files. Nothing here is needed to make a YAML. Every change is
          shown to you first, and the old file is kept as a backup.
        </p>
        <p className="host__bar">
          <button type="button" className="button" onClick={back}>
            Back
          </button>
          {leaving && (
            <span className="host__leave" role="alert">
              You have {changed} unsaved {changed === 1 ? 'change' : 'changes'}.
              <button type="button" className="button button--small" onClick={onBack}>
                Leave without saving
              </button>
              <button type="button" className="button button--small" onClick={() => setLeaving(false)}>
                Stay
              </button>
            </span>
          )}
        </p>

        {error !== null && (
          <p className="settings__error" role="alert">
            {error}
            {fileId !== null && (
              <>
                {' '}
                <button type="button" className="button button--small" onClick={() => void load(fileId)}>
                  Reload the file
                </button>
              </>
            )}
          </p>
        )}
        {saved !== null && (
          <p className="settings__status settings__status--ok" role="status">
            {saved}
          </p>
        )}

        {files === null && (
          <p className="status" role="status">
            Looking for host.yaml&hellip;
          </p>
        )}
        {files !== null && files.length === 0 && (
          <p className="settings__note">
            No Archipelago was found on this computer. Choose its source folder in Settings, or install Archipelago, and this page will show its settings.
          </p>
        )}
        {files !== null && files.length > 0 && files.every((file) => !file.exists) && (
          <p className="settings__note">Archipelago was found, but it has not made a host.yaml yet. Run its launcher once and it will.</p>
        )}

        {files !== null && files.filter((file) => file.exists).length > 1 && (
          <p className="host__which">
            <label htmlFor="host-which">Which host.yaml</label>{' '}
            <select
              id="host-which"
              className="host__select"
              value={fileId ?? ''}
              onChange={(event) => {
                const next = event.target.value as HostFileId;
                if (changed > 0) {
                  setError('Save or discard your changes before switching to the other host.yaml.');
                  return;
                }
                setFileId(next);
                void load(next);
              }}
            >
              {files
                .filter((file) => file.exists)
                .map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.label}
                  </option>
                ))}
            </select>
          </p>
        )}

        {loaded !== null && (
          <p className="settings__note host__path" data-testid="host-path">
            Editing {loaded.path}
          </p>
        )}

        {current.ok && loaded !== null && (
          <>
            <p className="host__search">
              <label htmlFor="host-search">Find a setting</label>{' '}
              <input id="host-search" className="host__input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="port, output, rom…" />
            </p>

            <div className="host__footer" role="region" aria-label="Save changes">
              <p className="host__count" role="status">
                {changed === 0 ? 'No changes yet.' : `${changed} ${changed === 1 ? 'change' : 'changes'} waiting.`}
              </p>
              <button type="button" className="button button--primary" disabled={changed === 0 || busy} onClick={() => setReviewing(true)}>
                Review and save&hellip;
              </button>
              <button
                type="button"
                className="button"
                disabled={changed === 0 || busy}
                onClick={() => {
                  setDraft(loaded.text);
                  setLeaving(false);
                  setReviewing(false);
                }}
              >
                Discard changes
              </button>
            </div>

            {reviewing && (
              <section className="host__review" role="dialog" aria-label="Review the changes" aria-modal="false">
                <h2 className="host__heading">Review the changes</h2>
                <p className="settings__lead">
                  This will change Archipelago&rsquo;s own settings file. Only the lines below change; everything else stays exactly as it is. The current file is copied to a backup first.
                </p>
                {current.ok && current.mixedEol && (
                  <p className="settings__note">
                    This file mixes Windows and plain line endings. Saving makes them all {current.eol === '\r\n' ? 'Windows' : 'plain'} line endings, which does not show in the lines below.
                  </p>
                )}
                <pre className="host__diff" aria-label="Changed lines">
                  {diff.map((line, index) => (
                    <span key={index} className={`host__line host__line--${line.kind}`}>
                      {line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '- ' : '  '}
                      {line.text}
                      {'\n'}
                    </span>
                  ))}
                </pre>
                <p className="host__bar">
                  <button type="button" className="button button--primary" disabled={busy} onClick={() => void save()}>
                    Save to host.yaml
                  </button>
                  <button type="button" className="button" disabled={busy} onClick={() => setReviewing(false)}>
                    Keep editing
                  </button>
                </p>
              </section>
            )}

            {current.sections.map((section) => {
              const shownEntries = section.entries.filter(matches);
              if (needle !== '' && shownEntries.length === 0) return null;
              return (
                <details key={section.key || 'general'} className="host__section" open>
                  <summary className="host__heading">{section.title}</summary>
                  {section.comment !== '' && <p className="host__comment">{section.comment}</p>}
                  {shownEntries.map((entry) => (
                    <div key={entry.key} className="host__entry">
                      <label className="host__label" htmlFor={idOf(entry)}>
                        {entry.label}
                      </label>
                      <EntryField entry={entry} onCommit={change} onPick={(e, kind) => void pick(e, kind)} />
                      {entry.comment !== '' && <p className="host__comment">{entry.comment}</p>}
                    </div>
                  ))}
                  {section.other.length > 0 && needle === '' && (
                    <p className="host__comment">
                      Also in this section, to change in a text editor: {section.other.join(', ')}.
                    </p>
                  )}
                </details>
              );
            })}

          </>
        )}
        {!current.ok && loaded !== null && (
          <p className="settings__error" role="alert">
            {current.message}
          </p>
        )}
      </div>
    </main>
  );
}
