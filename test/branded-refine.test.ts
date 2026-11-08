//The refinements every starter shares (the pattern the Spelling test set): the Hint is a small pill at the top right of the question card,
//Hint and Try again are one project setting each, buttons say what happens to the learner's work, and a control that starts something does
//not start it twice. The strict layout and contrast tests are the backstop for how all of it looks.
import { describe, expect, it } from 'vitest';
import type { FrameNode } from 'interactives-player';
import { BRANDED_STARTERS, COLOURWAYS, projectFromBrandedStarter } from '../src/lib/branded';
import { byName } from '../src/lib/branded/kit';
import { partsOf, questionFrames } from '../src/lib/question-kit';

const build = (key: string) => projectFromBrandedStarter(BRANDED_STARTERS.find((s) => s.key === key)!, COLOURWAYS[0]);
const buttonsByLabel = (key: string) => {
  const p = build(key);
  const out: { label: string; w: number; h: number; page: string }[] = [];
  const walk = (list: unknown[], page: string) => {
    for (const n of list as { type: string; label?: string; width: number; height: number; children?: unknown[] }[]) {
      if (n.type === 'button') out.push({ label: n.label ?? '', w: n.width, h: n.height, page });
      if (n.children) walk(n.children, page);
    }
  };
  for (const ab of p.artboards) if (!ab.isMaster) walk(ab.children, ab.name);
  return out;
};

describe('the Hint pill', () => {
  it('is a small pill at the top right of every kit question card, in every starter that has one', () => {
    let seen = 0;
    for (const s of BRANDED_STARTERS) {
      const p = projectFromBrandedStarter(s, COLOURWAYS[0]);
      for (const ab of p.artboards) {
        for (const f of questionFrames(ab)) {
          const parts = partsOf(f);
          if (!parts.hint?.length) continue;
          seen++;
          const row = parts.promptRow?.[0] as FrameNode | undefined;
          expect(row, `${s.key} ${ab.name}`).toBeTruthy();
          expect(row!.children.map((c) => c.questionPart)).toEqual(['prompt', 'hint']);
          expect(parts.hint[0], `${s.key} ${ab.name}`).toMatchObject({ height: 32, cornerRadius: 16 });
          expect((parts.buttons[0] as FrameNode).children.some((c) => c.questionPart === 'hint')).toBe(false);
        }
      }
    }
    expect(seen).toBeGreaterThan(20);
  });
});

describe('Hint and Try again as one setting each', () => {
  const WITH: Record<string, { hint: boolean; again: boolean; againOn?: boolean }> = {
    'assessment/multi-page-quiz': { hint: true, again: false },
    'assessment/find-the-hotspot': { hint: true, again: true },
    'assessment/audio-first-quiz': { hint: true, again: false },
    'drag/label-the-diagram': { hint: false, again: true },
    'drag/sort-into-groups': { hint: true, again: true },
    'drag/put-in-order': { hint: true, again: true },
    'drag/drag-the-words': { hint: false, again: true },
    'drag/image-pairing': { hint: false, again: true },
    'story/course-presentation': { hint: true, again: true },
    'story/video-questions': { hint: true, again: true },
    'story/interactive-book': { hint: true, again: true },
  };
  for (const [key, w] of Object.entries(WITH)) {
    it(`${key}: ${w.hint ? 'offerHint' : 'no Hint switch'}, ${w.again ? 'allowTryAgain' : 'no Try again switch'}, both on to begin with where they exist`, () => {
      const p = build(key);
      const v = (n: string) => p.variables.find((x) => x.name === n);
      expect(!!v('offerHint')).toBe(w.hint);
      expect(!!v('allowTryAgain')).toBe(w.again);
      if (w.hint) expect(v('offerHint')).toMatchObject({ type: 'boolean', initial: true });
      if (w.again) expect(v('allowTryAgain')).toMatchObject({ type: 'boolean', initial: true });
      for (const ab of p.artboards)
        for (const f of questionFrames(ab)) {
          const parts = partsOf(f);
          if (w.hint && parts.hint?.[0]) expect(parts.hint[0].bindings!.visible).toMatch(/^offerHint && /);
          if (w.again && parts.reset?.[0]) expect(parts.reset[0].bindings!.visible).toMatch(/^allowTryAgain && /);
        }
      //and the checklist tells the author where they are
      const text = projectFromBrandedStarter(BRANDED_STARTERS.find((s) => s.key === key)!, COLOURWAYS[0]).template!.checklist.map((c) => c.text).join('\n');
      expect(text).toMatch(/Optional extras, one switch each/);
    });
  }
});

describe('labels that say what happens to the answer', () => {
  it('Submit answer where the answer is final (the quiz), Check answer where there are tries', () => {
    const quiz = build('assessment/multi-page-quiz');
    for (const ab of quiz.artboards) for (const f of questionFrames(ab)) expect(partsOf(f).check[0]).toMatchObject({ label: 'Submit answer' });
    //and its Try again stays off: a wrong answer cannot be retried for a mark
    for (const ab of quiz.artboards) for (const f of questionFrames(ab)) expect(partsOf(f).reset[0].bindings!.visible).toBe('false');
    for (const key of ['drag/sort-into-groups', 'assessment/find-the-hotspot', 'story/video-questions']) {
      const p = build(key);
      for (const ab of p.artboards) for (const f of questionFrames(ab)) expect(partsOf(f).check[0]).toMatchObject({ label: 'Check answer' });
    }
  });

  it('says Check answer, not a bare Check, on the practice starters that check one answer', () => {
    for (const key of ['assessment/mark-the-words', 'assessment/image-choice', 'games/arithmetic-quiz']) expect(buttonsByLabel(key).some((b) => b.label === 'Check answer'), key).toBe(true);
    expect(buttonsByLabel('games/crossword').some((b) => b.label === 'Check letters')).toBe(true);
  });
});

describe('a control that starts something does not start it twice', () => {
  it('Play their line is disabled and reads Playing... while the line is going', () => {
    const p = build('practice/difficult-conversation');
    const play = byName(p.artboards[1], 'Play their line')!;
    expect(play.bindings).toMatchObject({ disabled: 'soundPlaying()', label: 'soundPlaying() ? "Playing…" : "Play their line"' });
  });

  it('the listening lab and the shadowing practice stop the other sound when one starts (solo)', () => {
    for (const key of ['media/listening-lab', 'practice/shadow-the-model']) {
      const p = build(key);
      const sounds = p.artboards.flatMap((a) => a.logic.nodes.filter((n) => n.kind === 'action.sound'));
      expect(sounds.length, key).toBeGreaterThan(0);
      expect(sounds.every((n) => n.params.solo === true), key).toBe(true);
    }
  });
});

describe('a small secondary button', () => {
  it('is the Show transcript in the lite lesson: a pill at the top right of the transcript, not a full width button', () => {
    const lesson = buttonsByLabel('media/lite-lesson').find((b) => b.label === 'Show transcript')!;
    expect(lesson).toMatchObject({ h: 32 });
    expect(lesson.w).toBeLessThan(200);
  });
});
