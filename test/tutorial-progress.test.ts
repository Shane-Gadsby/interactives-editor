import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATALOG, TUTORIAL_SETS } from '../src/help/tutorial-catalog';
import { BUILD_TUTORIALS } from '../src/help/build';
import { CONCEPTS } from '../src/help/concepts';
import { finish, newSets, restart, setStatus, setStep, stepNumber, stepsOf, ticked, countDone, isDone } from '../src/lib/tutorial-progress';

const steps = [1, 2, 3].map((n) => ({ n, title: `s${n}` }));

describe('numbered steps', () => {
  it('reads ## 1. and ### 1. headings, not code blocks or other headings', () => {
    const body = ['## 1. Make a project', 'text', '```', '## 2. In code', '```', '### 3. Under a part', '## Go further', '## What you learned'].join('\n');
    expect(stepsOf(body)).toEqual([
      { n: 1, title: 'Make a project' },
      { n: 3, title: 'Under a part' },
    ]);
  });
  it('knows a step heading from the markdown level and text', () => {
    expect(stepNumber('3. Draw it', 2)).toBe(3);
    expect(stepNumber('3. Draw it', 3)).toBe(3);
    expect(stepNumber('3. Draw it', 1)).toBeNull();
    expect(stepNumber('Go further', 2)).toBeNull();
  });
});

describe('ticking steps and finishing', () => {
  it('ticks, unticks and keeps the steps in order', () => {
    let m = setStep(undefined, 't', steps, 2, true).map;
    m = setStep(m, 't', steps, 1, true).map;
    expect(m.t.steps).toEqual([1, 2]);
    m = setStep(m, 't', steps, 2, false).map;
    expect(ticked(m, 't', steps)).toEqual([1]);
    expect(setStep(m, 't', steps, 1, false).map).toEqual({});
  });
  it('the last tick finishes the tutorial once, and the badge stays when a step is unticked', () => {
    let c = setStep(undefined, 't', steps, 1, true, 100);
    c = setStep(c.map, 't', steps, 2, true, 200);
    expect(c.finished).toBe(false);
    c = setStep(c.map, 't', steps, 3, true, 300);
    expect(c.finished).toBe(true);
    expect(c.map.t.done).toBe(300);
    const again = setStep(c.map, 't', steps, 3, true, 400);
    expect(again.finished).toBe(false);
    expect(again.map.t.done).toBe(300);
    expect(isDone(setStep(c.map, 't', steps, 2, false).map, 't')).toBe(true);
  });
  it('finish counts every step (or a concept with none), restart clears it', () => {
    const m = finish(undefined, 't', steps, 50);
    expect(m.finished).toBe(true);
    expect(m.map.t).toEqual({ steps: [1, 2, 3], done: 50 });
    expect(finish(m.map, 't', steps).finished).toBe(false);
    expect(finish(undefined, 'c', [], 7).map.c).toEqual({ done: 7 });
    expect(restart(m.map, 't')).toEqual({});
  });
  it('ignores ticked steps a tutorial no longer has', () => {
    expect(ticked({ t: { steps: [1, 9] } }, 't', steps)).toEqual([1]);
  });
});

describe('sets', () => {
  const set = { id: 's', name: 'S', members: ['a', 'b'] };
  it('is earned when every member is done, and newSets says which a change completed', () => {
    const one = { a: { done: 1 } };
    const both = { a: { done: 1 }, b: { done: 2 } };
    expect(setStatus(one, set)).toMatchObject({ done: 1, total: 2, earned: false });
    expect(setStatus(both, set).earned).toBe(true);
    expect(newSets(one, both, [set]).map((s) => s.id)).toEqual(['s']);
    expect(newSets(both, both, [set])).toEqual([]);
    expect(countDone(both, ['a', 'b', 'c'])).toBe(2);
  });
});

describe('what the screens list', () => {
  it('has every Build it tutorial, every Getting started one and every Concept, from the help registries', () => {
    expect(CATALOG.filter((c) => c.group === 'Build it').map((c) => c.id)).toEqual(BUILD_TUTORIALS.map((b) => b.topic.id));
    expect(CATALOG.filter((c) => c.group === 'Concepts')).toHaveLength(CONCEPTS.length);
    expect(CATALOG.filter((c) => c.group === 'Getting started').length).toBe(5);
  });
  it('gives every tutorial numbered steps and a finished example where it has one', () => {
    for (const c of CATALOG.filter((c) => c.group !== 'Concepts')) expect(c.steps.length, c.id).toBeGreaterThan(1);
    for (const b of BUILD_TUTORIALS) expect(CATALOG.find((c) => c.id === b.topic.id)!.example).toBe(b.example);
  });
  it('every finished example a card offers is in the examples index', () => {
    const keys = new Set((JSON.parse(readFileSync('examples/index.json', 'utf8')) as { key: string }[]).map((e) => e.key));
    for (const c of CATALOG) if (c.example) expect(keys.has(c.example), `${c.id} -> ${c.example}`).toBe(true);
  });
  it('step numbers are a clean run from 1 in every tutorial', () => {
    for (const c of CATALOG.filter((c) => c.group !== 'Concepts')) expect(c.steps.map((s) => s.n), c.id).toEqual(c.steps.map((_, i) => i + 1));
  });
  it('puts every Build it tutorial in exactly one theme set, and no set is empty', () => {
    const themes = TUTORIAL_SETS.filter((s) => !['getting-started', 'build-it', 'concepts'].includes(s.id));
    const all = themes.flatMap((s) => s.members);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(BUILD_TUTORIALS.map((b) => b.topic.id).sort());
    for (const s of TUTORIAL_SETS) expect(s.members.length, s.id).toBeGreaterThan(0);
  });
});
