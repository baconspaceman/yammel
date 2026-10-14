import { useCallback, useEffect, useRef, useState } from 'react';
import type { EditorApi } from '../../shared/api';
import type { CustomWorldsStatus } from '../../shared/customWorlds';

export type CustomWorldsApi = Pick<EditorApi, 'customWorldsStatus' | 'pickCustomWorlds' | 'scanCustomWorlds' | 'cancelScan' | 'saveSettings'>;

export interface CustomWorldsSectionProps {
  api: CustomWorldsApi;
  /** The set of games the editor knows changed (a scan finished, or the folder was forgotten). */
  onSchemaChanged(): void;
  /** Start a new YAML for one of the custom games. */
  onStartGame?(game: string): void;
  /** Save a plain starter YAML for each of these games into a folder the person picks. */
  onSaveStarters?(games: string[]): Promise<string>;
}

/** Choose a folder of custom .apworld files, scan it with Archipelago's own loader, and use the games it finds like any other. */
export function CustomWorldsSection({ api, onSchemaChanged, onStartGame, onSaveStarters }: CustomWorldsSectionProps) {
  const [status, setStatus] = useState<CustomWorldsStatus | null>(null);
  const [scanning, setScanning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  /** A scan this window started (its own progress is shown by scan()), as opposed to one that was already running when Settings was opened. */
  const own = useRef(false);
  const lastSeen = useRef(false);
  const changed = useRef(onSchemaChanged);
  changed.current = onSchemaChanged;

  const refresh = useCallback(async () => {
    const reply = await api.customWorldsStatus();
    if (!reply.ok) {
      setError(reply.message);
      return;
    }
    setStatus(reply.value);
    if (own.current) return;
    // A scan started before this screen was opened: show it, and when it ends, tell the app the games changed.
    if (lastSeen.current && !reply.value.scanning) changed.current();
    lastSeen.current = reply.value.scanning;
    setScanning(reply.value.scanning);
  }, [api]);

  useEffect(() => {
    if (!scanning || own.current) return;
    const poll = setInterval(() => void refresh(), 3000);
    return () => clearInterval(poll);
  }, [scanning, refresh]);

  useEffect(() => {
    void refresh();
    return () => {
      if (timer.current !== null) clearInterval(timer.current);
    };
  }, [refresh]);

  const scan = async () => {
    if (scanning) return;
    own.current = true;
    setScanning(true);
    setSeconds(0);
    setError(null);
    setMessage(null);
    timer.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    try {
      const reply = await api.scanCustomWorlds();
      if (!reply.ok) setError(reply.message);
      else if (!reply.value.ok) setError(reply.value.message);
      else {
        const found = reply.value.summary.games.length;
        setMessage(found === 0 ? 'The scan finished but found no games in that folder.' : `Found ${found} custom ${found === 1 ? 'game' : 'games'}.`);
        onSchemaChanged();
      }
    } finally {
      if (timer.current !== null) clearInterval(timer.current);
      timer.current = null;
      own.current = false;
      lastSeen.current = false;
      setScanning(false);
      await refresh();
    }
  };

  const choose = async () => {
    const picked = await api.pickCustomWorlds();
    if (!picked.ok) return setError(picked.message);
    if (picked.value === null) return;
    const saved = await api.saveSettings({ archipelago: { customWorldsDir: picked.value } });
    if (!saved.ok) return setError(saved.message);
    onSchemaChanged();
    await refresh();
    const reply = await api.customWorldsStatus();
    if (reply.ok && reply.value.canScan) void scan();
  };

  const forget = async () => {
    const saved = await api.saveSettings({ archipelago: { customWorldsDir: null } });
    if (!saved.ok) return setError(saved.message);
    setMessage(null);
    setError(null);
    onSchemaChanged();
    await refresh();
  };

  const saveStarters = async () => {
    if (onSaveStarters === undefined || status?.summary === null || status === null) return;
    setMessage(await onSaveStarters(status.summary.games.map((game) => game.name)));
  };

  const summary = status?.summary ?? null;
  return (
    <section className="settings__section" aria-labelledby="settings-custom">
      <h2 id="settings-custom" className="settings__heading">
        Custom worlds
      </h2>
      <p className="settings__lead">
        If you have extra games added to Archipelago (<code>.apworld</code> files), choose the folder they are in. The editor reads each one the way Archipelago does, learns its options, and lets you make a YAML for it.
        Loading a world runs that world&rsquo;s own code, just as the Archipelago launcher does, so only choose a folder you trust.
      </p>

      <div className="settings__row">
        <span className="settings__label" id="custom-folder-label">
          Custom worlds folder
        </span>
        <span className="settings__value" aria-labelledby="custom-folder-label" data-testid="custom-folder">
          {status?.folder ?? 'Not chosen'}
        </span>
        <button type="button" className="button" disabled={scanning} onClick={() => void choose()}>
          Choose&hellip;
        </button>
        <button type="button" className="button" disabled={scanning || status?.folder === null || status === null} onClick={() => void forget()}>
          Forget this folder
        </button>
      </div>

      {status !== null && status.folder !== null && !status.canScan && (
        <p className="settings__status" role="status">
          Cannot scan yet. {status.reason}
        </p>
      )}

      {status !== null && status.folder !== null && status.canScan && (
        <p className="settings__row">
          {scanning ? (
            <>
              <span role="status">Scanning&hellip; {own.current ? `${seconds}s ` : ''}(a big folder takes a few minutes)</span>{' '}
              <button type="button" className="button" onClick={() => void api.cancelScan()}>
                Stop
              </button>
            </>
          ) : (
            <button type="button" className="button" onClick={() => void scan()}>
              {summary === null ? 'Scan this folder' : 'Scan again'}
            </button>
          )}
        </p>
      )}

      {error !== null && (
        <p className="settings__error" role="alert">
          {error}
        </p>
      )}
      {message !== null && (
        <p className="settings__status settings__status--ok" role="status">
          {message}
        </p>
      )}

      {summary !== null && (
        <>
          <p className="settings__note" data-testid="custom-summary">
            {summary.games.length} custom {summary.games.length === 1 ? 'game' : 'games'} available
            {summary.problems.length > 0 ? `, ${summary.problems.length} ${summary.problems.length === 1 ? 'file' : 'files'} could not be added` : ''}. Last scanned {new Date(summary.scannedAt).toLocaleString()}.
          </p>
          {summary.games.length > 0 && onSaveStarters !== undefined && (
            <p>
              <button type="button" className="button" onClick={() => void saveStarters()}>
                Save a starter YAML for every custom game&hellip;
              </button>
            </p>
          )}
          {summary.games.length > 0 && (
            <details className="custom__list">
              <summary>The games found</summary>
              <ul className="custom__games" aria-label="Custom games">
                {summary.games.map((game) => (
                  <li key={game.name}>
                    <span className="custom__name">{game.name}</span> <span className="custom__file">{game.file}</span>
                    {onStartGame !== undefined && (
                      <button type="button" className="button button--small" onClick={() => onStartGame(game.name)}>
                        Make a YAML
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {summary.problems.length > 0 && (
            <details className="custom__list">
              <summary>Files that could not be added</summary>
              <ul className="custom__games" aria-label="Files that could not be added">
                {summary.problems.map((problem, index) => (
                  <li key={`${problem.file}-${index}`}>
                    <span className="custom__name">{problem.file}</span> <span className="custom__why">{problem.error}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
