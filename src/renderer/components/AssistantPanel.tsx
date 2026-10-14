import { useEffect, useRef, useState } from 'react';
import type { Pointer, Proposal, Reply } from '../../assistant/types';

export interface ChatEntry {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  reply?: Reply;
}

export interface HelperChoice {
  id: string;
  name: string;
  /** Why it cannot be used right now, or null when it can. */
  unavailable: string | null;
}

export interface AssistantPanelProps {
  entries: readonly ChatEntry[];
  /** Quick things to say when the chat is empty. */
  starters: readonly string[];
  /** Waiting for an answer. */
  busy: boolean;
  helpers: readonly HelperChoice[];
  helperId: string;
  /** A one-line note under the title, saying who is answering and what is sent where. */
  note: string;
  /** Proposals already applied or skipped, by id. */
  settled: ReadonlyMap<string, 'applied' | 'skipped'>;
  onHelper(id: string): void;
  /** viaChip: the text came from a suggestion button rather than being typed. */
  onSend(text: string, viaChip?: boolean): void;
  onApply(proposal: Proposal): void;
  onSkip(proposal: Proposal): void;
  onPointer(pointer: Pointer): void;
  onClear(): void;
  /** Shown in the editor: moves the chat into its own window. */
  onPopOut?(): void;
  /** Shown in the chat's own window: closes it, and the chat is back in the editor. */
  onDock?(): void;
}

function ProposalCard({ proposal, state, onApply, onSkip }: { proposal: Proposal; state: 'applied' | 'skipped' | undefined; onApply(): void; onSkip(): void }) {
  return (
    <li className="chat__proposal" data-state={state ?? 'open'}>
      <span className="chat__proposal-title">{proposal.title}</span>
      {proposal.detail !== undefined && <span className="chat__proposal-detail">{proposal.detail}</span>}
      {state === undefined ? (
        <span className="chat__proposal-actions">
          <button type="button" className="button button--small button--primary" onClick={onApply}>
            Apply
          </button>
          <button type="button" className="button button--small" onClick={onSkip}>
            Skip
          </button>
        </span>
      ) : (
        <span className="chat__proposal-done">{state === 'applied' ? 'Applied (you can undo it)' : 'Skipped'}</span>
      )}
    </li>
  );
}

/** The helper chat: you type what you want, it answers with changes you can apply or skip. */
export function AssistantPanel(props: AssistantPanelProps) {
  const { entries, starters, busy, helpers, helperId, note, settled } = props;
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const log = logRef.current;
    if (log !== null) log.scrollTop = log.scrollHeight;
  }, [entries.length, busy]);

  const send = (text: string, viaChip = false) => {
    const clean = text.trim();
    if (clean === '' || busy) return;
    props.onSend(clean, viaChip);
    setDraft('');
  };

  const last = entries[entries.length - 1];
  const chosen = helpers.find((helper) => helper.id === helperId);

  return (
    <section className="chat" aria-label="Helper">
      <header className="chat__head">
        <h2 className="chat__title">Helper</h2>
        <label className="chat__who">
          <select className="input" value={helperId} onChange={(e) => props.onHelper(e.target.value)} aria-label="Who answers">
            {helpers.map((helper) => (
              <option key={helper.id} value={helper.id} disabled={helper.unavailable !== null}>
                {helper.name}
                {helper.unavailable !== null ? ' (not set up)' : ''}
              </option>
            ))}
          </select>
        </label>
        {entries.length > 0 && (
          <button type="button" className="button button--small" onClick={props.onClear}>
            Clear
          </button>
        )}
        {props.onPopOut !== undefined && (
          <button type="button" className="button button--small" onClick={props.onPopOut} title="Open the helper in its own window, so it can sit beside the editor">
            Pop out
          </button>
        )}
        {props.onDock !== undefined && (
          <button type="button" className="button button--small" onClick={props.onDock} title="Close this window and use the helper inside the editor again">
            Back to the editor
          </button>
        )}
      </header>
      <p className="chat__note">{chosen?.unavailable ?? note}</p>

      <div className="chat__log" ref={logRef} role="log" aria-live="polite" aria-label="Conversation">
        {entries.length === 0 && (
          <div className="chat__empty">
            <p>Tell me what you want and I will change the settings for you. You always get to look at a change before it happens.</p>
            <div className="chat__chips">
              {starters.map((starter) => (
                <button key={starter} type="button" className="button button--small" onClick={() => send(starter, true)}>
                  {starter}
                </button>
              ))}
            </div>
          </div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className={`chat__msg chat__msg--${entry.role}`}>
            <p className="chat__text">{entry.text}</p>
            {entry.reply !== undefined && entry.reply.proposals.length > 0 && (
              <ul className="chat__proposals" aria-label="Suggested changes">
                {entry.reply.proposals.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    state={settled.get(proposal.id)}
                    onApply={() => props.onApply(proposal)}
                    onSkip={() => props.onSkip(proposal)}
                  />
                ))}
              </ul>
            )}
            {entry.reply !== undefined && entry.reply.pointers.length > 0 && (
              <div className="chat__chips">
                {entry.reply.pointers.map((pointer) => (
                  <button key={`${pointer.game}:${pointer.option}`} type="button" className="button button--small" onClick={() => props.onPointer(pointer)}>
                    Show {pointer.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <p className="chat__thinking" role="status">
            Thinking&hellip;
          </p>
        )}
        {last?.role === 'assistant' && last.reply !== undefined && last.reply.followUps.length > 0 && !busy && (
          <div className="chat__chips" aria-label="Things you could say next">
            {last.reply.followUps.map((text) => (
              <button key={text} type="button" className="button button--small" onClick={() => send(text, true)}>
                {text}
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        className="chat__form"
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
      >
        <input
          type="text"
          className="input chat__input"
          aria-label="Message to the helper"
          placeholder="For example: turn off death link"
          value={draft}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="button button--primary" disabled={busy || draft.trim() === ''}>
          Send
        </button>
      </form>
    </section>
  );
}
