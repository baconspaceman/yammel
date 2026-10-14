import { describe, expect, it } from 'vitest';
import { indexProfiles } from '../difficulty/registry';
import type { DifficultyProfile } from '../difficulty/types';
import { TEST_GAME, TEST_PROFILE } from '../difficulty/testGame';
import { YamlDocument } from '../model/document';
import { seededRandom } from '../roulette/random';
import { isWeightedValue, planRandomizeAll } from './plan';
import { withGroup } from './testGame';

const game = withGroup(TEST_GAME);
const profiles = indexProfiles([TEST_PROFILE]);
const base = { game, apVersion: '0.6.7', profiles, current: {}, locked: new Set<string>() };

function keys(plan: ReturnType<typeof planRandomizeAll>): string[] {
  if (!plan.ok) throw new Error(plan.message);
  return plan.edits.map((e) => (e.op === 'set' ? e.option : '?'));
}

describe('isWeightedValue', () => {
  it('is true only for a plain table of weights', () => {
    expect(isWeightedValue({ a: 1 })).toBe(true);
    expect(isWeightedValue(['a'])).toBe(true); // a list is a deliberate pool too: not ours to overwrite
    expect(isWeightedValue('random')).toBe(false);
    expect(isWeightedValue(null)).toBe(false);
    expect(isWeightedValue(undefined)).toBe(false);
    expect(isWeightedValue(3)).toBe(false);
  });
});

describe('planRandomizeAll without a band', () => {
  it('re-rolls every option Randomize everything may touch, as set edits, in one try', () => {
    const plan = planRandomizeAll({ ...base, random: seededRandom(1) });
    expect(plan.ok && plan.tries).toBe(1);
    expect(plan.ok && plan.rolled).toBe(4);
    expect(keys(plan)).toEqual(['death_link', 'mode', 'lives', 'balancing']);
  });

  it('leaves locked options alone', () => {
    const plan = planRandomizeAll({ ...base, locked: new Set(['mode', 'lives']), random: seededRandom(1) });
    expect(keys(plan)).toEqual(['death_link', 'balancing']);
    expect(plan.ok && plan.rolled).toBe(2);
  });

  it('says so when everything is locked, and changes nothing', () => {
    const all = new Set(['death_link', 'mode', 'lives', 'balancing']);
    const plan = planRandomizeAll({ ...base, locked: all, random: seededRandom(1) });
    expect(plan).toEqual({ ok: false, message: 'Every option that can be randomized is locked or weighted, so nothing was changed.' });
  });

  it('leaves options alone that the person weighted on purpose', () => {
    const plan = planRandomizeAll({ ...base, current: { mode: { easy: 1, hard: 3 }, lives: 4 }, random: seededRandom(1) });
    expect(keys(plan)).toEqual(['death_link', 'lives', 'balancing']);
    expect(plan.ok && plan.rolled).toBe(3);
  });

  it('counts a weighted option as locked when everything else is locked too', () => {
    const plan = planRandomizeAll({
      ...base,
      current: { mode: { easy: 1, hard: 3 } },
      locked: new Set(['death_link', 'lives', 'balancing']),
      random: seededRandom(1),
    });
    expect(plan.ok).toBe(false);
  });

  it('re-rolls an option set to random text, but leaves a list alone', () => {
    const plan = planRandomizeAll({ ...base, current: { mode: 'random', lives: 'random-low', balancing: [1, 2] }, random: seededRandom(1) });
    expect(keys(plan)).toEqual(['death_link', 'mode', 'lives']);
  });

  it('writes values that apply cleanly to a real YAML document, as a single batch', () => {
    const doc = YamlDocument.empty('Test Game');
    const plan = planRandomizeAll({ ...base, random: seededRandom(5) });
    if (!plan.ok) throw new Error(plan.message);
    doc.applyAll(plan.edits);
    expect(doc.isValid).toBe(true);
    for (const key of ['death_link', 'mode', 'lives', 'balancing']) expect(doc.has('Test Game', key)).toBe(true);
  });

  it('is deterministic for the same seed and differs between seeds', () => {
    const a = planRandomizeAll({ ...base, random: seededRandom(9) });
    const b = planRandomizeAll({ ...base, random: seededRandom(9) });
    const c = planRandomizeAll({ ...base, random: seededRandom(10) });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe('planRandomizeAll with a difficulty band', () => {
  it('only accepts a roll whose estimate lands inside the band', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const plan = planRandomizeAll({ ...base, band: { min: 6, max: 8 }, random: seededRandom(seed) });
      expect(plan.ok, `seed ${seed}`).toBe(true);
      if (plan.ok) {
        expect(plan.score).toBeGreaterThanOrEqual(6);
        expect(plan.score).toBeLessThanOrEqual(8);
      }
    }
  });

  it('counts locked options at their current values when judging the band', () => {
    // The base is 4 and the locked "hard" adds 2. Without it the best any roll can do is 9, so a band of 9.5 to 10 can only
    // be met if the locked value really is counted at its current setting.
    for (let seed = 1; seed <= 10; seed += 1) {
      const plan = planRandomizeAll({
        ...base,
        current: { mode: 'hard' },
        locked: new Set(['mode']),
        band: { min: 9.5, max: 10 },
        random: seededRandom(seed),
      });
      expect(plan.ok, `seed ${seed}`).toBe(true);
      expect(plan.ok && keys(plan)).not.toContain('mode');
      expect(plan.ok && (plan.score ?? 0) >= 9.5).toBe(true);
    }
    const ignoring = planRandomizeAll({ ...base, current: {}, band: { min: 9.5, max: 10 }, locked: new Set(['mode']), random: seededRandom(1), maxTries: 200 });
    expect(ignoring.ok).toBe(false); // with the locked mode at its default, 9.5 cannot be reached
  });

  it('says plainly when no roll fits and changes nothing', () => {
    const plan = planRandomizeAll({ ...base, band: { min: 0, max: 0.2 }, maxTries: 40, random: seededRandom(1) });
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.message).toBe(
      'No combination in 40 tries landed between 0 and 0.2, so nothing was changed. Try a wider band, or unlock more options.',
    );
  });

  it('refuses a band that makes no sense', () => {
    for (const band of [{ min: 5, max: 3 }, { min: -1, max: 4 }, { min: 2, max: 11 }, { min: Number.NaN, max: 4 }]) {
      const plan = planRandomizeAll({ ...base, band, random: seededRandom(1) });
      expect(plan.ok).toBe(false);
    }
  });

  it('refuses a band for a game that has no difficulty rating', () => {
    const plain = withGroup({ ...TEST_GAME, name: 'Plain', options: { notes: TEST_GAME.options['notes']!, mode: { ...TEST_GAME.options['mode']!, key: 'mode' } } });
    const plan = planRandomizeAll({ ...base, game: plain, band: { min: 2, max: 6 }, random: seededRandom(1) });
    expect(plan).toEqual({ ok: false, message: 'This game has no difficulty rating, so a difficulty band cannot be used.' });
  });

  it('is bounded and exact: it scores exactly maxTries rolls, never more and never fewer', () => {
    class CountingMap extends Map<string, DifficultyProfile> {
      gets = 0;
      override get(key: string): DifficultyProfile | undefined {
        this.gets += 1;
        return super.get(key);
      }
    }
    for (const maxTries of [1, 2, 25, 100]) {
      const counting = new CountingMap([...profiles]);
      const plan = planRandomizeAll({ ...base, profiles: counting, band: { min: 0, max: 0.2 }, maxTries, random: seededRandom(3) });
      expect(plan.ok).toBe(false);
      // one look at the current rating to see whether the game has one, then one per scored roll
      expect(counting.gets, `maxTries ${maxTries}`).toBe(1 + maxTries);
    }
  });

  it('cannot loop forever when no option has a second value to try', () => {
    const single = withGroup({
      ...TEST_GAME,
      name: 'Single',
      options: { mode: { ...TEST_GAME.options['mode']!, choices: [{ key: 'only', label: 'Only' }], default: 'only' } },
    });
    const plan = planRandomizeAll({
      ...base,
      game: single,
      profiles: indexProfiles([{ ...TEST_PROFILE, game: 'Single', options: { mode: { values: { only: 1 } } } }]),
      band: { min: 9, max: 10 },
      maxTries: 50,
      random: seededRandom(1),
    });
    expect(plan.ok).toBe(false);
  });
});
