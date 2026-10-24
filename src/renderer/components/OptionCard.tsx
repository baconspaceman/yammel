import { memo, useId, useMemo, useState } from 'react';
import type { Issue } from '../../validate/types';
import type { Edit } from '../../model/edits';
import { acceptsRandom, describeRandom, formatRandom, parseRandom, type RandomSpec } from '../../randomize/randomSpec';
import { isRollable, rollValue } from '../../randomize/roll';
import type { OptionSchema } from '../../schema/types';
import { describeOption, formatDefault, resetOption, setOption, summarizeValue } from '../state/options';
import { OptionControl } from './controls/OptionControl';
import { initialWeights, canWeigh, percentages, setWeightsEdit, valueLabel, weightsOf } from '../state/weights';
import { useAdvancedView } from '../state/viewMode';
import { entriesOf, isNameListKind, nameEdit } from '../state/namelist';
import { NameListEditor } from './NameListEditor';
import { WeightsEditor } from './WeightsEditor';
import { RandomControls, type ModeChoice } from './RandomControls';

const LONG_TEXT = 200;

function Description({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  if (text.trim() === '') return null;
  const long = text.length > LONG_TEXT || text.split('\n').length > 3;
  return (
    <div className="option__description">
      <p className={expanded || !long ? 'description' : 'description description--clamped'}>{text}</p>
      {long && (
        <button type="button" className="link" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

/** The game's item and location names, with the group names kept apart (only sets and lists accept groups). */
export interface GameNames {
  items: readonly string[];
  itemGroups: readonly string[];
  locations: readonly string[];
  locationGroups: readonly string[];
}

export interface OptionCardProps {
  /** Problems the validator found with this option (empty or missing when there are none). */
  issues?: readonly Issue[];
  /** Changes whenever `issues` does, so unchanged cards can skip re-rendering. */
  issuesKey?: string;
  /** The game's item and location names, for list options. */
  names?: GameNames | undefined;
  game: string;
  option: OptionSchema;
  /** The value in the file, or undefined when the option is not written there. */
  raw: unknown;
  /** JSON of `raw`, so unchanged cards can skip re-rendering. */
  rawJson: string;
  onEdit(edits: Edit[]): boolean;
  /** Kept out of Randomize everything. */
  locked: boolean;
  onToggleLock(key: string): void;
}

/** The value with the biggest weight, in the form the YAML uses for a single value. */
function heaviest(option: OptionSchema, weights: Record<string, number>): unknown {
  const [key] = Object.entries(weights).sort((a, b) => b[1] - a[1])[0]!;
  if (option.kind === 'toggle') return /^(true|on|yes)$/i.test(key) ? true : /^(false|off|no)$/i.test(key) ? false : key;
  if (option.kind === 'range' || option.kind === 'named_range') return /^-?\d+$/.test(key) ? Number(key) : key;
  return key;
}

function specFor(mode: Exclude<ModeChoice, 'fixed' | 'weighted'>, option: OptionSchema): RandomSpec {
  if (mode === 'range') return { type: 'range', from: option.min ?? 0, to: option.max ?? 0 };
  return { type: 'random', bias: mode === 'random' ? 'any' : (mode.slice('random-'.length) as 'low' | 'middle' | 'high') };
}

/**
 * In the Simple view, a weighted value with only one value above weight 0 is shown as that value: Archipelago always picks it, so
 * the card says what the option is. The file itself is not changed until the person edits the option.
 */
function settledValue(option: OptionSchema, raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw) || !canWeigh(option)) return raw;
  const positive = Object.entries(raw as Record<string, unknown>).filter(([, weight]) => typeof weight === 'number' && weight > 0);
  if (positive.length !== 1) return raw;
  return heaviest(option, Object.fromEntries(positive) as Record<string, number>);
}

const STATUS_LABEL = { default: 'Default', changed: 'Changed', random: 'Random', chances: 'Chances set' } as const;

/** Plain words for the chances a weighted value has in the file, so a simple-view person can see them without an editor. */
function ChancesNote({ option, weights }: { option: OptionSchema; weights: Record<string, number> }) {
  const odds = percentages(weights);
  // Only the values with a weight above 0 can be picked, so only those are named.
  const parts = Object.keys(weights)
    .filter((key) => weights[key]! > 0)
    .map((key) => `${valueLabel(option, key)} ${odds[key]}%`);
  return (
    <p className="chances-note">
      The file has chances set for this option: {parts.join(', ')}. Yammel picks one when the seed is made. To change the chances, use the Advanced view (top right).
    </p>
  );
}

function OptionCardView({ game, option, raw, onEdit, locked, onToggleLock, issues = [], names }: OptionCardProps) {
  const uid = useId();
  const controlId = `control-${uid}`;
  const titleId = `title-${uid}`;
  // Bumped when an edit is refused so the control remounts from the real value.
  const [resync, setResync] = useState(0);
  const advanced = useAdvancedView();
  // The Advanced view shows the file as it is; the Simple view shows what each option settles to (see settledValue).
  const shown = advanced ? raw : settledValue(option, raw);
  const state = describeOption(option, shown);
  const defaultText = formatDefault(option);
  const spec = parseRandom(option, shown);
  const weights = weightsOf(option, shown);
  const entries = isNameListKind(option) ? entriesOf(option, shown) : null;
  const withGroups = option.kind === 'set' || option.kind === 'list';
  const pool = useMemo(() => {
    if (option.domain === undefined || names === undefined || entries === null) return null;
    const plain = option.domain === 'items' ? names.items : names.locations;
    const groups = option.domain === 'items' ? names.itemGroups : names.locationGroups;
    return withGroups ? [...plain, ...groups] : plain;
  }, [option.domain, names, withGroups, entries === null]);
  const status = spec !== null ? 'random' : weights !== null ? 'chances' : state.changed ? 'changed' : 'default';
  // The chances of a weighted value are edited only in the Advanced view. In the Simple view they stay as they are in the file.
  const chancesHidden = weights !== null && !advanced;

  return (
    <article
      className="option"
      aria-labelledby={titleId}
      data-key={option.key}
      data-changed={state.changed}
      data-locked={locked}
      data-random={spec !== null}
      data-weighted={weights !== null}
      data-status={status}
    >
      <header className="option__head">
        <div className="option__titles">
          <h3 id={titleId} className="option__title">
            {option.displayName}
          </h3>
          <code className="option__key">{option.key}</code>
        </div>
        <span className={`option__status option__status--${status}`}>{STATUS_LABEL[status]}</span>
      </header>

      <Description text={option.description} />

      <div className="option__control">
        {weights !== null ? (
          advanced ? (
            <WeightsEditor key={resync} option={option} weights={weights} onChange={(next) => { if (!onEdit([setWeightsEdit(game, option, next)])) setResync((n) => n + 1); }} />
          ) : (
            <ChancesNote option={option} weights={weights} />
          )
        ) : entries !== null ? (
          <NameListEditor key={resync} option={option} pool={pool} entries={entries} onChange={(next) => { if (!onEdit([nameEdit(game, option, next)])) setResync((n) => n + 1); }} />
        ) : spec !== null ? (
          <p className="random__summary">{describeRandom(option, spec)}</p>
        ) : state.editable ? (
          <OptionControl
            key={resync}
            id={controlId}
            option={option}
            state={state}
            onCommit={(value) => {
              if (!onEdit([setOption(game, option, value)])) setResync((n) => n + 1);
            }}
          />
        ) : (
          <p className="readonly">
            <code>{summarizeValue(state.value)}</code>
          </p>
        )}
      </div>

      {!chancesHidden && (acceptsRandom(option) || canWeigh(option)) && (
        <RandomControls
          option={option}
          spec={spec}
          simple={!advanced}
          weighted={weights !== null}
          canWeigh={canWeigh(option) && advanced}
          custom={spec === null && weights === null && !state.editable}
          locked={locked}
          canRoll={isRollable(option)}
          onRoll={() => {
            const value = rollValue(option, Math.random);
            if (value !== undefined) onEdit([setOption(game, option, value)]);
          }}
          onMode={(mode) => {
            if (mode === 'weighted') onEdit([setWeightsEdit(game, option, initialWeights(option, state.editable ? state.value : undefined))]);
            else if (mode === 'fixed' && weights !== null) onEdit([setOption(game, option, heaviest(option, weights))]);
            else if (mode === 'fixed') onEdit([resetOption(game, option)]);
            else onEdit([setOption(game, option, formatRandom(specFor(mode, option)))]);
          }}
          onRange={(from, to) => onEdit([setOption(game, option, formatRandom({ type: 'range', from, to }))])}
          onToggleLock={() => onToggleLock(option.key)}
        />
      )}

      {state.note !== undefined && spec === null && weights === null && entries === null && <p className="note">{state.note}</p>}
      {issues.map((issue) => (
        <div key={issue.id} className={`note note--${issue.severity === 'error' ? 'error' : 'warn'}`} role="status" data-issue={issue.code}>
          <span>{issue.message}</span>
          {issue.fixes.length > 0 && (
            <span className="note__fixes">
              {issue.fixes.map((fix) => (
                <button key={fix.label} type="button" className="button button--small" onClick={() => onEdit(fix.edits)}>
                  {fix.label}
                </button>
              ))}
            </span>
          )}
        </div>
      ))}
      {state.warning !== undefined && issues.length === 0 && (
        <p className="note note--warn" role="status">
          {state.warning}
        </p>
      )}

      {(defaultText !== null || state.present) && (
        <footer className="option__foot">
          {defaultText !== null && <span className="option__default">Default: {defaultText}</span>}
          {state.present && (
            <button type="button" className="link" onClick={() => onEdit([resetOption(game, option)])}>
              Reset to default
            </button>
          )}
        </footer>
      )}
    </article>
  );
}

export const OptionCard = memo(
  OptionCardView,
  (a, b) =>
    a.option === b.option &&
    a.game === b.game &&
    a.rawJson === b.rawJson &&
    a.issuesKey === b.issuesKey &&
    a.names === b.names &&
    a.onEdit === b.onEdit &&
    a.locked === b.locked &&
    a.onToggleLock === b.onToggleLock,
);
