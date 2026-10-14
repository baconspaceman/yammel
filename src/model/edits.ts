/** The two top-level text fields every player YAML carries. */
export type MetaKey = 'name' | 'description';

/**
 * Every change to a YAML goes through one of these. The UI, presets, the validator's
 * suggested fixes and the AI helper all produce Edits, so there is one undo path and
 * suggestions can be previewed before they are applied.
 */
export type Edit =
  /** Write a plain value (string, number, boolean, list, or map) for one option. */
  | { op: 'set'; game: string; option: string; value: unknown }
  /** Remove the option so the game's own default applies. */
  | { op: 'reset'; game: string; option: string }
  /** Write a weighted choice: value -> weight. At least one weight must be above zero. */
  | { op: 'setWeights'; game: string; option: string; weights: Record<string, number>; numericKeys?: boolean }
  /** Set the player name or description. An empty description removes it; an empty name is refused. */
  | { op: 'setMeta'; key: MetaKey; value: string }
  /** Remove a game's whole options block. The `game:` line is not changed. */
  | { op: 'removeGame'; game: string }
  /** Replace the whole file with this text (the raw view). It must read as a YAML, and it must be the only edit in its batch. */
  | { op: 'replaceText'; text: string }
  /** Write the `game:` line: one name, or a map of name -> weight. At least one weight must be above zero. */
  | { op: 'setGameWeights'; weights: Record<string, number> };

export class EditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditError';
  }
}
