import { useEffect, useState } from 'react';
import type { ParseIssue } from '../../model/document';

export interface YamlPreviewProps {
  text: string;
  issues: ParseIssue[];
  onClose(): void;
  onNotice(message: string): void;
}

export function YamlPreview({ text, issues, onClose, onNotice }: YamlPreviewProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      onNotice('The YAML could not be copied to the clipboard.');
    }
  };

  const lines = text === '' ? 0 : text.replace(/\n$/, '').split('\n').length;
  return (
    <section className="preview" aria-label="YAML preview">
      <header className="preview__head">
        <h2 className="preview__title">YAML preview</h2>
        <span className="preview__meta">{lines} lines</span>
        <button type="button" className="button button--small" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="button button--small" onClick={onClose}>
          Hide
        </button>
      </header>
      {issues.length > 0 && (
        <ul className="preview__issues" aria-label="Problems in this YAML">
          {issues.map((issue, index) => (
            <li key={index}>
              Line {issue.line}: {issue.message}
            </li>
          ))}
        </ul>
      )}
      <pre className="yaml" tabIndex={0} aria-label="YAML text">
        <code>{text}</code>
      </pre>
    </section>
  );
}
