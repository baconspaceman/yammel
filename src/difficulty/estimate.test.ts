import { describe, expect, it } from 'vitest';
import { estimateProfile, ESTIMATE_BASE } from './estimate';
import { validateProfile } from './profile';
import { scoreProfile } from './score';
import type { GameSchema, OptionSchema } from '../schema/types';
import { TEST_GAME } from './testGame';

function gameWith(options: Partial<OptionSchema>[]): GameSchema {
  const built: Record<string, OptionSchema> = {};
  for (const o of options) {
    const full = { displayName: o.key!, description: '', visibility: ['simple_ui'], supportsWeighting: true, ...o } as OptionSchema;
    built[full.key] = full;
  }
  return { ...TEST_GAME, name: 'Estimated Game', options: built };
}

const choices = (...keys: string[]) => keys.map((key) => ({ key, label: key }));

describe('estimateProfile', () => {
  it('returns null when no option looks difficulty-related', () => {
    expect(estimateProfile({ ...TEST_GAME, options: { notes: TEST_GAME.options['notes']! } }, '0.6.7')).toBeNull();
    expect(estimateProfile(gameWith([{ key: 'music', kind: 'toggle', default: true }]), '0.6.7')).toBeNull();
  });

  it('starts every estimate at the middle of the scale and says it is estimated', () => {
    const profile = estimateProfile(gameWith([{ key: 'hard_mode', kind: 'toggle', default: false }]), '0.6.7')!;
    expect(profile.status).toBe('estimated');
    expect(profile.base).toBe(ESTIMATE_BASE);
    expect(profile.game).toBe('Estimated Game');
  });

  it('does not rate a game from death link and accessibility alone, since nearly every game has those', () => {
    const generic = [
      { key: 'death_link', kind: 'toggle', default: false },
      { key: 'accessibility', kind: 'choice', default: 'full', choices: choices('full', 'minimal') },
    ] as Partial<OptionSchema>[];
    expect(estimateProfile(gameWith(generic), '0.6.7')).toBeNull();
  });

  it('finds death link, as a switch or as a choice, once something specific backs the estimate', () => {
    const toggle = estimateProfile(gameWith([{ key: 'DeathLink', kind: 'toggle', default: false }, { key: 'hard_mode', kind: 'toggle', default: false }]), '0.6.7')!;
    expect(toggle.options['DeathLink']?.values).toEqual({ true: 0.4 });
    const choice = estimateProfile(
      gameWith([{ key: 'death_link', kind: 'choice', default: 'disable', choices: choices('disable', 'enable', 'enable_survive') }, { key: 'hard_mode', kind: 'toggle', default: false }]),
      '0.6.7',
    )!;
    expect(choice.options['death_link']?.values).toEqual({ enable: 0.4, enable_survive: 0.4 });
  });

  it('finds minimal accessibility only where it exists', () => {
    const found = estimateProfile(
      gameWith([{ key: 'accessibility', kind: 'choice', default: 'full', choices: choices('full', 'minimal') }, { key: 'hard_mode', kind: 'toggle', default: false }]),
      '0.6.7',
    )!;
    expect(found.options['accessibility']?.values).toEqual({ minimal: 0.6 });
    const other = estimateProfile(gameWith([{ key: 'accessibility', kind: 'choice', default: 'a', choices: choices('a', 'b') }, { key: 'hard_mode', kind: 'toggle', default: false }]), '0.6.7')!;
    expect(other.options['accessibility']).toBeUndefined();
  });

  it('scales the overall amount of traps and ignores per-trap weights, counts and sharing', () => {
    const profile = estimateProfile(
      gameWith([
        { key: 'trap_percentage', kind: 'range', default: 0, min: 0, max: 100 },
        { key: 'trap_fill_percentage', kind: 'range', default: 0, min: 0, max: 100 },
        { key: 'TrapChance', kind: 'range', default: 0, min: 0, max: 100 },
        { key: 'teleport_traps', kind: 'range', default: 0, min: 0, max: 25 },
        { key: 'ice_trap_weight', kind: 'choice', default: 'medium', choices: choices('none', 'low', 'medium', 'high') },
        { key: 'trap_chance_pong', kind: 'range', default: 0, min: 0, max: 100 },
        { key: 'trap_link', kind: 'toggle', default: false },
      ]),
      '0.6.7',
    )!;
    expect(profile.options['trap_percentage']?.curve).toEqual([[0, 0], [100, 1]]);
    expect(profile.options['trap_fill_percentage']?.curve).toEqual([[0, 0], [100, 1]]);
    expect(profile.options['TrapChance']?.curve).toEqual([[0, 0], [100, 1]]);
    // relative weights and per-trap counts only matter once traps exist, and all-equal weights change nothing
    expect(profile.options['teleport_traps']).toBeUndefined();
    expect(profile.options['ice_trap_weight']).toBeUndefined();
    expect(profile.options['trap_chance_pong']).toBeUndefined();
    expect(profile.options['trap_link']).toBeUndefined(); // sharing traps between players is not extra difficulty
  });

  it('cannot be pushed to the ends of the scale by turning every trap weight up or down', () => {
    const names = ['a', 'b', 'c', 'd'];
    const game = gameWith([
      { key: 'trap_fill_percentage', kind: 'range', default: 0, min: 0, max: 100 },
      ...names.map((n) => ({ key: `${n}_trap_weight`, kind: 'choice', default: 'medium', choices: choices('none', 'low', 'medium', 'high') }) as Partial<OptionSchema>),
    ]);
    const profile = estimateProfile(game, '0.6.7')!;
    const allNone = Object.fromEntries(names.map((n) => [`${n}_trap_weight`, 'none']));
    const allHigh = Object.fromEntries(names.map((n) => [`${n}_trap_weight`, 'high']));
    expect(scoreProfile(profile, game, allNone).score).toBe(5);
    expect(scoreProfile(profile, game, allHigh).score).toBe(5);
  });

  it('finds switches that make the game harder', () => {
    const profile = estimateProfile(
      gameWith([
        { key: 'hard_mode', kind: 'toggle', default: false },
        { key: 'ohko', kind: 'toggle', default: false },
      ]),
      '0.6.7',
    )!;
    expect(profile.options['hard_mode']?.values).toEqual({ true: 1.5 });
    expect(profile.options['ohko']?.values).toEqual({ true: 2 });
  });

  it('turns difficulty words in choice names into a ladder', () => {
    const profile = estimateProfile(
      gameWith([{ key: 'enemy_health', kind: 'choice', default: 'default', choices: choices('easy', 'default', 'hard', 'expert') }]),
      '0.6.7',
    )!;
    expect(profile.options['enemy_health']?.values).toEqual({ easy: -0.6, default: 0, hard: 0.6, expert: 1 });
  });

  it('refuses a ladder with any choice it cannot place, instead of scoring that choice as the default', () => {
    const odd = gameWith([{ key: 'game_difficulty', kind: 'choice', default: 'normal', choices: choices('easy', 'normal', 'hard', 'wobbly') }]);
    expect(estimateProfile(odd, '0.6.7')).toBeNull();
  });

  it('knows words for the easiest and hardest choices too', () => {
    const profile = estimateProfile(
      gameWith([{ key: 'game_difficulty', kind: 'choice', default: 'normal', choices: choices('baby', 'easy', 'normal', 'hard', 'brutal', 'extreme') }]),
      '0.6.7',
    )!;
    const v = profile.options['game_difficulty']!.values!;
    expect(v['baby']).toBeLessThan(v['easy']!);
    expect(v['brutal']).toBeGreaterThan(v['hard']!);
    expect(v['extreme']).toBeGreaterThan(v['brutal']!);
  });

  it('needs at least two recognised words before it trusts a ladder', () => {
    expect(estimateProfile(gameWith([{ key: 'difficulty', kind: 'choice', default: 'a', choices: choices('a', 'b', 'hard') }]), '0.6.7')).toBeNull();
  });

  it('moves the score from the middle when the options change, and leaves defaults alone', () => {
    const game = gameWith([
      { key: 'death_link', kind: 'toggle', default: false },
      { key: 'hard_mode', kind: 'toggle', default: false },
    ]);
    const profile = estimateProfile(game, '0.6.7')!;
    expect(scoreProfile(profile, game, {}).score).toBe(5);
    expect(scoreProfile(profile, game, { death_link: true, hard_mode: true }).score).toBeCloseTo(6.9, 5);
  });

  it('only ever builds sound profiles', () => {
    const game = gameWith([
      { key: 'death_link', kind: 'toggle', default: false },
      { key: 'trap_chance', kind: 'range', default: 0, min: 0, max: 100 },
      { key: 'difficulty', kind: 'choice', default: 'normal', choices: choices('easy', 'normal', 'hard') },
    ]);
    expect(validateProfile(estimateProfile(game, '0.6.7'), game)).toEqual([]);
  });
});
