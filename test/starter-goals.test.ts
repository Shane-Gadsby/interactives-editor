import { describe, expect, it } from 'vitest';
import { BRANDED_STARTERS } from '../src/lib/branded';
import { STARTERS } from '../src/lib/template-starters';
import { FIRST_RUN, GOALS, GOAL_KEYS, goalsOf, plainTags, starterMatches } from '../src/lib/starter-goals';
import { pickForKey, starterPlayHtml, starterProject } from '../src/lib/starter-pick';

const all = [...STARTERS, ...BRANDED_STARTERS];

describe('what each starter is for', () => {
  it('every built-in starter belongs to at least one goal, and every goal has starters', () => {
    expect(all.filter((s) => !goalsOf(s.key).length).map((s) => s.key)).toEqual([]);
    for (const g of GOALS) expect(all.filter((s) => goalsOf(s.key).includes(g.id)).length, g.id).toBeGreaterThanOrEqual(3);
  });

  it('only names starters that exist', () => {
    const keys = new Set(all.map((s) => s.key));
    expect(GOAL_KEYS.filter((k) => !keys.has(k))).toEqual([]);
  });

  it('the first-run suggestions all exist, each goal offers three, and each is for that goal', () => {
    for (const g of GOALS) {
      const keys = FIRST_RUN[g.id];
      expect(keys, g.id).toHaveLength(3);
      for (const k of keys) {
        expect(pickForKey(k), k).not.toBeNull();
        expect(goalsOf(k), `${k} for ${g.id}`).toContain(g.id);
      }
    }
  });

  it('a starter that is not listed by name falls back on the goal of its set', () => {
    expect(goalsOf('assessment/something-new')).toEqual(['quiz']);
    expect(goalsOf('media/something-new')).toEqual(['media']);
    expect(goalsOf('nothing-like-it')).toEqual([]);
  });
});

describe('tags in an author\'s words', () => {
  const jargon = ['variables', 'question kit', 'repeater', 'tries', 'list variable', 'user data', 'server marked'];
  it('hides the tool\'s own words on every card, and never leaves a card with none', () => {
    for (const s of all) {
      const shown = plainTags(s.tags, s.key);
      expect(shown.length, s.key).toBeGreaterThan(0);
      expect(shown.length, s.key).toBeLessThanOrEqual(4);
      for (const j of jargon) expect(shown, s.key).not.toContain(j);
    }
  });

  it('keeps the plain ones, renames a few, and puts "keyboard friendly" last', () => {
    expect(plainTags(['question kit', 'variables', 'hotspot', 'keyboard friendly', 'pictures'], 'assessment/x')).toEqual(['clickable spots', 'pictures', 'keyboard friendly']);
  });

  it('stands the goal in for a card that has only the tool\'s words', () => {
    expect(plainTags(['variables'], 'games/x')).toEqual(['practise']);
  });
});

describe('searching starters', () => {
  const quiz = STARTERS.find((s) => s.key === 'quiz')!;
  it('needs every word, anywhere in the name, description, tags or goal', () => {
    expect(starterMatches('', quiz)).toBe(true);
    expect(starterMatches('quiz', quiz)).toBe(true);
    expect(starterMatches('QUIZ multiple', quiz)).toBe(true);
    expect(starterMatches('quiz timeline', quiz)).toBe(false);
  });

  it('still finds a starter by the tool\'s own word that its card no longer shows', () => {
    expect(plainTags(quiz.tags, quiz.key)).not.toContain('question kit');
    expect(starterMatches('question kit', quiz)).toBe(true);
  });

  it('finds starters by what they are for', () => {
    const hits = all.filter((s) => starterMatches('test what learners know', s)).length;
    expect(hits).toBeGreaterThanOrEqual(10);
  });
});

describe('a starter built in memory', () => {
  it('makes the same project the Use button does, with its checklist, and nothing saved', () => {
    const p = starterProject(pickForKey('quiz')!);
    expect(p.template?.builtin).toBe('quiz');
    expect(p.template?.checklist.length).toBeGreaterThan(0);
    const b = starterProject(pickForKey('assessment/multi-page-quiz')!);
    expect(b.template?.builtin).toBe('branded:assessment/multi-page-quiz');
  });

  it('builds a page to play without asking the server anything', async () => {
    const calls: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (u: RequestInfo | URL) => {
      calls.push(String(u));
      throw new Error('no server in this test');
    }) as typeof fetch;
    try {
      const html = await starterPlayHtml(pickForKey('quiz')!);
      expect(html).toContain('<html');
      expect(html.length).toBeGreaterThan(10_000);
      expect(calls.filter((u) => /api\//.test(u))).toEqual([]);
    } finally {
      globalThis.fetch = real;
    }
  }, 30_000);
});
