import { parseAllDocuments, isMap, isScalar } from 'yaml';

/** One player's YAML taken out of a file that holds several, with its own comments intact. */
export interface DocPart {
  /** The player name as written, or '' when there is none. */
  name: string;
  /** The game, or the games joined with " / " when the YAML mixes several. */
  game: string;
  text: string;
}

const SEPARATOR = /^---(?:\s.*)?$/;

function scalarText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/**
 * Splits a file with several YAML documents (Archipelago accepts one player per document, separated by ---).
 * Returns null when the file is a single document, or when any part cannot be read, so the normal one-file path
 * and its error messages stay in charge.
 */
export function splitDocuments(text: string): DocPart[] | null {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const chunks: string[][] = [[]];
  for (const line of lines) {
    if (SEPARATOR.test(line)) {
      chunks.push([]);
      continue;
    }
    chunks[chunks.length - 1]!.push(line);
  }
  const parts = chunks.map((chunk) => chunk.join('\n')).filter((chunk) => chunk.trim() !== '' && chunk.split('\n').some((l) => l.trim() !== '' && !l.trim().startsWith('#')));
  if (parts.length < 2) return null;
  const out: DocPart[] = [];
  for (const part of parts) {
    const docs = parseAllDocuments(part, { version: '1.1' });
    if (docs.length !== 1 || docs[0]!.errors.length > 0 || !isMap(docs[0]!.contents)) return null;
    const doc = docs[0]!;
    const name = scalarText(doc.get('name'));
    const gameNode = doc.get('game', true);
    let game = '';
    if (isScalar(gameNode)) game = scalarText(gameNode.value);
    else if (isMap(gameNode)) game = gameNode.items.map((pair) => scalarText(isScalar(pair.key) ? pair.key.value : pair.key)).join(' / ');
    out.push({ name, game, text: part.replace(/^\n+/, '').replace(/\s+$/, '') + '\n' });
  }
  return out;
}

/** A file name for one part: the player's name and game made safe, never repeated within the set. */
export function partFileNames(parts: readonly DocPart[]): string[] {
  const used = new Set<string>();
  return parts.map((part, index) => {
    const base = `${part.name || `player-${index + 1}`}-${part.game}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '');
    let name = base === '' ? `player-${index + 1}` : base;
    for (let n = 2; used.has(name); n += 1) name = `${base}-${n}`;
    used.add(name);
    return `${name}.yaml`;
  });
}
