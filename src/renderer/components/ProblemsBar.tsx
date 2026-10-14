import { useState } from 'react';
import { bestFix, type Fix, type Issue } from '../../validate/types';

export interface ProblemsBarProps {
  issues: readonly Issue[];
  /** Apply one suggested fix (one undo step). */
  onFix(fix: Fix): void;
  /** Apply the first suggested fix of every problem that has one (one undo step). */
  onFixAll(fixes: Fix[]): void;
  /** Scroll to the option a problem is about. */
  onShow(issue: Issue): void;
}

function where(issue: Issue): string {
  if (issue.option !== null) return `${issue.game ?? ''}: ${issue.option}`;
  if (issue.game !== null) return issue.game;
  return 'This file';
}

/** The "is my YAML OK?" strip under the seed meter: one calm line when it is, the list of what to fix when it is not. */
export function ProblemsBar({ issues, onFix, onFixAll, onShow }: ProblemsBarProps) {
  const [open, setOpen] = useState(false);
  if (issues.length === 0) {
    return (
      <section className="problems" aria-label="Problems">
        <p className="problems__summary problems__summary--ok" role="status">
          No problems found. Archipelago should accept this YAML.
        </p>
      </section>
    );
  }
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  // "Apply all" never uses a fix that throws away something the person wrote; those are offered one at a time.
  const fixable = issues.flatMap((issue) => {
    const fix = bestFix(issue);
    return fix === undefined ? [] : [fix];
  });
  const parts = [errors > 0 ? `${errors} ${errors === 1 ? 'error' : 'errors'}` : '', warnings > 0 ? `${warnings} ${warnings === 1 ? 'warning' : 'warnings'}` : ''].filter(Boolean);
  return (
    <section className="problems" aria-label="Problems">
      <div className="problems__head">
        <p className="problems__summary" role="status">
          {parts.join(' and ')} to look at{errors > 0 ? '. Archipelago would stop or ignore part of this YAML.' : '.'}
        </p>
        {fixable.length > 0 && (
          <button type="button" className="button button--small" onClick={() => onFixAll(fixable)}>
            Apply the suggested fixes ({fixable.length})
          </button>
        )}
        <button type="button" className="button button--small" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? 'Hide the list' : 'Show the list'}
        </button>
      </div>
      {open && (
        <ul className="problems__list" aria-label="Problems found">
          {issues.map((issue) => (
            <li key={issue.id} className="problems__item" data-severity={issue.severity}>
              <span className="problems__where">{where(issue)}</span>
              <span>{issue.message}</span>
              {issue.fixes.map((fix) => (
                <button key={fix.label} type="button" className="button button--small" onClick={() => onFix(fix)}>
                  {fix.label}
                </button>
              ))}
              {issue.option !== null && (
                <button type="button" className="button button--small" onClick={() => onShow(issue)}>
                  Show the option
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
