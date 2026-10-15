// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WelcomeCard } from './WelcomeCard';

afterEach(cleanup);

describe('WelcomeCard', () => {
  it('is a labelled dialog with the four steps and says everything else is optional', () => {
    render(<WelcomeCard onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Welcome to Yammel' });
    expect(dialog).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText(/optional/)).toBeTruthy();
  });

  it('puts focus on the close button', () => {
    render(<WelcomeCard onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Got it' }));
  });

  it('closes with the button, with Esc, and by clicking outside', async () => {
    const onClose = vi.fn();
    const { container } = render(<WelcomeCard onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
    await userEvent.click(container.querySelector('.welcome__backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('keeps Tab inside the card', async () => {
    render(<WelcomeCard onClose={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Got it' });
    await userEvent.tab();
    expect(document.activeElement).toBe(button);
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(button);
  });
});
