// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SchemaFile } from '../../schema/types';
import { StartScreen } from './StartScreen';

const schema: SchemaFile = { apVersion: 'test', extractedAt: '', games: {}, errors: [] };

afterEach(cleanup);

describe('StartScreen roulette button', () => {
  it('is absent without onRoulette', () => {
    render(<StartScreen schema={schema} onStart={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Game roulette' })).toBeNull();
  });

  it('appears with onRoulette and calls it', async () => {
    const onRoulette = vi.fn();
    render(<StartScreen schema={schema} onStart={vi.fn()} onOpen={vi.fn()} onRoulette={onRoulette} />);
    await userEvent.click(screen.getByRole('button', { name: 'Game roulette' }));
    expect(onRoulette).toHaveBeenCalledTimes(1);
  });
});
