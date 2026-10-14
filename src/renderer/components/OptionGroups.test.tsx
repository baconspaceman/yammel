// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { YamlDocument } from '../../model/document';
import type { OptionGroupView } from '../state/options';
import { groupId, OptionGroups } from './OptionGroups';

describe('groupId', () => {
  it('differs for names that only differ in punctuation, because it includes the index', () => {
    const names = ['Items & Locations', 'Items / Locations', 'Items - Locations'];
    const ids = names.map((name, index) => groupId(name, index));
    expect(new Set(ids).size).toBe(names.length);
  });
  it('differs for the same name at different positions and is a usable element id', () => {
    expect(groupId('Same', 0)).not.toBe(groupId('Same', 1));
    expect(groupId('Game Options!', 2)).toMatch(/^group-[a-z0-9-]+$/);
  });
});

describe('OptionGroups', () => {
  const groups: OptionGroupView[] = [
    { name: 'Open one', collapsed: false, options: [] },
    { name: 'Closed one', collapsed: true, options: [] },
  ];
  const doc = YamlDocument.empty('G');

  it('only points aria-controls at a body that exists', () => {
    render(
      <OptionGroups
        game="G"
        doc={doc}
        groups={groups}
        isOpen={(name) => name === 'Open one'}
        onToggle={() => undefined}
        onEdit={() => true}
        locked={new Set()}
        onToggleLock={() => undefined}
      />,
    );
    const open = screen.getByRole('button', { name: /Open one/ });
    const closed = screen.getByRole('button', { name: /Closed one/ });
    expect(open.getAttribute('aria-controls')).not.toBeNull();
    expect(document.getElementById(open.getAttribute('aria-controls')!)).not.toBeNull();
    expect(closed.hasAttribute('aria-controls')).toBe(false);
  });
});
