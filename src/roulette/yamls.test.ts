import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { YamlDocument } from '../model/document';
import { parseSchemaFile } from '../schema/load';
import { rouletteGames } from './pick';
import { buildRouletteYamls } from './yamls';

const TEN_GAMES = [
  'Celeste',
  'Hollow Knight',
  'Super Metroid',
  'Factorio',
  'Stardew Valley',
  'Ori and the Blind Forest',
  'Pokemon Red and Blue',
  'Zelda',
  'Muse Dash',
  'Clique',
];

describe('buildRouletteYamls', () => {
  it('returns an empty list for an empty game list', () => {
    expect(buildRouletteYamls([])).toEqual([]);
  });

  it('gives unique file names and player names for 10 games', () => {
    const yamls = buildRouletteYamls(TEN_GAMES);
    expect(yamls).toHaveLength(10);
    expect(new Set(yamls.map((y) => y.fileName)).size).toBe(10);
    expect(new Set(yamls.map((y) => y.playerName)).size).toBe(10);
  });

  it('uses NN-slug.yaml file names of at most 46 characters for short names', () => {
    for (const yaml of buildRouletteYamls(TEN_GAMES)) {
      expect(yaml.fileName).toMatch(/^\d\d-[a-z0-9-]+\.yaml$/);
      expect(yaml.fileName.length).toBeLessThanOrEqual(46);
    }
  });

  it('numbers player names Roulette1..RouletteN, at most 16 characters', () => {
    const yamls = buildRouletteYamls(TEN_GAMES);
    expect(yamls.map((y) => y.playerName)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Roulette${i + 1}`),
    );
    for (const yaml of yamls) expect(yaml.playerName.length).toBeLessThanOrEqual(16);
  });

  it('writes YAML that parses to a valid document for its game and name', () => {
    for (const yaml of buildRouletteYamls(TEN_GAMES)) {
      const doc = YamlDocument.parse(yaml.text);
      expect(doc.isValid).toBe(true);
      expect(doc.getMeta('name')).toBe(yaml.playerName);
      expect(doc.games()).toContain(yaml.game);
      expect(yaml.game).toBeTruthy();
    }
  });

  it('makes clean slugs from names full of punctuation', () => {
    const yamls = buildRouletteYamls(['Celeste (Open World)', 'Yu-Gi-Oh! 2006', 'Mario & Luigi Superstar Saga']);
    expect(yamls.map((y) => y.fileName)).toEqual([
      '01-celeste-open-world.yaml',
      '02-yu-gi-oh-2006.yaml',
      '03-mario-luigi-superstar-saga.yaml',
    ]);
  });

  it('falls back to "game" when the slug would be empty', () => {
    const [yaml] = buildRouletteYamls(['!!!']);
    expect(yaml!.fileName).toBe('01-game.yaml');
  });

  it('cuts long slugs to 40 characters without a trailing dash', () => {
    const [yaml] = buildRouletteYamls(['A Very Long Game Name That Keeps Going And Going Forever']);
    const slug = yaml!.fileName.slice(3, -5);
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.startsWith('-')).toBe(false);
  });
});

describe('real visible games (skipped without data/schema.json)', () => {
  const schemaUrl = new URL('../../data/schema.json', import.meta.url);
  describe.skipIf(!existsSync(schemaUrl))('real schema', () => {
    const schema = parseSchemaFile(readFileSync(schemaUrl, 'utf8'));
    const games = rouletteGames(schema);

    it('every visible game gets a valid YAML for that game', () => {
      const yamls = buildRouletteYamls(games);
      expect(yamls).toHaveLength(games.length);
      for (const yaml of yamls) {
        const doc = YamlDocument.parse(yaml.text);
        expect(doc.isValid, yaml.game).toBe(true);
        expect(doc.games(), yaml.game).toEqual([yaml.game]);
      }
    });

    it('file names are unique across every batch of 10 games', () => {
      const yamls = buildRouletteYamls(games);
      for (let start = 0; start < yamls.length; start += 10) {
        const batch = yamls.slice(start, start + 10);
        expect(new Set(batch.map((y) => y.fileName)).size).toBe(batch.length);
      }
    });
  });
});
