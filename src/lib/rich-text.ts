import { runsInRange, runsPatch, type RunStyle, type TextRun, type TextStyle } from 'interactives-player';

/**
 * Editor side of rich text: turning inspector changes and keyboard shortcuts into run styles.
 * The run data model itself (splitting, merging, text sync) is the player's `textruns.ts`.
 */

/** Which of a text layer's style props can be set on a run, and the run key each one becomes. */
export function nodePropsToRunStyle(props: Record<string, unknown>): { style: Partial<RunStyle>; rest: Record<string, unknown> } {
  const style: Partial<RunStyle> = {};
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    switch (k) {
      case 'color':
        style.color = String(v);
        break;
      case 'fontSize':
        style.fontSize = Number(v);
        break;
      case 'fontWeight':
        style.fontWeight = Number(v);
        break;
      case 'fontFamily':
        style.fontFamily = String(v);
        break;
      case 'letterSpacing':
        style.letterSpacing = Number(v);
        break;
      case 'fontStyle':
        style.italic = v === 'italic';
        break;
      case 'textDecoration':
        style.underline = v === 'underline';
        style.strike = v === 'line-through';
        break;
      default:
        rest[k] = v;
    }
  }
  return { style, rest };
}

export type ToggleKind = 'bold' | 'italic' | 'underline' | 'strike';
type Base = Pick<TextStyle, 'fontWeight' | 'fontStyle'> & { textDecoration?: TextStyle['textDecoration'] };

const effective = (r: TextRun, kind: ToggleKind, base: Base): boolean => {
  switch (kind) {
    case 'bold':
      return (r.fontWeight ?? base.fontWeight) >= 600;
    case 'italic':
      return r.italic ?? base.fontStyle === 'italic';
    case 'underline':
      return r.underline ?? base.textDecoration === 'underline';
    case 'strike':
      return r.strike ?? base.textDecoration === 'line-through';
  }
};

/**
 * The style patch Ctrl+B / I / U does for a selection: turn it on, unless all of it
 * already has it (then turn it off). Turning off clears the override when the layer
 * itself doesn't have the style, and states "off" when it does.
 */
export function toggleRunStyle(runs: readonly TextRun[], start: number, end: number, kind: ToggleKind, base: Base): Partial<RunStyle> {
  const covered = runsInRange(runs, start, end);
  const allOn = covered.length > 0 && covered.every((r) => effective(r, kind, base));
  const baseOn = effective({ text: '' }, kind, base);
  switch (kind) {
    case 'bold':
      return { fontWeight: allOn ? (baseOn ? 400 : undefined) : 700 };
    case 'italic':
      return { italic: allOn ? (baseOn ? false : undefined) : true };
    case 'underline':
      return { underline: allOn ? (baseOn ? false : undefined) : true };
    case 'strike':
      return { strike: allOn ? (baseOn ? false : undefined) : true };
  }
}

/** The styling shared by everything in a range (keys left out where it varies), resolved against the layer's own style. */
export function runStyleAtRange(runs: readonly TextRun[], start: number, end: number, base: TextStyle): Partial<{ fontFamily: string; fontSize: number; fontWeight: number; color: string; letterSpacing: number; italic: boolean; underline: boolean; strike: boolean }> {
  const covered = runsInRange(runs, start, end);
  const out: Record<string, unknown> = {};
  if (!covered.length) return out;
  const get: Record<string, (r: TextRun) => unknown> = {
    fontFamily: (r) => r.fontFamily ?? base.fontFamily,
    fontSize: (r) => r.fontSize ?? base.fontSize,
    fontWeight: (r) => r.fontWeight ?? base.fontWeight,
    color: (r) => r.color ?? base.color,
    letterSpacing: (r) => r.letterSpacing ?? base.letterSpacing,
    italic: (r) => r.italic ?? base.fontStyle === 'italic',
    underline: (r) => r.underline ?? base.textDecoration === 'underline',
    strike: (r) => r.strike ?? base.textDecoration === 'line-through',
  };
  for (const [k, f] of Object.entries(get)) {
    const first = f(covered[0]);
    if (covered.every((r) => f(r) === first)) out[k] = first;
  }
  return out;
}

/** Store runs on a text layer (or draft of one): `text` follows, and plain runs remove `runs` altogether. */
export function applyRuns(n: { text: string; runs?: TextRun[] }, runs: readonly TextRun[]): void {
  const p = runsPatch(runs);
  n.text = p.text;
  if (p.runs) n.runs = p.runs;
  else delete n.runs;
}
