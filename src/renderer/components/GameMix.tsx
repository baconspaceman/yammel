import { useId, useState } from 'react';
import type { YamlDocument } from '../../model/document';
import type { Edit } from '../../model/edits';
import { NumberField } from './controls/NumberField';

export interface GameMixProps {
  doc: YamlDocument;
  /** The games this version of Archipelago has. */
  allGames: readonly string[];
  onEdit(edits: Edit[]): boolean;
}

/** The weight each game has now (one game counts as 100 for itself). */
export function gameWeights(doc: YamlDocument): Record<string, number> {
  const raw = doc.toObject()['game'];
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return Object.fromEntries(
      Object.entries(raw).map(([name, weight]) => {
        const value = typeof weight === 'string' && /^\d+$/.test(weight.trim()) ? Number(weight) : weight; // Archipelago reads "50" as 50
        return [name, typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0];
      }),
    );
  }
  return Object.fromEntries(doc.games().map((name) => [name, 50]));
}

/** Mix several games in one YAML: each seed rolls one of them, in the proportions set here. */
export function GameMix({ doc, allGames, onEdit }: GameMixProps) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const weights = gameWeights(doc);
  const names = Object.keys(weights);
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const addable = allGames.filter((name) => !names.includes(name));

  if (names.length <= 1 && !open) {
    return (
      <div className="gamemix">
        <button type="button" className="button button--small" onClick={() => setOpen(true)}>
          Mix with another game
        </button>
      </div>
    );
  }

  const add = (game: string) => onEdit([{ op: 'setGameWeights', weights: { ...weights, [game]: 50 } }]);
  const remove = (game: string) => {
    const rest = { ...weights };
    delete rest[game];
    if (Object.values(rest).some((weight) => weight > 0)) onEdit([{ op: 'setGameWeights', weights: rest }, { op: 'removeGame', game }]);
  };

  return (
    <section className="gamemix" aria-label="Games in this YAML">
      <p className="gamemix__lead">
        {names.length > 1 ? 'Each time a seed is made, one of these games is picked, in these proportions.' : 'Add a second game to mix. Each seed will pick one of them.'}
      </p>
      <ul className="gamemix__list">
        {names.map((name, index) => (
          <li key={name} className="gamemix__row">
            <span className="gamemix__name">{name}</span>
            <NumberField id={`${uid}-g${index}`} label={`Weight of ${name}`} value={weights[name]!} min={0} max={10000} onCommit={(value) => onEdit([{ op: 'setGameWeights', weights: { ...weights, [name]: value } }])} />
            <span className="gamemix__odds" aria-label={`${total > 0 ? Math.round((weights[name]! / total) * 100) : 0} percent`}>
              {total > 0 ? Math.round((weights[name]! / total) * 100) : 0}%
            </span>
            <button type="button" className="button button--small" aria-label={`Remove ${name}`} disabled={names.length <= 1} onClick={() => remove(name)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      {addable.length > 0 && (
        <select
          className="select select--small"
          aria-label="Add a game"
          value=""
          onChange={(e) => {
            if (e.target.value !== '') add(e.target.value);
          }}
        >
          <option value="">Add a game&hellip;</option>
          {addable.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      )}
    </section>
  );
}
