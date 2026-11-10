/**
 * The checks and Show me targets of the guided tutorials. Each guide is run against the tutorial's own finished project (every
 * check must pass) and against a blank one (none may), and every target has to be somewhere in the editor.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeProject, sanitizeProject, type Project } from 'interactives-player';
import { TUTORIAL_GUIDES, TUTORIALS } from '../src/help/tutorials';
import { BUILD_TUTORIALS } from '../src/help/build';
import { topicBody } from '../src/help/topics';
import { stepsOf } from '../src/lib/tutorial-progress';
import { passing, runCheck, targetsOf, type Guide, type GuideCtx } from '../src/lib/tutorial-checks';
import * as c from '../src/lib/tutorial-checks';
import { TOUR, tourSelector, type TourId } from '../src/lib/tour-targets';
import { blankProject } from '../scripts/tutorial-examples/kit';

const examples = path.resolve(__dirname, '..', 'examples');
const load = (key: string): Project => sanitizeProject(normalizeProject(JSON.parse(readFileSync(path.join(examples, key, 'project.json'), 'utf8'))));

const ctx = (project: Project, seen = false): GuideCtx => ({
  project,
  state: { activeArtboardId: project.artboards[0].id, selection: [], tool: 'select', bottomTab: null, recording: false },
  seen: { played: seen, recorded: seen, previewed: seen },
});

//Every guided tutorial: its help topic id, its guide and the project it ends with
//(the first interaction's example has the one flow of step 3: step 5 builds a second by hand, so its check wants two)
const NOT_IN_EXAMPLE: Record<string, number[]> = { 'tutorial-first-interaction': [5] };
const guided: { id: string; guide: Guide; finished: () => Project }[] = [
  { id: 'tutorial-first-animation', guide: TUTORIAL_GUIDES['tutorial-first-animation'], finished: () => load('first-animation') },
  { id: 'tutorial-first-interaction', guide: TUTORIAL_GUIDES['tutorial-first-interaction'], finished: () => load('first-interaction') },
  { id: 'tutorial-state-machine', guide: TUTORIAL_GUIDES['tutorial-state-machine'], finished: () => load('lamp') },
  ...BUILD_TUTORIALS.filter((b) => b.guide).map((b) => ({ id: b.topic.id, guide: b.guide!, finished: () => load(b.example) })),
];

describe('guided tutorials', () => {
  it('covers the five Getting started tutorials and at least six Build it ones', () => {
    for (const t of TUTORIALS.filter((x) => x.group === 'Getting started')) expect(Object.keys(TUTORIAL_GUIDES[t.id] ?? {}).length, t.id).toBeGreaterThan(0);
    expect(BUILD_TUTORIALS.filter((b) => b.guide).map((b) => b.topic.id)).toEqual(expect.arrayContaining(['tutorial-mcq', 'tutorial-flipcards', 'tutorial-carousel', 'tutorial-branching', 'tutorial-progress', 'tutorial-sound']));
  });

  it('only talks about steps the tutorial has, and about targets that exist', () => {
    const topics = [...TUTORIALS, ...BUILD_TUTORIALS.map((b) => b.topic)];
    const all: [string, Guide][] = [...Object.entries(TUTORIAL_GUIDES), ...BUILD_TUTORIALS.filter((b) => b.guide).map((b): [string, Guide] => [b.topic.id, b.guide!])];
    for (const [id, guide] of all) {
      const steps = stepsOf(topicBody(topics.find((t) => t.id === id)!)).map((s) => s.n);
      for (const n of Object.keys(guide).map(Number)) {
        expect(steps, `${id} step ${n}`).toContain(n);
        for (const t of targetsOf(guide[n])) expect(TOUR[t], `${id} step ${n} target ${t}`).toBeDefined();
      }
    }
  });

  for (const g of guided) {
    it(`${g.id}: every check passes on its finished project`, () => {
      const p = g.finished();
      const failing = Object.keys(g.guide)
        .map(Number)
        .filter((n) => g.guide[n].check && !(NOT_IN_EXAMPLE[g.id] ?? []).includes(n) && !runCheck(g.guide[n].check, ctx(p, true)));
      expect(failing, 'steps whose check fails on the finished project').toEqual([]);
    });

    it(`${g.id}: no check passes on a blank project`, () => {
      const blank = blankProject('Untitled project');
      expect(passing(g.guide, ctx(blank))).toEqual([]);
    });
  }

  it('what happened while the tutorial was open only counts when it was seen', () => {
    const p = load('first-animation');
    expect(runCheck(c.saw('played'), ctx(p, false))).toBe(false);
    expect(runCheck(c.saw('played'), ctx(p, true))).toBe(true);
  });

  it('a check that throws, or is handed rubbish, says no', () => {
    expect(runCheck(() => { throw new Error('odd project'); }, ctx(blankProject('x')))).toBe(false);
    expect(runCheck(c.layers('rect'), { project: {} as Project, state: {} as GuideCtx['state'], seen: { played: false, recorded: false, previewed: false } })).toBe(false);
    expect(runCheck(undefined, ctx(blankProject('x')))).toBe(false);
    for (const g of guided) for (const step of Object.values(g.guide)) expect(runCheck(step.check, { project: null as never, state: null as never, seen: null as never })).toBe(false);
  });

  it('reads the project like the tutorial says: a rectangle, two keys, a click that plays a timeline, a named variable', () => {
    const anim = load('first-animation');
    expect(c.layers('rect')(ctx(anim))).toBe(true);
    expect(c.layers('rect', 2)(ctx(anim))).toBe(false);
    expect(c.keys(2)(ctx(anim))).toBe(true);
    expect(c.keys(3)(ctx(anim))).toBe(false);
    expect(c.timelines()(ctx(anim))).toBe(true);
    const flow = load('first-interaction');
    expect(c.clickThen('button', 'action.timeline')(ctx(flow))).toBe(true);
    expect(c.clickThen('rect', 'action.timeline')(ctx(flow))).toBe(false);
    expect(c.clickThen('button', 'action.timeline', undefined, 2)(ctx(flow))).toBe(false);
    const lamp = load('lamp');
    expect(c.variable('lit', 'boolean')(ctx(lamp))).toBe(true);
    expect(c.variable('lit', 'number')(ctx(lamp))).toBe(false);
    expect(c.clickThen('button', 'action.setVariable', c.setsVariable('taps'))(ctx(lamp))).toBe(true);
    expect(c.clickThen('button', 'action.setVariable', c.setsVariable('nope'))(ctx(lamp))).toBe(false);
  });
});

describe('Show me targets', () => {
  const src = (f: string) => readFileSync(path.resolve(__dirname, '..', 'src', f), 'utf8');
  const files = ['Editor.tsx', 'components/Dock.tsx', 'components/ui.tsx', 'panels/Timeline.tsx', 'panels/TimelineList.tsx', 'panels/Inspector.tsx', 'panels/ScriptsVariables.tsx', 'panels/LeftPanel.tsx'].map(src).join('\n');
  const dock = src('lib/dock.ts');

  it('every control a step can point at carries its data-tour in the editor', () => {
    for (const id of Object.keys(TOUR) as TourId[]) {
      if ((TOUR[id] as { sel?: string }).sel) continue;
      expect(tourSelector(id)).toBe(`[data-tour="${id}"]`);
      if (id.startsWith('tool-')) expect(files, id).toContain('tour={`tool-${t.tool}`}');
      else if (id.startsWith('panel-')) {
        expect(files).toContain('data-tour={`panel-${p}`}');
        expect(dock, id).toContain(`| '${id.slice(6)}'`);
      } else expect(files, id).toMatch(new RegExp(`(data-tour|tour)="${id}"`));
    }
  });
});
