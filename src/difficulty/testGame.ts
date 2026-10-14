import type { GameSchema, OptionSchema } from '../schema/types';
import { PROFILE_FORMAT, type DifficultyProfile } from './types';

function option(partial: Partial<OptionSchema> & Pick<OptionSchema, 'key' | 'kind' | 'default'>): OptionSchema {
  return {
    displayName: partial.key,
    description: '',
    visibility: ['simple_ui'],
    supportsWeighting: true,
    ...partial,
  };
}

/** A small made-up game that has one option of every kind a difficulty profile can talk about. */
export const TEST_GAME: GameSchema = {
  name: 'Test Game',
  hidden: false,
  groups: [],
  presets: {},
  items: [],
  locations: [],
  itemGroups: [],
  locationGroups: [],
  options: {
    death_link: option({ key: 'death_link', kind: 'toggle', default: false, displayName: 'Death Link' }),
    mode: option({
      key: 'mode',
      kind: 'choice',
      default: 'normal',
      displayName: 'Mode',
      choices: [
        { key: 'easy', label: 'Easy' },
        { key: 'normal', label: 'Normal' },
        { key: 'hard', label: 'Hard' },
        { key: 'off', label: 'Off' },
      ],
      aliases: { simple: 'easy' },
    }),
    lives: option({ key: 'lives', kind: 'range', default: 5, min: 1, max: 9, displayName: 'Lives' }),
    balancing: option({
      key: 'balancing',
      kind: 'named_range',
      default: 50,
      min: 0,
      max: 100,
      specialNames: { disabled: 0, extreme: 99 },
      displayName: 'Balancing',
    }),
    notes: option({ key: 'notes', kind: 'free_text', default: '' }),
  },
};

export const TEST_PROFILE: DifficultyProfile = {
  format: PROFILE_FORMAT,
  game: 'Test Game',
  apVersion: '0.6.7',
  status: 'drafted',
  base: 4,
  options: {
    death_link: { why: 'One death costs everyone.', values: { true: 1 } },
    mode: { values: { easy: -1, normal: 0, hard: 2, off: 0 } },
    lives: {
      curve: [
        [1, 3],
        [5, 0],
        [9, -1],
      ],
    },
    balancing: { values: { extreme: 1.5 }, curve: [[0, 1], [50, 0], [100, -1]] },
  },
};
