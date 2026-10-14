import type { ChatEntry, HelperChoice } from '../renderer/components/AssistantPanel';

/**
 * The helper chat can live in its own window. The main window keeps the conversation and the open YAML; the pop-out only
 * shows a copy (a snapshot) and sends back what the person types or clicks (an action). Both travel through the main
 * process, which checks who sent them and what they say.
 */
export interface HelperSnapshot {
  entries: ChatEntry[];
  starters: string[];
  busy: boolean;
  helpers: HelperChoice[];
  helperId: string;
  note: string;
  /** Proposal id and what was done with it. */
  settled: [string, 'applied' | 'skipped'][];
}

export type HelperAction =
  | { type: 'send'; text: string; viaChip: boolean }
  | { type: 'helper'; id: string }
  | { type: 'apply'; proposalId: string }
  | { type: 'skip'; proposalId: string }
  | { type: 'point'; game: string; option: string }
  | { type: 'clear' };

export const MAX_ACTION_TEXT = 500;
export const MAX_SNAPSHOT_BYTES = 1_500_000;
const MAX_ID = 200;

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !value.includes('\u0000') ? value : null;
}

/** Reads an action sent by the pop-out. Anything that is not exactly one of the known actions is refused (null). */
export function parseHelperAction(raw: unknown): HelperAction | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  switch (record['type']) {
    case 'send': {
      const message = text(record['text'], MAX_ACTION_TEXT);
      return message === null || message.trim() === '' ? null : { type: 'send', text: message, viaChip: record['viaChip'] === true };
    }
    case 'helper': {
      const id = text(record['id'], MAX_ID);
      return id === null ? null : { type: 'helper', id };
    }
    case 'apply':
    case 'skip': {
      const proposalId = text(record['proposalId'], MAX_ID);
      return proposalId === null ? null : { type: record['type'], proposalId };
    }
    case 'point': {
      const game = text(record['game'], MAX_ID);
      const option = text(record['option'], MAX_ID);
      return game === null || option === null ? null : { type: 'point', game, option };
    }
    case 'clear':
      return { type: 'clear' };
    default:
      return null;
  }
}

/** A snapshot is plain data and must be small. Returns false for anything that is not one (or is too large to send). */
export function isSendableSnapshot(raw: unknown): raw is HelperSnapshot {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record['entries']) || !Array.isArray(record['starters']) || !Array.isArray(record['helpers']) || !Array.isArray(record['settled'])) return false;
  if (typeof record['busy'] !== 'boolean' || typeof record['helperId'] !== 'string' || typeof record['note'] !== 'string') return false;
  try {
    return JSON.stringify(raw).length <= MAX_SNAPSHOT_BYTES;
  } catch {
    return false;
  }
}
