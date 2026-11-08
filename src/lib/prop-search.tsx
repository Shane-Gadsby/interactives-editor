import { createContext, useContext, useId, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { scoreWord, wordsOf } from '../help/search';
import { FIELD_TIPS } from '../components/tips';
import { queryVariants } from './plain-words';

/**
 * Search in the properties panel. Every row in it (a field, or a block wrapped in PropRow) carries a `data-prop` key and is
 * registered with a store while the panel is mounted, so a search never reads text off the page: it scores the rows'
 * labels, synonyms, tips and section titles, and the rows and sections that don't match hide (class `ps-hide`).
 * Outside the properties panel there is no store and the same fields just carry their key.
 */

// ---------------------------------------------------------------- what a row is called

/** What the short and symbol labels stand for. */
const NAMES: Record<string, string> = {
  W: 'Width',
  H: 'Height',
  X: 'X position',
  Y: 'Y position',
  '↻': 'Rotation',
  'α': 'Opacity',
  Sx: 'Scale W',
  Sy: 'Scale H',
  Ox: 'Pivot x',
  Oy: 'Pivot y',
};

/**
 * Other words people look a row up by, keyed by the label as the row writes it. Matched a little below the label itself.
 * A row that isn't here is still found by its label, its tip and its section.
 */
export const PROP_SYNONYMS: Record<string, string[]> = {
  'α': ['transparency', 'transparent', 'alpha', 'fade', 'see through', 'translucent'],
  Opacity: ['transparency', 'transparent', 'alpha', 'α', 'fade', 'see through', 'translucent'],
  'Scale W': ['scale', 'zoom', 'size', 'stretch', 'flip', 'sx', 'scale x', 'scale across', 'resize'],
  'Scale H': ['scale', 'zoom', 'size', 'stretch', 'flip', 'sy', 'scale y', 'scale down', 'resize'],
  Pivot: ['origin', 'anchor', 'transform origin', 'centre of rotation', 'center of rotation', 'ox', 'oy'],
  'Pivot X': ['origin x', 'anchor', 'ox'],
  'Pivot Y': ['origin y', 'anchor', 'oy'],
  Radius: ['round', 'rounded', 'corners', 'curve', 'border radius', 'roundness'],
  'Top-left': ['round', 'rounded', 'corner', 'corner radius', 'radius'],
  'Top-right': ['round', 'rounded', 'corner', 'corner radius', 'radius'],
  'Bottom-left': ['round', 'rounded', 'corner', 'corner radius', 'radius'],
  'Bottom-right': ['round', 'rounded', 'corner', 'corner radius', 'radius'],
  'Corner radius': ['round', 'rounded', 'corners', 'curve', 'border radius'],
  Description: ['alt', 'alt text', 'alternative text', 'aria label', 'aria-label', 'aria', 'screen reader', 'accessible name'],
  'Text alternative': ['alt', 'alt text', 'description', 'aria label', 'aria', 'screen reader', 'accessible name'],
  Role: ['aria role', 'aria', 'semantics', 'landmark'],
  Visible: ['hide', 'hidden', 'show', 'invisible', 'display'],
  Hidden: ['hide', 'visible', 'show', 'invisible'],
  Locked: ['lock', 'protect', 'freeze', 'unlock'],
  Colour: ['color', 'colour', 'fill', 'paint', 'hex', 'tint', 'rgb'],
  Fill: ['color', 'colour', 'paint', 'background', 'solid', 'gradient'],
  Stroke: ['outline', 'border', 'line', 'colour', 'color'],
  'Page background': ['color', 'colour', 'backdrop'],
  Background: ['color', 'colour', 'fill', 'backdrop'],
  'Draw order': ['z order', 'z-order', 'z index', 'stacking', 'layer order', 'front back', 'bring forward', 'send backward'],
  'Paint order': ['stroke over fill', 'stacking'],
  Size: ['font size', 'text size', 'point size', 'type size'],
  Font: ['typeface', 'font family', 'family'],
  Weight: ['bold', 'font weight', 'heavy', 'thickness'],
  Italic: ['slant', 'oblique'],
  Line: ['line height', 'leading', 'line spacing'],
  Letter: ['letter spacing', 'tracking', 'kerning'],
  Align: ['alignment', 'justify', 'left right centre center'],
  'V-align': ['vertical alignment', 'top middle bottom'],
  Decoration: ['underline', 'strikethrough', 'strike'],
  Case: ['uppercase', 'lowercase', 'capitalise', 'capitalize', 'title case'],
  Blend: ['blend mode', 'multiply', 'screen', 'overlay', 'mix'],
  Blur: ['soften', 'gaussian', 'feather'],
  'Layer blur': ['soften', 'gaussian', 'blur'],
  Shadow: ['drop shadow', 'glow', 'elevation'],
  Spread: ['grow shadow'],
  Gap: ['spacing', 'space between', 'gutter'],
  Spacing: ['gap', 'space between', 'gutter'],
  Padding: ['inset', 'inner space', 'margin inside'],
  Margin: ['outside space', 'outer space'],
  Layout: ['auto layout', 'flex', 'stack', 'row', 'column', 'grid'],
  Direction: ['horizontal', 'vertical', 'row', 'column', 'flow'],
  Clip: ['crop', 'mask', 'overflow', 'cut off'],
  'Clip content': ['crop', 'overflow', 'cut off', 'mask'],
  Overflow: ['scroll', 'clip', 'hidden', 'spill'],
  Fit: ['cover', 'contain', 'stretch', 'object fit', 'resize image'],
  Image: ['picture', 'photo', 'asset', 'source'],
  Crop: ['crop picture', 'reposition', 'move picture', 'focal point', 'focus', 'pan', 'cut off', 'face', 'zoom picture'],
  Zoom: ['crop', 'magnify', 'scale picture', 'closer'],
  'Picture X': ['crop', 'move picture', 'pan', 'reposition', 'focal point'],
  'Picture Y': ['crop', 'move picture', 'pan', 'reposition', 'focal point'],
  Video: ['movie', 'clip', 'asset', 'source'],
  Autoplay: ['start automatically', 'play on show'],
  Loop: ['repeat', 'again'],
  Muted: ['mute', 'sound off', 'silent', 'audio'],
  Controls: ['play pause', 'player buttons'],
  Link: ['url', 'href', 'hyperlink', 'address', 'web address'],
  URL: ['link', 'address', 'web address', 'href', 'src'],
  Cursor: ['pointer', 'mouse', 'hand'],
  'Tab stop': ['tab order', 'keyboard', 'focusable', 'tabindex', 'focus'],
  Shortcut: ['key', 'hotkey', 'keyboard', 'accelerator'],
  Name: ['title', 'called', 'rename', 'label'],
  Label: ['text', 'caption', 'title'],
  Text: ['copy', 'words', 'content', 'string', 'label'],
  Placeholder: ['hint', 'ghost text', 'empty text'],
  Variable: ['value', 'state', 'binding'],
  Rotation: ['rotate', 'angle', 'turn', 'spin', 'degrees', '↻'],
  Scale: ['zoom', 'size', 'magnify'],
  Position: ['location', 'place', 'where', 'move'],
  Seed: ['random', 'shuffle'],
  Randomize: ['random', 'shuffle', 'mix up'],
  Mode: ['type', 'kind'],
  Sizing: ['auto width', 'auto height', 'hug', 'fixed', 'resize'],
  'Fit text to box': ['auto size', 'shrink to fit', 'autofit', 'auto fit'],
  'Page title': ['browser tab', 'document title', 'head title'],
  'Respect reduced motion': ['prefers reduced motion', 'animation off', 'vestibular', 'motion sensitivity'],
  'Publish to library': ['share', 'component', 'export'],
  'Use as mask': ['clipping', 'cut out', 'crop shape'],
  'Mask mode': ['clipping', 'alpha mask', 'luminance'],
  'Close on Escape': ['dismiss', 'esc key'],
  Modal: ['dialog', 'popup', 'overlay', 'trap focus'],
  Poster: ['thumbnail', 'preview image', 'cover image'],
  Speed: ['rate', 'tempo', 'fast slow'],
  Ease: ['easing', 'curve', 'timing function'],
  Offset: ['shift', 'delay', 'nudge'],
  Dash: ['dashed', 'dotted', 'pattern'],
  Cap: ['line end', 'butt', 'round', 'square'],
  Join: ['corner style', 'miter', 'bevel'],
  Angle: ['direction', 'rotation', 'degrees'],
  Sides: ['corners', 'polygon', 'edges'],
  Points: ['star', 'spikes', 'tips'],
};

// by the label as written, lower-cased (a symbol like α has no words of its own to key on)
const normSyn = new Map<string, string[]>();
for (const [k, v] of Object.entries(PROP_SYNONYMS)) normSyn.set(k.toLowerCase(), v.map((x) => wordsOf(x).join(' ')));

/** The key a row is found by: its label, as a slug ("Corner radius" is `corner-radius`; a symbol like α is its name). */
export function propKey(label: ReactNode, explicit?: string): string {
  const raw = explicit ?? (typeof label === 'string' || typeof label === 'number' ? String(label) : '');
  const named = NAMES[raw] ?? raw;
  return wordsOf(named).join('-');
}

export interface PropEntry {
  key: string;
  label: string;
  tip?: string;
  extra?: string[];
  section?: string;
  /** Not a property row (a graph node, an artboard): none of the property names, synonyms or standard tips apply to its label. */
  plain?: boolean;
}

/** The readable name for a label (W is Width). */
export const displayName = (label: string, plain?: boolean): string => (plain ? label : (NAMES[label] ?? label));

interface Prepared {
  label: string;
  names: string[];
  tip: string;
  section: string;
}
const prepared = new WeakMap<PropEntry, Prepared>();
function prepare(e: PropEntry): Prepared {
  let p = prepared.get(e);
  if (!p) {
    const named = e.plain ? undefined : NAMES[e.label];
    const syn = [...(e.plain ? [] : (normSyn.get(e.label.toLowerCase()) ?? [])), ...(named ? (normSyn.get(named.toLowerCase()) ?? []) : []), ...(e.extra ?? []).map((x) => wordsOf(x).join(' '))];
    p = {
      label: wordsOf(e.label).join(' '),
      names: [...(named ? [wordsOf(named).join(' ')] : []), ...syn].filter(Boolean),
      tip: wordsOf(e.tip ?? (e.plain ? '' : FIELD_TIPS[e.label]) ?? '').join(' '),
      section: wordsOf(e.section ?? '').join(' '),
    };
    prepared.set(e, p);
  }
  return p;
}

// ---------------------------------------------------------------- scoring

/**
 * How well a row matches what was typed, 0 for not at all. Every word has to match something (in any order); a word's score is
 * its best field: the label itself (see scoreWord, up to 100), a synonym or the name a symbol stands for (a little less), the
 * section's title (half) or the tip (a third). Typos and letters-in-order only count against labels and synonyms.
 */
export function scoreEntry(query: string, entry: PropEntry): number {
  // "artboard" finds what is worded "page" and the other way round
  // (the other wording counts for less, so it finds what is only worded that way without crowding what the query says)
  const [as, other] = queryVariants(query);
  const direct = scoreOne(as, entry);
  return other ? Math.max(direct, scoreOne(other, entry) * 0.6) : direct;
}

function scoreOne(query: string, entry: PropEntry): number {
  const qw = wordsOf(query);
  if (!qw.length) return 0;
  const p = prepare(entry);
  const whole = qw.join(' ');
  // the whole phrase against a label or a multi-word synonym ("z order", "corner radius")
  let phrase = 0;
  if (qw.length > 1 || whole.length > 1) {
    phrase = scoreWord(whole, p.label);
    for (const n of p.names) phrase = Math.max(phrase, scoreWord(whole, n) * 0.92);
  }
  let sum = 0;
  for (const w of qw) {
    let best = scoreWord(w, p.label);
    for (const n of p.names) best = Math.max(best, scoreWord(w, n) * 0.92);
    if (p.section) best = Math.max(best, scoreWord(w, p.section, false) >= 75 ? 50 : 0);
    if (p.tip && w.length >= 3) best = Math.max(best, scoreWord(w, p.tip, false) * 0.3);
    if (!best) {
      sum = 0;
      break;
    }
    sum += best;
  }
  return Math.max(phrase, qw.length ? sum / qw.length : 0);
}

/**
 * The items that match what was typed, best first, each read as a PropEntry. An item stays when it scores at least half of the
 * best one. Nothing typed is every item, in the order given. Anything that searches by name (graph nodes, artboards, a menu of
 * nodes) goes through this, so they all rank alike.
 */
export function rankEntries<T>(query: string, items: T[], entryOf: (item: T) => PropEntry): T[] {
  if (!query.trim()) return items;
  const scored = items.map((item, i) => ({ item, i, score: scoreEntry(query, entryOf(item)) })).filter((x) => x.score > 0);
  const best = Math.max(0, ...scored.map((x) => x.score));
  return scored
    .filter((x) => x.score >= best * KEEP_SHARE)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.item);
}

/** Closest single-word match to anything in the panel, for "did you mean" when nothing matches. */
export function suggest(query: string, entries: PropEntry[]): string | null {
  const qw = wordsOf(query).filter((w) => w.length >= 3);
  if (!qw.length) return null;
  let best = 0;
  let name: string | null = null;
  for (const e of entries) {
    const p = prepare(e);
    let s = 0;
    for (const w of qw) {
      let b = scoreWord(w, p.label);
      for (const n of p.names) b = Math.max(b, scoreWord(w, n) * 0.92);
      s = Math.max(s, b);
    }
    if (s > best) {
      best = s;
      name = displayName(e.label, e.plain);
    }
  }
  return best >= 18 ? name : null;
}

// ---------------------------------------------------------------- the store

interface Reg {
  entry: PropEntry;
  sectionId: string;
  score: number;
}
interface SectionReg {
  title: string;
}

/** A row stays when it scores at least this share of the best one, so an exact "opacity" doesn't also bring in every vague hit. */
export const KEEP_SHARE = 0.5;
const KEEP = KEEP_SHARE;

export class PropSearchStore {
  query = '';
  version = 0;
  private rows = new Map<string, Reg>();
  private sections = new Map<string, SectionReg>();
  private subs = new Set<() => void>();
  private shown = new Set<string>();
  private sectionBest = new Map<string, number>();
  private sectionHits = new Map<string, number>();
  private sectionTitleHit = new Map<string, boolean>();
  private scheduled = false;
  count = 0;
  suggestion: string | null = null;

  subscribe = (fn: () => void) => {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  };
  getVersion = () => this.version;

  setQuery(q: string) {
    if (q === this.query) return;
    this.query = q;
    this.flush();
  }
  register(id: string, entry: PropEntry, sectionId: string) {
    this.rows.set(id, { entry, sectionId, score: 0 });
    this.schedule();
  }
  unregister(id: string) {
    if (this.rows.delete(id)) this.schedule();
  }
  registerSection(id: string, title: string) {
    this.sections.set(id, { title });
    this.schedule();
  }
  unregisterSection(id: string) {
    if (this.sections.delete(id)) this.schedule();
  }
  /** Registered rows, for the audit and the "did you mean". */
  entries(): PropEntry[] {
    return [...this.rows.values()].map((r) => r.entry);
  }

  // rows and sections register in layout effects while React commits; one microtask later (before anything paints) the lot is scored once
  private schedule() {
    if (this.scheduled || !this.query) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.flush();
    });
  }
  private flush() {
    const q = this.query;
    this.shown.clear();
    this.sectionBest.clear();
    this.sectionHits.clear();
    this.sectionTitleHit.clear();
    this.count = 0;
    this.suggestion = null;
    if (q) {
      let best = 0;
      for (const r of this.rows.values()) {
        r.score = scoreEntry(q, { ...r.entry, section: this.sections.get(r.sectionId)?.title });
        best = Math.max(best, r.score);
      }
      for (const [id, r] of this.rows) {
        if (r.score > 0 && r.score >= best * KEEP) {
          this.shown.add(id);
          this.count++;
          this.sectionHits.set(r.sectionId, (this.sectionHits.get(r.sectionId) ?? 0) + 1);
          this.sectionBest.set(r.sectionId, Math.max(this.sectionBest.get(r.sectionId) ?? 0, r.score));
        }
      }
      for (const [id, s] of this.sections) this.sectionTitleHit.set(id, scoreEntry(q, { key: '', label: s.title }) >= 65);
      if (!this.count) this.suggestion = suggest(q, this.entries());
    }
    this.version++;
    for (const fn of this.subs) fn();
  }

  /** Whether a row shows. A row that hasn't registered yet shows (it will be scored before the next paint). */
  visible(id: string): boolean {
    if (!this.query) return true;
    return this.shown.has(id) || !this.rows.has(id);
  }
  /** What the section does for the current search: `hidden`, whether it was asked for by name, and where it goes in the order. */
  section(id: string): { hidden: boolean; hit: boolean; best: number } {
    if (!this.query) return { hidden: false, hit: false, best: 0 };
    const hit = this.sectionTitleHit.get(id) ?? false;
    const hits = this.sectionHits.get(id) ?? 0;
    const known = this.sections.has(id);
    return { hidden: known && hits === 0 && !hit, hit, best: hit ? Math.max(100, this.sectionBest.get(id) ?? 0) : (this.sectionBest.get(id) ?? 0) };
  }
}

const Ctx = createContext<PropSearchStore | null>(null);
const SecCtx = createContext<{ id: string; title: string } | null>(null);
/** The PropRow a field sits in, for a field with no label of its own. */
const RowCtx = createContext<{ key: string; label: string } | null>(null);
const idleStore = { subscribe: () => () => undefined, getVersion: () => 0 };

export const PropSearchProvider = Ctx.Provider;
export const usePropStore = (): PropSearchStore | null => useContext(Ctx);

/** Re-renders when the search changes. */
export function usePropSearchVersion(): void {
  const store = useContext(Ctx) ?? idleStore;
  useSyncExternalStore(store.subscribe, store.getVersion);
}

/** A Section's side of it: register its title, say whether to hide or open, and where it sorts. */
export function useSectionSearch(title: ReactNode): { id: string; searching: boolean; hidden: boolean; hit: boolean; order: number } {
  const store = useContext(Ctx);
  const id = useId();
  usePropSearchVersion();
  const text = typeof title === 'string' ? title : '';
  useLayoutEffect(() => {
    if (!store) return;
    store.registerSection(id, text);
    return () => store.unregisterSection(id);
  }, [store, id, text]);
  const searching = !!store?.query;
  const s = store ? store.section(id) : { hidden: false, hit: false, best: 0 };
  return { id, searching, hidden: s.hidden, hit: s.hit, order: searching ? -Math.round(s.best) : 0 };
}

/** The section a row sits in. */
export function SectionScope({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const value = useMemo(() => ({ id, title }), [id, title]);
  return <SecCtx.Provider value={value}>{children}</SecCtx.Provider>;
}

/**
 * A row's side of it: its `data-prop` key and whether it is hidden by the current search. Fields call this with their label,
 * their own tooltip and (for a label that isn't text) an explicit key.
 */
export function useRowSearch(label: ReactNode, tip?: string, explicit?: string, extra?: string[]): { prop: string; hide: boolean } {
  const store = useContext(Ctx);
  const sec = useContext(SecCtx);
  const id = useId();
  usePropSearchVersion();
  const row = useContext(RowCtx);
  let key = propKey(label, explicit);
  let text = typeof label === 'string' ? label : (explicit ?? '');
  // no label of its own: the block it sits in, else the first words of its tip
  if (!key && row) [key, text] = [row.key, row.label];
  if (!key && tip) key = text = wordsOf(tip).slice(0, 4).join('-');
  const extraKey = extra?.join('|') ?? '';
  useLayoutEffect(() => {
    if (!store) return;
    store.register(id, { key, label: text || key, tip, extra: extraKey ? extraKey.split('|') : undefined }, sec?.id ?? '');
    return () => store.unregister(id);
  }, [store, id, key, text, tip, extraKey, sec?.id]);
  return { prop: key, hide: !!store && !store.visible(id) };
}

/** A block in the properties panel that isn't one of the standard fields (a picker, a list, a button row), given its key and words. */
export function PropRow({ k, label, tip, words, className, children }: { k: string; label?: string; tip?: string; words?: string[]; className?: string; children: ReactNode }) {
  const { prop, hide } = useRowSearch(label ?? k, tip, k, words);
  return (
    <div className={`prop-row${className ? ' ' + className : ''}${hide ? ' ps-hide' : ''}`} data-prop={prop}>
      <RowScope k={prop} label={label ?? k}>
        {children}
      </RowScope>
    </div>
  );
}

/** Fields inside a block with its own key (a run editor, a list) that have no label take the block's. */
export function RowScope({ k, label, children }: { k: string; label: string; children: ReactNode }) {
  const value = useMemo(() => ({ key: k, label }), [k, label]);
  return <RowCtx.Provider value={value}>{children}</RowCtx.Provider>;
}
