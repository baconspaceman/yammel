import { useEffect, useRef } from 'react';

export interface WelcomeCardProps {
  /** Called when the card is closed in any way (button, Esc or the backdrop). */
  onClose(): void;
}

const STEPS: { title: string; text: string }[] = [
  { title: 'Pick a game', text: 'Choose a game on the start screen, or open a YAML you already have. Every option of the game is there, with its own description.' },
  { title: 'Watch the numbers', text: 'The check count and the difficulty gauge update as you change things, so you can see what a setting really does.' },
  { title: 'Fix problems in one click', text: 'If something would not work in Archipelago, a message says why in plain words and offers a button to fix it.' },
  { title: 'Save and send', text: 'Save the YAML and send it to whoever hosts the game. Your old file is backed up first.' },
];

/** A short, once-only "here is how it works" card. Nothing in the app depends on it being read. */
export function WelcomeCard({ onClose }: WelcomeCardProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => before?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || cardRef.current === null) return;
    const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])'));
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="welcome" onKeyDown={onKeyDown}>
      <div className="welcome__backdrop" onClick={onClose} />
      <div className="welcome__card" role="dialog" aria-modal="true" aria-labelledby="welcome-title" ref={cardRef}>
        <h2 id="welcome-title" className="welcome__title">
          Welcome to Yammel
        </h2>
        <p className="welcome__lead">Here is how it works, in four steps.</p>
        <ol className="welcome__steps">
          {STEPS.map((step) => (
            <li key={step.title} className="welcome__step">
              <strong>{step.title}.</strong> {step.text}
            </li>
          ))}
        </ol>
        <p className="welcome__note">Everything else, like the helper chat or making a seed, is optional. Nothing needs an account, and nothing is sent anywhere unless you switch an AI helper on.</p>
        <div className="welcome__actions">
          <button type="button" className="button button--primary" ref={closeRef} onClick={onClose}>
            Got it
          </button>
        </div>
        <p className="welcome__again">You can open this again from Settings.</p>
      </div>
    </div>
  );
}
