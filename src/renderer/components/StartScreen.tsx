import { useState } from 'react';
import type { RecentFile } from '../../shared/api';
import type { SchemaFile } from '../../schema/types';
import { searchGames } from '../state/options';

export interface StartScreenProps {
  schema: SchemaFile;
  onStart(game: string): void;
  onOpen(): void;
  onRoulette?(): void;
  onMix?(): void;
  /** Opens Settings at the custom worlds section. */
  onCustomWorlds?(): void;
  /** Files opened or saved lately, newest first. */
  recent?: RecentFile[];
  onOpenRecent?(path: string): void;
  onClearRecent?(): void;
}

export function StartScreen({ schema, onStart, onOpen, onRoulette, onMix, onCustomWorlds, recent, onOpenRecent, onClearRecent }: StartScreenProps) {
  const [query, setQuery] = useState('');
  const games = searchGames(schema, query);
  return (
    <main className="start">
      <div className="start__panel">
        <h1 className="start__title">Make a YAML for Archipelago</h1>
        <p className="start__lead">
          Pick a game to start a new player YAML, or open one you already have.
        </p>
        <div className="start__tools">
          <input
            type="search"
            className="input"
            aria-label="Search games"
            placeholder="Search games"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="button" onClick={onOpen}>
            Open a YAML file
          </button>
          {onRoulette && (
            <button type="button" className="button" onClick={onRoulette}>
              Game roulette
            </button>
          )}
          {onMix && (
            <button type="button" className="button" onClick={onMix}>
              Games to mix
            </button>
          )}
          {onCustomWorlds && (
            <button type="button" className="button" onClick={onCustomWorlds}>
              Add custom worlds
            </button>
          )}
        </div>
        {recent !== undefined && recent.length > 0 && onOpenRecent !== undefined && (
          <section className="recent" aria-label="Recent files">
            <h2 className="recent__title">Recent files</h2>
            <ul className="recent__list">
              {recent.slice(0, 6).map((file) => (
                <li key={file.path}>
                  <button type="button" className="recent__item" title={file.path} onClick={() => onOpenRecent(file.path)}>
                    <span className="recent__name">{file.name}</span>
                    <span className="recent__folder">{file.folder}</span>
                  </button>
                </li>
              ))}
            </ul>
            {onClearRecent !== undefined && (
              <button type="button" className="button button--small" onClick={onClearRecent}>
                Clear this list
              </button>
            )}
          </section>
        )}
        {games.length === 0 ? (
          <p className="empty">No game matches &ldquo;{query}&rdquo;.</p>
        ) : (
          <ul className="gamelist" aria-label="Games">
            {games.map((game) => (
              <li key={game.name}>
                <button type="button" className="gamelist__item" onClick={() => onStart(game.name)}>
                  <span className="gamelist__name">
                    {game.name}
                    {game.customFile !== undefined && <span className="gamelist__tag"> custom</span>}
                  </span>
                  <span className="gamelist__count">{Object.keys(game.options).length} options</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
