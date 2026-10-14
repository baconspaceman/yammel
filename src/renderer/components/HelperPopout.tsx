import { useEffect, useMemo, useState } from 'react';
import type { EditorApi } from '../../shared/api';
import type { HelperAction, HelperSnapshot } from '../../shared/popout';
import { AssistantPanel } from './AssistantPanel';

export type PopoutApi = Pick<EditorApi, 'getHelperSnapshot' | 'onHelperSnapshot' | 'sendHelperAction' | 'closeHelperWindow'>;

/**
 * The helper chat in its own window. It shows a copy of the conversation that the editor window keeps, and sends what the person
 * types or clicks back to the editor window, which does the work (so changes land in the YAML that is open there, and undo works).
 */
export function HelperPopout({ api }: { api: PopoutApi }) {
  const [snapshot, setSnapshot] = useState<HelperSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const stop = api.onHelperSnapshot((next) => {
      if (!cancelled) setSnapshot(next);
    });
    void api.getHelperSnapshot().then((reply) => {
      if (cancelled) return;
      if (!reply.ok) setError(reply.message);
      else if (reply.value !== null) setSnapshot((current) => current ?? reply.value);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [api]);

  const settled = useMemo(() => new Map(snapshot?.settled ?? []), [snapshot]);
  const act = (action: HelperAction) => {
    void api.sendHelperAction(action).then((reply) => {
      if (!reply.ok) setError(reply.message);
    });
  };

  return (
    <main className="popout">
      {error !== null && (
        <p className="settings__error" role="alert">
          {error}
        </p>
      )}
      {snapshot === null ? (
        <p className="status popout__waiting" role="status">
          Waiting for the editor window&hellip; Open or start a YAML there and the conversation shows up here.
        </p>
      ) : (
        <AssistantPanel
          entries={snapshot.entries}
          starters={snapshot.starters}
          busy={snapshot.busy}
          helpers={snapshot.helpers}
          helperId={snapshot.helperId}
          note={snapshot.note}
          settled={settled}
          onHelper={(id) => act({ type: 'helper', id })}
          onSend={(text, viaChip) => act({ type: 'send', text, viaChip: viaChip === true })}
          onApply={(proposal) => act({ type: 'apply', proposalId: proposal.id })}
          onSkip={(proposal) => act({ type: 'skip', proposalId: proposal.id })}
          onPointer={(pointer) => act({ type: 'point', game: pointer.game, option: pointer.option })}
          onClear={() => act({ type: 'clear' })}
          onDock={() => void api.closeHelperWindow()}
        />
      )}
    </main>
  );
}
