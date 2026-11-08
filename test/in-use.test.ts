import { describe, expect, it } from 'vitest';
import { inUseText, sinceText } from '../src/lib/in-use';

const NOW = Date.parse('2026-11-07T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();
const none = { share: false, review: false, learners: 0, last: null, courses: [], moreCourses: 0 };

describe('the in-use warning', () => {
  it('says nothing when the links are off and nobody has records', () => {
    expect(inUseText(none, 'delete', NOW)).toBe('');
  });

  it('names the links that stop working', () => {
    expect(inUseText({ ...none, share: true, review: true }, 'delete', NOW)).toBe('Its share link (the Link for StudyDesk too) is on, and stops working.\nIts review link is on, and stops working.');
    //turning off the share link leaves the review link alone, so it isn't mentioned
    expect(inUseText({ ...none, share: true, review: true }, 'unshare', NOW)).toMatch(/^Anyone using this link/);
  });

  it('lists the learners per course, and says it is in use right now when someone was active this month', () => {
    const t = inUseText({ share: true, review: false, learners: 31, last: daysAgo(2), courses: [{ course: 'MAT1000_2026_S2', learners: 30, last: daysAgo(2) }, { course: 'MAT1000_2026_S1', learners: 1, last: daysAgo(120) }], moreCourses: 2 }, 'delete', NOW);
    expect(t).toMatch(/^This project is in use right now\. /);
    expect(t).toContain('31 learners have results or progress in it, the latest 2 days ago:');
    expect(t).toContain('• MAT1000_2026_S2: 30 learners, last active 2 days ago');
    expect(t).toContain('• MAT1000_2026_S1: 1 learner, last active on');
    expect(t).toContain('• and 2 more courses');
  });

  it('leaves out "right now" for records that are old', () => {
    expect(inUseText({ ...none, learners: 1, last: daysAgo(90), courses: [{ course: 'X', learners: 1, last: daysAgo(90) }] }, 'delete', NOW)).toMatch(/^1 learner has results/);
  });

  it('words recent days plainly', () => {
    expect(sinceText(daysAgo(0), NOW)).toBe('today');
    expect(sinceText(daysAgo(1), NOW)).toBe('yesterday');
    expect(sinceText(daysAgo(10), NOW)).toBe('10 days ago');
  });
});
