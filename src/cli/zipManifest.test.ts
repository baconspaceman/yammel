import { describe, expect, it } from 'vitest';
import { readApworldManifest } from './zipManifest';
import { makeZip } from './testZip';

const MANIFEST = JSON.stringify({ game: 'Odd Game', world_version: '1.2.3', minimum_ap_version: '0.6.3' });

describe('readApworldManifest', () => {
  it('reads the game from a stored manifest', () => {
    const zip = makeZip({ 'odd/__init__.py': 'x = 1', 'odd/archipelago.json': MANIFEST });
    expect(readApworldManifest(zip)).toEqual({ game: 'Odd Game', worldVersion: '1.2.3', minimumApVersion: '0.6.3' });
  });

  it('reads a deflated manifest, and one with a byte-order mark', () => {
    const zip = makeZip({ 'odd/archipelago.json': `﻿${MANIFEST}` }, 'deflate');
    expect(readApworldManifest(zip)?.game).toBe('Odd Game');
  });

  it('returns null when there is no manifest (an older world)', () => {
    expect(readApworldManifest(makeZip({ 'odd/__init__.py': 'x = 1' }))).toBeNull();
  });

  it('does not take a manifest that is not one folder down', () => {
    expect(readApworldManifest(makeZip({ 'archipelago.json': MANIFEST }))).toBeNull();
  });

  it('gives null for something that is not a zip, or a manifest with no game', () => {
    expect(readApworldManifest(Buffer.from('not a zip at all'))).toBeNull();
    expect(readApworldManifest(makeZip({ 'odd/archipelago.json': '{"authors":"x"}' }))?.game).toBeNull();
    expect(readApworldManifest(makeZip({ 'odd/archipelago.json': '{ broken' }))).toBeNull();
  });
});
