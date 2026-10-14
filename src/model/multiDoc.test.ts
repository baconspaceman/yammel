import { describe, expect, it } from 'vitest';
import { partFileNames, splitDocuments } from './multiDoc';

const TWO = `# first player
name: Alice
game: APQuest
APQuest:
  hard_mode: true
---
name: Bob
game:
  APQuest: 50
  Other: 50
APQuest: {}
`;

describe('splitDocuments', () => {
  it('is null for an ordinary single-player file, with or without a leading ---', () => {
    expect(splitDocuments('name: A\ngame: X\nX: {}\n')).toBeNull();
    expect(splitDocuments('---\nname: A\ngame: X\nX: {}\n')).toBeNull();
    expect(splitDocuments('')).toBeNull();
  });

  it('splits several players and keeps each one\'s own text and comments', () => {
    const parts = splitDocuments(TWO)!;
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ name: 'Alice', game: 'APQuest' });
    expect(parts[0]!.text).toContain('# first player');
    expect(parts[1]).toMatchObject({ name: 'Bob', game: 'APQuest / Other' });
    expect(parts[1]!.text.startsWith('name: Bob')).toBe(true);
    expect(parts.every((p) => p.text.endsWith('\n') && !p.text.includes('---'))).toBe(true);
  });

  it('works with Windows line endings and a --- with a comment after it', () => {
    const parts = splitDocuments(TWO.replace(/\n/g, '\r\n').replace('---', '--- # second'))!;
    expect(parts.map((p) => p.name)).toEqual(['Alice', 'Bob']);
  });

  it('gives up (null) when any part is not a readable player YAML, so the normal error shows', () => {
    expect(splitDocuments('name: A\n---\na: [unclosed\n')).toBeNull();
    expect(splitDocuments('name: A\n---\n- just\n- a list\n')).toBeNull();
  });
});

describe('partFileNames', () => {
  it('makes safe, distinct file names', () => {
    expect(partFileNames([{ name: 'Alice', game: 'APQuest', text: '' }, { name: 'Alice', game: 'APQuest', text: '' }, { name: '', game: '', text: '' }])).toEqual(['alice-apquest.yaml', 'alice-apquest-2.yaml', 'player-3.yaml']);
    expect(partFileNames([{ name: '../..\\x', game: 'G:ame', text: '' }])[0]).toBe('x-g-ame.yaml');
  });
});
