import { useEffect, useRef, useState } from 'react';
import type { EditorApi } from '../../shared/api';
import type { GenerateMode, GenerateResult, GeneratorStatus } from '../../shared/generate';

export type SeedApi = Pick<EditorApi, 'generatorStatus' | 'generate' | 'cancelGenerate' | 'pickPlayerYamls' | 'revealSeed'>;

export interface SeedPanelProps {
  api: SeedApi;
  /** The YAML being edited. */
  yaml: { name: string; text: string };
  /** How many problems the checker found that Archipelago would stop at. */
  errorCount: number;
  onSettings(): void;
  /** The open game was added from the person's own custom worlds folder. */
  customGame?: boolean;
}

const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/** Runs Archipelago's own generator on this YAML: a check that writes nothing, or a real seed in a new folder. */
export function SeedPanel({ api, yaml, errorCount, onSettings, customGame }: SeedPanelProps) {
  const [status, setStatus] = useState<GeneratorStatus | null>(null);
  const [extra, setExtra] = useState<string[]>([]);
  const [running, setRunning] = useState<GenerateMode | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.generatorStatus().then((reply) => {
      if (!cancelled && reply.ok) setStatus(reply.value);
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => () => {
    if (timer.current !== null) clearInterval(timer.current);
  }, []);

  const run = async (mode: GenerateMode) => {
    if (running !== null) return;
    setRunning(mode);
    setSeconds(0);
    setResult(null);
    setError(null);
    setShowLog(false);
    timer.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    try {
      const reply = await api.generate({ mode, yaml, extraFiles: extra });
      if (reply.ok) setResult(reply.value);
      else setError(reply.message);
    } finally {
      if (timer.current !== null) clearInterval(timer.current);
      timer.current = null;
      setRunning(null);
    }
  };

  const addFiles = async () => {
    const reply = await api.pickPlayerYamls();
    if (!reply.ok) return setError(reply.message);
    setExtra((previous) => [...new Set([...previous, ...reply.value])]);
  };

  const available = status?.available === true;
  return (
    <section className="seed" aria-label="Make a seed">
      <h2 className="seed__title">Make a seed</h2>
      <p className="seed__note">
        This runs Archipelago's own generator, the same one the launcher uses. <strong>Check it</strong> only tests that it works and writes nothing. <strong>Make the seed</strong> writes a
        real seed into a new folder in your Documents.
      </p>
      {customGame === true && (
        <p className="seed__note">
          This game comes from your custom worlds. Archipelago can only make a seed for it if the <code>.apworld</code> is also installed in Archipelago&rsquo;s own <code>custom_worlds</code> folder; if it is not, the check will say the game is unknown.
        </p>
      )}

      {status === null ? (
        <p className="status" role="status">
          Looking for Archipelago&hellip;
        </p>
      ) : !available ? (
        <div className="seed__problem" role="status">
          <p>{status.problem}</p>
          <button type="button" className="button button--small" onClick={onSettings}>
            Open Settings
          </button>
        </div>
      ) : (
        <p className="seed__ready" role="status">
          Ready. It will use {status.kind === 'source' ? 'your Archipelago source folder' : 'your installed Archipelago'}.
        </p>
      )}

      {errorCount > 0 && (
        <p className="seed__warn" role="status">
          The problem checker found {errorCount} {errorCount === 1 ? 'error' : 'errors'}, so Archipelago will probably refuse this YAML. Fix {errorCount === 1 ? 'it' : 'them'} first, or try anyway.
        </p>
      )}

      <div className="seed__players">
        <h3 className="seed__subtitle">Players</h3>
        <ul className="seed__list" aria-label="YAML files in this seed">
          <li>
            <strong>{yaml.name}</strong> (the one you are editing)
          </li>
          {extra.map((file) => (
            <li key={file}>
              <span className="seed__file" title={file}>
                {fileName(file)}
              </span>
              <button type="button" className="button button--small" aria-label={`Leave out ${fileName(file)}`} onClick={() => setExtra((previous) => previous.filter((entry) => entry !== file))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="button button--small" disabled={running !== null} onClick={() => void addFiles()}>
          Add other players&rsquo; YAMLs&hellip;
        </button>
      </div>

      <div className="seed__actions">
        <button type="button" className="button" disabled={!available || running !== null} onClick={() => void run('check')}>
          Check it
        </button>
        <button type="button" className="button button--primary" disabled={!available || running !== null} onClick={() => void run('make')}>
          Make the seed
        </button>
        {running !== null && (
          <button type="button" className="button" onClick={() => void api.cancelGenerate()}>
            Stop
          </button>
        )}
      </div>

      {running !== null && (
        <p className="status" role="status">
          {running === 'check' ? 'Checking' : 'Making the seed'}&hellip; {seconds}s. This usually takes about ten seconds, and longer for big games.
        </p>
      )}

      {error !== null && (
        <p className="seed__error" role="alert">
          {error}
        </p>
      )}

      {result !== null && result.ok && (
        <div className="seed__result seed__result--ok" role="status">
          {result.mode === 'check' ? (
            <p>
              <strong>It generates.</strong> Archipelago accepted {extra.length === 0 ? 'this YAML' : 'these YAMLs'} and could place every item ({result.seconds}s). Nothing was written.
            </p>
          ) : (
            <>
              <p>
                <strong>Seed made</strong> ({result.seconds}s): {fileName(result.seedFile ?? '')}
              </p>
              <p className="seed__path">{result.folder}</p>
              <button type="button" className="button button--small" onClick={() => void api.revealSeed(result.seedFile ?? result.folder ?? '')}>
                Show in folder
              </button>
              {result.spoilerFile !== null && <p className="seed__note">A spoiler file was written beside it ({fileName(result.spoilerFile)}). Do not open it if you want to be surprised.</p>}
            </>
          )}
        </div>
      )}

      {result !== null && !result.ok && (
        <div className="seed__result seed__result--bad" role="alert">
          <p>
            <strong>{result.reason === 'stopped' ? 'It was stopped.' : result.reason === 'unavailable' ? 'It cannot run here.' : 'Archipelago would not make a seed.'}</strong>
          </p>
          <ul className="seed__problems">
            {result.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
          {result.log !== '' && (
            <>
              <button type="button" className="button button--small" aria-expanded={showLog} onClick={() => setShowLog((value) => !value)}>
                {showLog ? 'Hide the full log' : 'Show the full log'}
              </button>
              {showLog && (
                <pre className="seed__log" aria-label="Generator log">
                  {result.log}
                </pre>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
