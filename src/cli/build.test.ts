import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { indexProfiles } from '../difficulty/registry';
import { shippedProfiles } from '../difficulty/shipped';
import { TEST_GAME, TEST_PROFILE } from '../difficulty/testGame';
import { YamlDocument } from '../model/document';
import { withGroup } from '../randomize/testGame';
import { parseSchemaFile } from '../schema/load';
import { buildYaml, parseBand, validPlayerName, type BuildInput } from './build';

const game = withGroup(TEST_GAME);
const base: BuildInput = {
  game,
  apVersion: '0.6.7',
  profiles: indexProfiles([TEST_PROFILE]),
  name: 'Player',
  seed: 1,
  sets: {},
  lock: [],
  randomize: false,
  band: null,
};
const build = (patch: Partial<BuildInput> = {}) => buildYaml({ ...base, ...patch });

describe('validPlayerName', () => {
  it('accepts plain names up to 16 characters', () => {
    for (const name of ['Player', 'Fuzz12', 'a', 'Mr. Bean-2_x', '1234567890123456']) expect(validPlayerName(name), name).toBe(true);
  });
  it('refuses empty, long, odd or space-ended names', () => {
    for (const name of ['', '12345678901234567', '-x', 'a\nb', 'tab\t', 'ends ', 'café', '{player}']) expect(validPlayerName(name), name).toBe(false);
  });
});

describe('parseBand', () => {
  it('reads low-high', () => {
    expect(parseBand('2-4')).toEqual({ ok: true, band: { min: 2, max: 4 } });
    expect(parseBand(' 2.5-6.5 ')).toEqual({ ok: true, band: { min: 2.5, max: 6.5 } });
    expect(parseBand('0-10')).toEqual({ ok: true, band: { min: 0, max: 10 } });
  });
  it('refuses nonsense', () => {
    for (const text of ['', '5', '4-2', '2-11', '-1-3', 'a-b', '2..4']) expect(parseBand(text).ok, text).toBe(false);
  });
});

describe('buildYaml', () => {
  it('writes a default YAML with the name and game and no options', () => {
    const result = build();
    expect(result).toMatchObject({ ok: true, rolled: 0, options: {} });
    expect(result.ok && result.text).toBe('name: Player\ngame: Test Game\nTest Game: {}\n');
    expect(result.ok && result.difficulty).toEqual({ score: 4, label: 'Moderate', source: 'rated' });
  });

  it('writes the options it was given, and rates them', () => {
    const result = build({ sets: { death_link: true, lives: 3 } });
    expect(result.ok && result.options).toEqual({ death_link: true, lives: 3 });
    expect(result.ok && result.text).toContain('death_link: true');
    expect(result.ok && result.difficulty?.score).toBe(6.5);
  });

  it('gives a YAML that parses back to a valid document for that game', () => {
    const result = build({ sets: { mode: 'hard' }, randomize: true, seed: 9 });
    if (!result.ok) throw new Error(result.message);
    const doc = YamlDocument.parse(result.text);
    expect(doc.isValid).toBe(true);
    expect(doc.games()).toEqual(['Test Game']);
    expect(doc.getMeta('name')).toBe('Player');
  });

  it('randomizes everything that was not set or locked, and is repeatable from the seed', () => {
    const a = build({ randomize: true, seed: 5, sets: { mode: 'hard' }, lock: ['lives'] });
    const b = build({ randomize: true, seed: 5, sets: { mode: 'hard' }, lock: ['lives'] });
    const c = build({ randomize: true, seed: 6, sets: { mode: 'hard' }, lock: ['lives'] });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a.ok && a.options['mode']).toBe('hard'); // set on purpose, never re-rolled
    expect(a.ok && Object.keys(a.options)).not.toContain('lives'); // locked and not set: left out
    expect(a.ok && Object.keys(a.options)).toEqual(expect.arrayContaining(['mode', 'death_link', 'balancing']));
    expect(a.ok && a.rolled).toBe(2);
  });

  it('keeps the difficulty inside a band when asked', () => {
    for (let seed = 1; seed <= 15; seed += 1) {
      const result = build({ randomize: true, seed, band: { min: 6, max: 8 } });
      expect(result.ok, `seed ${seed}`).toBe(true);
      const score = result.ok ? result.difficulty?.score : null;
      expect(score).toBeGreaterThanOrEqual(6);
      expect(score).toBeLessThanOrEqual(8);
    }
  });

  it('says so when a band cannot be met, and refuses a band without randomize', () => {
    const impossible = build({ randomize: true, band: { min: 0, max: 0.1 } });
    expect(impossible.ok).toBe(false);
    expect(!impossible.ok && impossible.message).toMatch(/No combination in \d+ tries landed between 0 and 0.1/);
    expect(build({ band: { min: 1, max: 2 } })).toEqual({ ok: false, message: '--band only makes sense together with --randomize.' });
  });

  it('refuses an unusable name and a lock on an option that does not exist', () => {
    expect(build({ name: 'a'.repeat(17) }).ok).toBe(false);
    expect(build({ lock: ['nope'], randomize: true })).toEqual({ ok: false, message: '--lock: Test Game has no option "nope".' });
  });

  it('says nothing is left to randomize when everything is locked or set', () => {
    const result = build({ randomize: true, sets: { mode: 'easy' }, lock: ['death_link', 'lives', 'balancing'] });
    expect(result).toEqual({ ok: false, message: 'Every option that can be randomized is locked or weighted, so nothing was changed.' });
  });

  it('reports no difficulty for a game without a rating', () => {
    const plain = withGroup({ ...TEST_GAME, name: 'Plain', options: { notes: TEST_GAME.options['notes']! } });
    expect(buildYaml({ ...base, game: plain }).ok && (buildYaml({ ...base, game: plain }) as { difficulty: unknown }).difficulty).toBeNull();
  });
});

const schemaUrl = new URL('../../data/schema.json', import.meta.url);
const schema = existsSync(schemaUrl) ? parseSchemaFile(readFileSync(schemaUrl, 'utf8')) : null;

describe.skipIf(schema === null)('buildYaml against the real schema', () => {
  it('writes a valid, parseable, repeatable randomized YAML for every visible game', () => {
    for (const g of Object.values(schema!.games).filter((x) => !x.hidden)) {
      const input: BuildInput = { ...base, game: g, apVersion: schema!.apVersion, profiles: shippedProfiles, randomize: true, seed: g.name.length * 31 };
      const first = buildYaml(input);
      expect(first.ok, `${g.name}: ${first.ok ? '' : first.message}`).toBe(true);
      if (!first.ok) continue;
      expect(buildYaml(input)).toEqual(first);
      const doc = YamlDocument.parse(first.text);
      expect(doc.isValid, g.name).toBe(true);
      expect(doc.games(), g.name).toEqual([g.name]);
    }
  });

  it('a default YAML for a game is tiny and valid', () => {
    const g = schema!.games['A Link to the Past']!;
    const result = buildYaml({ ...base, game: g, apVersion: schema!.apVersion, profiles: shippedProfiles });
    expect(result.ok && result.text).toBe('name: Player\ngame: A Link to the Past\nA Link to the Past: {}\n');
    expect(result.ok && result.difficulty).toEqual({ score: 4, label: 'Moderate', source: 'rated' });
  });
});
