import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { YamlDocument } from './document';

const dir = new URL('../../tests/fixtures/player-yamls/', import.meta.url);
const files = readdirSync(dir).filter((file) => file.endsWith('.yaml'));

/** Whole-line and trailing comments, as written. */
function commentsOf(text: string): string[] {
  return text.split('\n').flatMap((line) => {
    const at = line.indexOf('#');
    return at === -1 ? [] : [line.slice(at).trim()];
  });
}

describe('player YAML corpus', () => {
  it('has fixture files', () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  describe.each(files)('%s', (file) => {
    const text = readFileSync(new URL(file, dir), 'utf8');

    it('round-trips byte for byte and is valid', () => {
      const doc = YamlDocument.parse(text);
      expect(doc.isValid).toBe(true);
      expect(doc.toString()).toBe(text);
    });

    it('stays valid and keeps every comment after an edit', () => {
      const doc = YamlDocument.parse(text);
      const game = doc.games()[0]!;
      const block = parse(text, { version: '1.1' })[game] as Record<string, unknown>;
      const option = Object.keys(block)[0]!;
      doc.apply({ op: 'set', game, option, value: 'edited' });
      const out = doc.toString();
      expect(out).not.toBe(text);
      const reparsed = YamlDocument.parse(out);
      expect(reparsed.isValid).toBe(true);
      expect(reparsed.get(game, option)).toBe('edited');
      for (const comment of commentsOf(text)) expect(out, comment).toContain(comment);
    });
  });
});
