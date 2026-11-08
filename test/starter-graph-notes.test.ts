//Every branded starter's interaction graph is annotated: a graph with more than a handful of nodes has at least one graph note that
//says what it does, the notes sit clear of the nodes once the graph is tidied, and none of it ships.
import { describe, expect, it } from 'vitest';
import { stripNotes } from 'interactives-player';
import { BRANDED_STARTERS, COLOURWAYS, projectFromBrandedStarter } from '../src/lib/branded';
import { nodeSizeGuess } from '../src/lib/branded/graph-kit';
import { graphNotePlace } from '../src/lib/graph-notes';

/** Graphs with more nodes than this need a note. */
const BIG = 5;

/**
 * The starters whose graphs have not been annotated yet (the template sweep takes them off this list as it goes). A starter that is
 * on it but already has a note on every big graph fails the test, so the list only ever shrinks.
 */
const NOT_ANNOTATED_YET = [
  'assessment/multi-page-quiz',
  'assessment/true-or-false',
  'assessment/fill-in-the-blanks',
  'assessment/mark-the-words',
  'assessment/find-the-hotspot',
  'assessment/find-multiple-hotspots',
  'assessment/image-choice',
  'assessment/summary',
  'assessment/essay',
  'assessment/audio-first-quiz',
  'assessment/spelling-test',
  'explore/image-hotspots',
  'explore/flip-and-dialog-cards',
  'explore/image-slider',
  'explore/before-and-after',
  'explore/image-sequence',
  'explore/information-wall',
  'drag/label-the-diagram',
  'drag/sort-into-groups',
  'drag/put-in-order',
  'drag/interactive-timeline',
  'drag/drag-the-words',
  'drag/image-pairing',
  'story/course-presentation',
  'story/memory-game',
  'story/video-questions',
  'story/interactive-book',
  'games/crossword',
  'games/word-search',
  'games/arithmetic-quiz',
  'games/guess-the-answer',
  'games/personality-quiz',
  'games/game-map',
  'writing/questionnaire',
  'writing/documentation-tool',
  'writing/reflection-journal',
  'practice/difficult-conversation',
  'practice/timed-talk-rehearsal',
  'practice/keep-the-beat',
  'practice/sign-practice',
  'practice/shadow-the-model',
  'media/observe-and-tag',
  'media/listening-lab',
  'media/lite-lesson',
  'media/live-sound-lab',
  'media/photo-notebook',
];

const built = BRANDED_STARTERS.map((starter) => ({ starter, project: projectFromBrandedStarter(starter, COLOURWAYS[0]) }));
const bigGraphs = (p: (typeof built)[number]['project']) => p.artboards.filter((a) => a.logic.nodes.length > BIG);
const unannotated = (p: (typeof built)[number]['project']) => bigGraphs(p).filter((a) => !a.logic.notes?.length);

describe('starter graph notes', () => {
  it('every starter not on the to-do list has a note on each graph of more than 5 nodes', () => {
    const missing = built.filter((b) => !NOT_ANNOTATED_YET.includes(b.starter.key) && unannotated(b.project).length).map((b) => `${b.starter.key}: ${unannotated(b.project).map((a) => a.name).join(', ')}`);
    expect(missing).toEqual([]);
  });

  it('the to-do list is only starters that still need notes, and only real starters', () => {
    const keys = new Set(BRANDED_STARTERS.map((s) => s.key));
    for (const k of NOT_ANNOTATED_YET) expect(keys.has(k), `${k} is not a starter`).toBe(true);
    const done = built.filter((b) => NOT_ANNOTATED_YET.includes(b.starter.key) && bigGraphs(b.project).length && !unannotated(b.project).length).map((b) => b.starter.key);
    expect(done, 'annotated now: take these off NOT_ANNOTATED_YET').toEqual([]);
  });

  it('the three style samples are annotated', () => {
    for (const key of ['explore/accordion', 'assessment/single-choice-set', 'explore/chart']) {
      const b = built.find((x) => x.starter.key === key)!;
      expect(b, key).toBeTruthy();
      expect(b.project.artboards.some((a) => a.logic.notes?.length), key).toBe(true);
    }
  });

  it('notes are written in the register: 1 to 3 lines of words, a **bold** key idea, written by the template, never longer than 420 characters', () => {
    for (const b of built)
      for (const a of b.project.artboards)
        for (const n of a.logic.notes ?? []) {
          expect(n.author, b.starter.key).toBe('Template');
          expect(n.text.length, `${b.starter.key}: ${n.text}`).toBeLessThanOrEqual(420);
          expect(n.text, b.starter.key).toMatch(/\*\*[^*]+\*\*/);
          expect(n.text, b.starter.key).not.toMatch(/—/);
          expect(n.text.split('\n').length, b.starter.key).toBeLessThanOrEqual(3);
        }
  });

  it('notes sit clear of every node once the starter is built and tidied', () => {
    const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    for (const b of built)
      for (const a of b.project.artboards) {
        if (!a.logic.notes?.length) continue;
        const nodes = a.logic.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, ...nodeSizeGuess(n) }));
        for (const n of a.logic.notes) {
          const at = graphNotePlace(a.logic, n);
          const r = { x: at.x, y: at.y, width: n.w, height: n.h };
          for (const node of nodes) expect(overlap(r, node), `${b.starter.key} / ${a.name}: a note is over a node`).toBe(false);
          for (const m of a.logic.notes) if (m !== n) {
            const mat = graphNotePlace(a.logic, m);
            expect(overlap(r, { x: mat.x, y: mat.y, width: m.w, height: m.h }), `${b.starter.key} / ${a.name}: two notes overlap`).toBe(false);
          }
        }
      }
  });

  it('none of it ships to players', () => {
    for (const b of built) {
      const stripped = stripNotes(b.project);
      for (const a of stripped.artboards) expect('notes' in a.logic, b.starter.key).toBe(false);
      const json = JSON.stringify(stripped);
      for (const a of b.project.artboards) for (const n of a.logic.notes ?? []) expect(json.includes(n.text), b.starter.key).toBe(false);
    }
  });
});
