//Your first visual novel and Add a puzzle: a step's check isn't already done on the template you start from, and every checked
//step is done on the tutorial's finished example
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeProject, sanitizeProject, type Project } from 'interactives-player';
import { BUILD_TUTORIALS } from '../src/help/build';
import { runCheck, type GuideCtx } from '../src/lib/tutorial-checks';
import { visualNovel } from '../src/lib/story-template';

const ctx = (project: Project): GuideCtx => ({ project, state: { activeArtboardId: '', selection: [], tool: 'select', bottomTab: 'story', recording: false } as never, seen: { played: false, recorded: false, previewed: false } });
const example = (key: string): Project => sanitizeProject(normalizeProject(JSON.parse(readFileSync(path.resolve(__dirname, '..', 'examples', key, 'project.json'), 'utf8'))));

describe('the story tutorials', () => {
  for (const [id, key, already] of [['tutorial-visual-novel', 'tut-visual-novel', [1]], ['tutorial-add-puzzle', 'tut-add-puzzle', []]] as const) {
    it(`${id}: nothing past the start is done on the template, and every checked step is done on the example`, () => {
      const t = BUILD_TUTORIALS.find((b) => b.topic.id === id)!;
      expect(t.example).toBe(key);
      const start = ctx(visualNovel().project);
      const done = ctx(example(key));
      for (const [n, step] of Object.entries(t.guide!)) {
        if (!step.check) continue;
        const usesPreview = String(step.check).includes('previewed') || n === '4' && id === 'tutorial-visual-novel' || n === '5' && id === 'tutorial-add-puzzle';
        if (usesPreview) continue;
        expect(runCheck(step.check, start), `${id} step ${n} on the template`).toBe((already as readonly number[]).includes(Number(n)));
        expect(runCheck(step.check, done), `${id} step ${n} on the example`).toBe(true);
      }
    });
  }
});
