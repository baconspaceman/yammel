import { Document, isMap, isNode, isScalar, isSeq, Pair, parseDocument, Scalar, YAMLMap } from 'yaml';
import { EditError, type Edit, type MetaKey } from './edits';

/** One option of a game's block as the file itself describes it (see YamlDocument.templateInfo). */
export interface TemplateOption {
  key: string;
  /** The option's value as plain data. */
  value: unknown;
  /** The comment lines under the option's name, or an empty string. */
  description: string;
  /** The short comment after an entry of a weighted map, by entry name. */
  notes: Record<string, string>;
  /** The keys of a map value in file order (plain data puts number-like keys first, so order is kept here). */
  keys?: string[];
  /** The title of the section banner just above this option, when there is one. */
  heading?: string;
}

export interface ParseIssue {
  message: string;
  /** 1-based */
  line: number;
  /** 1-based */
  column: number;
}

// Archipelago reads player files with PyYAML (YAML 1.1): unquoted on/off/yes/no are booleans there.
const YAML_OPTIONS = { version: '1.1' } as const;

const OUTPUT ={ lineWidth: 0, flowCollectionPadding: false } as const; // never fold long lines

/**
 * A typed facade over the `yaml` library's Document. Comments, key order and keys this app
 * does not know about (triggers, plando, meta...) survive because the Document is never rebuilt.
 */
export class YamlDocument {
  /**
   * `original` is the exact text this was parsed from, until the first edit lands.
   * While it is set, toString() returns it byte-for-byte, so opening and saving a file
   * without changing anything can never reformat it.
   */
  private constructor(
    private doc: Document,
    private original: string | null = null,
  ) {}

  static parse(text: string): YamlDocument {
    return new YamlDocument(parseDocument(text, YAML_OPTIONS), text);
  }

  /** A fresh player YAML for one game, with an empty options block. */
  static empty(game: string, playerName = 'Player'): YamlDocument {
    const doc = new Document({ name: playerName, game, [game]: {} }, YAML_OPTIONS);
    return new YamlDocument(doc);
  }

  /** A fresh player YAML that mixes several games (equal weights) with an empty options block for each. */
  static emptyMulti(games: readonly string[], playerName = 'Player'): YamlDocument {
    const unique = [...new Set(games)];
    if (unique.length === 0) throw new Error('At least one game is needed.');
    if (unique.length === 1) return YamlDocument.empty(unique[0]!, playerName);
    const doc = new Document(
      { name: playerName, game: Object.fromEntries(unique.map((game) => [game, 50])), ...Object.fromEntries(unique.map((game) => [game, {}])) },
      YAML_OPTIONS,
    );
    return new YamlDocument(doc);
  }

  /** Problems found while parsing. Empty when the text is a usable player YAML. */
  get issues(): ParseIssue[] {
    return this.doc.errors.map((error) => ({
      message: error.code === 'MULTIPLE_DOCS'
        ? 'This file contains several YAML documents (---). Multi-document files are not supported yet.'
        : error.message.split('\n')[0] ?? error.message,
      line: error.linePos?.[0].line ?? 1,
      column: error.linePos?.[0].col ?? 1,
    }));
  }

  get isValid(): boolean {
    return this.doc.errors.length === 0;
  }

  toString(): string {
    return this.original ?? this.doc.toString(OUTPUT);
  }

  clone(): YamlDocument {
    return new YamlDocument(this.doc.clone(), this.original);
  }

  /** Games named by the `game:` key, whether it is one name or a weighted map of names. */
  games(): string[] {
    const node = this.doc.get('game', true);
    if (isScalar(node)) return typeof node.value === 'string' ? [node.value] : [];
    if (isMap(node)) return node.items.map((pair) => String(isScalar(pair.key) ? pair.key.value : pair.key));
    if (isSeq(node)) return node.items.flatMap((item) => (isScalar(item) && typeof item.value === 'string' ? [item.value] : []));
    return [];
  }

  /** The player name or description as text, or undefined when missing or not a plain value. */
  getMeta(key: MetaKey): string | undefined {
    const value = this.doc.get(key);
    if (value === undefined || value === null || isNode(value)) return undefined;
    return String(value);
  }

  has(game: string, option: string): boolean {
    return this.doc.hasIn([game, option]);
  }

  /** The whole file as plain data (what Archipelago itself would read), or an empty object when it is not a map. */
  toObject(): Record<string, unknown> {
    const value: unknown = this.doc.toJS();
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  /** The option's value as plain data (a map for weights), or undefined when absent. */
  get(game: string, option: string): unknown {
    const node = this.doc.getIn([game, option], true);
    if (node === undefined) return undefined;
    return isNode(node) ? node.toJS(this.doc) : node;
  }

  /**
   * What the file itself says about the options of one game's block, in file order. Archipelago's templates put an option's
   * description in the comment lines under its name, a short note after each choice, and a banner (a line of `#` signs, then
   * a title) above the first option of each section. This reads all three so a game Yammel has no data for can still be edited.
   */
  templateInfo(game: string): TemplateOption[] {
    const block = this.doc.get(game, true);
    if (!isMap(block)) return [];
    const clean = (text: string | null | undefined): string =>
      (text ?? '')
        .split('\n')
        .map((line) => line.replace(/^\s?/, '').trimEnd())
        .join('\n')
        .trim();
    // A banner is a comment with a line of five or more # signs (the library drops each line's first #); its title is the first line that has words in it.
    const bannerTitle = (text: string | null | undefined): string | undefined => {
      const lines = (text ?? '').split('\n');
      if (!lines.some((line) => /^\s*#{5,}/.test(line))) return undefined;
      for (const line of lines) {
        const words = line.replace(/#/g, ' ').trim();
        if (words !== '') return words;
      }
      return undefined;
    };
    const out: TemplateOption[] = [];
    block.items.forEach((pair, index) => {
      if (!isScalar(pair.key)) return;
      const key = String(pair.key.value);
      const value = pair.value;
      const keyBefore = isNode(pair.key) ? pair.key.commentBefore : undefined;
      const heading = bannerTitle(keyBefore) ?? (index === 0 ? bannerTitle(block.commentBefore) : undefined);
      let description = '';
      const notes: Record<string, string> = {};
      const keys: string[] = [];
      if (isMap(value) && value.items.length > 0) {
        const first = value.items[0]!;
        description = clean(isNode(first.key) ? first.key.commentBefore : undefined) || clean(value.commentBefore);
        for (const entry of value.items) {
          if (!isScalar(entry.key)) continue;
          keys.push(String(entry.key.value));
          const note = isNode(entry.value) ? clean(entry.value.comment) : '';
          if (note !== '') notes[String(entry.key.value)] = note;
        }
      } else if (isNode(value)) {
        description = clean(value.commentBefore);
      }
      const plain = isNode(value) ? value.toJS(this.doc) : value;
      out.push({ key, value: plain, description, notes, ...(keys.length > 0 ? { keys } : {}), ...(heading === undefined ? {} : { heading }) });
    });
    return out;
  }

  apply(edit: Edit): void {
    this.applyAll([edit]);
  }

  /** All-or-nothing: if any edit fails, the document is left exactly as it was. */
  applyAll(edits: Edit[]): void {
    const replace = edits.find((edit) => edit.op === 'replaceText');
    if (replace !== undefined) {
      if (edits.length !== 1 || replace.op !== 'replaceText') throw new EditError('Replacing the whole text cannot be combined with other changes.');
      const next = YamlDocument.parse(replace.text);
      if (!next.isValid) throw new EditError(`That text is not a readable YAML: ${next.issues[0]?.message ?? 'a syntax problem'} (line ${next.issues[0]?.line ?? 1}).`);
      this.doc = next.doc;
      this.original = replace.text;
      return;
    }
    if (!this.isValid) {
      throw new EditError('Cannot edit a YAML that has parse errors. Fix the errors first.');
    }
    const working = this.doc.clone();
    for (const edit of edits) applyOne(working, edit);
    // Keep the exact original text when the edits changed nothing (no-op set/reset).
    const changed = working.toString(OUTPUT) !== this.doc.toString(OUTPUT);
    this.doc = working;
    if (changed) this.original = null;
  }
}

function applyOne(doc: Document, edit: Edit): void {
  if (edit.op === 'setMeta') {
    writeMeta(doc, edit.key, edit.value);
    return;
  }
  if (edit.op === 'replaceText') throw new EditError('Replacing the whole text cannot be combined with other changes.');
  if (edit.op === 'removeGame') {
    if (!isMap(doc.contents)) throw new EditError('The top level of the YAML must be a map of settings.');
    doc.delete(edit.game);
    return;
  }
  if (edit.op === 'setGameWeights') {
    if (doc.contents === null) doc.contents = doc.createNode({});
    if (!isMap(doc.contents)) throw new EditError('The top level of the YAML must be a map of settings.');
    const entries = Object.entries(edit.weights);
    if (entries.length === 0 || entries.some(([, w]) => !Number.isFinite(w) || w < 0) || !entries.some(([, w]) => w > 0)) {
      throw new EditError('The games need weights that are zero or more, with at least one above zero.');
    }
    const existing = doc.get('game', true);
    const next = doc.createNode(entries.length === 1 ? entries[0]![0] : edit.weights);
    if (isNode(existing)) {
      next.comment = existing.comment;
      next.commentBefore = existing.commentBefore;
    }
    doc.set('game', next);
    // Every game that can be picked needs its own options block, even an empty one, or Archipelago refuses the file.
    for (const [name, weight] of entries) {
      if (weight > 0 && !doc.has(name)) doc.set(name, new YAMLMap());
    }
    return;
  }
  if (edit.game === '' || edit.option === '') throw new EditError('Edit needs a game and an option.');
  switch (edit.op) {
    case 'reset':
      removeValue(doc, edit.game, edit.option);
      return;
    case 'set':
      writeValue(doc, edit.game, edit.option, edit.value);
      return;
    case 'setWeights': {
      const weights = Object.entries(edit.weights);
      if (weights.some(([, w]) => !Number.isFinite(w) || w < 0)) {
        throw new EditError(`Weights for "${edit.option}" must be numbers that are zero or more.`);
      }
      if (!weights.some(([, w]) => w > 0)) {
        throw new EditError(`Weights for "${edit.option}" need at least one value above zero.`);
      }
      // A switch's weights are written the way people write them by hand: `true: 50`, not `"true": 50`.
      const keys = weights.map(([key]) => key);
      const booleans = keys.every((key) => key === 'true' || key === 'false');
      // Whole numbers are written the same way: `40: 50`, not `"40": 50`.
      const numbers = edit.numericKeys === true && keys.every((key) => /^-?\d+$/.test(key));
      let value: unknown = edit.weights;
      if (booleans || numbers) {
        const map = new YAMLMap();
        for (const [key, weight] of weights) map.add(new Pair(new Scalar(booleans ? key === 'true' : Number(key)), new Scalar(weight)));
        value = map;
      }
      writeValue(doc, edit.game, edit.option, value);
      return;
    }
  }
}

function writeMeta(doc: Document, key: MetaKey, value: string): void {
  if (key === 'name' && value.trim() === '') throw new EditError('The player name cannot be empty.');
  if (doc.contents === null) doc.contents = doc.createNode({});
  if (!isMap(doc.contents)) throw new EditError('The top level of the YAML must be a map of settings.');
  if (key === 'description' && value === '') {
    doc.delete(key);
    return;
  }
  const existing = doc.get(key, true);
  const next = doc.createNode(value);
  if (isNode(existing)) {
    next.comment = existing.comment;
    next.commentBefore = existing.commentBefore;
  }
  doc.set(key, next);
}

/** Nothing to remove is not an error; a structure that cannot hold options is. */
function removeValue(doc: Document, game: string, option: string): void {
  if (doc.contents === null) return;
  if (!isMap(doc.contents)) throw new EditError('The top level of the YAML must be a map of settings.');

  const block = doc.get(game, true);
  if (block === undefined || (isScalar(block) && block.value === null)) return;
  if (!isMap(block)) throw new EditError(`"${game}" must be a block of options, not a single value.`);
  doc.deleteIn([game, option]);
}

/**
 * Writes a flat map (weights: value -> number) into the map that is already there, entry by entry, so the file keeps its order,
 * its quoting and the note after each line ("# equivalent to 50"). Rebuilding the map would sort number-like keys first and
 * drop those notes. Returns false (and changes nothing) when the new value is not a flat map.
 */
function mergeFlatMap(doc: Document, existing: YAMLMap, value: unknown): boolean {
  let entries: { key: unknown; text: string; value: unknown }[];
  const flat = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
  if (value instanceof YAMLMap) {
    entries = [];
    for (const pair of value.items) {
      const key = isScalar(pair.key) ? pair.key.value : pair.key;
      const v = isScalar(pair.value) ? pair.value.value : pair.value;
      if (!flat(key) || !flat(v)) return false;
      entries.push({ key: pair.key, text: String(key), value: v });
    }
  } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    entries = Object.entries(value as Record<string, unknown>).map(([key, v]) => ({ key, text: key, value: v }));
    if (!entries.every((entry) => flat(entry.value))) return false;
  } else {
    return false;
  }
  if (entries.length === 0) return false;
  if (!existing.items.every((pair) => isScalar(pair.key) && (pair.value === null || isScalar(pair.value)))) return false;
  const wanted = new Map(entries.map((entry) => [entry.text, entry]));
  const kept: typeof existing.items = [];
  for (const pair of existing.items) {
    const text = String((pair.key as Scalar).value);
    const entry = wanted.get(text);
    if (entry === undefined) continue;
    wanted.delete(text);
    if (isScalar(pair.value)) pair.value.value = entry.value;
    else pair.value = doc.createNode(entry.value);
    kept.push(pair);
  }
  for (const entry of wanted.values()) kept.push(doc.createPair(entry.key, entry.value) as (typeof existing.items)[number]);
  existing.items = kept;
  return true;
}

function writeValue(doc: Document, game: string, option: string, value: unknown): void {
  if (doc.contents === null) doc.contents = doc.createNode({});
  if (!isMap(doc.contents)) throw new EditError('The top level of the YAML must be a map of settings.');

  const block = doc.get(game, true);
  if (block === undefined || (isScalar(block) && block.value === null)) {
    doc.set(game, new YAMLMap());
  } else if (!isMap(block)) {
    throw new EditError(`"${game}" must be a block of options, not a single value.`);
  }

  const existing = doc.getIn([game, option], true);
  if (isMap(existing) && mergeFlatMap(doc, existing, value)) return;
  const next = doc.createNode(value);
  if (isNode(existing)) {
    next.comment = existing.comment; // keep "# why I chose this" notes
    next.commentBefore = existing.commentBefore;
  }
  doc.setIn([game, option], next);
}
