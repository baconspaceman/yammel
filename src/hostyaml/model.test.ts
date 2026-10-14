import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { choicesFrom, diffLines, humanize, parseHost, setEntry, withEol } from './model';

const SAMPLE = readFileSync(join(process.cwd(), 'tests', 'fixtures', 'host-sample.yaml'), 'utf8');
const parsed = (text = SAMPLE) => {
  const result = parseHost(text);
  if (!result.ok) throw new Error(result.message);
  return result;
};
const entry = (section: string, key: string) => parsed().sections.find((s) => s.key === section)!.entries.find((e) => e.key === key)!;

describe('humanize', () => {
  it('turns file keys into readable names', () => {
    expect(humanize('output_path')).toBe('Output path');
    expect(humanize('lttp_options')).toBe('Lttp options');
    expect(humanize('rom_file')).toBe('Rom file');
    expect(humanize('x')).toBe('X');
  });
});

describe('choicesFrom', () => {
  it('reads "value -> meaning" lines in a comment as a list of choices', () => {
    expect(choicesFrom('Release modes\n"disabled" -> clients cannot release,\n"enabled" -> clients can always release\n"auto-enabled" -> both')).toEqual([
      { value: 'disabled', label: 'clients cannot release,' },
      { value: 'enabled', label: 'clients can always release' },
      { value: 'auto-enabled', label: 'both' },
    ]);
    expect(choicesFrom('0 -> None\n1 -> Spoiler')).toHaveLength(2);
  });

  it('needs at least two, and ignores ordinary sentences', () => {
    expect(choicesFrom('"x" -> only one')).toEqual([]);
    expect(choicesFrom('Just a sentence about things -- not a list')).toEqual([]);
  });
});

describe('parseHost on a real host.yaml', () => {
  it('finds every section and entry, with the file\'s own comments as descriptions', () => {
    const host = parsed();
    expect(host.sections.map((s) => s.key)).toEqual(['general_options', 'server_options', 'generator', 'sni_options', 'bizhawkclient_options', 'adventure_options']);
    expect(entry('general_options', 'output_path')).toMatchObject({ value: 'output', kind: 'path', comment: 'Where to place output files' });
    expect(entry('server_options', 'port')).toMatchObject({ value: 38281, kind: 'number' });
    expect(entry('server_options', 'disable_save')).toMatchObject({ value: false, kind: 'bool' });
    expect(entry('server_options', 'host')).toMatchObject({ value: null });
  });

  it('turns the comment lists into dropdowns, for words and for numbers', () => {
    const release = entry('server_options', 'release_mode');
    expect(release.kind).toBe('choice');
    expect(release.choices.map((c) => c.value)).toEqual(['disabled', 'enabled', 'auto', 'auto-enabled', 'goal']);
    const spoiler = entry('generator', 'spoiler');
    expect(spoiler.kind).toBe('choice');
    expect(spoiler.choices.map((c) => c.value)).toEqual(['0', '1', '2', '3']);
    expect(entry('generator', 'panic_method').kind).toBe('choice');
  });

  it('recognizes files and folders so they get a Browse button', () => {
    expect(entry('adventure_options', 'rom_file').kind).toBe('path');
    expect(entry('sni_options', 'sni_path').kind).toBe('path');
    expect(entry('generator', 'player_files_path').kind).toBe('path');
    expect(entry('generator', 'enemizer_path').kind).toBe('path');
  });

  it('turns an unreadable file into a plain message', () => {
    expect(parseHost('a: [unclosed\n')).toMatchObject({ ok: false });
    expect(parseHost('- just\n- a list\n')).toMatchObject({ ok: false, message: 'host.yaml is not a list of settings.' });
  });
});

describe('setEntry', () => {
  it('changes one value and leaves every comment and every other line exactly as it was', () => {
    const after = setEntry(parsed(), { section: 'server_options', key: 'port' }, 12345);
    const changed = diffLines(SAMPLE, after, 0).filter((line) => line.kind !== 'same');
    expect(changed).toEqual([
      { kind: 'removed', text: '  port: 38281' },
      { kind: 'added', text: '  port: 12345' },
    ]);
  });

  it('keeps text in double quotes like the file does, and writes null for an empty box', () => {
    const quoted = setEntry(parsed(), { section: 'general_options', key: 'output_path' }, 'D:/seeds');
    expect(quoted).toContain('output_path: "D:/seeds"');
    const cleared = setEntry(parsed(quoted), { section: 'server_options', key: 'password' }, null);
    expect(cleared).toContain('password: null');
  });

  it('writes booleans and changes survive a second parse', () => {
    const after = setEntry(parsed(), { section: 'server_options', key: 'disable_save' }, true);
    expect(after).toContain('disable_save: true');
    const again = parseHost(after);
    expect(again.ok && again.sections.find((s) => s.key === 'server_options')!.entries.find((e) => e.key === 'disable_save')!.value).toBe(true);
  });

  it('does not touch the original', () => {
    const host = parsed();
    setEntry(host, { section: 'server_options', key: 'port' }, 1);
    expect(host.doc.toString()).toBe(parseHost(SAMPLE).ok ? (parseHost(SAMPLE) as { doc: { toString(): string } }).doc.toString() : '');
  });
});

describe('line endings', () => {
  const crlf = SAMPLE.replace(/\r?\n/g, '\r\n');

  it('keeps Windows line endings: an unchanged round trip gives back the identical text', () => {
    const host = parsed(crlf);
    expect(host.eol).toBe('\r\n');
    expect(setEntry(host, { section: 'server_options', key: 'port' }, 38281)).toBe(crlf);
  });

  it('changes only the edited line in a CRLF file', () => {
    const after = setEntry(parsed(crlf), { section: 'server_options', key: 'port' }, 1);
    expect(after.includes('\r\n')).toBe(true);
    expect(after.replace(/\r\n/g, '').includes('\n')).toBe(false);
    expect(diffLines(crlf, after, 0)).toEqual([
      { kind: 'removed', text: '  port: 38281' },
      { kind: 'added', text: '  port: 1' },
    ]);
  });

  it('notices a file that mixes both kinds, and uses the more common one', () => {
    const mixed = 'a:\r\n  b: 1\r\n  c: 2\n';
    expect(parsed(mixed)).toMatchObject({ eol: '\r\n', mixedEol: true });
    expect(parsed(crlf).mixedEol).toBe(false);
    expect(parsed('a:\n  b: 1\n').mixedEol).toBe(false);
  });

  it('keeps plain line endings plain', () => {
    expect(parsed(SAMPLE.replace(/\r\n/g, '\n')).eol).toBe('\n');
    expect(withEol('a\r\nb\n', '\n')).toBe('a\nb\n');
    expect(withEol('a\nb\r\n', '\r\n')).toBe('a\r\nb\r\n');
  });
});

describe('diffLines', () => {
  it('shows only what changed with a line of context', () => {
    const diff = diffLines('a\nb\nc\nd\ne\nf', 'a\nb\nX\nd\ne\nf');
    expect(diff).toEqual([
      { kind: 'same', text: 'b' },
      { kind: 'removed', text: 'c' },
      { kind: 'added', text: 'X' },
      { kind: 'same', text: 'd' },
    ]);
    expect(diffLines('same\ntext', 'same\ntext')).toEqual([]);
  });

  it('handles additions and removals at the ends', () => {
    expect(diffLines('a', 'a\nb', 0)).toEqual([{ kind: 'added', text: 'b' }]);
    expect(diffLines('a\nb', 'a', 0)).toEqual([{ kind: 'removed', text: 'b' }]);
  });

  it('is fast on a long file', () => {
    const lines = Array.from({ length: 700 }, (_, i) => `line ${i}`);
    const started = Date.now();
    diffLines(lines.join('\n'), [...lines.slice(0, 300), 'changed', ...lines.slice(301)].join('\n'));
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
