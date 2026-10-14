import { useEffect, useMemo, useRef, useState } from 'react';
import type { EditorApi } from '../../shared/api';
import type { Edit } from '../../model/edits';
import type { YamlDocument } from '../../model/document';
import type { GameSchema } from '../../schema/types';
import { addPreset, captureOptions, MAX_PRESET_NAME, presetEdits, removePreset, type PresetsState, type UserPreset } from '../../presets/presets';

export type PresetsApi = Pick<EditorApi, 'loadPresets' | 'savePresets'>;

export interface PresetsPanelProps {
  api: PresetsApi;
  /** The game being edited, or undefined when there is none. */
  game: GameSchema | undefined;
  doc: YamlDocument | null;
  /** Applies edits as one undoable step. Throws if refused. */
  onApply(edits: Edit[]): void;
}

/** The game's own presets (from Archipelago) and the person's saved ones: apply with one click, undo puts everything back. */
export function PresetsPanel({ api, game, doc, onApply }: PresetsPanelProps) {
  const [state, setState] = useState<PresetsState | null>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void api.loadPresets().then((reply) => {
      if (cancelled) return;
      if (reply.ok) setState(reply.value);
      else setError(reply.message);
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const builtIn = useMemo(() => (game === undefined ? [] : Object.entries(game.presets)), [game]);
  const mine = useMemo(() => (state === null || game === undefined ? [] : state.presets.filter((preset) => preset.game === game.name)), [state, game]);

  const [saving, setSaving] = useState(false);

  // One save at a time, so a second click cannot be built from the list as it was before the first finished.
  const persist = async (next: PresetsState, done: string) => {
    if (saving) return;
    setSaving(true);
    try {
      const reply = await api.savePresets(next);
      if (!reply.ok) {
        setError(reply.message);
        return;
      }
      setState(next);
      setError(null);
      setMessage(done);
    } finally {
      setSaving(false);
    }
  };

  const apply = (label: string, values: Record<string, unknown>) => {
    if (game === undefined) return;
    const edits = presetEdits(game, values);
    if (edits.length === 0) {
      setMessage(`"${label}" has nothing to change for this game.`);
      return;
    }
    try {
      onApply(edits);
      setError(null);
      setMessage(`Applied "${label}": ${edits.length} ${edits.length === 1 ? 'option' : 'options'} set. Undo puts it all back.`);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That preset could not be applied.');
    }
  };

  const save = () => {
    if (game === undefined || doc === null || state === null) return;
    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Give the preset a name first.');
      return;
    }
    const values = captureOptions(doc, game);
    if (Object.keys(values).length === 0) {
      setError('Nothing is set in this YAML yet, so there is nothing to save. Change an option first.');
      return;
    }
    const replaced = state.presets.some((preset) => preset.game === game.name && preset.name.toLowerCase() === trimmed.toLowerCase());
    const next = addPreset(state, { name: trimmed.slice(0, MAX_PRESET_NAME), game: game.name, values, savedAt: new Date().toISOString() }, () => `p${Date.now().toString(36)}${(counter.current += 1)}`);
    void persist(next, `${replaced ? 'Replaced' : 'Saved'} the preset "${trimmed.slice(0, MAX_PRESET_NAME)}" (${Object.keys(values).length} ${Object.keys(values).length === 1 ? 'option' : 'options'}).`);
    setName('');
  };

  const remove = (preset: UserPreset) => {
    if (state === null) return;
    void persist(removePreset(state, preset.id), `Deleted the preset "${preset.name}".`);
  };

  if (game === undefined) {
    return (
      <section className="presets" aria-label="Presets">
        <h2 className="seed__title">Presets</h2>
        <p className="seed__note">Open or start a YAML to use presets.</p>
      </section>
    );
  }

  return (
    <section className="presets" aria-label="Presets">
      <h2 className="seed__title">Presets</h2>
      <p className="seed__note">A preset is a set of option values you can apply in one click. Applying one changes only the options it mentions, and undo puts everything back.</p>

      {error !== null && (
        <p className="seed__error" role="alert">
          {error}
        </p>
      )}
      {message !== null && (
        <p className="seed__ready" role="status">
          {message}
        </p>
      )}

      <h3 className="seed__subtitle">Presets that come with {game.name}</h3>
      {builtIn.length === 0 ? (
        <p className="seed__note">This game does not ship any presets.</p>
      ) : (
        <ul className="presets__list" aria-label={`Presets that come with ${game.name}`}>
          {builtIn.map(([label, values]) => (
            <li key={label}>
              <span className="presets__name">{label}</span> <span className="presets__count">{Object.keys(values).length} options</span>
              <button type="button" className="button button--small" onClick={() => apply(label, values)}>
                Apply
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="seed__subtitle">Your presets for {game.name}</h3>
      {state === null ? (
        <p className="status" role="status">
          Loading&hellip;
        </p>
      ) : mine.length === 0 ? (
        <p className="seed__note">You have not saved any yet.</p>
      ) : (
        <ul className="presets__list" aria-label={`Your presets for ${game.name}`}>
          {mine.map((preset) => (
            <li key={preset.id}>
              <span className="presets__name">{preset.name}</span> <span className="presets__count">{Object.keys(preset.values).length} options</span>
              <button type="button" className="button button--small" onClick={() => apply(preset.name, preset.values)}>
                Apply
              </button>
              <button type="button" className="button button--small" aria-label={`Delete the preset ${preset.name}`} disabled={saving} onClick={() => remove(preset)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="presets__save">
        <label htmlFor="preset-name" className="seed__note">
          Save what is set in this YAML as a preset
        </label>
        <div className="presets__row">
          <input id="preset-name" aria-label="Preset name" className="input" type="text" maxLength={MAX_PRESET_NAME} value={name} placeholder="Preset name" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && save()} />
          <button type="button" className="button" disabled={state === null || saving} onClick={save}>
            Save preset
          </button>
        </div>
      </div>
    </section>
  );
}
