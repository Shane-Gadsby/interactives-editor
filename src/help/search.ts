import { plain, slug } from './markdown';
import { TOPICS, topicBody, type HelpTopic } from './topics';

export interface HelpHit {
  topic: HelpTopic;
  /** Heading anchor inside the topic, when the match is in a section. */
  anchor?: string;
  heading?: string;
  snippet: string;
  score: number;
}

interface Entry {
  topic: HelpTopic;
  anchor?: string;
  heading?: string;
  text: string;
  lower: string;
  headLower: string;
}

let index: Entry[] | null = null;

function build(): Entry[] {
  const out: Entry[] = [];
  for (const t of TOPICS) {
    const body = topicBody(t);
    // One entry for the topic's opening, one per heading section
    const parts = body.split(/\n(?=#{1,4}\s)/);
    parts.forEach((part, i) => {
      const m = /^#{1,4}\s+(.*)\n?/.exec(part);
      const heading = i > 0 && m ? m[1] : undefined;
      const text = plain(m && i > 0 ? part.slice(m[0].length) : part);
      const head = `${t.title} ${heading ?? ''} ${i === 0 ? `${t.summary} ${t.keywords ?? ''}` : ''}`;
      out.push({ topic: t, anchor: heading ? slug(heading) : undefined, heading, text, lower: text.toLowerCase(), headLower: head.toLowerCase() });
    });
  }
  return out;
}

/** Ranked matches: title and heading words count most, then keywords, then body text. */
export function searchHelp(query: string, limit = 12): HelpHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  index ??= build();
  const hits: HelpHit[] = [];
  for (const e of index) {
    let score = 0;
    let all = true;
    for (const w of words) {
      const inHead = e.headLower.includes(w);
      const inBody = e.lower.includes(w);
      if (!inHead && !inBody) {
        all = false;
        break;
      }
      if (inHead) score += new RegExp(`\\b${escape(w)}`).test(e.headLower) ? 10 : 6;
      if (inBody) score += Math.min(4, e.lower.split(w).length - 1);
    }
    if (!all) continue;
    if (!e.anchor) score += 2;
    hits.push({ topic: e.topic, anchor: e.anchor, heading: e.heading, snippet: snippet(e.text, words[0]), score });
  }
  hits.sort((a, b) => b.score - a.score);
  // One result per topic section, best first; at most three from any one topic
  const per = new Map<string, number>();
  return hits
    .filter((h) => {
      const n = per.get(h.topic.id) ?? 0;
      per.set(h.topic.id, n + 1);
      return n < 3;
    })
    .slice(0, limit);
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function snippet(text: string, word: string): string {
  const i = text.toLowerCase().indexOf(word);
  if (i < 0) return text.slice(0, 140);
  const start = Math.max(0, i - 50);
  return (start ? '…' : '') + text.slice(start, start + 150) + (start + 150 < text.length ? '…' : '');
}

// ---------------------------------------------------------------- shared fuzzy pieces (the properties panel's search uses these too)

/** Lower-case words with the punctuation stripped, so "Z-order" and "z order" are the same two words. */
export function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u0370-\u03ff]+/g, ' ')
    .split(' ')
    .filter(Boolean);
}

/** Edit distance with a swap counting as one edit, so a typo like "opacity" for "opaicty" costs 1. Gives up early past `max`. */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    rows[i] = [i];
    for (let j = 1; j <= b.length; j++) rows[i][j] = i === 0 ? j : 0;
  }
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, rows[i - 2][j - 2] + 1);
      rows[i][j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return rows[a.length][b.length];
}

/** How many typos a word of this length is allowed: none for the very short ones, which would match anything. */
export const typoBudget = (len: number): number => (len <= 3 ? 0 : len <= 5 ? 1 : 2);

/** The letters of `needle` appear in order in `hay` ("crnrad" in "corner radius"). */
export function inOrder(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) if (ch === needle[i] && ++i === needle.length) return true;
  return needle.length === 0;
}

/**
 * Score one query word against one piece of text (a label, a synonym, a tip): 100 the whole text, 85 starts with it, 75 a
 * whole word of it, 65 a word that starts with it, 50 somewhere inside, 40 within a typo or two of one of its words,
 * 18 the letters in order (the last two only when `loose`). 0 is no match. `text` is already normalised (see wordsOf).
 */
export function scoreWord(word: string, text: string, loose = true): number {
  if (!word || !text) return 0;
  const tw = text.split(' ');
  if (text === word) return 100;
  if (text.startsWith(word)) return 85;
  if (tw.includes(word)) return 75;
  if (tw.some((t) => t.startsWith(word))) return 65;
  if (text.includes(word)) return 50;
  // a phrase only matches as a phrase
  if (word.includes(' ')) return 0;
  // the typo and letters-in-order tiers are for short texts (labels, synonyms), not a sentence of tip
  if (!loose) return 0;
  const budget = typoBudget(word.length);
  if (budget && tw.some((t) => t.length > 2 && editDistance(word, t, budget) <= budget)) return 40;
  // a typo in the start of a longer word ("opac" for "opacity" is a prefix, "opcaity" is not)
  if (budget && tw.some((t) => t.length > word.length && editDistance(word, t.slice(0, word.length), budget) <= budget && word.length >= 4)) return 32;
  if (word.length >= 3 && inOrder(word, text.replace(/ /g, ''))) return 18;
  return 0;
}
