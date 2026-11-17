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
  titleLower: string;
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
      out.push({ topic: t, anchor: heading ? slug(heading) : undefined, heading, text, lower: text.toLowerCase(), headLower: head.toLowerCase(), titleLower: t.title.toLowerCase() });
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
      //A topic whose title starts with the word (Pages for "page") is the one about it, ahead of every page that mentions it
      if (words.length === 1 && e.titleLower.startsWith(w)) score += 6;
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

export { wordsOf, editDistance, typoBudget, inOrder, scoreWord } from './match';
