//The GIFT reader: every question type the kit takes, the escapes, feedback, and the list of what is left out and why.
import { describe, expect, it } from 'vitest';
import { giftReportLines, parseGift, unescapeGift } from '../src/lib/gift';

const one = (src: string) => {
  const r = parseGift(src);
  expect(r.skipped).toEqual([]);
  expect(r.questions).toHaveLength(1);
  return r.questions[0];
};
const skipped = (src: string) => {
  const r = parseGift(src);
  expect(r.questions).toEqual([]);
  expect(r.skipped).toHaveLength(1);
  return r.skipped[0];
};

describe('escapes', () => {
  it('unescapes the special characters and \\n', () => {
    expect(unescapeGift('a\\~b\\=c\\#d\\{e\\}f\\:g\\\\h')).toBe('a~b=c#d{e}f:g\\h');
    expect(unescapeGift('one\\ntwo')).toBe('one\ntwo');
    expect(unescapeGift('\\\\n')).toBe('\\n');
  });
  it('keeps an escaped brace, tilde, equals and hash out of the answer syntax', () => {
    const q = one('Which is valid JS \\{ \\}?\n{\n=let a \\= \\{\\};\n~a \\= 1 \\# \\~\n}');
    expect(q.prompt).toBe('Which is valid JS { }?');
    expect(q.options.map((o) => o.text)).toEqual(['let a = {};', 'a = 1 # ~']);
    expect(q.options.map((o) => o.correct)).toEqual([true, false]);
  });
  it('reads an escaped :: as text and a title with escaped colons', () => {
    const q = one('::Part 1\\: basics::What is 2+2?\n{=4 ~5}');
    expect(q.title).toBe('Part 1: basics');
    expect(q.prompt).toBe('What is 2+2?');
  });
  it('does not treat a literal \\#### as general feedback', () => {
    const q = one('Pick\n{=a ~b\\#\\#\\#\\#c}');
    expect(q.options[1].text).toBe('b####c');
    expect(q.generalFeedback).toBe('');
  });
});

describe('multiple choice and multiple response', () => {
  it('one = and some ~ is multiple choice', () => {
    const q = one('::Primes::Which is prime?{\n~9\n=11\n~15\n}');
    expect(q).toMatchObject({ kind: 'single', title: 'Primes', prompt: 'Which is prime?', line: 1 });
    expect(q.options.map((o) => [o.text, o.correct])).toEqual([['9', false], ['11', true], ['15', false]]);
  });
  it('several = with ~ is a multiple response (what the Word converter writes)', () => {
    const q = one('Which are fruit (select all that apply):\n{\n=Apple\n~Carrot\n=Banana\n~Potato\n}');
    expect(q.kind).toBe('multiple');
    expect(q.options.filter((o) => o.correct).map((o) => o.text)).toEqual(['Apple', 'Banana']);
  });
  it('weighted ~%50% answers are a multiple response, negatives wrong', () => {
    const q = one('Which?\n{\n~%50%A\n~%50%B\n~%-50%C\n~%-50%D\n}');
    expect(q.kind).toBe('multiple');
    expect(q.options.map((o) => o.correct)).toEqual([true, true, false, false]);
    expect(q.notes).toEqual([]);
  });
  it('weights with the converter 33.33333 shares', () => {
    const q = one('Which?\n{\n~%33.33333%A\n~%33.33333%B\n~%33.33333%C\n~%-33.33333%D\n}');
    expect(q.options.map((o) => o.correct)).toEqual([true, true, true, false]);
  });
  it('a full answer with part-mark near misses is single choice and says so', () => {
    const q = one('Which?\n{\n=%100%A\n~%50%B\n~%25%C\n~D\n}');
    expect(q.kind).toBe('single');
    expect(q.options.map((o) => o.correct)).toEqual([true, false, false, false]);
    expect(q.notes.join(' ')).toMatch(/part marks/);
  });
  it('unequal part marks across right answers say the kit scores by share', () => {
    const q = one('Which?\n{\n~%70%A\n~%30%B\n~%-100%C\n}');
    expect(q.kind).toBe('multiple');
    expect(q.notes.join(' ')).toMatch(/share of right choices/);
  });
  it('answer feedback goes on the option and #### is the general feedback', () => {
    const q = one('Capital of France?\n{\n=Paris # Yes!\n~Lyon # It is bigger than it is famous.\n~Nice\n####Paris has been the capital since 987.\n}');
    expect(q.options.map((o) => o.feedback)).toEqual(['Yes!', 'It is bigger than it is famous.', undefined]);
    expect(q.generalFeedback).toBe('Paris has been the capital since 987.');
    expect(q.options[0].text).toBe('Paris');
  });
  it('the text after the braces makes a missing word question with a gap', () => {
    const q = one('Pick the {=right ~wrong} word.');
    expect(q.prompt).toBe('Pick the _____ word.');
    expect(q.kind).toBe('single');
  });
  it('multi-line questions, braces on their own lines, CRLF and a BOM', () => {
    const q = one('\uFEFFLine one\r\nLine two\r\n{\r\n=Yes\r\n~No\r\n}\r\n');
    expect(q.prompt).toBe('Line one\nLine two');
    expect(q.options.map((o) => o.text)).toEqual(['Yes', 'No']);
  });
  it('skips a question with no right answer, one choice, or an empty choice', () => {
    expect(skipped('Q?\n{~a ~b}').reason).toMatch(/marked right/);
    expect(skipped('Q?\n{~a}').reason).toMatch(/only one choice/);
    expect(skipped('Q?\n{=a ~ }').reason).toMatch(/empty/);
  });
  it('skips more choices than the kit holds', () => {
    const many = Array.from({ length: 31 }, (_, i) => (i ? '~' : '=') + `opt${i}`).join('\n');
    expect(skipped(`Q?\n{\n${many}\n}`).reason).toMatch(/holds 30/);
  });
});

describe('true or false', () => {
  it('reads T, F, TRUE and FALSE in any case', () => {
    for (const [a, t] of [['T', true], ['F', false], ['true', true], ['FALSE', false]] as const) {
      const q = one(`The sky is blue.{${a}}`);
      expect(q.kind).toBe('truefalse');
      expect(q.options.map((o) => [o.text, o.correct])).toEqual([['True', t], ['False', !t]]);
    }
  });
  it('first feedback is for the wrong answer, second for the right one', () => {
    const q = one('Grant is buried in Grant\'s tomb.{FALSE#Check again.#Right: he is not.}');
    expect(q.options.find((o) => o.correct)).toMatchObject({ text: 'False', feedback: 'Right: he is not.' });
    expect(q.options.find((o) => !o.correct)).toMatchObject({ text: 'True', feedback: 'Check again.' });
  });
  it('keeps general feedback on a true or false', () => {
    const q = one('Q.\n{T####Because.}');
    expect(q.generalFeedback).toBe('Because.');
  });
});

describe('short answer and numerical as fill in the blank', () => {
  it('collects every = answer', () => {
    const q = one('Who wrote 1984?\n{=George Orwell =Orwell =Eric Blair}');
    expect(q).toMatchObject({ kind: 'blank', prompt: 'Who wrote 1984?' });
    expect(q.answers).toEqual(['George Orwell', 'Orwell', 'Eric Blair']);
  });
  it('a missing word becomes a gap in the prompt', () => {
    expect(one('Paris is the capital of {=France}.').prompt).toBe('Paris is the capital of _____.');
  });
  it('turns a * wildcard into a pattern and escapes the rest', () => {
    const q = one('Name a Beatle.\n{=John * =Paul (Mc*)? =a.b}');
    expect(q.answers).toEqual(['/^John .*$/i', '/^Paul \\(Mc.*\\)\\?$/i', 'a.b']);
  });
  it('an answer that already looks like a /pattern/ is matched literally', () => {
    expect(one('Path?\n{=/usr/bin/}').answers).toEqual(['/^\\/usr\\/bin\\/$/i']);
  });
  it('drops answers worth part marks and says so', () => {
    const q = one('Q?\n{=yes =%50%maybe}');
    expect(q.answers).toEqual(['yes']);
    expect(q.notes.join(' ')).toMatch(/part marks/);
  });
  it('notes dropped answer feedback', () => {
    expect(one('Q?\n{=yes#Good}').notes.join(' ')).toMatch(/Feedback on individual answers/);
  });
  it('numerical: plain, margin, range and several', () => {
    expect(one('Pi?\n{#3.14159}')).toMatchObject({ kind: 'blank', answers: ['3.14159'] });
    expect(one('Pi?\n{#3.14:0.01}')).toMatchObject({ answers: ['3.14'], tolerance: 0.01 });
    expect(one('Between?\n{#1..5}')).toMatchObject({ answers: ['3'], tolerance: 2 });
    expect(one('x?\n{#1.1..1.3}')).toMatchObject({ answers: ['1.2'], tolerance: 0.1 });
    const q = one('Year?\n{#=1822:0 =1823:0}');
    expect(q.answers).toEqual(['1822', '1823']);
    expect(q.tolerance).toBeUndefined();
  });
  it('numerical answers with a different margin are left out with a note', () => {
    const q = one('N?\n{#=10:1 =20:5}');
    expect(q.answers).toEqual(['10']);
    expect(q.tolerance).toBe(1);
    expect(q.notes.join(' ')).toMatch(/one margin of error/);
  });
  it('a numerical answer that is not a number is skipped', () => {
    expect(skipped('N?\n{#lots}').reason).toMatch(/not a number/);
    expect(skipped('N?\n{#*}').reason).toMatch(/not a number/);
  });
});

describe('matching', () => {
  it('reads the pairs', () => {
    const q = one('Match capitals.\n{\n=France -> Paris\n=Japan -> Tokyo\n=Peru -> Lima\n}');
    expect(q).toMatchObject({ kind: 'matching', prompt: 'Match capitals.' });
    expect(q.pairs).toEqual([{ term: 'France', match: 'Paris' }, { term: 'Japan', match: 'Tokyo' }, { term: 'Peru', match: 'Lima' }]);
  });
  it('drops an extra wrong match (nothing on the left) with a note', () => {
    const q = one('M.\n{=a -> 1 =b -> 2 =c -> 3 = -> 99}');
    expect(q.pairs).toHaveLength(3);
    expect(q.notes.join(' ')).toMatch(/extra wrong match/);
  });
  it('skips fewer than two pairs, more than the kit holds, and a ~ line', () => {
    expect(skipped('M.\n{=a -> 1}').reason).toMatch(/at least two/);
    const nine = Array.from({ length: 9 }, (_, i) => `=t${i} -> m${i}`).join('\n');
    expect(skipped(`M.\n{\n${nine}\n}`).reason).toMatch(/holds 8/);
    expect(skipped('M.\n{=a -> 1 ~b -> 2}').reason).toMatch(/every line/);
  });
  it('general feedback ends the block, it is not a pair', () => {
    const q = one('M.\n{=a -> 1 =b -> 2 ####Well done.}');
    expect(q.pairs).toHaveLength(2);
    expect(q.generalFeedback).toBe('Well done.');
  });
});

describe('what is left out, and why', () => {
  it('essay: empty braces', () => {
    expect(skipped('Discuss at length.\n{}').reason).toMatch(/Essay/);
  });
  it('description: text with no braces', () => {
    expect(skipped('Read the next passage carefully.').reason).toMatch(/description/);
  });
  it('an unclosed brace and two sets of braces', () => {
    expect(skipped('Q?\n{=a ~b').reason).toMatch(/never closed/);
    expect(skipped('Q {=a ~b} and {=c ~d}').reason).toMatch(/more than one set/);
  });
  it('answers with stray text, no marks', () => {
    expect(skipped('Q?\n{stuff =a ~b}').reason).toMatch(/not marked/);
  });
  it('a question with no text', () => {
    expect(skipped('::T::\n{=a ~b}').reason).toMatch(/no question text/);
  });
  it('an unclosed block does not swallow the questions after it', () => {
    const r = parseGift('Broken {=a ~b\n\n::Next::Fine?\n{=yes ~no}\n');
    expect(r.skipped).toHaveLength(1);
    expect(r.questions.map((q) => q.title)).toEqual(['Next']);
  });
  it('a block with a blank line inside its braces stays one question', () => {
    const q = one('Q?\n{\n=a\n\n~b\n}');
    expect(q.options.map((o) => o.text)).toEqual(['a', 'b']);
  });
  it('the report names the line and title or the start of the text', () => {
    const r = parseGift('Fine?\n{=a ~b}\n\n::Long one::\nWrite about it.\n{}\n\nA description here.\n');
    const lines = giftReportLines(r);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^Line 4 \(Long one\) was left out\. Essay/);
    expect(lines[1]).toMatch(/^Line 8 \("A description here\."\) was left out/);
  });
  it('the report carries a question\'s notes after the left out ones', () => {
    const r = parseGift('Q?\n{=yes =%50%maybe}\n\nEssay?\n{}');
    const lines = giftReportLines(r);
    expect(lines[0]).toMatch(/Essay/);
    expect(lines[1]).toMatch(/^Line 1 \("Q\?"\): /);
  });
});

describe('file level', () => {
  it('ignores // comments and counts $CATEGORY lines in a note', () => {
    const r = parseGift('// a comment\n$CATEGORY: $course$/top/Week 1\n\n// question: 12  name: x\n::A::Q?{=a ~b}\n\n$CATEGORY: other\n\n::B::Q2?{T}\n');
    expect(r.questions.map((q) => q.title)).toEqual(['A', 'B']);
    expect(r.skipped).toEqual([]);
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]).toMatch(/2 category lines ignored/);
  });
  it('a // inside a line is text, not a comment', () => {
    expect(one('See http://example.com now?\n{T}').prompt).toBe('See http://example.com now?');
  });
  it('reads many questions of different types in one file', () => {
    const r = parseGift('A?{T}\n\nB?\n{=x ~y}\n\nC?{=z}\n\nD?\n{=a -> 1 =b -> 2}\n\nE?{#4}\n');
    expect(r.questions.map((q) => q.kind)).toEqual(['truefalse', 'single', 'blank', 'matching', 'blank']);
    expect(r.questions.map((q) => q.line)).toEqual([1, 3, 6, 8, 11]);
  });
  it('an empty or non string input is no questions', () => {
    expect(parseGift('')).toEqual({ questions: [], skipped: [], notes: [] });
    expect(parseGift('\n\n  \n// only a comment\n').questions).toEqual([]);
    expect(parseGift(undefined as unknown as string).questions).toEqual([]);
  });
});

describe('html format', () => {
  it('strips tags and decodes entities, noting what was lost', () => {
    const q = one('[html]<p>What is <b>1 &lt; 2</b>?</p><img src="x.png">\n{=<i>True</i>&nbsp;enough ~no}');
    expect(q.prompt).toBe('What is 1 < 2?');
    expect(q.options[0].text).toBe('True enough');
    expect(q.notes.join(' ')).toMatch(/picture/);
    expect(q.notes.join(' ')).toMatch(/formatting/);
  });
  it('leaves angle brackets alone in the default format', () => {
    expect(one('What does <b> do?\n{=bold ~italic}').prompt).toBe('What does <b> do?');
  });
  it('[markdown] and [plain] markers are removed and the text kept', () => {
    expect(one('[markdown]Is **this** fine?{T}').prompt).toBe('Is **this** fine?');
  });
  it('notes maths markup', () => {
    expect(one('Solve $$x^2=4$$.\n{=2 ~3}').notes.join(' ')).toMatch(/maths/);
  });
});

describe('real GIFT from the suite converter', () => {
  const sample = `Raw score is the test score, before standardisation. Why? (Briefly justify your answer in up to 50 words)
{
=True
~False
}

A child receives a stanine score of 7 on a reading test (where a stanine of 5 \\= average and higher scores \\= better reading). What does this indicate?
{
~The child is below average
=The child is above average
~The child has a reading disability
####Stanines run 1 to 9.
}

Which two are true?
{
~%50%Larger samples are stable.
~%50%Stratified sampling helps.
~%-50%Samples never matter.
~%-50%Only one group matters.
}

Match the term to its group.
{
=Mean -> Average
=Median -> Middle
}
`;
  it('reads it all without anything left out', () => {
    const r = parseGift(sample);
    expect(r.skipped).toEqual([]);
    expect(r.questions.map((q) => q.kind)).toEqual(['single', 'single', 'multiple', 'matching']);
    expect(r.questions[1].prompt).toContain('a stanine of 5 = average and higher scores = better reading');
    expect(r.questions[1].generalFeedback).toBe('Stanines run 1 to 9.');
    expect(giftReportLines(r)).toEqual([]);
  });
});
