import type { GameSchema, OptionSchema } from '../schema/types';

/** The test game with every option placed in one Simple-mode group (the shared test game has no groups). */
export function withGroup(game: GameSchema, extra: OptionSchema[] = []): GameSchema {
  const options = { ...game.options, ...Object.fromEntries(extra.map((o) => [o.key, o])) };
  return { ...game, options, groups: [{ name: 'Options', collapsed: false, options: Object.keys(options) }] };
}
