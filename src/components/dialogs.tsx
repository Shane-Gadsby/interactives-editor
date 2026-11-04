import { useEffect, useRef, useState } from 'react';

/**
 * In-app replacements for the browser's confirm/prompt/alert. Call the promise functions from anywhere;
 * one `<DialogHost />` mounted at the app root shows them (one at a time, queued in call order).
 */

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive action: the confirm button turns red. */
  danger?: boolean;
}

export interface PromptOptions extends ConfirmOptions {
  /** Label above the text box. */
  label?: string;
  initial?: string;
  placeholder?: string;
  /** Return an error message to block the answer, or null when it is fine. */
  validate?: (value: string) => string | null;
}

export interface AlertOptions {
  title: string;
  message?: string;
  okLabel?: string;
}

export type LinkMode = 'link' | 'embed';

export interface LinkChoiceRow {
  name: string;
  /** Set when the file can only be embedded: the reason, shown under its name. */
  embedOnly?: string;
}

export interface LinkChoiceOptions {
  title: string;
  message?: string;
  rows: LinkChoiceRow[];
}

type Request =
  | { kind: 'confirm'; opts: ConfirmOptions; done: (v: boolean) => void }
  | { kind: 'link'; opts: LinkChoiceOptions; done: (v: LinkMode[] | null) => void }
  | { kind: 'prompt'; opts: PromptOptions; done: (v: string | null) => void }
  | { kind: 'alert'; opts: AlertOptions; done: () => void };

let queue: Request[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function enqueue(r: Request) {
  queue = [...queue, r];
  emit();
}

function settle(r: Request) {
  queue = queue.filter((q) => q !== r);
  emit();
}

export const confirmDialog = (opts: ConfirmOptions): Promise<boolean> => new Promise((done) => enqueue({ kind: 'confirm', opts, done }));
export const promptDialog = (opts: PromptOptions): Promise<string | null> => new Promise((done) => enqueue({ kind: 'prompt', opts, done }));
export const alertDialog = (opts: AlertOptions): Promise<void> => new Promise((done) => enqueue({ kind: 'alert', opts, done }));
/**
 * Ask, for each dropped file, whether to link it (keep watching the file on disk) or embed it (copy it into the project).
 * Resolves with one answer per row, or null when cancelled.
 */
export const linkChoiceDialog = (opts: LinkChoiceOptions): Promise<LinkMode[] | null> => new Promise((done) => enqueue({ kind: 'link', opts, done }));

const LINK_DEFAULT_KEY = 'ix-link-default';
function lastLinkMode(): LinkMode {
  try {
    return localStorage.getItem(LINK_DEFAULT_KEY) === 'embed' ? 'embed' : 'link';
  } catch {
    return 'link';
  }
}
function rememberLinkMode(m: LinkMode) {
  try {
    localStorage.setItem(LINK_DEFAULT_KEY, m);
  } catch {
    /* private window */
  }
}

/** Cancel everything open or waiting (confirm: false, prompt: null). */
export function dismissAllDialogs() {
  const all = queue;
  queue = [];
  emit();
  for (const r of all) r.kind === 'confirm' ? r.done(false) : r.kind === 'prompt' || r.kind === 'link' ? r.done(null) : r.done();
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function DialogHost() {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  const head = queue[0];
  return head ? <DialogView key={queueKey(head)} req={head} /> : null;
}

const keys = new WeakMap<Request, number>();
let keySeq = 0;
function queueKey(r: Request) {
  if (!keys.has(r)) keys.set(r, ++keySeq);
  return String(keys.get(r));
}

function DialogView({ req }: { req: Request }) {
  const opts = req.opts;
  const [value, setValue] = useState(req.kind === 'prompt' ? req.opts.initial ?? '' : '');
  const [showError, setShowError] = useState(false);
  const linkRows = req.kind === 'link' ? req.opts.rows : [];
  const [modes, setModes] = useState<LinkMode[]>(() => {
    const d = lastLinkMode();
    return linkRows.map((r) => (r.embedOnly ? 'embed' : d));
  });
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const okBtn = useRef<HTMLButtonElement>(null);
  const error = req.kind === 'prompt' ? req.opts.validate?.(value) ?? null : null;
  // Latest state for the window key handler (installed once per dialog)
  const live = useRef({ value, error, modes });
  live.current = { value, error, modes };

  const accept = () => {
    if (req.kind === 'prompt') {
      if (live.current.error) {
        setShowError(true);
        input.current?.focus();
        return;
      }
      finish(() => req.done(live.current.value));
    } else if (req.kind === 'confirm') finish(() => req.done(true));
    else if (req.kind === 'link') answerLink(live.current.modes);
    else finish(() => req.done());
  };
  /** Finish the link chooser with these answers (and remember the choice for next time). */
  const answerLink = (answers: LinkMode[]) => {
    if (req.kind !== 'link') return;
    if (req.opts.rows.some((r) => !r.embedOnly)) rememberLinkMode(answers.some((a, i) => a === 'link' && !req.opts.rows[i].embedOnly) ? 'link' : 'embed');
    finish(() => req.done(answers));
  };
  const all = (m: LinkMode) => answerLink(linkRows.map((r) => (r.embedOnly ? 'embed' : m)));
  const cancel = () => {
    if (req.kind === 'link') finish(() => req.done(null));
    else if (req.kind === 'prompt') finish(() => req.done(null));
    else if (req.kind === 'confirm') finish(() => req.done(false));
    else finish(() => req.done());
  };
  const finish = (resolve: () => void) => {
    settle(req);
    resolve();
  };
  const handlers = useRef({ accept, cancel });
  handlers.current = { accept, cancel };

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    if (input.current) {
      input.current.focus();
      input.current.select();
    } else okBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // The dialog is modal: the editor's own shortcuts must not see keys while it is open
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        handlers.current.cancel();
      } else if (e.key === 'Enter' && !e.isComposing) {
        const t = e.target as HTMLElement | null;
        // Enter on a focused button presses that button (so Enter on Cancel cancels)
        if (t instanceof HTMLButtonElement && box.current?.contains(t)) return;
        e.preventDefault();
        handlers.current.accept();
      } else if (e.key === 'Tab') {
        const items = Array.from(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        const at = document.activeElement as HTMLElement | null;
        if (!at || !box.current?.contains(at)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && at === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && at === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (before && document.contains(before)) before.focus();
    };
  }, []);

  const confirmLabel = req.kind === 'alert' ? req.opts.okLabel ?? 'OK' : req.kind === 'link' ? 'Import' : (req.opts as ConfirmOptions).confirmLabel ?? (req.kind === 'prompt' ? 'OK' : 'Confirm');
  const cancelLabel = req.kind === 'alert' ? '' : req.kind === 'link' ? 'Cancel' : (req.opts as ConfirmOptions).cancelLabel ?? 'Cancel';
  const danger = req.kind !== 'alert' && req.kind !== 'link' && !!(req.opts as ConfirmOptions).danger;
  const canLink = linkRows.some((r) => !r.embedOnly);
  const message = opts.message;
  const promptOpts = req.kind === 'prompt' ? req.opts : null;
  const titleId = 'dlg-title';

  return (
    <div className="modal-backdrop dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && cancel()}>
      <div className={`modal dialog${req.kind === 'link' ? ' link-dialog' : ''}`} role={req.kind === 'alert' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby={titleId} ref={box}>
        <header>
          <strong id={titleId}>{opts.title}</strong>
        </header>
        <div className="dialog-body">
          {message && <p className="dialog-message">{message}</p>}
          {req.kind === 'link' && (
            <ul className="link-rows">
              {linkRows.map((r, i) => (
                <li key={i} className="link-row">
                  <div className="link-file">
                    <span className="link-name" title={r.name}>
                      {r.name}
                    </span>
                    {r.embedOnly && <span className="link-reason">{r.embedOnly}</span>}
                  </div>
                  <div className="seg" role="radiogroup" aria-label={`${r.name}: link or embed`}>
                    {(['link', 'embed'] as const).map((m) => (
                      <button
                        key={m}
                        role="radio"
                        aria-checked={modes[i] === m}
                        className={`seg-btn${modes[i] === m ? ' on' : ''}`}
                        disabled={m === 'link' && !!r.embedOnly}
                        title={m === 'link' ? 'Keep a link to the file, watch it and bring its changes in' : 'Copy the file into the project; it stays as it is'}
                        onClick={() => setModes((cur) => cur.map((x, j) => (j === i ? m : x)))}
                      >
                        {m === 'link' ? 'Link' : 'Embed'}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {promptOpts && (
            <label className="dialog-field">
              {promptOpts.label && <span>{promptOpts.label}</span>}
              <input
                ref={input}
                type="text"
                value={value}
                placeholder={promptOpts.placeholder}
                title={promptOpts.label ?? promptOpts.title}
                aria-invalid={showError && !!error}
                onChange={(e) => {
                  setValue(e.target.value);
                  setShowError(true);
                }}
              />
              {showError && error && <span className="dialog-error">{error}</span>}
            </label>
          )}
        </div>
        <footer className="dialog-actions">
          {cancelLabel && (
            <button className="btn" title={`${cancelLabel} (Esc)`} onClick={cancel}>
              {cancelLabel}
            </button>
          )}
          {req.kind === 'link' && canLink && (
            <>
              <button className="btn" title="Embed every file" onClick={() => all('embed')}>
                Embed all
              </button>
              <button className="btn" title="Link every file that can be linked" onClick={() => all('link')}>
                Link all
              </button>
            </>
          )}
          <button ref={okBtn} className={`btn ${danger ? 'danger-fill' : 'primary'}`} title={`${confirmLabel} (Enter)`} onClick={accept}>
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
