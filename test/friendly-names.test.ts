import { describe, expect, it } from 'vitest';
import { friendlyIdentifier, nameFromWords, variableOption } from '../src/lib/friendly-names';

describe('friendly variable names', () => {
  it('turns words into a camel case identifier', () => {
    expect(friendlyIdentifier('Quiz score')).toBe('quizScore');
    expect(friendlyIdentifier('  how many   times? ')).toBe('howManyTimes');
    expect(friendlyIdentifier('QUIZ SCORE')).toBe('quizScore');
    expect(friendlyIdentifier('Café visits!')).toBe('cafeVisits');
    expect(friendlyIdentifier('high-score')).toBe('highScore');
  });

  it('leaves an identifier alone, and fixes a leading digit or a word formulas use', () => {
    expect(friendlyIdentifier('high_score')).toBe('high_score');
    expect(friendlyIdentifier('quizScore')).toBe('quizScore');
    expect(friendlyIdentifier('2nd try')).toBe('_2ndTry');
    expect(friendlyIdentifier('9lives')).toBe('_9lives');
    expect(friendlyIdentifier('event')).toBe('eventValue');
  });

  it('has nothing to offer for text with no letter or digit', () => {
    expect(friendlyIdentifier('???')).toBe('');
    expect(friendlyIdentifier('   ')).toBe('');
    expect(nameFromWords('???', [])).toBeNull();
    expect(nameFromWords('', [])).toBeNull();
  });

  it('keeps the words as the label, picks a free name, and gives a plain name no label', () => {
    expect(nameFromWords('Quiz score', ['x'])).toEqual({ label: 'Quiz score', name: 'quizScore' });
    expect(nameFromWords('Quiz score', ['quizScore'])).toEqual({ label: 'Quiz score', name: 'quizScore2' });
    expect(nameFromWords('score', [])).toEqual({ name: 'score' });
  });

  it('picker rows lead with the words and put the name small after them', () => {
    expect(variableOption({ name: 'quizScore', label: 'Quiz score' }, 'number')).toEqual({ value: 'quizScore', label: 'Quiz score', hint: 'quizScore · number' });
    expect(variableOption({ name: 'score' }, 'number')).toEqual({ value: 'score', label: 'score', hint: 'number' });
  });
});
