import { useId, useMemo } from 'react';
import type { YamlDocument } from '../../model/document';
import type { Edit } from '../../model/edits';
import { newTrigger, readTriggers, triggersEdit, type ChangeMode, type Trigger, type TriggerChange } from '../../model/triggers';
import type { GameSchema, OptionSchema } from '../../schema/types';
import type { Issue } from '../../validate/types';
import { ValueField } from './ValueField';

export interface TriggersPanelProps {
  doc: YamlDocument | null;
  /** The game these triggers belong to. */
  gameName: string | null;
  game: GameSchema | undefined;
  /** Problems found in the YAML; the ones about triggers are listed here with their fixes. */
  issues: readonly Issue[];
  onApply(edits: Edit[]): void;
}

const MODE_LABEL: Record<ChangeMode, string> = { set: 'set to', add: 'add to', remove: 'take from' };
const MERGEABLE = ['set', 'list', 'dict', 'counter'];

/** A starting value for an option: its own default when that is plain, otherwise an empty list or map. */
function startValue(option: OptionSchema | undefined): unknown {
  if (option === undefined) return '';
  const d = option.default;
  if (typeof d === 'string' || typeof d === 'number' || typeof d === 'boolean') return d;
  if (option.kind === 'set' || option.kind === 'list') return [];
  if (option.kind === 'dict' || option.kind === 'counter') return {};
  return '';
}

/** Triggers: "when this option comes out as this, change those". One card each, with the options and values picked from the game. */
export function TriggersPanel({ doc, gameName, game, issues, onApply }: TriggersPanelProps) {
  const uid = useId();
  const read = useMemo(() => (doc === null || gameName === null ? null : readTriggers(doc.get(gameName, 'triggers'), gameName)), [doc, gameName]);
  const topLevel = useMemo(() => {
    const value = doc?.toObject()['triggers'];
    return Array.isArray(value) ? value.length : 0;
  }, [doc]);
  const options = useMemo(() => (game === undefined ? [] : Object.values(game.options).sort((a, b) => a.displayName.localeCompare(b.displayName))), [game]);

  if (doc === null || gameName === null || game === undefined || read === null) {
    return (
      <section className="triggers" aria-label="Triggers">
        <h2 className="triggers__title">Triggers</h2>
        <p className="triggers__note">Open or start a YAML to add triggers.</p>
      </section>
    );
  }

  const triggers = read.triggers;
  const save = (next: Trigger[]) => onApply([triggersEdit(gameName, next)]);
  const update = (index: number, change: (trigger: Trigger) => Trigger) => save(triggers.map((trigger, i) => (i === index ? change(trigger) : trigger)));
  const optionOf = (key: string): OptionSchema | undefined => (Object.prototype.hasOwnProperty.call(game.options, key) ? game.options[key] : undefined);
  const written = (key: string): unknown => doc.get(gameName, key);

  const addTrigger = () => {
    const first = options.find((o) => doc.has(gameName, o.key)) ?? options[0];
    if (first === undefined) return;
    const current = written(first.key);
    const result = current !== undefined && current !== null && typeof current !== 'object' ? current : startValue(first);
    const edits: Edit[] = [triggersEdit(gameName, [...triggers, newTrigger(gameName, first.key, result)])];
    // A trigger can only watch an option that is written in the YAML, so write it with the value the trigger waits for.
    if (!doc.has(gameName, first.key)) edits.unshift({ op: 'set', game: gameName, option: first.key, value: result });
    onApply(edits);
  };

  const watch = (index: number, key: string) => {
    const option = optionOf(key);
    const current = written(key);
    const result = current !== undefined && current !== null && typeof current !== 'object' ? current : startValue(option);
    const edits: Edit[] = [triggersEdit(gameName, triggers.map((t, i) => (i === index ? { ...t, option: key, result } : t)))];
    if (!doc.has(gameName, key)) edits.unshift({ op: 'set', game: gameName, option: key, value: result });
    onApply(edits);
  };

  const changeAt = (index: number, at: number, next: (change: TriggerChange) => TriggerChange) =>
    update(index, (trigger) => ({ ...trigger, changes: trigger.changes.map((change, i) => (i === at ? next(change) : change)) }));

  const relevant = issues.filter((issue) => issue.game === gameName && issue.option === 'triggers');

  return (
    <section className="triggers" aria-label="Triggers">
      <h2 className="triggers__title">Triggers</h2>
      <p className="triggers__note">
        A trigger says: <em>when this option comes out as this value, change these other options.</em> It is checked when the seed is made. The watched option has to be written in the YAML. Comments inside the
        trigger list are not kept when you edit it here.
      </p>

      {read.problem !== null && (
        <p className="triggers__note" role="alert">
          {read.problem} Fix it in the Raw tab.
        </p>
      )}
      {topLevel > 0 && (
        <p className="triggers__note" data-testid="triggers-top">
          This file also has {topLevel} {topLevel === 1 ? 'trigger' : 'triggers'} at the top level, outside the game&rsquo;s section. Edit {topLevel === 1 ? 'it' : 'them'} in the Raw tab.
        </p>
      )}

      {read.problem === null && triggers.length === 0 && <p className="triggers__note">No triggers yet.</p>}

      {read.problem === null && (
        <ol className="triggers__list">
          {triggers.map((trigger, index) => {
            const watched = optionOf(trigger.option);
            const pre = `${uid}-${index}`;
            return (
              <li key={index} className="trigger" aria-label={`Trigger ${index + 1}`}>
                <div className="trigger__head">
                  <h3 className="trigger__title">Trigger {index + 1}</h3>
                  <button type="button" className="button button--small" onClick={() => save(triggers.filter((_, i) => i !== index))}>
                    Remove trigger {index + 1}
                  </button>
                </div>
                {!trigger.editable ? (
                  <p className="triggers__note">This trigger uses something this editor does not show (for example a weighted watched option, or changes outside {gameName}). It is kept exactly as it is. Edit it in the Raw tab.</p>
                ) : (
                  <>
                    <div className="trigger__row">
                      <label htmlFor={`${pre}-opt`}>When</label>
                      <select id={`${pre}-opt`} className="host__select" value={trigger.option} onChange={(event) => watch(index, event.target.value)}>
                        {watched === undefined && <option value={trigger.option}>{trigger.option === '' ? '(choose an option)' : `${trigger.option} (not an option of this game)`}</option>}
                        {options.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.displayName}
                          </option>
                        ))}
                      </select>
                      <span>is</span>
                      <ValueField id={`${pre}-res`} label={`Value that fires trigger ${index + 1}`} option={watched} value={trigger.result} onChange={(value) => update(index, (t) => ({ ...t, result: value }))} />
                    </div>
                    <div className="trigger__row">
                      <label htmlFor={`${pre}-pct`}>Chance (%)</label>
                      <input
                        id={`${pre}-pct`}
                        className="host__input trigger__pct"
                        type="text"
                        inputMode="decimal"
                        placeholder="always"
                        defaultValue={trigger.percentage === null ? '' : String(trigger.percentage)}
                        key={`${index}-${trigger.percentage}`}
                        onBlur={(event) => {
                          const text = event.target.value.trim();
                          const number = Number(text);
                          const next = text === '' ? null : Number.isFinite(number) ? number : trigger.percentage;
                          if (next !== trigger.percentage) update(index, (t) => ({ ...t, percentage: next }));
                          else event.target.value = trigger.percentage === null ? '' : String(trigger.percentage);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                      />
                      <span className="triggers__hint">Leave empty for every time. 0 is never, 100 is always.</span>
                    </div>
                    <p className="trigger__then">Then change:</p>
                    <ul className="trigger__changes">
                      {trigger.changes.map((change, at) => {
                        const target = optionOf(change.option);
                        const canMerge = target !== undefined && MERGEABLE.includes(target.kind);
                        return (
                          <li key={at} className="trigger__change">
                            <select
                              className="host__select"
                              aria-label={`How trigger ${index + 1} changes change ${at + 1}`}
                              value={change.mode}
                              onChange={(event) => changeAt(index, at, (c) => ({ ...c, mode: event.target.value as ChangeMode }))}
                            >
                              <option value="set">{MODE_LABEL.set}</option>
                              {(canMerge || change.mode !== 'set') && <option value="add">{MODE_LABEL.add}</option>}
                              {(canMerge || change.mode !== 'set') && <option value="remove">{MODE_LABEL.remove}</option>}
                            </select>
                            <select
                              className="host__select"
                              aria-label={`Option for change ${at + 1} of trigger ${index + 1}`}
                              value={change.option}
                              onChange={(event) => {
                                const picked = optionOf(event.target.value);
                                changeAt(index, at, (c) => ({ ...c, option: event.target.value, mode: picked !== undefined && MERGEABLE.includes(picked.kind) ? c.mode : 'set', value: startValue(picked) }));
                              }}
                            >
                              {target === undefined && <option value={change.option}>{change.option === '' ? '(choose an option)' : `${change.option} (not an option of this game)`}</option>}
                              {options.map((option) => (
                                <option key={option.key} value={option.key}>
                                  {option.displayName}
                                </option>
                              ))}
                            </select>
                            <ValueField id={`${pre}-c${at}`} label={`Value for change ${at + 1} of trigger ${index + 1}`} option={target} value={change.value} onChange={(value) => changeAt(index, at, (c) => ({ ...c, value }))} />
                            <button
                              type="button"
                              className="button button--small"
                              aria-label={`Remove change ${at + 1} from trigger ${index + 1}`}
                              onClick={() => update(index, (t) => ({ ...t, changes: t.changes.filter((_, i) => i !== at) }))}
                            >
                              Remove
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {trigger.changes.length === 0 && <p className="triggers__hint">Nothing changes yet. Add a change below.</p>}
                    <button
                      type="button"
                      className="button button--small"
                      onClick={() => {
                        const first = options.find((o) => o.key !== trigger.option) ?? options[0];
                        if (first === undefined) return;
                        update(index, (t) => ({ ...t, changes: [...t.changes, { category: gameName, option: first.key, mode: 'set', value: startValue(first) }] }));
                      }}
                    >
                      Add a change to trigger {index + 1}
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {read.problem === null && (
        <p>
          <button type="button" className="button button--primary" onClick={addTrigger} disabled={options.length === 0}>
            Add a trigger
          </button>
        </p>
      )}

      {relevant.length > 0 && (
        <ul className="triggers__issues" aria-label="Problems with the triggers">
          {relevant.map((issue) => (
            <li key={issue.id} className={`triggers__issue triggers__issue--${issue.severity}`}>
              <span>{issue.message}</span>
              {issue.fixes.map((fix) => (
                <button key={fix.label} type="button" className="button button--small" onClick={() => onApply(fix.edits)}>
                  {fix.label}
                </button>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
