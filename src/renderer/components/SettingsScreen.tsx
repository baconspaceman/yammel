import { useEffect, useState } from 'react';
import type { EditorApi, SettingsView, SourceOrigin } from '../../shared/api';
import { THEME_CHOICES, type SettingsPatch } from '../../shared/settings';
import { HelpersSection } from './HelpersSection';
import { CustomWorldsSection, type CustomWorldsApi } from './CustomWorldsSection';
import { HostScreen, type HostApi } from './HostScreen';

export type SettingsApi = Pick<EditorApi, 'getSettings' | 'saveSettings' | 'pickArchipelagoFolder' | 'pickPythonFile' | 'helperStatus' | 'setOpenRouterKey'> & HostApi & CustomWorldsApi;

export interface SettingsScreenProps {
  api: SettingsApi;
  onBack(): void;
  /** Called after a setting the check engine depends on was saved. */
  onChanged(): void;
  /** Called after an AI helper was switched on or off, or its key or model changed. */
  onHelpersChanged?(): void;
  /** Called after the set of games changed (custom worlds were scanned or forgotten). */
  onSchemaChanged?(): void;
  /** Start a new YAML for one of the custom games. */
  onStartGame?(game: string): void;
  /** Save a starter YAML for each of these games; resolves to a sentence saying what happened. */
  onSaveStarters?(games: string[]): Promise<string>;
}

const ORIGIN_TEXT: Record<SourceOrigin, string> = {
  settings: 'chosen here',
  env: 'from the ARCHIPELAGO_AP_ROOT setting of this computer',
  sibling: 'found next to this app',
};

export function SettingsScreen({ api, onBack, onChanged, onHelpersChanged, onSchemaChanged, onStartGame, onSaveStarters }: SettingsScreenProps) {
  const [view, setView] = useState<SettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hostOpen, setHostOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api.getSettings().then((result) => {
      if (cancelled) return;
      if (result.ok) setView(result.value);
      else setError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const save = async (patch: SettingsPatch) => {
    const result = await api.saveSettings(patch);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    setView(result.value);
    onChanged();
  };

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const browse = (kind: 'sourceRoot' | 'pythonPath') =>
    run(async () => {
      const picked = await (kind === 'sourceRoot' ? api.pickArchipelagoFolder() : api.pickPythonFile());
      if (!picked.ok) {
        setError(picked.message);
        return;
      }
      if (picked.value !== null) await save({ archipelago: { [kind]: picked.value } });
    });

  const clear = (kind: 'sourceRoot' | 'pythonPath') => run(() => save({ archipelago: { [kind]: null } }));

  const finding = view?.finding ?? null;
  const settings = view?.settings ?? null;

  if (hostOpen) return <HostScreen api={api} onBack={() => setHostOpen(false)} />;

  return (
    <main className="start settings">
      <div className="start__panel">
        <h1 className="start__title">Settings</h1>
        <p className="start__lead">
          Nothing on this page is required. The editor works with all of it left as it is; these only switch on extras.
        </p>
        <p>
          <button type="button" className="button" onClick={onBack}>
            Back
          </button>
        </p>

        {error !== null && (
          <p className="settings__error" role="alert">
            {error}
          </p>
        )}
        {view === null && error === null && (
          <p className="status" role="status">
            Loading settings&hellip;
          </p>
        )}

        {finding !== null && settings !== null && (
          <>
            <section className="settings__section" aria-labelledby="settings-look">
              <h2 id="settings-look" className="settings__heading">
                Appearance
              </h2>
              <p className="settings__lead">Follow your computer&rsquo;s light or dark setting, or always use one of them.</p>
              <div role="radiogroup" aria-labelledby="settings-look" className="settings__choices">
                {THEME_CHOICES.map((choice) => (
                  <label key={choice} className="settings__choice">
                    <input type="radio" name="theme" value={choice} checked={settings.appearance.theme === choice} onChange={() => void save({ appearance: { theme: choice } })} />
                    <span>{choice === 'system' ? 'Same as my computer' : choice === 'light' ? 'Light' : 'Dark'}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="settings__section" aria-labelledby="settings-ap">
              <h2 id="settings-ap" className="settings__heading">
                Check counts
              </h2>
              <p className="settings__lead">
                The live check count needs an Archipelago <em>source</em> folder with its own Python. Without one, everything
                else in the editor still works, and the count just says it is unavailable.
              </p>
              <p className={finding.problem === null ? 'settings__status settings__status--ok' : 'settings__status'} role="status">
                {finding.problem === null
                  ? `Ready. Using ${finding.sourceRoot ?? ''} (${finding.origin !== null ? ORIGIN_TEXT[finding.origin] : ''}).`
                  : `Off. ${finding.problem}`}
              </p>

              <div className="settings__row">
                <span className="settings__label" id="settings-folder-label">
                  Archipelago source folder
                </span>
                <span className="settings__value" aria-labelledby="settings-folder-label" data-testid="settings-folder">
                  {settings.archipelago.sourceRoot ?? 'Automatic'}
                </span>
                <button type="button" className="button" disabled={busy} onClick={() => void browse('sourceRoot')}>
                  Browse&hellip;
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={busy || settings.archipelago.sourceRoot === null}
                  onClick={() => void clear('sourceRoot')}
                >
                  Use automatic
                </button>
              </div>

              <div className="settings__row">
                <span className="settings__label" id="settings-python-label">
                  Python program
                </span>
                <span className="settings__value" aria-labelledby="settings-python-label" data-testid="settings-python">
                  {settings.archipelago.pythonPath ?? "Automatic (the folder's own .venv)"}
                </span>
                <button type="button" className="button" disabled={busy} onClick={() => void browse('pythonPath')}>
                  Browse&hellip;
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={busy || settings.archipelago.pythonPath === null}
                  onClick={() => void clear('pythonPath')}
                >
                  Use automatic
                </button>
              </div>

              <p className="settings__note">
                Installed Archipelago:{' '}
                {finding.installRoot !== null ? `found at ${finding.installRoot}` : 'not found (not needed for anything yet)'}.
                The editor only looks at it; it never changes it.
              </p>
            </section>

            <CustomWorldsSection
              api={api}
              onSchemaChanged={onSchemaChanged ?? (() => undefined)}
              {...(onStartGame === undefined ? {} : { onStartGame })}
              {...(onSaveStarters === undefined ? {} : { onSaveStarters })}
            />

            <section className="settings__section" aria-labelledby="settings-host">
              <h2 id="settings-host" className="settings__heading">
                Archipelago&rsquo;s own settings
              </h2>
              <p className="settings__lead">
                Archipelago keeps its own settings (where seeds go, the server port, where your game files are) in a file called host.yaml. You can look at them and change them here, with a backup and a
                review before anything is written.
              </p>
              <p>
                <button type="button" className="button" onClick={() => setHostOpen(true)}>
                  Open host.yaml settings
                </button>
              </p>
            </section>

            <HelpersSection api={api} onChanged={onHelpersChanged ?? (() => undefined)} />
          </>
        )}
      </div>
    </main>
  );
}
