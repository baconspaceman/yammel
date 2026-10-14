import { useCallback, useRef, useState } from 'react';
import { guideReply, type GuideContext } from '../../assistant/guide';
import type { ChatTurn, Pointer, Proposal, Reply } from '../../assistant/types';
import type { ChatEntry, HelperChoice } from '../components/AssistantPanel';

export const GUIDE_ID = 'guide';

export const GUIDE_CHOICE: HelperChoice = { id: GUIDE_ID, name: 'Built-in guide', unavailable: null };

/** Asks an AI helper (not the built-in guide). Never throws: a failure comes back as a reply that says so. */
export type AskHelper = (helperId: string, message: string, history: ChatTurn[], ctx: GuideContext) => Promise<Reply>;

export interface HelperDeps {
  /** What the helper may look at right now, or null when there is nothing open to talk about. */
  context(): GuideContext | null;
  /** Applies the edits as one undo step. Returns false when they could not be applied. */
  apply(edits: Proposal['edits']): boolean;
  point(pointer: Pointer): void;
  /** AI helpers. Without it only the built-in guide is offered. */
  ask?: AskHelper;
}

const NOTHING_OPEN = "Open or start a YAML first, and then I can help with it.";

/** The chat's state: what was said, which suggestions were applied or skipped, and who is answering. */
export function useHelper(deps: HelperDeps) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [settled, setSettled] = useState<ReadonlyMap<string, 'applied' | 'skipped'>>(new Map());
  const [busy, setBusy] = useState(false);
  const [helperId, setHelperId] = useState(GUIDE_ID);
  const next = useRef(1);
  // Checked at once (not after the next render), so two quick clicks, here or in the pop-out window, cannot both get through.
  const settledNow = useRef(new Set<string>());
  const askingNow = useRef(false);
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const add = useCallback((entry: Omit<ChatEntry, 'id'>) => {
    const id = next.current;
    next.current += 1;
    setEntries((previous) => [...previous, { ...entry, id }]);
  }, []);

  const send = useCallback(
    async (text: string, id: string) => {
      add({ role: 'user', text });
      const ctx = depsRef.current.context();
      if (ctx === null) {
        add({ role: 'assistant', text: NOTHING_OPEN });
        return;
      }
      if (id === GUIDE_ID || depsRef.current.ask === undefined) {
        const reply = guideReply(text, ctx);
        add({ role: 'assistant', text: reply.text, reply });
        return;
      }
      if (askingNow.current) return; // one question at a time
      askingNow.current = true;
      setBusy(true);
      try {
        const history: ChatTurn[] = entriesRef.current.slice(-8).map((entry) => ({ role: entry.role, text: entry.text }));
        const reply = await depsRef.current.ask(id, text, history, ctx);
        add({ role: 'assistant', text: reply.text, reply });
      } catch {
        add({ role: 'assistant', text: 'Something went wrong while asking, so nothing was changed. You can try again, or switch to the built-in guide.' });
      } finally {
        askingNow.current = false;
        setBusy(false);
      }
    },
    [add],
  );

  const settle = useCallback((proposal: Proposal, how: 'applied' | 'skipped') => {
    setSettled((previous) => new Map(previous).set(proposal.id, how));
  }, []);

  return {
    entries,
    settled,
    busy,
    helperId,
    setHelperId,
    /** Chips and starter buttons are the guide's own phrases, so they are always answered by the built-in guide, which costs nothing. */
    send: (text: string, viaChip = false) => send(text, viaChip ? GUIDE_ID : helperId),
    apply: (proposal: Proposal) => {
      if (settledNow.current.has(proposal.id)) return;
      settledNow.current.add(proposal.id);
      if (depsRef.current.apply(proposal.edits)) settle(proposal, 'applied');
      else {
        settledNow.current.delete(proposal.id);
        add({ role: 'assistant', text: 'That change could not be made. Nothing was changed.' });
      }
    },
    skip: (proposal: Proposal) => {
      if (settledNow.current.has(proposal.id)) return;
      settledNow.current.add(proposal.id);
      settle(proposal, 'skipped');
    },
    point: (pointer: Pointer) => depsRef.current.point(pointer),
    clear: () => {
      settledNow.current.clear();
      setEntries([]);
      setSettled(new Map());
    },
  };
}
