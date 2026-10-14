import { describe, expect, it } from 'vitest';
import { addRecent, describeRecent, MAX_RECENT, parseRecent, removeRecent } from './recent';

describe('recent files', () => {
  it('reads a damaged file as an empty list and drops bad entries', () => {
    expect(parseRecent(undefined)).toEqual({ files: [] });
    expect(parseRecent({ files: 'x' })).toEqual({ files: [] });
    const state = parseRecent({ files: [{ path: 'C:\\a.yaml', at: 't' }, { path: '' }, 5, { path: 'C:\\A.YAML' }, { path: 'C:\\b.yaml' }] });
    expect(state.files.map((f) => f.path)).toEqual(['C:\\a.yaml', 'C:\\b.yaml']);
  });

  it('puts the newest first, never lists a file twice, and keeps ten', () => {
    let state = parseRecent(undefined);
    for (let i = 0; i < 14; i += 1) state = addRecent(state, `C:\\f${i}.yaml`, new Date(2026, 9, 14, 0, i));
    expect(state.files).toHaveLength(MAX_RECENT);
    expect(state.files[0]!.path).toBe('C:\\f13.yaml');
    state = addRecent(state, 'C:\\F5.YAML', new Date());
    expect(state.files[0]!.path).toBe('C:\\F5.YAML');
    expect(state.files.filter((f) => f.path.toLowerCase() === 'c:\\f5.yaml')).toHaveLength(1);
  });

  it('lists only files that still exist, with name and folder, and can remove one', () => {
    const state = parseRecent({ files: [{ path: 'C:\\w\\one.yaml' }, { path: 'C:\\w\\gone.yaml' }] });
    expect(describeRecent(state, (p) => p === 'C:\\w\\one.yaml')).toEqual([{ path: 'C:\\w\\one.yaml', name: 'one.yaml', folder: 'C:\\w' }]);
    expect(removeRecent(state, 'C:\\w\\one.yaml').files).toHaveLength(1);
  });
});
