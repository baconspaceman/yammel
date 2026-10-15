import { useEffect, useId, useMemo, useState } from 'react';
import { parseHost } from '../../hostyaml/model';
import type { YamlDocument } from '../../model/document';
import type { Edit } from '../../model/edits';
import {
  connectionPlandoToPlain,
  itemPlandoToPlain,
  newConnectionPlando,
  newItemPlando,
  plandoEdit,
  readConnectionPlando,
  readItemPlando,
  type ConnectionPlando,
  type Force,
  type ItemPlando,
  type PlandoWorld,
} from '../../model/plando';
import type { GameSchema, OptionSchema } from '../../schema/types';
import type { EditorApi } from '../../shared/api';
import { SPECIAL_LOCATIONS } from '../../validate/plando';
import type { Issue } from '../../validate/types';
import { NameListEditor } from './NameListEditor';

export type PlandoApi = Pick<EditorApi, 'hostFiles' | 'readHost'>;

export interface PlandoPanelProps {
  api?: PlandoApi;
  doc: YamlDocument | null;
  gameName: string | null;
  game: GameSchema | undefined;
  issues: readonly Issue[];
  onApply(edits: Edit[]): void;
}

/** Which kinds of plando the Archipelago host.yaml switches on (null = it could not be read). */
export interface PlandoSwitches {
  items: boolean;
  connections: boolean;
}

/** Reads `plando_options` out of a host.yaml's text. */
export function plandoSwitchesFrom(text: string): PlandoSwitches | null {
  const parsed = parseHost(text);
  if (!parsed.ok) return null;
  for (const section of parsed.sections) {
    const entry = section.entries.find((candidate) => candidate.key === 'plando_options');
    if (entry === undefined) continue;
    const words = String(entry.value ?? '').toLowerCase().split(/[\s,]+/);
    return { items: words.includes('items'), connections: words.includes('connections') };
  }
  return null;
}

const WORLD_CHOICES = [
  { id: 'own', label: 'My own world' },
  { id: 'others', label: "Any other player's world" },
  { id: 'all', label: "Everyone's world, mine too" },
  { id: 'player', label: 'One player (number or name)' },
] as const;
type WorldChoice = (typeof WORLD_CHOICES)[number]['id'];

const worldChoice = (world: PlandoWorld): WorldChoice => (world === false ? 'own' : world === true ? 'others' : world === null ? 'all' : 'player');

const FORCE_LABEL: Record<string, string> = {
  silent: 'If it cannot be done, carry on quietly',
  false: 'If it cannot be done, carry on but warn me',
  true: 'If it cannot be done, stop the generation',
};

/** A whole number or empty, committed when you leave the box or press Enter. */
function NumberBox({ id, label, value, placeholder, onCommit }: { id: string; label: string; value: number | null; placeholder: string; onCommit(value: number | null): void }) {
  return (
    <input
      id={id}
      className="host__input trigger__pct"
      type="text"
      inputMode="numeric"
      aria-label={label}
      placeholder={placeholder}
      defaultValue={value === null ? '' : String(value)}
      key={String(value)}
      onBlur={(event) => {
        const text = event.target.value.trim();
        const number = Number(text);
        const next = text === '' ? null : Number.isInteger(number) ? number : value;
        if (next !== value) onCommit(next);
        else event.target.value = value === null ? '' : String(value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

/**
 * Plando: placing items, or joining entrances to exits, by hand. Each placement is a card with the controls Archipelago
 * understands. The panel also says whether the Archipelago host.yaml has that kind of plando switched on, because when it
 * is off Archipelago ignores the placements without stopping.
 */
export function PlandoPanel({ api, doc, gameName, game, issues, onApply }: PlandoPanelProps) {
  const uid = useId();
  const [switches, setSwitches] = useState<PlandoSwitches | null | 'loading'>('loading');
  useEffect(() => {
    if (api === undefined) {
      setSwitches(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const files = await api.hostFiles();
      const found = files.ok ? files.value.find((file) => file.exists) : undefined;
      if (found === undefined) return void (!cancelled && setSwitches(null));
      const read = await api.readHost(found.id);
      if (!cancelled) setSwitches(read.ok ? plandoSwitchesFrom(read.value.text) : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const itemOptions = useMemo(() => (game === undefined ? [] : Object.values(game.options).filter((o) => o.kind === 'plando_items')), [game]);
  const connectionOptions = useMemo(() => (game === undefined ? [] : Object.values(game.options).filter((o) => o.kind === 'plando_connections')), [game]);
  const itemPool = useMemo(() => (game === undefined ? [] : [...game.items, ...game.itemGroups]), [game]);
  const locationPool = useMemo(() => (game === undefined ? [] : [...game.locations, ...game.locationGroups.filter((name) => name !== 'Everywhere'), ...SPECIAL_LOCATIONS]), [game]);

  if (doc === null || gameName === null || game === undefined) {
    return (
      <section className="plando" aria-label="Plando">
        <h2 className="plando__title">Plando</h2>
        <p className="triggers__note">Open or start a YAML to use plando.</p>
      </section>
    );
  }
  const relevant = (option: OptionSchema) => issues.filter((issue) => issue.game === gameName && issue.option === option.key);
  const none = itemOptions.length === 0 && connectionOptions.length === 0;

  const note = (kind: 'items' | 'connections') => {
    if (switches === 'loading' || switches === null) {
      return (
        <p className="triggers__note" data-testid={`plando-${kind}-switch`}>
          Archipelago only uses {kind} plando if its <code>host.yaml</code> lists <code>{kind}</code> in <code>plando_options</code>. The person who makes the seed controls that. Yammel could not read it here.
        </p>
      );
    }
    const on = kind === 'items' ? switches.items : switches.connections;
    return on ? (
      <p className="triggers__note" data-testid={`plando-${kind}-switch`}>
        Your Archipelago host.yaml has {kind} plando switched on.
      </p>
    ) : (
      <p className="triggers__note plando__off" role="status" data-testid={`plando-${kind}-switch`}>
        Your Archipelago host.yaml has {kind} plando switched <strong>off</strong>, so seeds made on this computer ignore these placements (Archipelago only warns). Open Settings, then Archipelago&rsquo;s own settings, and add <code>{kind}</code> to <code>plando_options</code>.
      </p>
    );
  };

  return (
    <section className="plando" aria-label="Plando">
      <h2 className="plando__title">Plando</h2>
      <p className="triggers__note">
        Plando means placing things yourself instead of letting the randomizer choose. Put a chosen item at a chosen spot, or choose which door leads where. Whoever makes the seed has to allow it. Comments inside a plando list are not kept when you edit it here.
      </p>
      {none && <p className="triggers__note">{gameName} has no plando options that this editor can show.</p>}

      {itemOptions.map((option) => (
        <ItemSection key={option.key} uid={uid} doc={doc} gameName={gameName} option={option} itemPool={itemPool} locationPool={locationPool} onApply={onApply} issues={relevant(option)} note={note('items')} />
      ))}
      {connectionOptions.map((option) => (
        <ConnectionSection key={option.key} uid={uid} doc={doc} gameName={gameName} option={option} onApply={onApply} issues={relevant(option)} note={note('connections')} />
      ))}
    </section>
  );
}

function IssueList({ issues, onApply, label }: { issues: readonly Issue[]; onApply(edits: Edit[]): void; label: string }) {
  if (issues.length === 0) return null;
  return (
    <ul className="triggers__issues" aria-label={label}>
      {issues.map((issue) => (
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
  );
}

interface SectionProps {
  uid: string;
  doc: YamlDocument;
  gameName: string;
  option: OptionSchema;
  onApply(edits: Edit[]): void;
  issues: readonly Issue[];
  note: React.ReactNode;
}

function ItemSection({ uid, doc, gameName, option, itemPool, locationPool, onApply, issues, note }: SectionProps & { itemPool: string[]; locationPool: string[] }) {
  const read = readItemPlando(doc.get(gameName, option.key));
  const entries = read.entries;
  const save = (next: ItemPlando[]) => onApply([plandoEdit(gameName, option.key, next.map(itemPlandoToPlain))]);
  const update = (index: number, change: (entry: ItemPlando) => ItemPlando) => save(entries.map((entry, i) => (i === index ? change(entry) : entry)));
  const itemsOption: OptionSchema = { ...option, key: `${option.key}-items`, displayName: 'Items', kind: 'list' };
  const countedOption: OptionSchema = { ...option, key: `${option.key}-items`, displayName: 'Items', kind: 'counter' };
  const locationsOption: OptionSchema = { ...option, key: `${option.key}-locations`, displayName: 'Locations', kind: 'list' };

  return (
    <div className="plando__section" aria-label={option.displayName}>
      <h3 className="plando__heading">{option.displayName}</h3>
      {note}
      {read.problem !== null && (
        <p className="triggers__note" role="alert">
          {read.problem} Fix it in the Raw tab.
        </p>
      )}
      {read.problem === null && entries.length === 0 && <p className="triggers__note">No placements yet.</p>}
      {read.problem === null && (
        <ol className="triggers__list">
          {entries.map((entry, index) => {
            const pre = `${uid}-${option.key}-${index}`;
            return (
              <li key={index} className="trigger" aria-label={`Placement ${index + 1}`}>
                <div className="trigger__head">
                  <h4 className="trigger__title">Placement {index + 1}</h4>
                  <button type="button" className="button button--small" onClick={() => save(entries.filter((_, i) => i !== index))}>
                    Remove placement {index + 1}
                  </button>
                </div>
                {!entry.editable ? (
                  <p className="triggers__note">This placement uses something this editor does not show (for example a count range, or a list of worlds). It is kept exactly as it is. Edit it in the Raw tab.</p>
                ) : (
                  <>
                    <div className="trigger__row">
                      <label htmlFor={`${pre}-mode`}>Items</label>
                      <select
                        id={`${pre}-mode`}
                        className="host__select"
                        value={entry.items.type}
                        onChange={(event) =>
                          update(index, (e) => ({
                            ...e,
                            items:
                              event.target.value === 'counts'
                                ? { type: 'counts', counts: Object.fromEntries((e.items.type === 'names' ? e.items.names : Object.keys(e.items.counts)).map((name) => [name, 1])) }
                                : { type: 'names', names: e.items.type === 'names' ? e.items.names : Object.keys(e.items.counts) },
                          }))
                        }
                      >
                        <option value="names">a list of items</option>
                        <option value="counts">items with how many of each</option>
                      </select>
                    </div>
                    <NameListEditor option={entry.items.type === 'names' ? itemsOption : countedOption} pool={itemPool} entries={entry.items} emptyText="No item chosen yet. A placement needs at least one." onChange={(items) => update(index, (e) => ({ ...e, items }))} />
                    <p className="trigger__then">Where to put them</p>
                    <NameListEditor
                      option={locationsOption}
                      pool={locationPool}
                      entries={{ type: 'names', names: entry.locations }}
                      emptyText="Anywhere (every location of the world)."
                      onChange={(next) => update(index, (e) => ({ ...e, locations: next.type === 'names' ? next.names : Object.keys(next.counts) }))}
                    />
                    <div className="trigger__row">
                      <label htmlFor={`${pre}-world`}>In whose world</label>
                      <select
                        id={`${pre}-world`}
                        className="host__select"
                        value={worldChoice(entry.world)}
                        onChange={(event) => {
                          const picked = event.target.value as WorldChoice;
                          update(index, (e) => ({ ...e, world: picked === 'own' ? false : picked === 'others' ? true : picked === 'all' ? null : 1 }));
                        }}
                      >
                        {WORLD_CHOICES.map((choice) => (
                          <option key={choice.id} value={choice.id}>
                            {choice.label}
                          </option>
                        ))}
                      </select>
                      {worldChoice(entry.world) === 'player' && (
                        <input
                          className="host__input"
                          type="text"
                          aria-label={`Player number or name for placement ${index + 1}`}
                          defaultValue={String(entry.world)}
                          key={String(entry.world)}
                          onBlur={(event) => {
                            const text = event.target.value.trim();
                            if (text === '' || text === String(entry.world)) return void (event.target.value = String(entry.world));
                            update(index, (e) => ({ ...e, world: /^\d+$/.test(text) ? Number(text) : text }));
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur();
                          }}
                        />
                      )}
                    </div>
                    <div className="trigger__row">
                      <label className="host__check">
                        <input type="checkbox" checked={entry.fromPool} onChange={(event) => update(index, (e) => ({ ...e, fromPool: event.target.checked }))} />
                        <span>Take them from the normal item pool (untick to add new copies)</span>
                      </label>
                    </div>
                    <div className="trigger__row">
                      <label htmlFor={`${pre}-force`}>If it goes wrong</label>
                      <select id={`${pre}-force`} className="host__select" value={String(entry.force)} onChange={(event) => update(index, (e) => ({ ...e, force: (event.target.value === 'silent' ? 'silent' : event.target.value === 'true') as Force }))}>
                        {Object.entries(FORCE_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="trigger__row">
                      <label htmlFor={`${pre}-count`}>How many to place</label>
                      <NumberBox id={`${pre}-count`} label={`How many to place for placement ${index + 1}`} value={entry.count} placeholder="all" onCommit={(count) => update(index, (e) => ({ ...e, count }))} />
                      <label htmlFor={`${pre}-pct`}>Chance (%)</label>
                      <NumberBox id={`${pre}-pct`} label={`Chance of placement ${index + 1}`} value={entry.percentage} placeholder="always" onCommit={(percentage) => update(index, (e) => ({ ...e, percentage }))} />
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {read.problem === null && (
        <p>
          <button type="button" className="button button--primary" onClick={() => save([...entries, newItemPlando()])}>
            Add an item placement
          </button>
        </p>
      )}
      <IssueList issues={issues} onApply={onApply} label={`Problems with ${option.displayName}`} />
    </div>
  );
}

function ConnectionSection({ uid, doc, gameName, option, onApply, issues, note }: SectionProps) {
  const read = readConnectionPlando(doc.get(gameName, option.key));
  const entries = read.entries;
  const save = (next: ConnectionPlando[]) => onApply([plandoEdit(gameName, option.key, next.map(connectionPlandoToPlain))]);
  const update = (index: number, change: (entry: ConnectionPlando) => ConnectionPlando) => save(entries.map((entry, i) => (i === index ? change(entry) : entry)));
  const listId = `${uid}-${option.key}`;

  return (
    <div className="plando__section" aria-label={option.displayName}>
      <h3 className="plando__heading">{option.displayName}</h3>
      {note}
      {option.entrances !== undefined && (
        <>
          <datalist id={`${listId}-entrances`}>
            {option.entrances.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <datalist id={`${listId}-exits`}>
            {(option.exits ?? []).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </>
      )}
      {read.problem !== null && (
        <p className="triggers__note" role="alert">
          {read.problem} Fix it in the Raw tab.
        </p>
      )}
      {read.problem === null && entries.length === 0 && <p className="triggers__note">No connections yet.</p>}
      {read.problem === null && (
        <ol className="triggers__list">
          {entries.map((entry, index) => {
            const pre = `${listId}-${index}`;
            return (
              <li key={index} className="trigger" aria-label={`Connection ${index + 1}`}>
                <div className="trigger__head">
                  <h4 className="trigger__title">Connection {index + 1}</h4>
                  <button type="button" className="button button--small" onClick={() => save(entries.filter((_, i) => i !== index))}>
                    Remove connection {index + 1}
                  </button>
                </div>
                {!entry.editable ? (
                  <p className="triggers__note">This connection uses something this editor does not show (for example a list of possible entrances). It is kept exactly as it is. Edit it in the Raw tab.</p>
                ) : (
                  <>
                    <div className="trigger__row">
                      <label htmlFor={`${pre}-in`}>Entrance</label>
                      <TextBox id={`${pre}-in`} list={option.entrances !== undefined ? `${listId}-entrances` : undefined} value={entry.entrance} onCommit={(entrance) => update(index, (e) => ({ ...e, entrance }))} />
                    </div>
                    <div className="trigger__row">
                      <label htmlFor={`${pre}-out`}>Exit</label>
                      <TextBox id={`${pre}-out`} list={option.exits !== undefined ? `${listId}-exits` : undefined} value={entry.exit} onCommit={(exit) => update(index, (e) => ({ ...e, exit }))} />
                    </div>
                    <div className="trigger__row">
                      <label htmlFor={`${pre}-dir`}>Which way</label>
                      <select id={`${pre}-dir`} className="host__select" value={entry.direction} onChange={(event) => update(index, (e) => ({ ...e, direction: event.target.value as ConnectionPlando['direction'] }))}>
                        <option value="both">both ways (the way back is joined too)</option>
                        <option value="entrance">entrance to exit only</option>
                        <option value="exit">exit to entrance only</option>
                      </select>
                      <label htmlFor={`${pre}-pct`}>Chance (%)</label>
                      <NumberBox id={`${pre}-pct`} label={`Chance of connection ${index + 1}`} value={entry.percentage} placeholder="always" onCommit={(percentage) => update(index, (e) => ({ ...e, percentage }))} />
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {read.problem === null && (
        <p>
          <button type="button" className="button button--primary" onClick={() => save([...entries, newConnectionPlando()])}>
            Add a connection
          </button>
        </p>
      )}
      <IssueList issues={issues} onApply={onApply} label={`Problems with ${option.displayName}`} />
    </div>
  );
}

/** Text with an optional list of suggestions, committed when you leave the box or press Enter. */
function TextBox({ id, list, value, onCommit }: { id: string; list: string | undefined; value: string; onCommit(value: string): void }) {
  return (
    <input
      id={id}
      className="host__input"
      type="text"
      list={list}
      defaultValue={value}
      key={value}
      onBlur={(event) => {
        const text = event.target.value.trim();
        if (text !== value) onCommit(text);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}
