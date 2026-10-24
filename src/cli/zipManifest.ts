import { inflateRawSync } from 'node:zlib';

/**
 * Reads the game name an `.apworld` file says it holds, without Python and without running any of the world's code.
 * An .apworld is a zip file with `<world folder>/archipelago.json` inside; that manifest has a "game" entry.
 * Older worlds have no manifest: the answer is then null and the caller falls back to the file name.
 */

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_MANIFEST = 256 * 1024;

export interface ApworldManifest {
  game: string | null;
  worldVersion: string | null;
  minimumApVersion: string | null;
}

function entryBytes(buffer: Buffer, offset: number, compressedSize: number, method: number, size: number): Buffer | null {
  if (buffer.readUInt32LE(offset) !== LOCAL || size > MAX_MANIFEST) return null;
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const data = buffer.subarray(start, start + compressedSize);
  if (method === 0) return data;
  if (method === 8) return inflateRawSync(data, { maxOutputLength: MAX_MANIFEST });
  return null;
}

/** The manifest inside a zip's bytes, or null when there is none or the zip cannot be read. */
export function readApworldManifest(buffer: Buffer): ApworldManifest | null {
  try {
    let eocd = -1;
    for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i -= 1) {
      if (buffer.readUInt32LE(i) === EOCD) {
        eocd = i;
        break;
      }
    }
    if (eocd === -1) return null;
    const entries = buffer.readUInt16LE(eocd + 10);
    let cursor = buffer.readUInt32LE(eocd + 16);
    for (let n = 0; n < entries; n += 1) {
      if (buffer.readUInt32LE(cursor) !== CENTRAL) return null;
      const method = buffer.readUInt16LE(cursor + 10);
      const compressedSize = buffer.readUInt32LE(cursor + 20);
      const size = buffer.readUInt32LE(cursor + 24);
      const nameLength = buffer.readUInt16LE(cursor + 28);
      const extraLength = buffer.readUInt16LE(cursor + 30);
      const commentLength = buffer.readUInt16LE(cursor + 32);
      const localOffset = buffer.readUInt32LE(cursor + 42);
      const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
      cursor += 46 + nameLength + extraLength + commentLength;
      // the manifest sits one folder down: "<world>/archipelago.json"
      if (!/^[^/]+\/archipelago\.json$/.test(name)) continue;
      const bytes = entryBytes(buffer, localOffset, compressedSize, method, size);
      if (bytes === null) return null;
      const parsed: unknown = JSON.parse(bytes.toString('utf8').replace(/^﻿/, ''));
      if (typeof parsed !== 'object' || parsed === null) return null;
      const record = parsed as Record<string, unknown>;
      const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);
      return {
        game: text(record['game']),
        worldVersion: text(record['world_version']),
        minimumApVersion: text(record['minimum_ap_version']),
      };
    }
    return null;
  } catch {
    return null;
  }
}
