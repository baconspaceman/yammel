import { isMap, isScalar, parseDocument, Scalar, type Document } from 'yaml';

/** What kind of control an entry gets. */
export type EntryKind = 'bool' | 'number' | 'choice' | 'path' | 'text';

export interface Choice {
  /** The value as written in the file ("auto", "3"). */
  value: string;
  /** What the file's own comment says it does. */
  label: string;
}

export interface Entry {
  section: string;
  key: string;
  /** "Output path" for output_path. */
  label: string;
  /** The comment above the entry in the file, one string with line breaks, or ''. */
  comment: string;
  kind: EntryKind;
  value: string | number | boolean | null;
  choices: Choice[];
}

export interface Section {
  key: string;
  title: string;
  comment: string;
  entries: Entry[];
  /** Keys inside this section that hold lists or nested settings; the form does not edit those. */
  other: string[];
}

export type Eol = '\n' | '\r\n';

export type ParsedHost =
  | {
      ok: true;
      doc: Document;
      sections: Section[];
      /** The file's own line ending, kept when it is saved. */
      eol: Eol;
      /** The file mixes Windows and plain line endings; a save makes them all the same. */
      mixedEol: boolean;
    }
  | { ok: false; message: string };

/** "output_path" becomes "Output path"; "lttp_options" becomes "Lttp options". */
export function humanize(key: string): string {
  const text = key.replace(/_options$/, ' options').split(/[_\s]+/).filter(Boolean).join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function cleanComment(text: string | null | undefined): string {
  if (text === undefined || text === null) return '';
  return text
    .split('\n')
    .map((line) => line.replace(/^\s?/, ''))
    .join('\n')
    .trim();
}

/** "disabled" -> clients cannot release   lines in a comment make a list of choices. */
export function choicesFrom(comment: string): Choice[] {
  const out: Choice[] = [];
  for (const line of comment.split('\n')) {
    const match = /^\s*"?([A-Za-z0-9_.\- ]+?)"?\s*->\s*(.+)$/.exec(line);
    if (match !== null) out.push({ value: match[1]!.trim(), label: match[2]!.trim() });
  }
  return out.length >= 2 ? out : [];
}

const PATH_KEY = /(^|_)(path|paths|file|files|dir|folder|executable|exe|rom|iso|location)(_|$)/i;

function kindFor(key: string, value: unknown, comment: string, choices: Choice[]): EntryKind {
  if (typeof value === 'boolean') return 'bool';
  if (choices.some((choice) => choice.value === String(value))) return 'choice';
  if (typeof value === 'number') return 'number';
  if (value === null || typeof value === 'string') {
    if (PATH_KEY.test(key) || /\b(file name|location of|folder|path to)\b/i.test(comment)) return 'path';
  }
  return 'text';
}

function sectionEntries(section: string, node: unknown): { entries: Entry[]; other: string[] } {
  const entries: Entry[] = [];
  const other: string[] = [];
  if (!isMap(node)) return { entries, other };
  for (const [index, pair] of node.items.entries()) {
    const key = isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
    const value = pair.value;
    if (!isScalar(value)) {
      other.push(key);
      continue;
    }
    const raw = value.value;
    if (raw !== null && typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') {
      other.push(key);
      continue;
    }
    // The comment above the first entry of a section belongs to the section's map, not to the key.
    const keyComment = isScalar(pair.key) ? pair.key.commentBefore : undefined;
    const comment = cleanComment(keyComment ?? (index === 0 ? node.commentBefore : undefined) ?? value.commentBefore);
    const choices = choicesFrom(comment);
    entries.push({ section, key, label: humanize(key), comment, kind: kindFor(key, raw, comment, choices), value: raw as Entry['value'], choices });
  }
  return { entries, other };
}

/** Reads a host.yaml into sections of simple entries. Comments, order and everything the form does not show are kept in the document. */
export function parseHost(text: string): ParsedHost {
  const doc = parseDocument(text, { version: '1.1' });
  if (doc.errors.length > 0) return { ok: false, message: `host.yaml could not be read: ${doc.errors[0]!.message.split('\n')[0]}` };
  if (!isMap(doc.contents)) return { ok: false, message: 'host.yaml is not a list of settings.' };
  const sections: Section[] = [];
  const loose: Entry[] = [];
  const looseOther: string[] = [];
  for (const pair of doc.contents.items) {
    const key = isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
    const comment = cleanComment(isScalar(pair.key) ? pair.key.commentBefore : undefined);
    if (isMap(pair.value)) {
      const { entries, other } = sectionEntries(key, pair.value);
      sections.push({ key, title: humanize(key), comment, entries, other });
    } else if (isScalar(pair.value) && (pair.value.value === null || ['string', 'number', 'boolean'].includes(typeof pair.value.value))) {
      const choices = choicesFrom(comment);
      loose.push({ section: '', key, label: humanize(key), comment, kind: kindFor(key, pair.value.value, comment, choices), value: pair.value.value as Entry['value'], choices });
    } else looseOther.push(key);
  }
  if (loose.length > 0 || looseOther.length > 0) sections.unshift({ key: '', title: 'General', comment: '', entries: loose, other: looseOther });
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length - crlf;
  return { ok: true, doc, sections, eol: crlf >= lf && crlf > 0 ? '\r\n' : '\n', mixedEol: crlf > 0 && lf > 0 };
}

/** The text with every line ending set to `eol` (Archipelago's host.yaml on Windows uses CRLF, and a save must not change that). */
export function withEol(text: string, eol: Eol): string {
  const unix = text.replace(/\r\n/g, '\n');
  return eol === '\n' ? unix : unix.replace(/\n/g, '\r\n');
}

/** The file text with one entry changed. null (an empty box) writes `null`. Strings keep the file's double quotes. */
export function setEntry(parsed: Extract<ParsedHost, { ok: true }>, entry: Pick<Entry, 'section' | 'key'>, value: string | number | boolean | null): string {
  const doc = parsed.doc.clone();
  const path = entry.section === '' ? [entry.key] : [entry.section, entry.key];
  const existing = doc.getIn(path, true);
  const node = new Scalar(value);
  if (typeof value === 'string') node.type = 'QUOTE_DOUBLE';
  if (isScalar(existing)) {
    node.comment = existing.comment;
    node.commentBefore = existing.commentBefore;
  }
  doc.setIn(path, node);
  return withEol(doc.toString({ lineWidth: 0 }), parsed.eol);
}

export interface DiffLine {
  kind: 'same' | 'removed' | 'added';
  text: string;
}

/** A line-by-line difference of two texts (small files), with unchanged stretches cut down to a little context. */
export function diffLines(before: string, after: string, context = 1): DiffLine[] {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  }
  const full: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      full.push({ kind: 'same', text: a[i]! });
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      full.push({ kind: 'removed', text: a[i]! });
      i += 1;
    } else {
      full.push({ kind: 'added', text: b[j]! });
      j += 1;
    }
  }
  for (; i < n; i += 1) full.push({ kind: 'removed', text: a[i]! });
  for (; j < m; j += 1) full.push({ kind: 'added', text: b[j]! });
  const keep = full.map((line, index) => line.kind !== 'same' || full.slice(Math.max(0, index - context), index + context + 1).some((near) => near.kind !== 'same'));
  return full.filter((_, index) => keep[index]);
}
