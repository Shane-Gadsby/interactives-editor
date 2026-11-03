import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatColor, parseColor } from 'interactives-player';
import { HelpLink } from '../help/Help';
import { FIELD_TIPS } from './tips';

/** An explicit title, or the standard explanation for a field label. */
function tipFor(label: ReactNode, title?: string): string | undefined {
  if (title) return title;
  return typeof label === 'string' ? FIELD_TIPS[label] : undefined;
}

/** Number input whose label can be dragged left/right to scrub the value. */
export function NumberField({
  label,
  value,
  onChange,
  onCommit,
  step = 1,
  min,
  max,
  suffix,
  title,
  mixed,
}: {
  label?: ReactNode;
  value: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  title?: string;
  mixed?: boolean;
}) {
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(mixed ? '' : fmt(value));
  }, [value, mixed]);
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const commitText = () => {
    const v = evalNumber(text);
    if (v !== null) onChange(clamp(v));
    else setText(fmt(value));
    onCommit?.();
  };
  const scrub = (e: React.PointerEvent) => {
    const startX = e.clientX;
    const start = value;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const mult = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
      onChange(clamp(round(start + ((ev.clientX - startX) / 2) * step * mult, step)));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      onCommit?.();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <label className="field number-field" title={tipFor(label, title)}>
      {label !== undefined && (
        <span className="field-label scrub" onPointerDown={scrub}>
          {label}
        </span>
      )}
      <input
        value={text}
        placeholder={mixed ? 'Mixed' : undefined}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onBlur={() => {
          focused.current = false;
          commitText();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const dir = e.key === 'ArrowUp' ? 1 : -1;
            const v = clamp(round(value + dir * step * (e.shiftKey ? 10 : 1), step));
            onChange(v);
            setText(fmt(v));
          }
          e.stopPropagation();
        }}
      />
      {suffix && <span className="field-suffix">{suffix}</span>}
    </label>
  );
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '';
  return String(Math.round(v * 100) / 100);
}

function round(v: number, step: number): number {
  const places = step < 1 ? Math.ceil(-Math.log10(step)) : 0;
  const f = Math.pow(10, places);
  return Math.round(v * f) / f;
}

/** Accept simple arithmetic in number fields ("100/2", "20+5"). */
function evalNumber(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  if (!/^[\d+\-*/().\s]+$/.test(t)) return null;
  try {
    const v = Function(`"use strict"; return (${t})`)() as unknown;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  mono,
  commitOnBlur,
  rows,
  title,
}: {
  label?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  mono?: boolean;
  commitOnBlur?: boolean;
  rows?: number;
  title?: string;
}) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  const props = {
    value: commitOnBlur ? text : value,
    placeholder,
    className: mono ? 'mono' : undefined,
    onFocus: () => (focused.current = true),
    onBlur: () => {
      focused.current = false;
      if (commitOnBlur && text !== value) onChange(text);
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => (commitOnBlur ? setText(e.target.value) : onChange(e.target.value)),
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (!multiline && e.key === 'Enter') (e.target as HTMLInputElement).blur();
    },
  };
  return (
    <label className={`field text-field${multiline ? ' multiline' : ''}`} title={tipFor(label, title)}>
      {label !== undefined && <span className="field-label">{label}</span>}
      {multiline ? <textarea rows={rows ?? 3} {...props} /> : <input {...props} />}
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  title,
}: {
  label?: ReactNode;
  value: T;
  options: { value: T; label: string }[] | readonly T[];
  onChange: (v: T) => void;
  title?: string;
}) {
  const opts = (options as (T | { value: T; label: string })[]).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <label className="field select-field" title={tipFor(label, title)}>
      {label !== undefined && <span className="field-label">{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value as T)} onKeyDown={(e) => e.stopPropagation()}>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CheckField({ label, value, onChange, title }: { label: ReactNode; value: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <label className="field check-field" title={tipFor(label, title)}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** Colour swatch + hex/rgba text + opacity. */
export function ColorField({ label, value, onChange, onCommit, title }: { label?: ReactNode; value: string; onChange: (v: string) => void; onCommit?: () => void; title?: string }) {
  const rgba = parseColor(value) ?? [0, 0, 0, 1];
  const hex = formatColor([rgba[0], rgba[1], rgba[2], 1]);
  const alpha = Math.round(rgba[3] * 100);
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="field color-field">
      {label !== undefined && (
        <span className="field-label" title={tipFor(label, title)}>
          {label}
        </span>
      )}
      <span className="swatch" style={{ background: value }}>
        <input
          type="color"
          value={hex}
          onChange={(e) => {
            const c = parseColor(e.target.value)!;
            onChange(formatColor([c[0], c[1], c[2], rgba[3]]));
          }}
          onBlur={onCommit}
        />
      </span>
      <input
        className="mono color-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (parseColor(text)) onChange(text.trim());
          else setText(value);
          onCommit?.();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <input
        className="alpha"
        type="number"
        min={0}
        max={100}
        value={alpha}
        title="Opacity %"
        onChange={(e) => {
          const a = Math.max(0, Math.min(100, Number(e.target.value))) / 100;
          onChange(formatColor([rgba[0], rgba[1], rgba[2], a]));
        }}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export function Section({
  title,
  children,
  actions,
  collapsible = true,
  defaultOpen = true,
  help,
}: {
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Help topic id (or "topic#anchor") for the section's "?" link. */
  help?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`section${open ? '' : ' closed'}`}>
      <header className="section-head">
        <button className="section-title" onClick={() => collapsible && setOpen(!open)}>
          {title}
        </button>
        {help && <HelpLink topic={help.split('#')[0]} anchor={help.split('#')[1]} />}
        <div className="section-actions">{actions}</div>
      </header>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

export function IconButton({ icon, title, onClick, active, disabled, className }: { icon: ReactNode; title: string; onClick?: (e: React.MouseEvent) => void; active?: boolean; disabled?: boolean; className?: string }) {
  return (
    <button type="button" className={`icon-btn${active ? ' active' : ''}${className ? ' ' + className : ''}`} title={title} aria-label={title} onClick={onClick} disabled={disabled}>
      {icon}
    </button>
  );
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`row${className ? ' ' + className : ''}`}>{children}</div>;
}
