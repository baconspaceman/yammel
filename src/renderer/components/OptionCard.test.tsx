// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OptionSchema } from '../../schema/types';
import { OptionCard } from './OptionCard';

const textOption: OptionSchema = {
  key: 'motto',
  kind: 'free_text',
  displayName: 'Motto',
  description: '',
  default: 'hello',
  visibility: ['simple_ui'],
  supportsWeighting: false,
};

describe('OptionCard', () => {
  it('puts the real value back in the control when an edit is refused', async () => {
    const onEdit = vi.fn(() => false);
    render(<OptionCard game="G" option={textOption} raw={undefined} rawJson="" onEdit={onEdit} locked={false} onToggleLock={() => undefined} />);
    const box = screen.getByRole('textbox', { name: 'Motto' }) as HTMLInputElement;
    await userEvent.clear(box);
    await userEvent.type(box, 'changed{Enter}');
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('textbox', { name: 'Motto' }) as HTMLInputElement).value).toBe('hello');
  });

  it('keeps what the user typed when the edit is accepted', async () => {
    const onEdit = vi.fn(() => true);
    render(<OptionCard game="G" option={textOption} raw={undefined} rawJson="" onEdit={onEdit} locked={false} onToggleLock={() => undefined} />);
    const box = screen.getByRole('textbox', { name: 'Motto' }) as HTMLInputElement;
    await userEvent.clear(box);
    await userEvent.type(box, 'changed{Enter}');
    expect(box.value).toBe('changed');
  });
});
