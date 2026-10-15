/** Shape of schema.json, written by extractor/schema_extract.py. */

export const OPTION_KINDS = [
  'toggle',
  'choice',
  'text_choice',
  'range',
  'named_range',
  'free_text',
  'set',
  'list',
  'dict',
  'counter',
  'plando_items',
  'plando_connections',
  'plando_texts',
  'other',
] as const;

export type OptionKind = (typeof OPTION_KINDS)[number];

export type Visibility = 'template' | 'simple_ui' | 'complex_ui' | 'spoiler';

export interface ChoiceEntry {
  /** The value written in YAML. */
  key: string;
  /** The text shown to people. */
  label: string;
  /** The number this choice has inside the game's code. Archipelago accepts it in a YAML (presets use it). */
  value?: number;
}

export interface OptionSchema {
  key: string;
  kind: OptionKind;
  displayName: string;
  description: string;
  default: unknown;
  visibility: Visibility[];
  supportsWeighting: boolean;
  /** choice, text_choice */
  choices?: ChoiceEntry[];
  /** choice, text_choice: alias -> canonical key */
  aliases?: Record<string, string>;
  /** range, named_range */
  min?: number;
  max?: number;
  /** named_range: name -> number */
  specialNames?: Record<string, number>;
  /** set, list, dict, counter: which name list the values come from */
  domain?: 'items' | 'locations';
  /** plando_connections: the entrance and exit names Archipelago accepts (lower case; it ignores capitals). */
  entrances?: string[];
  exits?: string[];
  /** plando_texts: the places a text may be put (capitals matter). */
  validKeys?: string[];
  /** plando_connections: whether one exit may be used by several connections. */
  duplicateExits?: boolean;
}

export interface OptionGroup {
  name: string;
  collapsed: boolean;
  /** option keys, in display order */
  options: string[];
}

export interface GameSchema {
  name: string;
  hidden: boolean;
  groups: OptionGroup[];
  options: Record<string, OptionSchema>;
  presets: Record<string, Record<string, unknown>>;
  items: string[];
  locations: string[];
  itemGroups: string[];
  locationGroups: string[];
  /** Only for a game added from the person's own custom worlds folder: the .apworld file it came from. */
  customFile?: string;
  /**
   * Set for a game Yammel has no option data for: the options were read from the YAML file itself (see infer.ts).
   * It has no item or location names, so names are not checked, and the seed engine is not asked about it.
   */
  inferred?: boolean;
}

export interface SchemaFile {
  apVersion: string;
  extractedAt: string;
  games: Record<string, GameSchema>;
  errors: { game: string; error: string }[];
}
