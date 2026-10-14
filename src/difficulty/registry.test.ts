import { describe, expect, it } from 'vitest';
import { indexProfiles, rateGame } from './registry';
import { TEST_GAME, TEST_PROFILE } from './testGame';
import type { GameSchema } from '../schema/types';

const profiles = indexProfiles([TEST_PROFILE]);

describe('indexProfiles', () => {
  it('indexes profiles by game and skips things that are not profiles', () => {
    const index = indexProfiles([TEST_PROFILE, null, 3, 'x', {}, { game: '' }]);
    expect([...index.keys()]).toEqual(['Test Game']);
  });
});

describe('rateGame', () => {
  it('rates a game that has a profile, with the label and the draft note', () => {
    const rating = rateGame(TEST_GAME, '0.6.7', { mode: 'hard' }, profiles);
    expect(rating.source).toBe('rated');
    expect(rating.status).toBe('drafted');
    expect(rating.score).toBe(6);
    expect(rating.label).toBe('Hard');
    expect(rating.contributions[0]?.key).toBe('mode');
    expect(rating.note).toMatch(/draft rating/);
  });

  it('says so when a player has checked the profile', () => {
    const reviewed = indexProfiles([{ ...TEST_PROFILE, status: 'reviewed' }]);
    expect(rateGame(TEST_GAME, '0.6.7', {}, reviewed).note).toMatch(/checked by someone who plays this game/);
  });

  it('warns when the profile was written for another Archipelago version', () => {
    expect(rateGame(TEST_GAME, '0.7.0', {}, profiles).note).toMatch(/written for Archipelago 0\.6\.7; the options here are from 0\.7\.0/);
    expect(rateGame(TEST_GAME, '0.6.7', {}, profiles).note).not.toMatch(/written for Archipelago/);
  });

  it('estimates a game without a profile when its options give something to go on', () => {
    const game: GameSchema = {
      ...TEST_GAME,
      name: 'Other Game',
      options: {
        death_link: { ...TEST_GAME.options['death_link']! },
        hard_mode: { ...TEST_GAME.options['death_link']!, key: 'hard_mode', displayName: 'Hard Mode' },
      },
    };
    const calm = rateGame(game, '0.6.7', {}, profiles);
    expect(calm.source).toBe('estimated');
    expect(calm.status).toBe('estimated');
    expect(calm.score).toBe(5);
    expect(calm.label).toBe('Moderate');
    expect(calm.note).toMatch(/Estimated from option names only/);
    expect(rateGame(game, '0.6.7', { death_link: true }, profiles).score).toBe(5.4);
    expect(rateGame(game, '0.6.7', { hard_mode: true }, profiles).score).toBe(6.5);
  });

  it('does not estimate a game whose only hints are death link and accessibility', () => {
    const game: GameSchema = { ...TEST_GAME, name: 'Generic Game', options: { death_link: TEST_GAME.options['death_link']! } };
    expect(rateGame(game, '0.6.7', { death_link: true }, profiles).source).toBe('none');
  });

  it('gives no rating when nothing looks difficulty-related, and never a made-up number', () => {
    const game: GameSchema = { ...TEST_GAME, name: 'Plain Game', options: { notes: TEST_GAME.options['notes']! } };
    const rating = rateGame(game, '0.6.7', {}, profiles);
    expect(rating).toMatchObject({ source: 'none', status: null, score: null, label: null, contributions: [], approximated: [] });
    expect(rating.note).toMatch(/nobody has written a rating/);
  });

  it('never shows NaN: a profile with a broken base is treated as no rating', () => {
    const broken = indexProfiles([{ ...TEST_PROFILE, base: 'x' }]);
    const rating = rateGame(TEST_GAME, '0.6.7', {}, broken);
    expect(rating).toMatchObject({ source: 'none', score: null, label: null });
  });

  it('passes on which options were counted as averages', () => {
    expect(rateGame(TEST_GAME, '0.6.7', { mode: 'random' }, profiles).approximated).toEqual(['Mode']);
  });
});
