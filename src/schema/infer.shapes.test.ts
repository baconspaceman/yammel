import { describe, expect, it } from 'vitest';
import { YamlDocument } from '../model/document';
import { validateDocument } from '../validate/validate';
import { inferGameSchema } from './infer';
import type { SchemaFile } from './types';

// Shapes found in real Archipelago templates of custom worlds (October 2026 sweep of 290 templates).
const TEMPLATE = `name: Player{number}
game: Shapes

Shapes:
  trap_weights:
    # Specifies the weights at which traps become each trap type
    Burn Trap: 0
    Ice Trap: 0
  filler_weights:
    # How often each filler appears.
    Small Coin: 5
    Big Coin: 1
  minikit_bundle_size:
    # Minikits are bundled into items worth this many.
    individual: 0
    '2': 0
    '5': 50
    '10': 0
  gil_rewards:
    # Sets the amount of gil.
    #
    # You can define additional values between the minimum and maximum values.
    # Minimum value is 0
    # Maximum value is 51000
    1000: 50
    random: 0
    random-range-0-51000: 0 # random value between 0 and 51000
    individually-randomized: 0 # equivalent to individually-randomized
  set_count:
    # Leave this at 0 for a freeform layout.
    #
    # You can define additional values between the minimum and maximum values.
    # Minimum value is 3
    # Maximum value is 28
    0: 50
    random: 0
    random-range-3-28: 0 # random value between 3 and 28
  clock_time:
    # Minimum value is -60
    # Maximum value is 60
    4: 50
    random: 0
    random-range--60-60: 0 # random value between -60 and 60
`;

const doc = YamlDocument.parse(TEMPLATE);
const game = inferGameSchema('Shapes', doc.templateInfo('Shapes'));

describe('inferring the shapes real templates use', () => {
  it('reads a map of item names to counts as counts, not as weighted choices', () => {
    expect(game.options['trap_weights']!.kind).toBe('counter'); // every number is 0
    expect(game.options['filler_weights']!.kind).toBe('counter'); // names with spaces
  });

  it('reads number-like names without range lines as choices', () => {
    const o = game.options['minikit_bundle_size']!;
    expect(o.kind).toBe('choice');
    expect(o.choices!.map((c) => c.key)).toEqual(['individual', '2', '5', '10']);
  });

  it('keeps a word whose number the template does not give as an accepted word', () => {
    const o = game.options['gil_rewards']!;
    expect(o.kind).toBe('named_range');
    expect(o.extraWords).toEqual(['individually-randomized']);
    expect([o.min, o.max, o.default]).toEqual([0, 51000, 1000]);
  });

  it("allows the world's own default even when it lies outside the stated range", () => {
    const o = game.options['set_count']!;
    expect(o.default).toBe(0);
    expect(o.min).toBe(0);
  });

  it('finds no problem in the template itself', () => {
    const schema: SchemaFile = { apVersion: '0.6.8', extractedAt: '', games: { Shapes: game }, errors: [] };
    expect(validateDocument(doc, schema)).toEqual([]);
  });
});
