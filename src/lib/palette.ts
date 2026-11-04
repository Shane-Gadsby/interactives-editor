import { useEffect, useState } from 'react';
import { parseColor } from 'interactives-player';

/**
 * The toolbox palette: the colours si-studydesk-styles publishes as CSS custom properties in /styles/palette.min.css.
 * The editor reads that stylesheet at runtime, so a change to the palette shows up here without a rebuild.
 * Picking a colour stores a plain value on the layer; nothing that is exported refers back to the stylesheet.
 *
 * Display names: see the comment above PALETTE_NAME_FORMAT below.
 */

export interface PaletteColor {
  /** The custom property, e.g. --ilar-swatch-yellow */
  name: string;
  /** Readable name for tooltips, e.g. "Yellow": the stylesheet's name comment when it has one, else made from the property name */
  label: string;
  /** True when the label came from a name comment */
  named?: boolean;
  /** Plain colour value (hex or rgb) */
  value: string;
  /** Other properties that resolve to the same colour in this group */
  aliases: string[];
}

export interface PaletteGroup {
  id: string;
  title: string;
  colors: PaletteColor[];
}

// Display names. A colour is called after its custom property (--ilar-swatch-yellow-dark is "Yellow dark") unless the
// stylesheet gives it a name in a comment with three or more stars each side: /***name: Gold***/
// The comment belongs to the declaration it sits on the same line as, written after it:
//     --feature-colour-gold: var(--ilar-swatch-yellow); /***name: Gold***/
// or, when it is on a line of its own, to the declaration on the next line:
//     /***name: Gold***/
//     --feature-colour-gold: var(--ilar-swatch-yellow);
// Comments with fewer stars are ordinary comments and ignored. The name replaces the readable label on the swatch's tooltip
// (the property name is still listed there). A blank name falls back to the property's name.
//
// csso, the minifier si-studydesk-styles runs, strips every comment from palette.min.css, even /*! */ ones inside a
// rule (it only keeps them at the top of the sheet), so the names can only be read from the unminified palette.css
// that the same server serves at /styles/palette.css. The editor loads that first and falls back to palette.min.css,
// which has the colours and never the names.
/** Where the stylesheet is served from, through haproxy on the same host */
export const PALETTE_URL = '/styles/palette.min.css';
/** The unminified source beside it, the only one that still has the name comments */
export const PALETTE_SOURCE_URL = '/styles/palette.css';

const GROUPS: { id: string; title: string }[] = [
  { id: 'brand', title: 'Brand colours' },
  { id: 'greys', title: 'Greys' },
  { id: 'links', title: 'Links and status' },
  { id: 'feature', title: 'Feature colours' },
  { id: 'gradients', title: 'Gradient stops' },
  { id: 'roles', title: 'Roles and buttons' },
];

const MAX_NAME = 60;
// /***name: Gold***/ : three or more stars each side, so an ordinary comment that starts with "name:" is left alone
const NAME_COMMENT = /^\/\*{3,}\s*name\s*:([^*]*?)\s*\*{3,}\/$/i;
const MARK = '\u0001';

/** The name a comment gives, or null when it is not a name comment (or the name is blank) */
export function nameFromComment(comment: string): string | null {
  const m = NAME_COMMENT.exec(comment);
  const name = m?.[1].trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
  return name || null;
}

/** Every `--name: value` declared in a :root rule, later declarations winning. */
export function parseCustomProperties(css: string): Map<string, string> {
  return parseDeclarations(css).props;
}

/** The properties and, for each one a name comment belongs to, its display name. */
export function parseDeclarations(css: string): { props: Map<string, string>; names: Map<string, string> } {
  const props = new Map<string, string>();
  const names = new Map<string, string>();
  // Name comments become a marker (so they survive the rest of the parse, newlines around them included); other comments go
  const found: string[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) => {
    const n = nameFromComment(c);
    if (n === null) return ' ';
    found.push(n);
    return `${MARK}${found.length - 1}${MARK}`;
  });
  const marks = (chunk: string) => [...chunk.matchAll(new RegExp(`${MARK}(\\d+)${MARK}`, 'g'))].map((m) => found[Number(m[1])]);
  for (const rule of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!rule[1].split(',').some((sel) => sel.trim() === ':root')) continue;
    // Split on semicolons that are not inside brackets
    let depth = 0;
    let cur = '';
    const decls: string[] = [];
    for (const ch of rule[2]) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ';' && depth === 0) {
        decls.push(cur);
        cur = '';
      } else cur += ch;
    }
    decls.push(cur);
    let previous: string | null = null;
    const blank = new RegExp(`^(?:\\s|${MARK}\\d+${MARK})*$`);
    const custom = new RegExp(`^((?:\\s|${MARK}\\d+${MARK})*)(--[\\w-]+)\\s*:([\\s\\S]*?)\\s*(?:!important)?\\s*$`);
    for (const d of decls) {
      const m = custom.exec(d);
      if (!m) {
        // Only comments after the last declaration: on its line they name it. Any other declaration ends the run.
        if (previous && blank.test(d)) for (const n of marks(d.split('\n')[0])) names.set(previous, n);
        else if (!blank.test(d)) previous = null;
        continue;
      }
      const [, lead, name, rest] = m;
      // Before this declaration: what is on the previous declaration's line names that one, what is on later lines names this one
      const nl = lead.indexOf('\n');
      const sameLine = nl === -1 ? lead : lead.slice(0, nl);
      const ownLines = nl === -1 ? '' : lead.slice(nl);
      if (previous) for (const n of marks(sameLine)) names.set(previous, n);
      const mine = [...marks(ownLines), ...(previous ? [] : marks(sameLine)), ...marks(rest)];
      if (mine.length) names.set(name, mine[mine.length - 1]);
      const value = rest.replace(new RegExp(`${MARK}\\d+${MARK}`, 'g'), '').trim();
      if (value) {
        props.set(name, value);
        previous = name;
      }
    }
  }
  return { props, names };
}

/** Replaces var(--x, fallback) with what it points at. Null when it can't be settled (a loop, or an unknown property with no fallback). */
function resolveValue(value: string, props: Map<string, string>, seen: string[] = []): string | null {
  let failed = false;
  // Innermost var() first, so nested fallbacks work
  let out = value;
  for (let guard = 0; guard < 20 && /var\(/.test(out); guard++) {
    out = out.replace(/var\(\s*(--[\w-]+)\s*(?:,([^()]*))?\)/g, (_all, name: string, fallback?: string) => {
      if (seen.includes(name)) {
        failed = true;
        return '';
      }
      const target = props.get(name);
      if (target !== undefined) {
        const r = resolveValue(target, props, [...seen, name]);
        if (r === null) failed = true;
        return r ?? '';
      }
      if (fallback !== undefined) return fallback.trim();
      failed = true;
      return '';
    });
    if (failed) return null;
  }
  return failed ? null : out.trim();
}

/** A plain colour the editor can store: hex, or rgb()/rgba() with plain numbers. Anything else (gradients, relative colours, transparent) is left out. */
function plainColor(v: string): string | null {
  const s = v.trim();
  if (!/^#[0-9a-f]{3,8}$/i.test(s) && !/^rgba?\(\s*[\d.%\s,/]+\)$/i.test(s)) return null;
  const c = parseColor(s);
  if (!c || c[3] <= 0) return null;
  return s.toLowerCase();
}

function titleCase(words: string): string {
  const s = words.replace(/-/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function classify(name: string): { group: string; label: string } {
  let m = /^--ilar-swatch-(.+)$/.exec(name);
  if (m) {
    const key = m[1];
    if (/^grey|^off-white/.test(key)) return { group: 'greys', label: titleCase(key.replace(/^grey-(\d)/, 'grey $1')) };
    if (/^hyperlink|^error/.test(key)) return { group: 'links', label: titleCase(key) };
    return { group: 'brand', label: titleCase(key) };
  }
  m = /^--feature-colour-(.+)$/.exec(name);
  if (m) return { group: 'feature', label: titleCase(m[1]) };
  m = /^--([a-z]+)-gradient-([12])$/.exec(name);
  if (m) return { group: 'gradients', label: `${titleCase(m[1])} gradient ${m[2] === '1' ? 'start' : 'end'}` };
  return { group: 'roles', label: titleCase(name.replace(/^--(ilar-)?/, '')) };
}

/** Turns the stylesheet text into named, grouped colours. Empty when it holds none (an error page, another stylesheet, an empty file). */
export function parsePaletteCss(css: string): PaletteGroup[] {
  const { props, names } = parseDeclarations(css);
  const groups = new Map<string, PaletteGroup>(GROUPS.map((g) => [g.id, { ...g, colors: [] }]));
  const shownAlready = new Map<string, PaletteColor>();
  for (const [name, raw] of props) {
    const resolved = resolveValue(raw, props, [name]);
    const value = resolved === null ? null : plainColor(resolved);
    if (!value) continue;
    const { group, label } = classify(name);
    const g = groups.get(group)!;
    const same = g.colors.find((c) => c.value === value);
    if (same) {
      same.aliases.push(name);
      continue;
    }
    // The roles and button tokens mostly repeat a swatch under another name: note them on the swatch instead of listing them again
    if (group === 'roles') {
      const earlier = shownAlready.get(value);
      if (earlier) {
        earlier.aliases.push(name);
        continue;
      }
    }
    const given = names.get(name);
    const color: PaletteColor = { name, label: given ?? label, ...(given ? { named: true } : {}), value, aliases: [] };
    g.colors.push(color);
    if (group !== 'roles' && !shownAlready.has(value)) shownAlready.set(value, color);
  }
  return [...groups.values()].filter((g) => g.colors.length);
}

/** The tooltip for a colour: its name, value and the property it comes from. */
export function paletteTip(c: PaletteColor): string {
  const also = c.aliases.length ? `, also ${c.aliases.slice(0, 2).join(', ')}${c.aliases.length > 2 ? ` and ${c.aliases.length - 2} more` : ''}` : '';
  return `${c.label} ${c.value} (${c.name}${also})`;
}

let loaded: PaletteGroup[] = [];
let pending: Promise<PaletteGroup[]> | null = null;
const listeners = new Set<(g: PaletteGroup[]) => void>();

/** Fetches and parses the stylesheet once per page load. Never rejects: any failure is an empty palette. */
export function loadPalette(url?: string): Promise<PaletteGroup[]> {
  if (!pending) {
    const read = async (from: string): Promise<PaletteGroup[]> => {
      try {
        const res = await fetch(from, { credentials: 'same-origin', cache: 'no-cache' });
        if (!res.ok) return [];
        return parsePaletteCss(await res.text());
      } catch {
        return [];
      }
    };
    pending = (async () => {
      if (url) return read(url);
      // The source has the name comments; the minified copy only has the colours
      const withNames = await read(PALETTE_SOURCE_URL);
      return withNames.length ? withNames : read(PALETTE_URL);
    })().then((g) => {
      loaded = g;
      listeners.forEach((fn) => fn(g));
      return g;
    });
  }
  return pending;
}

/** The palette groups, empty until (and unless) the stylesheet loads. */
export function usePalette(): PaletteGroup[] {
  const [groups, setGroups] = useState(loaded);
  useEffect(() => {
    listeners.add(setGroups);
    void loadPalette();
    setGroups(loaded);
    return () => void listeners.delete(setGroups);
  }, []);
  return groups;
}
