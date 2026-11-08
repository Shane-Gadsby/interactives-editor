import { store, type Toast } from '../store/store';

/** The message at the bottom of the editor, with an Undo (or Redo) button when it is about a change that can be taken back. */
export function ToastView({ toast }: { toast: Toast }) {
  const a = toast.action;
  return (
    <div className={`toast ${toast.kind}${a ? ' with-action' : ''}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      <span>{toast.text}</span>
      {a && (
        <button
          type="button"
          className="toast-action"
          disabled={a.stale}
          title={
            a.stale
              ? 'Something else has changed since, so this button would no longer take back just that. Ctrl+Z still undoes the latest change'
              : a.kind === 'undo'
                ? 'Take that change back (Ctrl+Z does the same)'
                : 'Do that change again (Ctrl+Shift+Z does the same)'
          }
          onClick={() => store().runToastAction()}
        >
          {a.kind === 'undo' ? 'Undo' : 'Redo'}
        </button>
      )}
    </div>
  );
}
