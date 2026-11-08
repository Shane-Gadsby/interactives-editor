//The player (src/course.ts) and the server (shared/course.mjs) each clean names and work out what an add changes, and they have to agree:
//the player shows what the store replied, the server decides what is kept. Same inputs, same answers.
import { describe, expect, it } from 'vitest';
import { applyCoursePlan, cleanCollection, cleanCount, cleanCounterName, cleanCounts, courseChanged, planCourseAdd, uniqueStamps } from 'interactives-player';
import * as server from '../shared/course.mjs';

const NAMES = ['Passport', ' passport ', 'My.Badges$!', 'café', 'CAFÉ', '', '   ', 'x'.repeat(100), 'a_b-c', '日本語', 'tab\tname', 7, null, {}];
const STAMPS = ['Gold star', 'gold  STAR', '', 'Map', 7, {}, 'x'.repeat(200), 'hello\u0000world', 'a​b'];
const NUMBERS = [3, '4.5', -2, 1e12, NaN, '', 'x', 1.23456, 0, null, Infinity];

describe('player and server agree', () => {
  it('on a collection and counter name', () => {
    for (const n of NAMES) {
      expect(server.cleanCollection(n)).toBe(cleanCollection(n));
      expect(server.cleanCounterName(n)).toBe(cleanCounterName(n));
    }
  });

  it('on stamps and counts', () => {
    expect(server.uniqueStamps(STAMPS)).toEqual(uniqueStamps(STAMPS));
    for (const n of NUMBERS) expect(server.cleanCount(n)).toBe(cleanCount(n));
    const counts = { Quizzes: 2, quizzes: 5, bad: 'x', '': 1, 'A.b': 3 };
    expect(server.cleanCounts(counts)).toEqual(cleanCounts(counts));
  });

  it('on what an add changes, and what is left after it', () => {
    const haves = [{}, { stamps: ['Gold star'], counts: { quizzes: 3 } }, { stamps: Array.from({ length: 200 }, (_, i) => `s${i}`), counts: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`c${i}`, 1])) }];
    const adds = [{}, { stamps: ['gold star', 'Map'], counts: { quizzes: 2, visits: 1 } }, { stamps: ['new'], counts: { extra: 4, c0: 2, quizzes: 9 } }];
    for (const have of haves) {
      for (const add of adds) {
        const mine = planCourseAdd(have, add);
        const theirs = server.planAdd(have, add);
        expect(theirs).toEqual(mine);
        expect(server.changed(theirs)).toBe(courseChanged(mine));
        expect(server.applyPlan(have, theirs)).toEqual(applyCoursePlan(have, mine));
      }
    }
  });

  it('on the limits', () => {
    expect(server.LIMITS).toMatchObject({ collections: 20, collectionName: 40, stamp: 60, stamps: 200, counterName: 40, counters: 100, maxCount: 1e9 });
  });
});
