import type { Artboard, Project } from 'interactives-player';
import { helpSearch } from '../help/lazy';
import type { HelpHit } from '../help/search';
import { describeIt } from './describe-it';
import { RECIPE_BY_ID, applyBehaviour, buildBehaviour, incomplete, triggerIncomplete } from './recipes';
import { track } from './analytics';
import { store } from '../store/store';

/**
 * The Activity Designer's free answers. Cogniti caps how many messages a person can send an hour, so a message is only spent when
 * the AI is needed: a "how do I..." question is answered from the editor's own help (with the top topics as links), and a single
 * behaviour on a selected layer that Describe it already understands is written through the Describe it path with no AI at all.
 * Both are deliberately conservative: when unsure, it is a build request and goes to the AI.
 */

// ------------------------------------------------------------------------------------------------ "how do I..." questions

//Starts like a question about the editor. Said politely first ("hi, how do I") is still one.
const QUESTION = /^\s*(?:(?:hi|hello|hey|ok|okay|so|and|please|quick question)[,!.\s]+)*(?:how (?:do|can|would|should|does|to)\b|how's|what (?:is|are|does|do)\b|what's|where (?:do|can|is|are|does)\b|why (?:does|is|do|can't|won't|isn't|doesn't)\b|can i\b|is it possible\b|is there a way\b|explain\b|tell me about\b)/i;

//Asking for work to be done, or for ideas, even when it is worded as a question
const BUILD = /\b(?:for me|please (?:make|add|build|create|do|put|change|fix)|can you|could you|would you|will you|i want you|i need you|my project|my page|this project|this page|this button|this layer|the open page|here)\b|\b(?:good|best|ideas?|suggest|recommend|example of|for teaching|to teach|activity for|lesson)\b/i;

/** Is this a "how do I..." / "what is..." question about the editor, rather than a request to make or change something? */
export function isHowQuestion(text: string): boolean {
  const t = text.trim();
  if (t.length < 8 || t.length > 200 || t.split(/\s+/).length > 30) return false;
  return QUESTION.test(t) && !BUILD.test(t);
}

const STOP = new Set(['how', 'do', 'does', 'did', 'i', 'we', 'you', 'can', 'could', 'would', 'should', 'to', 'the', 'a', 'an', 'is', 'are', 'was', 'what', "what's", "how's", 'where', 'why', 'which', 'when', 'it', 'in', 'on', 'of', 'for', 'my', 'me', 'this', 'that', 'there', 'way', 'possible', 'tell', 'about', 'explain', 'with', 'and', 'or', 'if', 'get', 'make', 'use', 'hi', 'hello', 'hey', 'please', 'ok', 'okay', 'so', 'quick', 'question', "can't", "won't", "isn't", "doesn't", 'be', 'have', 'has']);

export interface HelpAnswer {
  id: string;
  title: string;
  anchor?: string;
  heading?: string;
  snippet: string;
}

/** The help topics that best answer a question, best first (at most `limit`, one per topic). Empty when nothing matches. */
export function helpAnswers(text: string, search: (query: string, limit?: number) => HelpHit[], limit = 3): HelpAnswer[] {
  let words = text
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
  while (words.length) {
    const hits = search(words.join(' '), 12);
    if (hits.length) {
      const seen = new Set<string>();
      const out: HelpAnswer[] = [];
      for (const h of hits) {
        if (seen.has(h.topic.id)) continue;
        seen.add(h.topic.id);
        out.push({ id: h.topic.id, title: h.topic.title, anchor: h.anchor, heading: h.heading, snippet: h.snippet });
        if (out.length >= limit) break;
      }
      return out;
    }
    //nothing matched every word: drop the shortest and try again
    const shortest = words.reduce((a, w, i) => (w.length < words[a].length ? i : a), 0);
    if (words.length === 1) break;
    words = words.filter((_, i) => i !== shortest);
  }
  return [];
}

// ------------------------------------------------------------------------------------------------ one behaviour, no AI

//A sentence that starts with what triggers it ("when clicked go to the next page"): the shape Describe it was made for
const TRIGGERED = /^\s*(?:(?:please|ok|okay)[,\s]+)?(?:when|whenever|once|as soon as|every time|each time|after\s+\d|on\s+(?:click|hover|load|start)|click(?:ing)?\b|tap(?:ping)?\b)/i;
//Making new things is the AI's job, even when a trigger leads the sentence
const MAKING = /\b(?:create|build|design|generate|draft|write|new page|new question|new button|add (?:a|an|another|some) (?:new )?(?:page|question|button|heading|image|picture|text|shape|quiz|activity|section))\b/i;

export interface LocalBehaviour {
  /** What it did, read back the way the Inspector says it. */
  sentence: string;
}

/**
 * Write one behaviour on the selected layer with Describe it, when the sentence is plainly one and was read completely: nothing
 * missing, nothing left out. Returns what was done, or null when it is not for here (then the AI gets it). It is the same code as
 * "+ When clicked..." and Describe it in the palette, written as one undo step.
 */
export function describeLocally(text: string, project: Project, ab: Artboard, selectedId: string, write: (abId: string, b: ReturnType<typeof buildBehaviour>) => void): LocalBehaviour | null {
  const t = text.trim();
  if (!selectedId || t.split(/\s+/).length < 3 || t.length > 300 || !TRIGGERED.test(t) || MAKING.test(t)) return null;
  const d = describeIt(t, project, ab, selectedId);
  if (!d || !d.layerId || d.missing.length || d.ignored.length) return null;
  const ctx = { project, ab, layerId: d.layerId };
  const gap = incomplete(RECIPE_BY_ID[d.recipe], d.answers, project, ab) ?? triggerIncomplete(d.trigger, d.when, project, ab) ?? d.then.map((st) => incomplete(RECIPE_BY_ID[st.recipe], st.answers, project, ab)).find(Boolean);
  if (gap) return null;
  try {
    const b = buildBehaviour(ctx, d.recipe, d.trigger, d.answers, undefined, { when: d.when, then: d.then, only: d.only, otherwise: d.otherwise });
    write(ab.id, b);
    return { sentence: b.sentence };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------------------------ the panel's ask

export type LocalAnswer = { kind: 'help'; topics: HelpAnswer[] } | { kind: 'behaviour'; sentence: string };

/** The panel's first look at what was typed: a free answer, or null to send it to the AI. Reads the open page and selection as they are now. */
export function localAnswer(text: string): LocalAnswer | null | Promise<LocalAnswer | null> {
  if (isHowQuestion(text)) {
    //the help is a chunk of its own: loaded the first time someone asks it a question
    return helpSearch.ensure().then((m) => {
      const topics = helpAnswers(text, m.searchHelp);
      if (!topics.length) return null;
      track('feature', 'designer-help-answer');
      return { kind: 'help', topics } as LocalAnswer;
    });
  }
  const s = store();
  const ab = s.artboard();
  const sel = s.selectedNodes();
  if (!ab || sel.length !== 1) return null;
  const done = describeLocally(text, s.get().project, ab, sel[0].id, (abId, b) => void applyBehaviour((r) => s.update(r), abId, b));
  if (!done) return null;
  track('feature', 'designer-local-behaviour');
  return { kind: 'behaviour', sentence: done.sentence };
}

/** The page the person has open, so the AI starts from where they are. */
export function openArtboardId(): string {
  try {
    return store().artboard()?.id ?? '';
  } catch {
    return '';
  }
}
