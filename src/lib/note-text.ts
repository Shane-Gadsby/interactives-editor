/**
 * The light markdown a sticky note understands: **bold**, *italic*, `code`, "- " bullets and "[ ]" / "[x]" checkboxes (a tick on
 * the canvas rewrites the text). Parsed into plain tokens that the canvas draws as elements, so a note can never inject markup.
 */
export interface NoteSpan {
  kind: 'text' | 'bold' | 'italic' | 'code';
  text: string;
  /** Code inside **bold**, drawn bold as well. */
  strong?: boolean;
}

export interface NoteLine {
  /** Index of the line in the source text (what `toggleCheck` takes). */
  line: number;
  kind: 'paragraph' | 'bullet' | 'check' | 'blank';
  checked?: boolean;
  spans: NoteSpan[];
}

const INLINE = /(\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`)/g;

export function inlineSpans(s: string): NoteSpan[] {
  const out: NoteSpan[] = [];
  let at = 0;
  for (const m of s.matchAll(INLINE)) {
    const i = m.index ?? 0;
    if (i > at) out.push({ kind: 'text', text: boxes(s.slice(at, i)) });
    //code marks inside bold are code, still bold, not backticks shown as they are
    if (m[2] !== undefined)
      for (const [j, part] of m[2].split('`').entries()) {
        if (part) out.push(j % 2 ? { kind: 'code', text: part, strong: true } : { kind: 'bold', text: part });
      }
    else if (m[3] !== undefined) out.push({ kind: 'italic', text: m[3] });
    else out.push({ kind: 'code', text: m[4] });
    at = i + m[0].length;
  }
  if (at < s.length) out.push({ kind: 'text', text: boxes(s.slice(at)) });
  return out;
}

//a [ ] or [x] partway through a line can't be ticked (only one starting a line is a checkbox), but it still reads as a box, not brackets
const boxes = (t: string): string => t.replace(/\[ \]/g, '\u2610').replace(/\[[xX]\]/g, '\u2611');

const CHECK = /^\s*(?:[-*]\s+)?\[( |x|X)\]\s?(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;

export function parseNoteText(text: string): NoteLine[] {
  return text.split('\n').map((raw, line) => {
    if (!raw.trim()) return { line, kind: 'blank', spans: [] };
    const c = CHECK.exec(raw);
    if (c) return { line, kind: 'check', checked: c[1] !== ' ', spans: inlineSpans(c[2]) };
    const b = BULLET.exec(raw);
    if (b) return { line, kind: 'bullet', spans: inlineSpans(b[1]) };
    return { line, kind: 'paragraph', spans: inlineSpans(raw) };
  });
}

/** The text with one line's checkbox ticked or unticked (unchanged when that line has none). */
export function toggleCheck(text: string, line: number): string {
  const lines = text.split('\n');
  const raw = lines[line];
  if (raw === undefined) return text;
  const next = raw.replace(/\[( |x|X)\]/, (_m, v: string) => (v === ' ' ? '[x]' : '[ ]'));
  if (next === raw) return text;
  lines[line] = next;
  return lines.join('\n');
}

/** The note's words with the markers taken off, for a label or a search. */
export function plainNoteText(text: string): string {
  return parseNoteText(text)
    .filter((l) => l.kind !== 'blank')
    .map((l) => l.spans.map((s) => s.text).join(''))
    .join(' ')
    .trim();
}
