import { YamlDocument } from '../model/document';

export interface RouletteYaml {
  game: string;
  playerName: string;
  fileName: string;
  text: string;
}

const SLUG_MAX = 40;

function slugFor(game: string): string {
  const slug = game
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');
  return slug === '' ? 'game' : slug;
}

/** A plain starter YAML per game (every option at its default, player name "Player"), named after the game. File names never repeat. */
export function buildStarterYamls(games: readonly string[]): { game: string; fileName: string; text: string }[] {
  const used = new Set<string>();
  return games.map((game) => {
    let slug = slugFor(game);
    for (let n = 2; used.has(slug); n += 1) slug = `${slugFor(game)}-${n}`;
    used.add(slug);
    return { game, fileName: `${slug}.yaml`, text: YamlDocument.empty(game, 'Player').toString() };
  });
}

/** One player YAML per game: names Roulette1.., file names 01-slug.yaml, text from the empty-document model. */
export function buildRouletteYamls(games: readonly string[]): RouletteYaml[] {
  return games.map((game, index) => {
    const playerName = `Roulette${index + 1}`;
    const number = String(index + 1).padStart(2, '0');
    return {
      game,
      playerName,
      fileName: `${number}-${slugFor(game)}.yaml`,
      text: YamlDocument.empty(game, playerName).toString(),
    };
  });
}
