// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { rateGame } from '../../difficulty/registry';
import { shippedProfiles } from '../../difficulty/shipped';
import { YamlDocument } from '../../model/document';
import { parseSchemaFile } from '../../schema/load';
import { seededRandom } from '../../roulette/random';
import type { GuideContext } from '../../assistant/guide';
import type { Reply } from '../../assistant/types';
import { validateDocument } from '../../validate/validate';
import { GUIDE_ID, useHelper, type AskHelper } from './helper';

const schema = parseSchemaFile(readFileSync(join(process.cwd(), 'data', 'schema.json'), 'utf8'));
const NAME = 'A Link to the Past';

function context(): GuideContext {
  const doc = YamlDocument.empty(NAME);
  const game = schema.games[NAME]!;
  return { schema, game, doc, issues: validateDocument(doc, schema), rating: rateGame(game, schema.apVersion, {}, shippedProfiles), profiles: shippedProfiles, checks: null, random: seededRandom(1) };
}

const aiReply = (text: string): Reply => ({ text, proposals: [], pointers: [], followUps: [], source: 'claudeCode' });

function setup(ask?: AskHelper, ctx: GuideContext | null = context()) {
  const apply = vi.fn(() => true);
  const point = vi.fn();
  const hook = renderHook(() => useHelper({ context: () => ctx, apply, point, ...(ask === undefined ? {} : { ask }) }));
  return { hook, apply, point };
}

describe('useHelper', () => {
  it('answers with the built-in guide by default', async () => {
    const { hook } = setup();
    await act(async () => hook.result.current.send('turn on swordless'));
    expect(hook.result.current.entries.map((e) => e.role)).toEqual(['user', 'assistant']);
    expect(hook.result.current.entries[1]!.reply?.source).toBe('guide');
    expect(hook.result.current.entries[1]!.reply?.proposals).toHaveLength(1);
  });

  it('asks the chosen AI helper for typed text, and the guide for suggestion buttons', async () => {
    const ask = vi.fn<AskHelper>(async () => aiReply('from the AI'));
    const { hook } = setup(ask);
    act(() => hook.result.current.setHelperId('claudeCode'));
    await act(async () => hook.result.current.send('make my seed spicy'));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0]![0]).toBe('claudeCode');
    expect(hook.result.current.entries[1]!.text).toBe('from the AI');
    await act(async () => hook.result.current.send('What did I change?', true));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(hook.result.current.entries[3]!.reply?.source).toBe('guide');
  });

  it('shows "thinking" while an AI helper works, and not for the guide', async () => {
    let finish: (reply: Reply) => void = () => undefined;
    const ask: AskHelper = () => new Promise((resolve) => (finish = resolve));
    const { hook } = setup(ask);
    act(() => hook.result.current.setHelperId('codex'));
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = hook.result.current.send('something open-ended');
    });
    await waitFor(() => expect(hook.result.current.busy).toBe(true));
    await act(async () => {
      finish(aiReply('done'));
      await pending;
    });
    expect(hook.result.current.busy).toBe(false);
  });

  it('says to open a YAML first when there is nothing open', async () => {
    const { hook } = setup(undefined, null);
    await act(async () => hook.result.current.send('hello'));
    expect(hook.result.current.entries[1]!.text).toContain('Open or start a YAML first');
  });

  it('applies a proposal once, and marks it applied or skipped', async () => {
    const { hook, apply } = setup();
    await act(async () => hook.result.current.send('turn on swordless'));
    const proposal = hook.result.current.entries[1]!.reply!.proposals[0]!;
    act(() => hook.result.current.apply(proposal));
    expect(apply).toHaveBeenCalledWith(proposal.edits);
    expect(hook.result.current.settled.get(proposal.id)).toBe('applied');
    await act(async () => hook.result.current.send('turn on key drop shuffle'));
    const second = hook.result.current.entries[3]!.reply!.proposals[0]!;
    act(() => hook.result.current.skip(second));
    expect(hook.result.current.settled.get(second.id)).toBe('skipped');
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('does not mark a proposal applied when the edit fails, and says so', async () => {
    const apply = vi.fn(() => false);
    const hook = renderHook(() => useHelper({ context: () => context(), apply, point: vi.fn() }));
    await act(async () => hook.result.current.send('turn on swordless'));
    const proposal = hook.result.current.entries[1]!.reply!.proposals[0]!;
    act(() => hook.result.current.apply(proposal));
    expect(hook.result.current.settled.has(proposal.id)).toBe(false);
    expect(hook.result.current.entries[hook.result.current.entries.length - 1]!.text).toContain('Nothing was changed');
  });

  it('clearing forgets the conversation and the choices made', async () => {
    const { hook } = setup();
    await act(async () => hook.result.current.send('help'));
    act(() => hook.result.current.clear());
    expect(hook.result.current.entries).toEqual([]);
    expect(hook.result.current.helperId).toBe(GUIDE_ID);
  });

  it('applies a suggestion only once, even when Apply arrives twice before the screen has updated', async () => {
    const { hook, apply } = setup();
    await act(async () => hook.result.current.send('turn on swordless'));
    const proposal = hook.result.current.entries[1]!.reply!.proposals[0]!;
    act(() => {
      hook.result.current.apply(proposal);
      hook.result.current.apply(proposal); // the second click lands in the same moment
      hook.result.current.skip(proposal);
    });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(hook.result.current.settled.get(proposal.id)).toBe('applied');
  });

  it('lets a suggestion be tried again after a change that could not be made, and again after Clear', async () => {
    const { hook, apply } = setup();
    await act(async () => hook.result.current.send('turn on swordless'));
    const proposal = hook.result.current.entries[1]!.reply!.proposals[0]!;
    apply.mockReturnValueOnce(false);
    act(() => hook.result.current.apply(proposal));
    expect(hook.result.current.settled.has(proposal.id)).toBe(false);
    act(() => hook.result.current.apply(proposal));
    expect(apply).toHaveBeenCalledTimes(2);
    act(() => hook.result.current.clear());
    act(() => hook.result.current.apply(proposal));
    expect(apply).toHaveBeenCalledTimes(3);
  });

  it('asks an AI helper one question at a time: a second one that arrives meanwhile is dropped', async () => {
    let release: (reply: Reply) => void = () => undefined;
    const ask = vi.fn<AskHelper>(() => new Promise<Reply>((resolve) => (release = resolve)));
    const { hook } = setup(ask);
    act(() => hook.result.current.setHelperId('claudeCode'));
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = hook.result.current.send('first question');
      void hook.result.current.send('second question');
    });
    expect(ask).toHaveBeenCalledTimes(1);
    await act(async () => {
      release(aiReply('done'));
      await first;
    });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(hook.result.current.busy).toBe(false);
    await act(async () => {
      const again = hook.result.current.send('third question');
      release(aiReply('again'));
      await again;
    });
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('passes pointers to the app', () => {
    const { hook, point } = setup();
    act(() => hook.result.current.point({ game: NAME, option: 'goal', label: 'Goal' }));
    expect(point).toHaveBeenCalledWith({ game: NAME, option: 'goal', label: 'Goal' });
  });
});
