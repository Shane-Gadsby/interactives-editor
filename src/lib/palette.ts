import { useEffect, useState } from 'react';
import { parseColor } from 'interactives-player';

/**
 * The toolbox palette: the colours si-studydesk-styles publishes as CSS custom properties in /styles/palette.min.css.
 * The editor reads that stylesheet at runtime, so a change to the palette shows up here without a rebuild.
 * Picking a colour stores a plain value on the layer; nothing that is exported refers back to the stylesheet.
 */

export interface PaletteColor {
  /** The custom property, e.g. --ilar-swatch-yellow */
  name: string;
  /** Readable name for tooltips, e.g. "Yellow" */
  label: string;
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

/** Where the stylesheet is served from, through haproxy on the same host */
export const PALETTE_URL = '/styles/palette.min.css';

const GROUPS: { id: string; title: string }[] = [
  { id: 'brand', title: 'Brand colours' },
  { id: 'greys', title: 'Greys' },
  { id: 'links', title: 'Links and status' },
  { id: 'feature', title: 'Feature colours' },
  { id: 'gradients', title: 'Gradient stops' },
  { id: 'roles', title: 'Roles and buttons' },
];

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Every `--name: value` declared in a :root rule, later declarations winning. */
export function parseCustomProperties(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rule of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
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
    for (const d of decls) {
      const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]*?)\s*(?:!important)?\s*$/.exec(d);
      if (m && m[2]) out.set(m[1], m[2]);
    }
  }
  return out;
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
  const props = parseCustomProperties(css);
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
    const color: PaletteColor = { name, label, value, aliases: [] };
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
export function loadPalette(url: string = PALETTE_URL): Promise<PaletteGroup[]> {
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(url, { credentials: 'same-origin', cache: 'no-cache' });
        if (!res.ok) return [];
        return parsePaletteCss(await res.text());
      } catch {
        return [];
      }
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
