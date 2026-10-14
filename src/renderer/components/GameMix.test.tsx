// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { YamlDocument } from '../../model/document';
import { gameWeights, GameMix } from './GameMix';

const ALL = ['Alpha', 'Beta', 'Gamma'];

describe('gameWeights', () => {
  it('reads one game as a lone game and a map as weights, fixing nothing', () => {
    expect(gameWeights(YamlDocument.parse('game: Alpha\n'))).toEqual({ Alpha: 50 });
    expect(gameWeights(YamlDocument.parse('game:\n  Alpha: 30\n  Beta: 70\n'))).toEqual({ Alpha: 30, Beta: 70 });
    expect(gameWeights(YamlDocument.parse('game:\n  Alpha: lots\n'))).toEqual({ Alpha: 0 });
  });
});

describe('GameMix', () => {
  it('offers to mix when there is only one game, and then offers a second one', async () => {
    const onEdit = vi.fn(() => true);
    render(<GameMix doc={YamlDocument.parse('name: P\ngame: Alpha\nAlpha: {}\n')} allGames={ALL} onEdit={onEdit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mix with another game' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Add a game' }), 'Beta');
    expect(onEdit).toHaveBeenCalledWith([{ op: 'setGameWeights', weights: { Alpha: 50, Beta: 50 } }]);
  });

  it('shows each game with its weight and chance, and does not offer a game twice', () => {
    render(<GameMix doc={YamlDocument.parse('name: P\ngame:\n  Alpha: 1\n  Beta: 3\nAlpha: {}\nBeta: {}\n')} allGames={ALL} onEdit={vi.fn()} />);
    expect(screen.getByLabelText('25 percent')).toBeTruthy();
    expect(screen.getByLabelText('75 percent')).toBeTruthy();
    const options = screen.getByRole('combobox', { name: 'Add a game' }).querySelectorAll('option');
    expect([...options].map((o) => o.textContent)).toEqual(['Add a game…', 'Gamma']);
  });

  it('changes a weight, and removes a game together with its options', async () => {
    const onEdit = vi.fn(() => true);
    render(<GameMix doc={YamlDocument.parse('name: P\ngame:\n  Alpha: 50\n  Beta: 50\n')} allGames={ALL} onEdit={onEdit} />);
    const box = screen.getByRole('textbox', { name: 'Weight of Alpha' });
    await userEvent.clear(box);
    await userEvent.type(box, '10{Enter}');
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'setGameWeights', weights: { Alpha: 10, Beta: 50 } }]);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Beta' }));
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'setGameWeights', weights: { Alpha: 50 } }, { op: 'removeGame', game: 'Beta' }]);
  });

  it('will not remove the only game with a weight above zero', async () => {
    const onEdit = vi.fn(() => true);
    render(<GameMix doc={YamlDocument.parse('name: P\ngame:\n  Alpha: 0\n  Beta: 50\n')} allGames={ALL} onEdit={onEdit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Alpha' }));
    expect(onEdit).toHaveBeenCalledTimes(1); // removing Alpha leaves Beta, which is fine
    onEdit.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Beta' }));
    expect(onEdit).not.toHaveBeenCalled(); // that would leave only a game with weight 0
  });

  it('cannot remove the last game', () => {
    render(<GameMix doc={YamlDocument.parse('name: P\ngame:\n  Alpha: 50\n  Beta: 50\n')} allGames={ALL} onEdit={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Remove Alpha' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
