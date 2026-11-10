import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { layerScope, walk, type SceneNode } from 'interactives-player';
import { maybeStore } from '../store/store';
import { previewScope } from '../lib/data';
import { accept, suggest, type SuggestEnv, type Suggestion } from '../lib/suggest';
import { checkFormula, checkTemplate, type CheckEnv, type FormulaStatus } from '../lib/expr-check';
import { BoundMark, FieldTrail, fieldClass, tipFor, unbroken } from './ui';
import { useRowSearch } from '../lib/prop-search';

/**
 * Names an expression field sees only here, given once by whatever holds the fields: a binding's layer is `self`
 * for every formula in it. Fields add their own on top (a converter's `value`).
 */
export const ExprLocals = createContext<{ locals?: string[]; self?: SceneNode; values?: Record<string, unknown> }>({});

const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

/** What the suggestions know about the open project, worked out only when a suggestion is asked for. */
function envFor(locals: string[], self: SceneNode | undefined, values?: Record<string, unknown>): SuggestEnv | null {
  const st = maybeStore()?.get();
  if (!st) return null;
  const project = st.project;
  const board = project.artboards.find((a) => a.id === st.activeArtboardId) ?? project.artboards[0];
  let scope: Record<string, unknown> | null = null;
  return {
    project,
    scope: () => {
      if (!scope) {
        try {
          scope = previewScope(project, board);
        } catch {
          scope = {};
        }
      }
      return scope;
    },
    layers: () => {
      const seen = new Set<string>();
      const out: { name: string; type: string }[] = [];
      if (board)
        walk(board.children, (n) => {
          if (n.name && !seen.has(n.name)) (seen.add(n.name), out.push({ name: n.name, type: n.type }));
        });
      return out;
    },
    locals,
    localValues: self || values ? { ...values, ...(self ? { self: layerScope(self) } : {}) } : undefined,
  };
}

/** What the formula checker knows about the open project; the scope is only built if the formula gets as far as being worked out. */
function checkEnvFor(locals: string[], self: SceneNode | undefined, values?: Record<string, unknown>): CheckEnv | null {
  const env = envFor(locals, self, values);
  if (!env) return null;
  return { variables: env.project.variables, dataNames: env.project.dataSources.map((d) => d.name), locals, localValues: env.localValues, scope: env.scope };
}

/**
 * What a formula says right now, or what is wrong with it, for the line under a field. Checked a moment after typing stops, and
 * again when the project's variables or data change, not on every edit to a layer (working a formula out builds the whole scope).
 */
export function useFormulaStatus(text: string, locals: string[], self: SceneNode | undefined, template?: boolean, values?: Record<string, unknown>): FormulaStatus {
  const [status, setStatus] = useState<FormulaStatus>({ kind: 'empty' });
  const st = maybeStore()?.get();
  const vars = st?.project.variables;
  const data = st?.project.dataSources;
  const key = locals.join(',');
  useEffect(() => {
    if (!text.trim()) return setStatus((s) => (s.kind === 'empty' ? s : { kind: 'empty' }));
    const t = setTimeout(() => {
      const env = checkEnvFor(locals, self, values);
      setStatus(env ? (template ? checkTemplate(text, env) : checkFormula(text, env)) : { kind: 'empty' });
    }, 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, vars, data, key, self?.id, template, values]);
  return status;
}

/** The line under a formula field: green with what it works out to, or red with what is wrong and a button for the easy fix. */
export function FormulaStatusLine({ status, onFix }: { status: FormulaStatus; onFix?: (text: string) => void }) {
  if (status.kind === 'empty') return null;
  if (status.kind === 'ok')
    return (
      <div className="expr-status ok" role="status" aria-live="polite">
        <span aria-hidden="true">✓ </span>
        {status.text}
      </div>
    );
  return (
    <div className="expr-status err" role="alert">
      <span aria-hidden="true">⚠ </span>
      {status.message}
      {status.fix && onFix ? (
        <>
          {' '}
          <button type="button" className="link-btn" onClick={() => onFix(status.fix!.text)}>
            {status.fix.label}
          </button>
        </>
      ) : null}
    </div>
  );
}

/**
 * A text field for an expression, or (with `template`) for text that has `{expressions}` in it. As you type a name, or
 * after a dot, a list suggests what is in scope: variables, the course context, data, helpers, layer names for
 * layer("..."). The rules are in lib/suggest.ts. Arrows move, Enter or Tab take the choice, Escape closes. With the list
 * closed it behaves exactly like TextField (Enter finishes a single line).
 */
export function ExprField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  mono = true,
  commitOnBlur,
  rows,
  title,
  onInput,
  template,
  locals,
  ariaLabel,
}: {
  label?: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  mono?: boolean;
  commitOnBlur?: boolean;
  rows?: number;
  title?: string;
  onInput?: (v: string) => void;
  /** Suggest only inside `{...}`, as in a text layer's words. */
  template?: boolean;
  /** Names this field sees besides the project's (event, value, item, index, self...). */
  locals?: string[];
  ariaLabel?: string;
}) {
  const ctx = useContext(ExprLocals);
  const ps = useRowSearch(label ?? ariaLabel, tipFor(label, title));
  const [text, setText] = useState(value);
  const focused = useRef(false);
  const el = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const pending = useRef<{ text: string; caret: number } | null>(null);
  const [sug, setSug] = useState<ReturnType<typeof suggest>>(null);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const id = useId();
  const listId = `${id}-list`;
  const open = !!sug && sug.items.length > 0;

  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);

  // the caret goes after what was just put in, once the new text is in the input
  useLayoutEffect(() => {
    const p = pending.current;
    if (p && el.current && el.current.value === p.text) {
      el.current.setSelectionRange(p.caret, p.caret);
      pending.current = null;
    }
  });

  useLayoutEffect(() => {
    if (!open || !el.current) return;
    const r = el.current.getBoundingClientRect();
    const width = Math.max(260, r.width);
    const h = pop.current?.offsetHeight ?? 240;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.left));
    const below = r.bottom + 2;
    setPos({ left, width, top: below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 2) : below });
  }, [open, sug?.items.length]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (!pop.current?.contains(e.target as Node)) setSug(null);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  useEffect(() => {
    pop.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  const names = useMemo(() => [...new Set([...(ctx.locals ?? []), ...(ctx.self ? ['self'] : []), ...(locals ?? [])])], [ctx.locals, ctx.self, locals]);

  const refresh = (node: HTMLInputElement | HTMLTextAreaElement) => {
    const env = envFor(names, ctx.self, ctx.values);
    const caret = node.selectionStart ?? node.value.length;
    setSug(env ? suggest(node.value, caret, env, template) : null);
    setActive(0);
  };

  const put = (next: string) => {
    if (commitOnBlur) setText(next);
    else onChange(next);
    onInput?.(next);
  };

  const choose = (item: Suggestion) => {
    if (!sug || !el.current) return;
    const r = accept(el.current.value, sug.slot, item);
    pending.current = r;
    put(r.text);
    setSug(null);
  };

  const shown = commitOnBlur ? text : value;
  //The easy fix is a real change: it is committed now, even in a field that waits for the blur
  const fix = (fixed: string) => {
    if (commitOnBlur) setText(fixed);
    onChange(fixed);
    onInput?.(fixed);
  };
  const status = useFormulaStatus(shown, names, ctx.self, template, ctx.values);
  const props = {
    ref: el as React.Ref<HTMLInputElement & HTMLTextAreaElement>,
    value: shown,
    placeholder,
    className: mono ? 'mono' : undefined,
    role: 'combobox' as const,
    'aria-label': ariaLabel,
    'aria-autocomplete': 'list' as const,
    'aria-expanded': open,
    'aria-controls': open ? listId : undefined,
    'aria-activedescendant': open ? `${id}-o${active}` : undefined,
    autoComplete: 'off',
    spellCheck: false,
    onFocus: () => (focused.current = true),
    onBlur: () => {
      focused.current = false;
      setSug(null);
      if (commitOnBlur && text !== value) onChange(text);
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      put(e.target.value);
      refresh(e.target);
    },
    onClick: (e: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => refresh(e.currentTarget),
    onKeyUp: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (NAV_KEYS.has(e.key)) refresh(e.currentTarget);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (open && sug) {
        const n = sug.items.length;
        if (e.key === 'ArrowDown') return (e.preventDefault(), setActive((a) => (a + 1) % n));
        if (e.key === 'ArrowUp') return (e.preventDefault(), setActive((a) => (a + n - 1) % n));
        if (e.key === 'Enter' || e.key === 'Tab') return (e.preventDefault(), choose(sug.items[Math.min(active, n - 1)]));
        if (e.key === 'Escape') return (e.preventDefault(), setSug(null));
      }
      if (!multiline && e.key === 'Enter') (e.target as HTMLInputElement).blur();
    },
  };

  return (
    <>
      <label className={fieldClass('text-field', label, ps, multiline ? 'multiline stacked' : '')} data-prop={ps.prop} title={tipFor(label, title)}>
        {label !== undefined && <span className="field-label">
          {unbroken(label)}
          {ps.bound && <BoundMark />}
        </span>}
        {multiline ? <textarea rows={rows ?? 3} {...props} /> : <input {...props} />}
        {!multiline && <FieldTrail />}
      </label>
      <FormulaStatusLine status={status} onFix={fix} />
      {open &&
        sug &&
        createPortal(
          <div ref={pop} className="expr-pop" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: pos?.width }}>
            <ul id={listId} role="listbox" aria-label="Suggestions" onMouseDown={(e) => e.preventDefault()}>
              {sug.items.map((s, i) => (
                <li key={`${s.kind}:${s.label}`} id={`${id}-o${i}`} role="option" aria-selected={i === active} className={i === active ? 'on' : ''} onPointerEnter={() => setActive(i)} onClick={() => choose(s)}>
                  <span className="expr-name mono">{s.label}</span>
                  <span className="expr-type">{s.type}</span>
                  {s.detail && <span className="expr-detail">{s.detail}</span>}
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
      <span className="sr-only" role="status" aria-live="polite">
        {open && sug ? `${sug.items.length} suggestion${sug.items.length === 1 ? '' : 's'}, ${sug.items[Math.min(active, sug.items.length - 1)].label} ${sug.items[Math.min(active, sug.items.length - 1)].type}` : ''}
      </span>
    </>
  );
}
