import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rateGame } from '../difficulty/registry';
import { shippedProfiles } from '../difficulty/shipped';
import { YamlDocument } from '../model/document';
import { parseSchemaFile } from '../schema/load';
import { seededRandom } from '../roulette/random';
import { validateDocument } from '../validate/validate';
import { guideReply, startersFor, type GuideContext } from './guide';
import { clearWinner, searchOptions, stem, words } from './match';

const schema = parseSchemaFile(readFileSync(new URL('../../data/schema.json', import.meta.url), 'utf8'));

function ctxFor(gameName: string, yaml?: string): GuideContext {
  const doc = yaml === undefined ? YamlDocument.empty(gameName) : YamlDocument.parse(yaml);
  const game = schema.games[gameName]!;
  const values: Record<string, unknown> = {};
  for (const key of Object.keys(game.options)) if (doc.has(gameName, key)) values[key] = doc.get(gameName, key);
  return {
    schema,
    game,
    doc,
    issues: validateDocument(doc, schema),
    rating: rateGame(game, schema.apVersion, values, shippedProfiles),
    profiles: shippedProfiles,
    checks: 223,
    random: seededRandom(3),
  };
}

const alttp = () => ctxFor('A Link to the Past');
const apply = (ctx: GuideContext, edits: Parameters<YamlDocument['applyAll']>[0]) => {
  ctx.doc.applyAll(edits);
  return ctx.doc;
};

describe('word matching', () => {
  it('stems, drops filler words and splits CamelCase', () => {
    expect(stem('chests')).toBe('chest');
    expect(stem('shuffling')).toBe('shuffl');
    expect(words('Please turn off the Death Link')).toEqual(['death', 'link']);
    expect(words('ShuffleStorybookPages')).toEqual(['shuffle', 'storybook', 'pages']);
  });

  it('finds an option from its name, its key or a synonym', () => {
    const game = schema.games['A Link to the Past']!;
    expect(searchOptions(game, 'swordless', 3)[0]!.option.key).toBe('swordless');
    expect(searchOptions(game, 'key drop shuffle', 3)[0]!.option.key).toBe('key_drop_shuffle');
    expect(searchOptions(game, 'the goal', 3)[0]!.option.key).toBe('goal');
  });

  it('says nothing for words that match no option', () => {
    expect(searchOptions(schema.games['A Link to the Past']!, 'xylophone quasar', 3)).toEqual([]);
    expect(searchOptions(schema.games['A Link to the Past']!, '', 3)).toEqual([]);
  });

  it('only calls a match clear when it clearly beats the next one', () => {
    const game = schema.games['A Link to the Past']!;
    expect(clearWinner(searchOptions(game, 'swordless', 4))).not.toBeNull();
    expect(clearWinner([])).toBeNull();
  });
});

describe('the built-in guide', () => {
  it('introduces itself and offers things that make sense right now', () => {
    const ctx = alttp();
    const r = guideReply('help', ctx);
    expect(r.source).toBe('guide');
    expect(r.text).toContain('nothing happens until you press Apply');
    expect(r.followUps.length).toBeGreaterThan(0);
    expect(startersFor(ctx)).toContain('Make it harder');
    expect(startersFor(ctxFor('Factorio'))).not.toContain('Fix my problems');
  });

  it('offers "Fix my problems" first only when there are problems', () => {
    const bad = ctxFor('A Link to the Past', 'name: P\ngame: A Link to the Past\nA Link to the Past:\n  swordless: ture\n');
    expect(startersFor(bad)[0]).toBe('Fix my problems');
  });

  describe('turning options on and off', () => {
    it('turns a switch on', () => {
      const ctx = alttp();
      const r = guideReply('turn on swordless', ctx);
      expect(r.proposals).toHaveLength(1);
      expect(r.proposals[0]!.title).toBe('Turn on Swordless');
      expect(apply(ctx, r.proposals[0]!.edits).get('A Link to the Past', 'swordless')).toBe(true);
      expect(r.pointers[0]!.option).toBe('swordless');
    });

    it('turns a switch off, in several ways of saying it', () => {
      for (const sentence of ['turn off key drop shuffle', 'disable key drop shuffle', 'I do not want key drop shuffle, switch it off']) {
        const r = guideReply(sentence, alttp());
        expect(r.proposals[0]?.edits[0], sentence).toMatchObject({ option: 'key_drop_shuffle', value: false });
      }
    });

    it('sets a number, and says when it had to stay inside the range', () => {
      const ctx = alttp();
      const r = guideReply('set crystals needed for ganon to 5', ctx);
      expect(r.proposals[0]!.edits[0]).toMatchObject({ option: 'crystals_needed_for_ganon', value: 5 });
      const big = guideReply('set crystals needed for ganon to 50', ctx);
      expect(big.proposals[0]!.edits[0]).toMatchObject({ value: 7 });
      expect(big.text).toContain('only goes from');
    });

    it('sets a choice by its name', () => {
      const game = schema.games['A Link to the Past']!;
      const goal = game.options['goal']!;
      const choice = goal.choices![1]!;
      const r = guideReply(`set goal to ${choice.label}`, alttp());
      expect(r.proposals[0]!.edits[0]).toMatchObject({ option: 'goal', value: choice.key });
    });

    it('makes an option random when asked', () => {
      const r = guideReply('make swordless random', alttp());
      expect(r.proposals[0]!.edits[0]).toMatchObject({ option: 'swordless', value: 'random' });
    });

    it('offers the choices when the option is clear but the value is not', () => {
      const r = guideReply('change the goal', alttp());
      expect(r.proposals.length).toBeGreaterThan(1);
      expect(r.text).toContain('Goal');
    });

    it('asks for a number instead of guessing one', () => {
      const r = guideReply('change crystals needed for ganon', alttp());
      expect(r.proposals).toEqual([]);
      expect(r.text).toMatch(/Tell me the number you want, from 0 to 7/);
    });
  });

  describe('difficulty', () => {
    it('makes a rated game harder, and the change really raises the estimate', () => {
      const ctx = alttp();
      const r = guideReply('make it harder', ctx);
      expect(r.proposals).toHaveLength(1);
      const before = ctx.rating!.score!;
      apply(ctx, r.proposals[0]!.edits);
      const after = rateGame(ctx.game, schema.apVersion, Object.fromEntries(r.proposals[0]!.edits.map((e) => [(e as { option: string }).option, (e as { value: unknown }).value])), shippedProfiles).score!;
      expect(after).toBeGreaterThan(before);
      expect(r.text).toMatch(/from about .* to about/);
    });

    it('makes it easier from a hard setup, and "a bit" moves less than "a lot"', () => {
      const hard = ctxFor('A Link to the Past', 'name: P\ngame: A Link to the Past\nA Link to the Past:\n  swordless: true\n  timer: ohko\n');
      const easier = guideReply('make it easier', hard);
      expect(easier.proposals.length).toBeGreaterThan(0);
      const bit = guideReply('make it a bit harder', alttp());
      const lot = guideReply('make it much harder', alttp());
      expect(lot.proposals[0]!.edits.length).toBeGreaterThanOrEqual(bit.proposals[0]!.edits.length);
    });

    it('says plainly when a game has no rating', () => {
      const r = guideReply('make it harder', ctxFor('Factorio'));
      expect(r.proposals).toEqual([]);
      expect(r.text).toMatch(/no difficulty rating|cannot tell/);
    });

    it('leaves locked options alone', () => {
      const ctx = { ...alttp(), locked: new Set(Object.keys(schema.games['A Link to the Past']!.options)) };
      expect(guideReply('make it harder', ctx).proposals).toEqual([]);
    });
  });

  describe('problems', () => {
    const bad = 'name: P\ngame: A Link to the Past\nA Link to the Past:\n  swordless: ture\n  crystals_needed_for_ganon: 99\n';
    it('proposes the fixes, including one that applies them all', () => {
      const ctx = ctxFor('A Link to the Past', bad);
      const r = guideReply('fix my problems', ctx);
      expect(r.proposals[0]!.title).toBe('Apply all 2 fixes');
      apply(ctx, r.proposals[0]!.edits);
      expect(validateDocument(ctx.doc, schema)).toEqual([]);
    });

    it('never throws away something you wrote on its own: a fix that only removes is left for you to decide', () => {
      const ctx = ctxFor('A Link to the Past', 'name: P\ngame: A Link to the Past\nA Link to the Past:\n  swordless: ture\n  hardmode: true\n');
      const r = guideReply('fix my problems', ctx);
      expect(r.proposals).toHaveLength(1); // only the swordless fix
      expect(r.text).toContain('only fix would remove something you wrote');
      apply(ctx, r.proposals[0]!.edits);
      expect(ctx.doc.has('A Link to the Past', 'hardmode')).toBe(true);
    });

    it('says everything is fine when it is', () => {
      expect(guideReply('are there any errors?', alttp()).text).toContain('Nothing to fix');
    });
  });

  it('randomizes everything on request, as one proposal', () => {
    const r = guideReply('surprise me', alttp());
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0]!.edits.length).toBeGreaterThan(5);
  });

  it('summarizes what changed, with the check count and difficulty', () => {
    const ctx = ctxFor('A Link to the Past', 'name: P\ngame: A Link to the Past\nA Link to the Past:\n  swordless: true\n');
    const r = guideReply('what did I change?', ctx);
    expect(r.text).toContain('Swordless: On');
    expect(r.text).toContain('223 checks');
    expect(r.text).toMatch(/difficulty is about/);
    expect(guideReply('what did I change?', alttp()).text).toContain('Nothing in A Link to the Past has been changed');
  });

  it('explains an option from its own description', () => {
    const r = guideReply('what does goal do?', alttp());
    expect(r.text).toMatch(/^Goal:/);
    expect(r.text).toContain('Right now it is');
    expect(r.pointers[0]!.option).toBe('goal');
  });

  it('resets one option, or all of them', () => {
    const ctx = ctxFor('A Link to the Past', 'name: P\ngame: A Link to the Past\nA Link to the Past:\n  swordless: true\n  key_drop_shuffle: true\n');
    const one = guideReply('reset swordless', ctx);
    expect(one.proposals[0]!.edits).toEqual([{ op: 'reset', game: 'A Link to the Past', option: 'swordless' }]);
    expect(guideReply('start over', ctx).proposals[0]!.edits).toHaveLength(2);
    expect(guideReply('start over', alttp()).text).toContain('already at its defaults');
  });

  it('lists presets when a game has them, and applies one by name', () => {
    const name = Object.keys(schema.games).find((g) => Object.keys(schema.games[g]!.presets).length > 0 && !schema.games[g]!.hidden)!;
    const presetName = Object.keys(schema.games[name]!.presets)[0]!;
    const ctx = ctxFor(name);
    expect(guideReply('what presets are there?', ctx).proposals.length).toBeGreaterThan(0);
    const byName = guideReply(`use the ${presetName} preset`, ctx);
    expect(byName.proposals[0]!.title).toContain(presetName);
    apply(ctx, byName.proposals[0]!.edits);
    expect(validateDocument(ctx.doc, schema).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('finds options for an open question and points at them', () => {
    const r = guideReply('anything about dungeon keys', alttp());
    expect(r.pointers.length).toBeGreaterThan(0);
    expect(r.text).toContain('closest');
  });

  it('is honest when it cannot tell what was meant, and points to an AI helper', () => {
    const r = guideReply('xylophone quasar zeppelin', alttp());
    expect(r.proposals).toEqual([]);
    expect(r.text).toContain('built-in guide');
    expect(r.text).toContain('AI helper');
  });

  it('never proposes an edit the validator would call an error, over many requests on every game', () => {
    const requests = ['surprise me', 'make it harder', 'make it easier', 'fix my problems', 'use a preset', 'reset everything'];
    const problems: string[] = [];
    for (const game of Object.values(schema.games).filter((g) => !g.hidden)) {
      for (const request of requests) {
        const ctx = ctxFor(game.name);
        const r = guideReply(request, ctx);
        for (const p of r.proposals) {
          const doc = YamlDocument.empty(game.name);
          doc.applyAll(p.edits);
          const errors = validateDocument(doc, schema).filter((i) => i.severity === 'error');
          if (errors.length > 0) problems.push(`${game.name} / ${request} / ${p.title}: ${errors[0]!.message}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
