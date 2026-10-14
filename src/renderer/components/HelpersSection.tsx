import { useCallback, useEffect, useState } from 'react';
import type { EditorApi, HelperId, HelperStatus } from '../../shared/api';

export type HelpersApi = Pick<EditorApi, 'helperStatus' | 'saveSettings' | 'setOpenRouterKey'>;

export interface HelpersSectionProps {
  api: HelpersApi;
  /** Called after anything changed that the helper chat should notice. */
  onChanged(): void;
  /** Asks the person to confirm (the app's own confirm box in the real window). */
  confirm?(message: string): boolean;
}

function consentFor(helper: HelperStatus): string {
  const base = `Turning on ${helper.name} means that each time you type a question in the Helper, your current YAML and descriptions of the game's options are sent to ${helper.name}. This app sends nothing else.`;
  if (helper.id === 'openRouter') return `${base}\n\nOpenRouter charges your own account for every question. The built-in guide stays free and sends nothing.\n\nTurn it on?`;
  return `${base}\n\nIt uses your own login and your own plan allowance. The built-in guide stays free and sends nothing.\n\nTurn it on?`;
}

function HelperCard({ helper, api, onChanged, confirm }: { helper: HelperStatus; api: HelpersApi; onChanged(): void; confirm(message: string): boolean }) {
  const [model, setModel] = useState(helper.model ?? '');
  const [key, setKey] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (patch: { enabled?: boolean; model?: string | null }) => {
    setBusy(true);
    try {
      const result = await api.saveSettings({ integrations: { [helper.id]: patch } });
      setMessage(result.ok ? null : result.message);
      if (result.ok) onChanged();
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (next: boolean) => {
    if (next && !confirm(consentFor(helper))) return;
    await save({ enabled: next });
  };

  const saveKey = async (value: string | null) => {
    setBusy(true);
    try {
      const result = await api.setOpenRouterKey(value);
      setMessage(result.ok ? null : result.message);
      if (result.ok) {
        setKey('');
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  const id = `helper-${helper.id}`;
  return (
    <div className="settings__helper" role="group" aria-labelledby={`${id}-name`}>
      <h3 id={`${id}-name`} className="settings__subheading">
        {helper.name}
      </h3>
      <p className="settings__note">{helper.note}</p>
      <label className="settings__check">
        <input type="checkbox" checked={helper.enabled} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
        <span>Use {helper.name} in the Helper</span>
      </label>
      {helper.enabled && !helper.ready && <p className="settings__status">Switched on, but not ready yet: {helper.id === 'openRouter' ? 'save a key below.' : `${helper.name} was not found.`}</p>}

      {helper.id === 'openRouter' && (
        <div className="settings__row">
          <label className="settings__label" htmlFor={`${id}-key`}>
            OpenRouter key
          </label>
          <input
            id={`${id}-key`}
            type="password"
            autoComplete="off"
            className="input settings__input"
            placeholder={helper.keySet ? 'A key is saved (type a new one to replace it)' : 'Paste your key'}
            value={key}
            disabled={busy || helper.canStoreKey === false}
            onChange={(e) => setKey(e.target.value)}
          />
          <button type="button" className="button" disabled={busy || key.trim() === ''} onClick={() => void saveKey(key.trim())}>
            Save key
          </button>
          <button type="button" className="button" disabled={busy || helper.keySet !== true} onClick={() => void saveKey(null)}>
            Remove key
          </button>
        </div>
      )}

      <div className="settings__row">
        <label className="settings__label" htmlFor={`${id}-model`}>
          Model (optional)
        </label>
        <input
          id={`${id}-model`}
          type="text"
          className="input settings__input"
          placeholder="Leave empty for the default"
          value={model}
          maxLength={100}
          disabled={busy}
          onChange={(e) => setModel(e.target.value)}
        />
        <button type="button" className="button" disabled={busy || model.trim() === (helper.model ?? '')} onClick={() => void save({ model: model.trim() === '' ? null : model.trim() })}>
          Save model
        </button>
      </div>
      {message !== null && (
        <p className="settings__error" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}

/** The optional AI helpers: each off until switched on, each saying what it needs and what it costs. */
export function HelpersSection({ api, onChanged, confirm = (message) => window.confirm(message) }: HelpersSectionProps) {
  const [helpers, setHelpers] = useState<HelperStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await api.helperStatus();
    if (result.ok) setHelpers(result.value);
    else setError(result.message);
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const changed = () => {
    void refresh();
    onChanged();
  };

  return (
    <section className="settings__section" aria-labelledby="settings-extras">
      <h2 id="settings-extras" className="settings__heading">
        Optional AI helpers
      </h2>
      <p className="settings__lead">
        The Helper already works on its own, for free, and sends nothing anywhere. These add an AI that understands more open-ended requests. Each one is off until you
        turn it on, and it only ever sees the YAML you are working on. You can always keep using the built-in guide.
      </p>
      {error !== null && (
        <p className="settings__error" role="alert">
          {error}
        </p>
      )}
      {helpers === null && error === null && <p className="status">Checking&hellip;</p>}
      {helpers?.map((helper) => (
        <HelperCard key={helper.id as HelperId} helper={helper} api={api} onChanged={changed} confirm={confirm} />
      ))}
    </section>
  );
}
