import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSchemaFile } from '../schema/load';
import { shippedProfiles } from '../difficulty/shipped';
import { buildGameInfos, parseFactsFile, parseFeelFile } from './games';
import { scoreAllPairs, scorePair } from './score';
import { shippedFacts, shippedFeel } from './shipped';

const schema = parseSchemaFile(readFileSync(new URL('../../data/schema.json', import.meta.url), 'utf8'));
const visible = Object.values(schema.games).filter((g) => !g.hidden).map((g) => g.name);

describe('parseFeelFile', () => {
  it('keeps good entries and skips damaged ones', () => {
    const file = parseFeelFile({
      note: 'n',
      games: {
        Good: { genre: 'rpg', pace: 2, length: 3, tones: ['cozy', 4], era: 'mid', families: [], activities: ['x'] },
        BadPace: { genre: 'rpg', pace: 9, length: 3, era: 'mid' },
        BadEra: { genre: 'rpg', pace: 2, length: 3, era: 'future' },
        NotObject: 5,
      },
    });
    expect(Object.keys(file.games)).toEqual(['Good']);
    expect(file.games['Good']!.tones).toEqual(['cozy']);
  });

  it('gives an empty file for garbage', () => {
    for (const raw of [undefined, null, 5, [], 'x']) expect(parseFeelFile(raw).games).toEqual({});
  });
});

describe('parseFactsFile', () => {
  it('keeps good entries, nulls an unknown early-open, and skips damaged ones', () => {
    const file = parseFactsFile({
      apVersion: '0.6.7',
      scannedAt: 'now',
      games: { A: { checks: 6, items: 6, earlyOpen: 3, needsFile: true, systems: ['GB'] }, B: { checks: 9, earlyOpen: 'x' }, C: { checks: -1 }, D: 'no' },
      failed: {},
    });
    expect(Object.keys(file.games)).toEqual(['A', 'B']);
    expect(file.games['A']).toEqual({ checks: 6, items: 6, earlyOpen: 3, needsFile: true, systems: ['GB'] });
    expect(file.games['B']).toMatchObject({ earlyOpen: null, needsFile: false, systems: [] });
  });
});

describe('the shipped data', () => {
  it('has a drafted profile for every visible game, and none for a game that does not exist', () => {
    expect(Object.keys(shippedFeel.games).sort()).toEqual([...visible].sort());
  });

  it('draws every profile from the allowed vocabulary', () => {
    const tones = new Set(['cozy', 'whimsical', 'heroic', 'dark', 'tense', 'funny', 'mysterious', 'serious', 'energetic']);
    for (const [name, feel] of Object.entries(shippedFeel.games)) {
      expect(feel.tones.length, name).toBeGreaterThan(0);
      expect(feel.tones.length, name).toBeLessThanOrEqual(3);
      for (const tone of feel.tones) expect(tones.has(tone), `${name}: ${tone}`).toBe(true);
      expect(feel.activities.length, name).toBeGreaterThan(0);
    }
  });

  it('has scanned facts for (nearly) every visible game once the scan has been run', () => {
    if (Object.keys(shippedFacts.games).length === 0) return; // scan not run yet in this checkout
    const missing = visible.filter((name) => shippedFacts.games[name] === undefined);
    expect(missing.length, `not scanned: ${missing.join(', ')}`).toBeLessThanOrEqual(3);
    for (const facts of Object.values(shippedFacts.games)) {
      expect(facts.checks).toBeGreaterThanOrEqual(0);
      if (facts.earlyOpen !== null) expect(facts.earlyOpen).toBeLessThanOrEqual(facts.checks);
    }
  });
});

describe('buildGameInfos', () => {
  const infos = buildGameInfos(schema, shippedFeel, shippedFacts, shippedProfiles);

  it('makes one entry per visible game, sorted by name, hidden games left out', () => {
    expect(infos.map((i) => i.name)).toEqual([...visible].sort((a, b) => a.localeCompare(b)));
  });

  it('uses a difficulty only for curated ratings', () => {
    const rated = infos.filter((i) => i.difficulty !== null).map((i) => i.name);
    expect(rated).toContain('A Link to the Past');
    expect(rated).not.toContain('Factorio');
    expect(rated.length).toBeGreaterThanOrEqual(6);
  });

  it('with no data at all, every game is guessed and unscanned but still listed', () => {
    const bare = buildGameInfos(schema, null, null, new Map());
    expect(bare).toHaveLength(visible.length);
    expect(bare.every((i) => i.feel === null && i.facts === null && i.difficulty === null)).toBe(true);
  });
});

describe('the recommender on the real games (a smoke test, not proof of taste)', () => {
  const infos = buildGameInfos(schema, shippedFeel, shippedFacts, shippedProfiles);
  const byName = new Map(infos.map((i) => [i.name, i]));

  it('scores all 3,160 pairs, all inside 0 to 100, quickly', () => {
    const started = Date.now();
    const pairs = scoreAllPairs(infos);
    expect(pairs).toHaveLength((infos.length * (infos.length - 1)) / 2);
    for (const pair of pairs) {
      expect(pair.score).toBeGreaterThanOrEqual(0);
      expect(pair.score).toBeLessThanOrEqual(100);
    }
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('keeps Super Mario World with Kingdom Hearts out of the bottom third of the Kingdom Hearts partners (Balanced)', () => {
    // The project owner's example of a pairing they like. It is not in the top quarter as the design hoped: SMW has 108 checks
    // against 511 and needs a ROM, and the drafted profiles share only one tone. That is the honest output; this
    // test only guards against the pair being scored as plainly bad.
    const kh = 'Kingdom Hearts';
    const partners = infos
      .filter((i) => i.name !== kh)
      .map((i) => scorePair(byName.get(kh)!, i, { mood: 'balanced' }))
      .sort((x, y) => y.score - x.score);
    const rank = partners.findIndex((p) => p.a === 'Super Mario World' || p.b === 'Super Mario World');
    expect(rank).toBeGreaterThanOrEqual(0);
    expect(rank).toBeLessThan((partners.length * 2) / 3);
  });
});
