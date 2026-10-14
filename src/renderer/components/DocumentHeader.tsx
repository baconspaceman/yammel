import { useState } from 'react';
import type { YamlDocument } from '../../model/document';
import type { Edit } from '../../model/edits';
import { TextControl } from './controls/TextControl';
import { GameMix } from './GameMix';

export interface DocumentHeaderProps {
  doc: YamlDocument;
  games: string[];
  selectedGame: string;
  onSelectGame(game: string): void;
  onEdit(edits: Edit[]): boolean;
  /** Every game this version of Archipelago has, for mixing games. */
  allGames?: readonly string[];
}

export function DocumentHeader({ doc, games, selectedGame, onSelectGame, onEdit, allGames = [] }: DocumentHeaderProps) {
  // Bumped when an edit is refused so the text box goes back to the real value.
  const [resets, setResets] = useState(0);
  const commit = (key: 'name' | 'description', value: string) => {
    if (!onEdit([{ op: 'setMeta', key, value }])) setResets((n) => n + 1);
  };

  return (
    <section className="docheader" aria-label="About this YAML">
      <div className="docheader__game">
        {games.length > 1 ? (
          <>
            <label htmlFor="meta-game">Game</label>
            <select id="meta-game" className="select" value={selectedGame} onChange={(e) => onSelectGame(e.target.value)}>
              {games.map((game) => (
                <option key={game} value={game}>
                  {game}
                </option>
              ))}
            </select>
          </>
        ) : (
          <h2 className="docheader__title">{selectedGame}</h2>
        )}
      </div>
      {allGames.length > 0 && (
        <div className="docheader__mix">
          <GameMix doc={doc} allGames={allGames} onEdit={onEdit} />
        </div>
      )}
      <div className="field">
        <label htmlFor="meta-name">Player name</label>
        <TextControl
          key={`name-${resets}`}
          id="meta-name"
          label="Player name"
          value={doc.getMeta('name') ?? ''}
          onCommit={(value) => commit('name', value)}
        />
      </div>
      <div className="field">
        <label htmlFor="meta-description">Description</label>
        <TextControl
          key={`description-${resets}`}
          id="meta-description"
          label="Description"
          value={doc.getMeta('description') ?? ''}
          onCommit={(value) => commit('description', value)}
        />
      </div>
    </section>
  );
}
