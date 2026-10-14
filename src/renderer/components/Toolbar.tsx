import type { ThemeChoice } from '../../shared/settings';

const LOOK_NAME: Record<ThemeChoice, string> = { system: 'Auto', light: 'Light', dark: 'Dark' };

export interface ToolbarProps {
  hasDocument: boolean;
  dirty: boolean;
  fileName: string;
  canUndo: boolean;
  canRedo: boolean;
  previewOpen: boolean;
  busy: boolean;
  onNew(): void;
  onOpen(): void;
  onSave(): void;
  onSaveAs(): void;
  onUndo(): void;
  onRedo(): void;
  onTogglePreview(): void;
  onSettings(): void;
  onHelper(): void;
  /** The chosen look, and a click to move to the next one (same as computer, light, dark). */
  theme?: ThemeChoice;
  onTheme?(): void;
}

export function Toolbar(props: ToolbarProps) {
  const { hasDocument, dirty, fileName, canUndo, canRedo, previewOpen, busy } = props;
  return (
    <header className="toolbar" role="toolbar" aria-label="File actions">
      <div className="toolbar__group">
        <button type="button" className="button" onClick={props.onNew} disabled={busy}>
          New
        </button>
        <button type="button" className="button" onClick={props.onOpen} disabled={busy}>
          Open
        </button>
        <button type="button" className="button button--primary" onClick={props.onSave} disabled={!hasDocument || busy}>
          Save
        </button>
        <button type="button" className="button" onClick={props.onSaveAs} disabled={!hasDocument || busy}>
          Save as
        </button>
      </div>
      <div className="toolbar__group">
        <button type="button" className="button" onClick={props.onUndo} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" className="button" onClick={props.onRedo} disabled={!canRedo}>
          Redo
        </button>
      </div>
      <p className="toolbar__file" title={fileName}>
        {hasDocument ? fileName : 'Yammel'}
        {hasDocument && dirty && (
          <span className="toolbar__dirty" role="img" aria-label="Unsaved changes">
            {' ●'}
          </span>
        )}
      </p>
      {hasDocument && (
        <button type="button" className="button" aria-pressed={previewOpen} onClick={props.onTogglePreview}>
          {previewOpen ? 'Hide preview' : 'Show preview'}
        </button>
      )}
      {hasDocument && (
        <button type="button" className="button" onClick={props.onHelper}>
          Helper
        </button>
      )}
      {props.theme !== undefined && props.onTheme !== undefined && (
        <button type="button" className="button" onClick={props.onTheme} aria-label={`Look: ${LOOK_NAME[props.theme]}. Change it`} title="Change between the computer's setting, light and dark">
          {LOOK_NAME[props.theme]}
        </button>
      )}
      <button type="button" className="button" onClick={props.onSettings}>
        Settings
      </button>
    </header>
  );
}
