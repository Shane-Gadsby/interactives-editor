import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatColor, isTokenRef, parseColor, type Project } from 'interactives-player';
import { HelpLink } from '../help/Help';
import { paletteTip, usePalette } from '../lib/palette';
import { Icons } from './icons';
import { TokensTab, tokenSummary, linked, useBrandLocked, useThemeState } from './TokenPicker';
import { FIELD_TIPS } from './tips';
import { useRowSearch, useSectionSearch, RowScope, SectionScope } from '../lib/prop-search';
import { ContextMenu } from './ContextMenu';
import { isSectionOpen, onlySectionOpen, registerSection, resetSectionFolds, sectionKey, setAllSections, setSectionOpen, useSectionFoldVersion } from '../lib/section-fold';

/** An explicit title, or the standard explanation for a field label. */
export function tipFor(label: ReactNode, title?: string): string | undefined {
  if (title) return title;
  return typeof label === 'string' ? FIELD_TIPS[label] : undefined;
}

/** A field label that never breaks after a hyphen ("V-align" would wrap to "V-" and "align" in a tight row). */
export const unbroken = (label: ReactNode): ReactNode => (typeof label === 'string' ? label.replace(/-/g, '\u2011') : label);

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
  scale = 1,
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
  /** What the stored value is multiplied by to show it (100 for an opacity kept as 0 to 1, shown as a percent). `step`, `min` and `max` are in the shown units, and `onChange` still gets the stored value. */
  scale?: number;
}) {
  const ps = useRowSearch(label, tipFor(label, title));
  // shown units from here on; what goes out is turned back into the stored ones
  const stored = onChange;
  if (scale !== 1) {
    value = Math.round(value * scale * 1e6) / 1e6;
    onChange = (v) => stored(Math.round((v / scale) * 1e6) / 1e6);
  }
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
    <label className={`field number-field${ps.hide ? ' ps-hide' : ''}`} data-prop={ps.prop} title={tipFor(label, title)}>
      {label !== undefined && (
        <span className="field-label scrub" onPointerDown={scrub}>
          {unbroken(label)}
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

/**
 * A number in px or percent, for auto-layout padding, margin and gap. Type "10%" or "10px" to pick the unit, or press the unit
 * button. With `ownerW` (the width a percent is a share of) switching units keeps the size: 20 px of 400 becomes 5%.
 */
export function UnitField({
  label,
  value,
  unit,
  onChange,
  ownerW,
  min,
  mixed,
  title,
}: {
  label?: ReactNode;
  value: number;
  unit: 'px' | 'percent';
  onChange: (v: number, unit: 'px' | 'percent') => void;
  ownerW?: number;
  min?: number;
  mixed?: boolean;
  title?: string;
}) {
  const ps = useRowSearch(label, tipFor(label, title));
  const shown = (v: number, u: 'px' | 'percent') => (mixed ? '' : fmt(v) + (u === 'percent' ? '%' : ''));
  const [text, setText] = useState(shown(value, unit));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(shown(value, unit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, unit, mixed]);
  const clamp = (v: number) => Math.max(min ?? -Infinity, v);
  const commitText = () => {
    const m = /^(.*?)\s*(%|px)?\s*$/i.exec(text.trim());
    const v = m ? evalNumber(m[1]) : null;
    if (v === null) {
      setText(shown(value, unit));
      return;
    }
    const u = m![2] ? (m![2] === '%' ? 'percent' : 'px') : unit;
    onChange(clamp(v), u);
  };
  const toggle = () => {
    const to = unit === 'percent' ? 'px' : 'percent';
    const owner = ownerW && ownerW > 0 ? ownerW : 0;
    // Keep what it comes to now when the width is known
    const v = owner ? (to === 'percent' ? (value / owner) * 100 : (value / 100) * owner) : value;
    onChange(clamp(Math.round(v * 100) / 100), to);
  };
  return (
    <label className={`field number-field unit-field${ps.hide ? ' ps-hide' : ''}`} data-prop={ps.prop} title={tipFor(label, title)}>
      {label !== undefined && <span className="field-label">{unbroken(label)}</span>}
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
            const v = clamp(Math.round((value + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)) * 100) / 100);
            onChange(v, unit);
            setText(shown(v, unit));
          }
          e.stopPropagation();
        }}
      />
      <button
        type="button"
        className={`unit-toggle${unit === 'percent' ? ' on' : ''}`}
        title={unit === 'percent' ? 'A percent of the width around it. Click for px' : 'In px. Click for a percent of the width around it (or type 10%)'}
        aria-label={unit === 'percent' ? 'Unit: percent. Switch to px' : 'Unit: px. Switch to percent'}
        onClick={toggle}
      >
        {unit === 'percent' ? '%' : 'px'}
      </button>
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
  onInput,
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
  /** Every keystroke, even with commitOnBlur (for a live warning about text that is not committed yet) */
  onInput?: (v: string) => void;
}) {
  const ps = useRowSearch(label, tipFor(label, title));
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
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onInput?.(e.target.value);
      if (commitOnBlur) setText(e.target.value);
      else onChange(e.target.value);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (!multiline && e.key === 'Enter') (e.target as HTMLInputElement).blur();
    },
  };
  // A long label would squeeze its own box to nothing at the inspector's width, so it goes above it, like a text area's
  const stacked = multiline || (typeof label === 'string' && label.length > 14);
  return (
    <label className={`field text-field${stacked ? ' multiline' : ''}${ps.hide ? ' ps-hide' : ''}`} data-prop={ps.prop} title={tipFor(label, title)}>
      {label !== undefined && <span className="field-label">{unbroken(label)}</span>}
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
  disabled,
}: {
  label?: ReactNode;
  value: T;
  options: { value: T; label: string }[] | readonly T[];
  onChange: (v: T) => void;
  title?: string;
  disabled?: boolean;
}) {
  const ps = useRowSearch(label, tipFor(label, title));
  const opts = (options as (T | { value: T; label: string })[]).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <label className={`field select-field${ps.hide ? ' ps-hide' : ''}`} data-prop={ps.prop} title={tipFor(label, title)}>
      {label !== undefined && <span className="field-label">{unbroken(label)}</span>}
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)} onKeyDown={(e) => e.stopPropagation()}>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CheckField({ label, value, onChange, title, disabled }: { label: ReactNode; value: boolean; onChange: (v: boolean) => void; title?: string; disabled?: boolean }) {
  const ps = useRowSearch(label, tipFor(label, title));
  return (
    <label className={`field check-field${ps.hide ? ' ps-hide' : ''}`} data-prop={ps.prop} title={tipFor(label, title)}>
      <input type="checkbox" checked={value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/**
 * The toolbox palette as a popover of swatches, grouped and named (the name is the tooltip).
 * Renders nothing when the palette stylesheet didn't load, so the picker is just the picker.
 * `onPick` gets a plain colour value; nothing refers back to the stylesheet.
 */
export function PaletteButton({ value, onPick, tokenTab, tokensOnly = false }: { value: string; onPick: (v: string) => void; tokenTab?: { ts: { project: Project; canvasTheme: string | null }; onToken: (ref: string) => void }; tokensOnly?: boolean }) {
  // A branded project's picker is its tokens and nothing else
  const palette = usePalette();
  const groups = tokensOnly ? [] : palette;
  const [open, setOpen] = useState(false);
  // The picker has two tabs when layers can follow theme tokens: the palette, and the project's tokens
  const [tab, setTab] = useState<'palette' | 'tokens'>(() => (tokenTab && (!groups.length || isTokenRef(value)) ? 'tokens' : 'palette'));
  const [hover, setHover] = useState('');
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = pop.current?.offsetHeight ?? 320;
    const w = 244;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
    const below = r.bottom + 4;
    setPos({ left, top: below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : below });
  }, [open, groups]);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key, true);
    const close = () => setOpen(false);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('resize', close);
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [open]);
  if (!groups.length && !tokenTab) return null;
  // Closing after a pick: a keyboard pick had the focus inside the box, which is about to go, so it goes back to the button
  const done = () => {
    const had = !!pop.current?.contains(document.activeElement);
    setOpen(false);
    if (had) btn.current?.focus();
  };
  const current = parseColor(value);
  const same = (v: string) => {
    const c = parseColor(v);
    return !!c && !!current && c[0] === current[0] && c[1] === current[1] && c[2] === current[2];
  };
  return (
    <>
      <button ref={btn} type="button" className={`palette-btn${open ? ' open' : ''}`} title={tokenTab ? 'Toolbox palette and theme tokens: pick one of the suite\'s colours, or a colour that follows the theme' : 'Toolbox palette: pick one of the suite\'s colours'} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icons.chevronDown />
      </button>
      {open &&
        createPortal(
          <div ref={pop} className="palette-pop" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }} role="dialog" aria-label={tokenTab ? 'Colour picker' : 'Toolbox palette'} onKeyDown={(e) => e.stopPropagation()}>
            {tokenTab ? (
              <div className="tabs picker-tabs" role="tablist">
                {groups.length > 0 && (
                  <button role="tab" aria-selected={tab === 'palette'} className={tab === 'palette' ? 'active' : ''} onClick={() => setTab('palette')} title="The suite's own colours">
                    Palette
                  </button>
                )}
                <button role="tab" aria-selected={tab === 'tokens'} className={tab === 'tokens' ? 'active' : ''} onClick={() => setTab('tokens')} title="Colours that change with the theme (Light, Dark, High contrast)">
                  Tokens
                </button>
              </div>
            ) : (
              <div className="palette-head">Toolbox palette</div>
            )}
            {tokenTab && tab === 'tokens' && (
              <TokensTab
                ts={tokenTab.ts}
                value={value}
                onPick={(ref) => {
                  tokenTab.onToken(ref);
                  done();
                }}
              />
            )}
            {(!tokenTab || tab === 'palette') && groups.map((g) => (
              <div key={g.id} className="palette-group">
                <div className="palette-group-title">{g.title}</div>
                <div className="palette-swatches">
                  {g.colors.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      className={`palette-swatch${same(c.value) ? ' on' : ''}`}
                      style={{ background: c.value }}
                      title={paletteTip(c)}
                      aria-label={`${c.label} ${c.value}`}
                      onMouseEnter={() => setHover(`${c.label}  ${c.value}`)}
                      onFocus={() => setHover(`${c.label}  ${c.value}`)}
                      onClick={() => {
                        onPick(c.value);
                        done();
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
            {(!tokenTab || tab === 'palette') && <div className="palette-foot">{hover || 'Hover a swatch for its name'}</div>}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Colour swatch + hex/rgba text + opacity. */
export function ColorField({ label, value, onChange, onCommit, title, tokens = false }: { label?: ReactNode; value: string; onChange: (v: string) => void; onCommit?: () => void; title?: string; tokens?: boolean }) {
  const ps = useRowSearch(label, tipFor(label, title));
  // With `tokens` the picker has a Tokens tab, and a colour that says `token:<id>` shows as a named chip that follows the theme
  const ts = useThemeState();
  // A layer colour in a branded starter project (lock on) takes theme tokens only: no hex box, no native picker, no palette, no detaching
  const lockOn = useBrandLocked();
  const locked = lockOn && tokens;
  const link = tokens || locked ? linked(ts, value) : null;
  const rgba = parseColor(link ? link.shown : value) ?? [0, 0, 0, 1];
  const hex = formatColor([rgba[0], rgba[1], rgba[2], 1]);
  const alpha = Math.round(rgba[3] * 100);
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const tokenTab = (tokens || locked) && ts ? { ts, onToken: (ref: string) => (onChange(ref), onCommit?.()) } : undefined;
  if (link) {
    return (
      <div className={`field color-field linked${ps.hide ? ' ps-hide' : ''}`} data-prop={ps.prop}>
        {label !== undefined && (
          <span className="field-label" title={tipFor(label, title)}>
            {label}
          </span>
        )}
        <span className="swatch linked" style={{ background: link.shown }} title={link.token ? `Follows ${link.token.name}: changes with the theme` : 'Follows a token that no longer exists'}>
          <Icons.link width={9} height={9} />
        </span>
        <PaletteButton value={value} onPick={(v) => (onChange(v), onCommit?.())} tokenTab={tokenTab} tokensOnly={locked} />
        <span className={`token-chip${link.token ? '' : ' missing'}`} title={link.token ? `Follows the token ${link.token.name}${ts ? ` (${tokenSummary(ts.project, link.token)})` : ''}. Edit its colours in the Themes panel` : 'This token was deleted. Detach it to keep the colour'}>
          <span className="token-chip-name">{link.token?.name ?? 'missing token'}</span>
          {!locked && (
          <button
            type="button"
            className="token-detach"
            title="Detach: keep the colour as it is now, as a plain colour that no longer follows the theme"
            aria-label="Detach from the token"
            onClick={() => {
              onChange(formatColor(parseColor(link.shown) ?? [0, 0, 0, 1]));
              onCommit?.();
            }}
          >
            <Icons.close width={9} height={9} />
          </button>
          )}
        </span>
      </div>
    );
  }
  if (locked && tokenTab) {
    return (
      <div className={`field color-field linked${ps.hide ? ' ps-hide' : ''}`} data-prop={ps.prop}>
        {label !== undefined && (
          <span className="field-label" title={tipFor(label, title)}>
            {label}
          </span>
        )}
        <span className="swatch" style={{ background: value }} title="Not a theme colour. Pick one from the Tokens tab" />
        <PaletteButton value={value} onPick={() => undefined} tokenTab={tokenTab} tokensOnly />
        <span className="muted small">Theme colours only</span>
      </div>
    );
  }
  return (
    <div className={`field color-field${ps.hide ? ' ps-hide' : ''}`} data-prop={ps.prop}>
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
      <PaletteButton
        value={value}
        tokenTab={tokenTab}
        onPick={(v) => {
          // Keeps the opacity already set, like the native picker does
          const c = parseColor(v)!;
          onChange(formatColor([c[0], c[1], c[2], rgba[3]]));
          onCommit?.();
        }}
      />
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
  id,
}: {
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Help topic id (or "topic#anchor") for the section's "?" link. */
  help?: string;
  /** What the fold memory keys on when the title isn't plain text (a count in it, say) or two sections share a title. */
  id?: string;
}) {
  const key = collapsible ? sectionKey(id, title) : '';
  useSectionFoldVersion();
  const open = collapsible ? isSectionOpen(key, defaultOpen) : defaultOpen;
  const setOpen = (o: boolean) => (collapsible ? setSectionOpen(key, o, defaultOpen) : undefined);
  useLayoutEffect(() => (key ? registerSection(key, defaultOpen) : undefined), [key, defaultOpen]);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const ps = useSectionSearch(title);
  // While searching every section opens, so its rows are there to be matched; the ones with no match hide
  const shown = open || ps.searching;
  const titleText = typeof title === 'string' ? title : '';
  return (
    <section className={`section${shown ? '' : ' closed'}${ps.hidden ? ' ps-hide' : ''}${ps.hit ? ' ps-hit' : ''}`} style={ps.searching ? { order: ps.order } : undefined} data-section={key || undefined} data-help={help} data-section-title={titleText || undefined}>
      <header className="section-head">
        <div
          className="section-title-row"
          onClick={(e) => {
            if (!collapsible) return;
            if (e.altKey) onlySectionOpen(key);
            else setOpen(!open);
          }}
          onContextMenu={(e) => {
            if (!collapsible) return;
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          <button className="section-title" aria-expanded={collapsible ? shown : undefined} title={collapsible ? `${open ? 'Collapse' : 'Expand'} (Alt-click: only this one open. Right-click: fold or unfold them all)` : undefined}>
            {/* the chevron says it folds, and which way it is now: pointing down when open, right when closed */}
            {collapsible && <span className="section-chev" aria-hidden="true" />}
            {title}
          </button>
          {help && <HelpLink topic={help.split('#')[0]} anchor={help.split('#')[1]} />}
        </div>
        {/* Adding something (the + buttons) opens the section so it can be seen */}
        <div className="section-actions" onClickCapture={() => setOpen(true)}>
          {actions}
        </div>
      </header>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Fold all sections', onClick: () => setAllSections(false) },
            { label: 'Unfold all sections', onClick: () => setAllSections(true) },
            { label: 'Only this one open', hint: 'Alt-click', onClick: () => onlySectionOpen(key) },
            { separator: true },
            { label: 'Back to the default folds', onClick: resetSectionFolds },
          ]}
        />
      )}
      {shown && (
        <div className="section-body">
          <SectionScope id={ps.id} title={titleText}>
            {children}
          </SectionScope>
        </div>
      )}
    </section>
  );
}

export function IconButton({ icon, title, onClick, active, disabled, className, pressed, onContextMenu, popup, expanded }: { icon: ReactNode; title: string; onClick?: (e: React.MouseEvent) => void; active?: boolean; disabled?: boolean; className?: string; pressed?: boolean; onContextMenu?: (e: React.MouseEvent) => void; popup?: 'menu'; expanded?: boolean }) {
  return (
    <button type="button" className={`icon-btn${active ? ' active' : ''}${className ? ' ' + className : ''}`} title={title} aria-label={title} aria-pressed={pressed} aria-haspopup={popup} aria-expanded={popup ? !!expanded : undefined} onClick={onClick} onContextMenu={onContextMenu} disabled={disabled}>
      {icon}
    </button>
  );
}

/** A line of controls. With `k` it is a row of its own in the properties search (for a row of buttons: its name and the words it is looked up by). */
export function Row({ children, className, k, words }: { children: ReactNode; className?: string; k?: string; words?: string[] }) {
  if (k)
    return (
      <KeyedRow k={k} words={words} className={className}>
        {children}
      </KeyedRow>
    );
  return <div className={`row${className ? ' ' + className : ''}`}>{children}</div>;
}

function KeyedRow({ k, words, className, children }: { k: string; words?: string[]; className?: string; children: ReactNode }) {
  const ps = useRowSearch(k, undefined, k, words);
  return (
    <div className={`row${className ? ' ' + className : ''}${ps.hide ? ' ps-hide' : ''}`} data-prop={ps.prop}>
      <RowScope k={ps.prop} label={k}>
        {children}
      </RowScope>
    </div>
  );
}
