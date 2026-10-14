import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shippedProfiles } from '../difficulty/shipped';
import { YamlDocument } from '../model/document';
import { planRandomizeAll } from '../randomize/plan';
import { parseSchemaFile } from '../schema/load';
import { seededRandom } from '../roulette/random';
import { closest } from './text';
import { validateDocument } from './validate';
import type { Issue } from './types';

const miniText = readFileSync(new URL('../../tests/fixtures/mini-schema.json', import.meta.url), 'utf8');
const mini = parseSchemaFile(miniText);
const real = parseSchemaFile(readFileSync(new URL('../../data/schema.json', import.meta.url), 'utf8'));

const check = (yaml: string, schema = mini): Issue[] => validateDocument(YamlDocument.parse(yaml), schema);
const codes = (issues: Issue[]) => issues.map((i) => i.code);
const demo = (options: string, head = 'name: P\ngame: Demo Game\n') => `${head}Demo Game:\n${options}`;

/** Apply the first fix of the first issue and return the new text. */
function applyFirstFix(yaml: string, schema = mini): string {
  const doc = YamlDocument.parse(yaml);
  const issue = validateDocument(doc, schema)[0]!;
  doc.applyAll(issue.fixes[0]!.edits);
  return doc.toString();
}

describe('closest', () => {
  it('finds a believable typo and nothing for nonsense', () => {
    expect(closest('hrad', ['easy', 'hard'])).toBe('hard');
    expect(closest('Hard Mode', ['hard_mode', 'lives'])).toBe('hard_mode');
    expect(closest('banana', ['easy', 'hard'])).toBeUndefined();
    expect(closest('x', [])).toBeUndefined();
  });
});

describe('a good YAML', () => {
  it('has no problems, with or without options', () => {
    expect(check(demo('  difficulty: hard\n  lives: 3\n  hard_mode: true\n'))).toEqual([]);
    expect(check('name: P\ngame: Demo Game\nDemo Game: {}\n')).toEqual([]);
    expect(check('name: P\ngame: Demo Game\nDemo Game:\n')).toEqual([]);
  });

  it('accepts every legal spelling Archipelago accepts', () => {
    const good = [
      '  difficulty: HARD\n',
      '  difficulty: difficult\n',
      '  difficulty: random\n',
      '  lives: random\n  hard_mode: random\n',
      '  lives: random-low\n',
      '  lives: random-range-2-8\n',
      '  lives: random-range-low-2-8\n',
      '  lives: high\n',
      '  lives: "5"\n',
      '  hard_mode: yes\n',
      '  hard_mode: "off"\n',
      '  hard_mode:\n    true: 50\n    false: 50\n',
      '  difficulty:\n    easy: 1\n    hard: 3\n',
      '  lives:\n    2: 1\n    9: 1\n',
    ];
    for (const options of good) expect(check(demo(options)), options).toEqual([]);
  });
});

describe('the player name', () => {
  it('is not required: Archipelago uses the file name when there is none', () => {
    expect(check('game: Demo Game\nDemo Game: {}\n')).toEqual([]);
  });

  it('warns that long names are cut at 16 characters, counting placeholders as Archipelago does', () => {
    const issues = check('name: ABCDEFGHIJKLMNOPQRST\ngame: Demo Game\nDemo Game: {}\n');
    expect(codes(issues)).toEqual(['NAME_TOO_LONG']);
    expect(issues[0]!.message).toContain('ABCDEFGHIJKLMNOP');
    expect(check('name: "Player{number}"\ngame: Demo Game\nDemo Game: {}\n')).toEqual([]);
    expect(check('name: "ABCDEFGHIJKLMNO{PLAYER}"\ngame: Demo Game\nDemo Game: {}\n')).toEqual([]);
  });

  it('refuses the reserved name', () => {
    expect(codes(check('name: Archipelago\ngame: Demo Game\nDemo Game: {}\n'))).toEqual(['NAME_RESERVED']);
  });
});

describe('the game line', () => {
  it('names an unknown game with a suggestion', () => {
    const issues = check('name: P\ngame: Demo Gme\nDemo Gme: {}\n');
    expect(codes(issues)).toEqual(['UNKNOWN_GAME']);
    expect(issues[0]!.message).toContain('Did you mean "Demo Game"?');
  });

  it('wants a game line', () => {
    expect(codes(check('name: P\n'))).toEqual(['NO_GAME']);
  });

  it('rejects zero and invalid game weights, and fixes zero ones', () => {
    const zero = 'name: P\ngame:\n  Demo Game: 0\nDemo Game: {}\n';
    expect(codes(check(zero))).toEqual(['GAME_WEIGHTS_ZERO']);
    expect(applyFirstFix(zero)).toContain('Demo Game: Demo Game'.slice(0, 0) + 'game: Demo Game');
    expect(codes(check('name: P\ngame:\n  Demo Game: lots\nDemo Game: {}\n'))).toEqual(['BAD_GAME_WEIGHT']);
  });

  it('can drop an unknown game from a mix', () => {
    const text = 'name: P\ngame:\n  Demo Game: 50\n  Nope: 50\nDemo Game: {}\nNope: {}\n';
    const doc = YamlDocument.parse(text);
    const issue = validateDocument(doc, mini).find((i) => i.code === 'UNKNOWN_GAME')!;
    doc.applyAll(issue.fixes[0]!.edits);
    expect(doc.games()).toEqual(['Demo Game']);
    expect(doc.toString()).not.toContain('Nope');
  });

  it('warns when the file asks for a newer Archipelago', () => {
    expect(codes(check('name: P\ngame: Demo Game\nrequires:\n  version: 9.0.0\nDemo Game: {}\n'))).toEqual(['NEEDS_NEWER_VERSION']);
    expect(check('name: P\ngame: Demo Game\nrequires:\n  version: 0.5.0\nDemo Game: {}\n')).toEqual([]);
  });

  it('checks each game of a mix', () => {
    const text = 'name: P\ngame:\n  Demo Game: 1\nDemo Game:\n  lives: 99\n';
    expect(codes(check(text))).toEqual(['BAD_VALUE']);
  });
});

describe('options', () => {
  it('flags an unknown option and offers a rename that keeps the value', () => {
    const text = demo('  hardmode: true\n');
    const issues = check(text);
    expect(codes(issues)).toEqual(['UNKNOWN_OPTION']);
    expect(issues[0]!.severity).toBe('warning');
    const fixed = applyFirstFix(text);
    expect(fixed).toContain('hard_mode: true');
    expect(fixed).not.toContain('hardmode');
  });

  it('flags a block that is not a map', () => {
    expect(codes(check('name: P\ngame: Demo Game\nDemo Game: 5\n'))).toEqual(['BLOCK_NOT_MAP']);
  });

  describe('switches', () => {
    it('rejects words that are not on or off, with a suggestion for a typo', () => {
      const text = demo('  hard_mode: ture\n');
      expect(codes(check(text))).toEqual(['BAD_VALUE']);
      expect(applyFirstFix(text)).toContain('hard_mode: true');
    });

    it('rejects capital Random, which Archipelago refuses for switches', () => {
      const issues = check(demo('  hard_mode: Random\n'));
      expect(issues[0]!.message).toContain('lowercase');
      expect(applyFirstFix(demo('  hard_mode: Random\n'))).toContain('hard_mode: random');
    });

    it('rejects numbers other than 0 and 1', () => {
      expect(codes(check(demo('  hard_mode: 7\n')))).toEqual(['BAD_VALUE']);
    });
  });

  describe('choices', () => {
    it('rejects an unknown choice and suggests the nearest', () => {
      const text = demo('  difficulty: hrad\n');
      expect(codes(check(text))).toEqual(['BAD_VALUE']);
      expect(applyFirstFix(text)).toContain('difficulty: hard');
    });

    it('lists the choices when nothing is close', () => {
      const issues = check(demo('  difficulty: zzzzzz\n'));
      expect(issues[0]!.message).toContain('easy, hard');
      expect(issues[0]!.fixes.map((f) => f.label)).toEqual(['Go back to the default']);
    });
  });

  describe('numbers', () => {
    it('keeps numbers inside the allowed range and offers the nearest allowed value', () => {
      expect(applyFirstFix(demo('  lives: 99\n'))).toContain('lives: 10');
      expect(applyFirstFix(demo('  lives: 0\n'))).toContain('lives: 1');
    });

    it('wants whole numbers', () => {
      const issues = check(demo('  lives: 2.5\n'));
      expect(issues[0]!.message).toContain('whole number');
    });

    it('reads number words and rejects other words', () => {
      expect(codes(check(demo('  lives: lots\n')))).toEqual(['BAD_VALUE']);
      expect(codes(check(demo('  lives: true\n')))).toEqual(['BAD_VALUE']);
    });

    it('explains that a random range cannot hold a minus sign', () => {
      const issues = check(demo('  lives: random-range--5-5\n'));
      expect(issues[0]!.message).toContain('minus sign');
    });

    it('always accepts the number behind a name of a named range, even below its minimum (Stardew Valley quest_locations: none)', () => {
      const yaml = 'name: P\ngame: Stardew Valley\nStardew Valley:\n  quest_locations: -1\n  starting_money: -1\n';
      expect(check(yaml, real)).toEqual([]);
      expect(codes(check('name: P\ngame: Stardew Valley\nStardew Valley:\n  quest_locations: -2\n', real))).toEqual(['BAD_VALUE']);
    });

    it('checks random forms against the range', () => {
      expect(codes(check(demo('  lives: random-range-1-99\n')))).toEqual(['BAD_VALUE']);
      expect(applyFirstFix(demo('  lives: random-range-1-99\n'))).toContain('lives: random-range-1-10');
      expect(codes(check(demo('  lives: random-sideways\n')))).toEqual(['BAD_VALUE']);
    });
  });

  describe('weighted values', () => {
    it('needs at least one weight above zero, and numeric weights', () => {
      expect(codes(check(demo('  difficulty:\n    easy: 0\n    hard: 0\n')))).toEqual(['ALL_WEIGHTS_ZERO']);
      expect(codes(check(demo('  difficulty:\n    easy: lots\n    hard: 1\n')))).toEqual(['BAD_WEIGHT']);
      expect(codes(check(demo('  difficulty:\n    easy: -1\n    hard: 1\n')))).toEqual(['BAD_WEIGHT']);
      expect(codes(check(demo('  difficulty: {}\n')))).toEqual(['EMPTY_WEIGHTS']);
    });

    it('checks the values being weighted and offers to fix or remove one', () => {
      const text = demo('  difficulty:\n    easy: 1\n    hrad: 1\n');
      const issues = check(text);
      expect(codes(issues)).toEqual(['BAD_WEIGHTED_VALUE']);
      const doc = YamlDocument.parse(text);
      doc.applyAll(issues[0]!.fixes[0]!.edits);
      expect(doc.get('Demo Game', 'difficulty')).toEqual({ easy: 1, hard: 1 });
      const doc2 = YamlDocument.parse(text);
      doc2.applyAll(issues[0]!.fixes[1]!.edits);
      expect(doc2.get('Demo Game', 'difficulty')).toEqual({ easy: 1 });
    });

    it('accepts a list (Archipelago picks one entry at random) when every entry is good, and flags a bad entry', () => {
      expect(check(demo('  lives: [1, 2]\n'))).toEqual([]);
      expect(codes(check(demo('  lives: [1, 99]\n')))).toEqual(['BAD_LIST_VALUE']);
      expect(codes(check(demo('  lives: []\n')))).toEqual(['EMPTY_LIST']);
    });
  });

  it('gives each problem a stable id and distinct ones for repeats', () => {
    const issues = check(demo('  lives: 99\n  hard_mode: ture\n'));
    expect(new Set(issues.map((i) => i.id)).size).toBe(issues.length);
    expect(check(demo('  lives: 99\n  hard_mode: ture\n')).map((i) => i.id)).toEqual(issues.map((i) => i.id));
  });

  it('says nothing when the file cannot be read at all', () => {
    expect(validateDocument(YamlDocument.parse('name: [unclosed\n'), mini)).toEqual([]);
  });
});

describe('item and location lists (real data)', () => {
  const withNames = Object.values(real.games).find((g) => !g.hidden && Object.values(g.options).some((o) => o.domain === 'items' && o.kind === 'set'))!;
  const option = Object.values(withNames.options).find((o) => o.domain === 'items' && o.kind === 'set')!;
  const valid = withNames.items[0]!;

  it('accepts real names and rejects made-up ones, offering the closest real name', () => {
    const yaml = (names: string[]) => `name: P\ngame: ${withNames.name}\n${withNames.name}:\n  ${option.key}: ${JSON.stringify(names)}\n`;
    expect(check(yaml([valid]), real)).toEqual([]);
    const issues = check(yaml([valid, valid.slice(0, -1) + 'x']), real);
    expect(codes(issues)).toEqual(['UNKNOWN_NAME']);
    const doc = YamlDocument.parse(yaml([valid, 'Totally Made Up Thing']));
    const bad = validateDocument(doc, real)[0]!;
    doc.applyAll(bad.fixes[bad.fixes.length - 1]!.edits); // "Remove it"
    expect(validateDocument(doc, real)).toEqual([]);
  });

  it('only a capital difference is a warning', () => {
    const yaml = `name: P\ngame: ${withNames.name}\n${withNames.name}:\n  ${option.key}: ${JSON.stringify([valid.toUpperCase() === valid ? valid.toLowerCase() : valid.toUpperCase()])}\n`;
    const issues = check(yaml, real);
    expect(issues[0]!.severity).toBe('warning');
  });
});

describe('against all 80 real games', () => {
  const games = Object.values(real.games).filter((g) => !g.hidden);

  it('finds nothing wrong with an empty YAML of any game', () => {
    for (const game of games) expect(check(`name: P\ngame: ${JSON.stringify(game.name)}\n${JSON.stringify(game.name)}: {}\n`, real), game.name).toEqual([]);
  });

  it('finds nothing wrong with what Randomize writes, for every game and several seeds', () => {
    const problems: string[] = [];
    for (const game of games) {
      for (const seed of [1, 2, 3]) {
        const doc = YamlDocument.empty(game.name);
        const plan = planRandomizeAll({ game, apVersion: real.apVersion, profiles: shippedProfiles, current: {}, locked: new Set(), random: seededRandom(seed), band: null });
        if (!plan.ok) continue;
        doc.applyAll(plan.edits);
        for (const issue of validateDocument(doc, real)) problems.push(`${game.name} seed ${seed}: ${issue.code} ${issue.option} ${issue.message}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every default value in the data is accepted when written out explicitly', () => {
    const problems: string[] = [];
    for (const game of games) {
      for (const option of Object.values(game.options)) {
        if (!['toggle', 'choice', 'range', 'named_range'].includes(option.kind) || option.default === undefined || option.default === null) continue;
        const doc = YamlDocument.empty(game.name);
        doc.apply({ op: 'set', game: game.name, option: option.key, value: option.default });
        for (const issue of validateDocument(doc, real)) problems.push(`${game.name}.${option.key}=${JSON.stringify(option.default)}: ${issue.message}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
