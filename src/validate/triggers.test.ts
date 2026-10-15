import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { YamlDocument } from '../model/document';
import { parseSchemaFile } from '../schema/load';
import { validateDocument } from './validate';
import type { Issue } from './types';

const real = parseSchemaFile(readFileSync(new URL('../../data/schema.json', import.meta.url), 'utf8'));
const G = 'A Link to the Past';

const yamlWith = (block: string, extra = '') => `name: P\ngame: ${G}\n${G}:\n${block}${extra}`;
const check = (text: string): Issue[] => validateDocument(YamlDocument.parse(text), real);
const triggerCodes = (text: string) => check(text).filter((issue) => issue.code.startsWith('TRIGGER')).map((issue) => issue.code);
const trigger = (lines: string) => `  triggers:\n${lines}`;

const GOOD = trigger(`    - option_category: ${G}
      option_name: goal
      option_result: ganon
      options:
        ${G}:
          swordless: true
`);

function fixed(text: string, code: string): string {
  const doc = YamlDocument.parse(text);
  const issue = validateDocument(doc, real).find((i) => i.code === code)!;
  expect(issue, code).toBeDefined();
  expect(issue.fixes.length, `${code} has a fix`).toBeGreaterThan(0);
  doc.applyAll(issue.fixes[0]!.edits);
  return doc.toString();
}

describe('a good trigger', () => {
  it('has no problems', () => {
    expect(triggerCodes(yamlWith('  goal: ganon\n' + GOOD))).toEqual([]);
  });

  it('can use a chance, a merge and a weighted watched option', () => {
    const text = yamlWith(
      '  goal:\n    ganon: 50\n    crystals: 50\n' +
        trigger(`    - option_category: ${G}
      option_name: goal
      option_result: crystals
      percentage: 25
      options:
        ${G}:
          +start_inventory:
            - Bow
`),
    );
    expect(triggerCodes(text)).toEqual([]);
  });

  it('can fire on a value that another trigger sets', () => {
    const text = yamlWith(
      '  goal: ganon\n  mode: open\n' +
        trigger(`    - option_category: ${G}
      option_name: goal
      option_result: ganon
      options:
        ${G}:
          mode: inverted
    - option_category: ${G}
      option_name: mode
      option_result: inverted
      options:
        ${G}:
          swordless: true
`),
    );
    expect(triggerCodes(text)).toEqual([]);
  });
});

describe('what Archipelago really stops on', () => {
  it('triggers that are not a list', () => {
    expect(triggerCodes(yamlWith('  triggers:\n    a: 1\n'))).toEqual(['TRIGGERS_NOT_LIST']);
  });

  it('a trigger that is not a block', () => {
    expect(triggerCodes(yamlWith('  triggers:\n    - just text\n'))).toEqual(['TRIGGER_NOT_MAP']);
  });

  it('a trigger with no option_name or no options', () => {
    const noName = yamlWith(`  goal: ganon\n${trigger(`    - option_category: ${G}\n      option_result: ganon\n      options:\n        ${G}:\n          swordless: true\n`)}`);
    expect(triggerCodes(noName)).toContain('TRIGGER_MISSING');
    const noOptions = yamlWith(`  goal: ganon\n${trigger(`    - option_category: ${G}\n      option_name: goal\n      option_result: ganon\n`)}`);
    expect(triggerCodes(noOptions)).toContain('TRIGGER_MISSING');
  });

  it('a category that is not a section of the file, with a fix to the closest one', () => {
    const text = yamlWith('  goal: ganon\n' + GOOD.replace(`option_category: ${G}`, 'option_category: A Link to the Pas'));
    expect(triggerCodes(text)).toContain('TRIGGER_BAD_CATEGORY');
    expect(fixed(text, 'TRIGGER_BAD_CATEGORY')).toContain(`option_category: ${G}`);
  });

  it('a watched option that the game block does not write, with a fix that writes it', () => {
    const text = yamlWith(GOOD);
    expect(triggerCodes(text)).toContain('TRIGGER_WATCHED_NOT_SET');
    const after = fixed(text, 'TRIGGER_WATCHED_NOT_SET');
    expect(after).toMatch(/goal: /);
    expect(triggerCodes(after)).not.toContain('TRIGGER_WATCHED_NOT_SET');
  });

  it('a percentage that is not a number', () => {
    const text = yamlWith('  goal: ganon\n' + GOOD.replace('      options:', '      percentage: often\n      options:'));
    expect(triggerCodes(text)).toContain('TRIGGER_PERCENT');
    expect(fixed(text, 'TRIGGER_PERCENT')).toContain('percentage: 100');
  });

  it('options that are not blocks of changes, and changes for a section that is missing', () => {
    const shape = yamlWith(`  goal: ganon\n${trigger(`    - option_category: ${G}\n      option_name: goal\n      option_result: ganon\n      options: swordless\n`)}`);
    expect(triggerCodes(shape)).toContain('TRIGGER_OPTIONS_SHAPE');
    const missing = yamlWith('  goal: ganon\n' + GOOD.replace(`        ${G}:\n`, '        Nowhere:\n'));
    expect(triggerCodes(missing)).toContain('TRIGGER_CHANGE_BAD_CATEGORY');
  });

  it('+ or - on an option that is a single value', () => {
    const text = yamlWith('  goal: ganon\n  mode: open\n' + GOOD.replace('swordless: true', '+mode: [inverted]'));
    expect(triggerCodes(text)).toContain('TRIGGER_MERGE_KIND');
  });

  it('a new value that is not allowed for the option', () => {
    const text = yamlWith('  goal: ganon\n' + GOOD.replace('swordless: true', 'mode: sideways'));
    const codes = triggerCodes(text);
    expect(codes).toContain('TRIGGER_BAD_VALUE');
  });
});

describe('what Archipelago lets through but that never works', () => {
  it('no option_category in a game block: it looks in the wrong place, and says so', () => {
    const text = yamlWith('  goal: ganon\n' + GOOD.replace(`    - option_category: ${G}\n      option_name`, '    - option_name').replace('      option_name: goal', '      option_name: goal'));
    expect(triggerCodes(text)).toContain('TRIGGER_NO_CATEGORY');
    expect(fixed(text, 'TRIGGER_NO_CATEGORY')).toContain(`option_category: ${G}`);
  });

  it('a watched option that does not exist', () => {
    const text = yamlWith('  goal: ganon\n' + GOOD.replace('option_name: goal', 'option_name: gaol'));
    expect(triggerCodes(text)).toContain('TRIGGER_UNKNOWN_OPTION');
    expect(fixed(text, 'TRIGGER_UNKNOWN_OPTION')).toContain('option_name: goal');
  });

  it('a result that the watched option never has', () => {
    const text = yamlWith('  goal: ganon\n' + GOOD.replace('option_result: ganon', 'option_result: crystals'));
    expect(triggerCodes(text)).toContain('TRIGGER_NEVER_FIRES');
    expect(fixed(text, 'TRIGGER_NEVER_FIRES')).toContain('option_result: ganon');
  });

  it('a switch value and the text of it do not match', () => {
    const text = yamlWith(
      '  swordless: true\n' +
        trigger(`    - option_category: ${G}
      option_name: swordless
      option_result: "true"
      options:
        ${G}:
          goal: crystals
`),
    );
    const issue = check(text).find((i) => i.code === 'TRIGGER_NEVER_FIRES')!;
    expect(issue.message).toMatch(/exactly/);
  });

  it('capitals that differ', () => {
    const text = yamlWith('  goal: ganon\n' + GOOD.replace('option_result: ganon', 'option_result: Ganon'));
    const issue = check(text).find((i) => i.code === 'TRIGGER_NEVER_FIRES')!;
    expect(issue.message).toMatch(/capitals/);
  });

  it('a change to an option the game does not have', () => {
    const text = yamlWith('  goal: ganon\n' + GOOD.replace('swordless: true', 'swordles: true'));
    expect(triggerCodes(text)).toContain('TRIGGER_CHANGE_UNKNOWN_OPTION');
  });

  it('a chance outside 0 to 100', () => {
    const text = yamlWith('  goal: ganon\n' + GOOD.replace('      options:', '      percentage: 150\n      options:'));
    expect(triggerCodes(text)).toContain('TRIGGER_PERCENT_RANGE');
    expect(fixed(text, 'TRIGGER_PERCENT_RANGE')).toContain('percentage: 100');
  });
});

describe('what is left alone', () => {
  it('a watched option that is random, so any result could happen', () => {
    const text = yamlWith('  goal: random\n' + GOOD.replace('option_result: ganon', 'option_result: crystals'));
    expect(triggerCodes(text)).toEqual([]);
  });

  it('triggers at the top of the file are checked too, without fixes', () => {
    const text = `name: P\ngame: ${G}\n${G}:\n  goal: ganon\ntriggers:\n  - option_category: Nowhere\n    option_name: goal\n    option_result: ganon\n    options: {}\n`;
    const issue = check(text).find((i) => i.code === 'TRIGGER_BAD_CATEGORY');
    expect(issue).toBeDefined();
    expect(issue!.fixes).toEqual([]);
  });

  it('every game in the real data survives a trigger with an empty options block', () => {
    for (const game of Object.values(real.games)) {
      const text = `name: P\ngame: ${game.name}\n${game.name}:\n  triggers:\n    - option_category: ${game.name}\n      option_name: ${Object.keys(game.options)[0] ?? 'x'}\n      option_result: 1\n      options: {}\n`;
      expect(() => check(text), game.name).not.toThrow();
    }
  });
});
