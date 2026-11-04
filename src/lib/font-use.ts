import type { FontRef } from 'interactives-player';

/** What a rendered picture asks of one font family */
export interface FontUse {
  weights: Set<number>;
  italic: boolean;
}

const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, '').trim();

function weightOf(w: string): number {
  if (w === 'bold') return 700;
  if (w === 'normal' || !w) return 400;
  const n = parseInt(w, 10);
  return Number.isFinite(n) ? n : 400;
}

/**
 * The font families (with weights and styles) the text in a rendered tree really draws with, by lowercase family.
 * Text inside instances is part of the same tree. An element counts when it holds text of its own, or is a form
 * control (its value and placeholder use its font).
 */
export function fontUseIn(root: Element): Map<string, FontUse> {
  const out = new Map<string, FontUse>();
  // A browser answers with the inherited value; a bare DOM (tests) leaves it empty, so look up the tree for it
  const inherited = (el: Element, prop: 'fontFamily' | 'fontWeight' | 'fontStyle') => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const v = getComputedStyle(e)[prop] || (e as HTMLElement).style?.[prop];
      if (v) return v;
    }
    return '';
  };
  const note = (el: Element) => {
    const weight = weightOf(inherited(el, 'fontWeight'));
    const italic = /italic|oblique/.test(inherited(el, 'fontStyle'));
    for (const fam of inherited(el, 'fontFamily').split(',')) {
      const key = unquote(fam).toLowerCase();
      if (!key) continue;
      let u = out.get(key);
      if (!u) out.set(key, (u = { weights: new Set(), italic: false }));
      u.weights.add(weight);
      if (italic) u.italic = true;
    }
  };
  const visit = (el: Element) => {
    const own = Array.from(el.childNodes).some((c) => c.nodeType === 3 && (c.textContent ?? '').trim() !== '');
    if (own || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName)) note(el);
    for (const c of Array.from(el.children)) visit(c);
  };
  visit(root);
  return out;
}

/** The weight a browser falls back to when a family lacks the one asked for (nearest; for 500 and over the heavier first) */
function nearest(want: number, have: number[]): number {
  let best = have[0];
  for (const h of have) {
    const d = Math.abs(h - want);
    const bd = Math.abs(best - want);
    if (d < bd || (d === bd && (want >= 500 ? h > best : h < best))) best = h;
  }
  return best;
}

export interface FontNeed {
  font: FontRef;
  /** Google fonts: just the weights the picture uses (of those the font offers) */
  weights: number[];
}

/** Only the project fonts that `use` draws with, and for Google fonts only the weights it draws in. System fonts need nothing embedded. */
export function neededFonts(fonts: FontRef[], use: Map<string, FontUse>): FontNeed[] {
  const out: FontNeed[] = [];
  for (const f of fonts) {
    if (f.source === 'system') continue;
    const u = use.get(f.family.toLowerCase());
    if (!u) continue;
    const have = (f.weights?.length ? f.weights : [400, 700]).slice().sort((a, b) => a - b);
    const weights = [...new Set([...u.weights].map((w) => nearest(w, have)))].sort((a, b) => a - b);
    out.push({ font: f, weights });
  }
  return out;
}
