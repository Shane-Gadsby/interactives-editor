//The player (src/shared.ts) and the server (shared/responses.mjs) each clean, compare and count answers, and they have to agree: the page
//shows what the player worked out from a reply, the server decides what is kept. Same inputs, same answers.
import { describe, expect, it } from 'vitest';
import { answerKey, cleanAnswer, cleanSharedSettings, isBlockedAnswer, tallyAnswers } from 'interactives-player';
// @ts-expect-error plain ESM shared with index.js
import * as server from '../shared/responses.mjs';

const WORDS = ['Focus', ' focus ', 'FOCUS', 'sleep  time', 'Sleep time', '', '   ', 'x'.repeat(200), 'café', 'CafÉ', 'hello\u0000world', 'a​b', 'class', 'ass', 'Ass!', 'what the ass', 'a bad phrase here', 'bad', '‮evil', 42, null, { a: 1 }];

describe('player and server agree', () => {
  it('on cleaning an answer', () => {
    for (const w of WORDS) for (const max of [5, 40, 120]) expect(server.cleanAnswer(w, max)).toBe(cleanAnswer(w, max));
  });

  it('on what two answers are compared by', () => {
    for (const w of WORDS.filter((x) => typeof x === 'string')) expect(server.answerKey(w as string)).toBe(answerKey(w as string));
  });

  it('on what is blocked', () => {
    const lists = [[], ['ass'], ['bad phrase'], ['ASS', ' bad phrase ', 'x'], ['"quoted"']];
    for (const list of lists) for (const w of WORDS.filter((x) => typeof x === 'string')) expect(server.isBlocked(w, list)).toBe(isBlockedAnswer(w as string, list));
  });

  it('on counting', () => {
    const people = [['Focus', 'sleep time', 'focus'], ['FOCUS ', 'ass'], ['sleep  time', 'class'], ['one'], []];
    for (const minCount of [1, 2, 3]) {
      for (const blocked of [[], ['ass'], ['one']]) {
        const mine = tallyAnswers(people, minCount, (t) => !isBlockedAnswer(t, blocked));
        const theirs = server.tally(people, { minCount, blocked });
        expect(theirs).toEqual(mine);
      }
    }
  });

  it('on the settings and their defaults', () => {
    for (const raw of [undefined, {}, { who: 'me', perPerson: 9, maxLength: 3000, minCount: 4, blocked: [' a ', 5] }, { perPerson: -1, minCount: 'x' }]) {
      const c = cleanSharedSettings(raw);
      const d = server.cleanDeclaration(raw);
      expect(d).toMatchObject({ who: c.who, maxLength: c.maxLength, perPerson: c.perPerson, minCount: c.minCount, blocked: c.blocked, byVariable: !!c.whoVariable });
    }
  });
});
