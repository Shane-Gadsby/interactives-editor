import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { csvRows, pasteLayout, parsePastedQuestions } from '../src/lib/paste-questions';
import { docxText, fileQuestionText, xlsxText } from '../src/lib/office-text';
import { applyGift } from '../src/lib/gift-import';
import { createProject, type Project } from 'interactives-player';
import * as tpl from '../shared/question-template.mjs';

const read = (name: string) => new Uint8Array(readFileSync(join(process.cwd(), 'public/templates', name)));
const shape = (src: string) => parsePastedQuestions(src).questions.map((q) => ({ kind: q.kind, prompt: q.prompt, right: q.options.filter((o) => o.correct).map((o) => o.text), n: q.options.length, answers: q.answers, pairs: q.pairs.map((p) => `${p.term}=${p.match}`), fb: q.generalFeedback }));

describe('paste questions: lines', () => {
  it('reads a choice question with * marks and letters', () => {
    const p = parsePastedQuestions('1. Which planet is closest to the Sun?\na) Venus\nb) Mercury *\nc) Earth\nd) Mars');
    expect(p.skipped).toEqual([]);
    expect(p.questions).toHaveLength(1);
    const q = p.questions[0];
    expect(q.kind).toBe('single');
    expect(q.prompt).toBe('Which planet is closest to the Sun?');
    expect(q.options.map((o) => o.text)).toEqual(['Venus', 'Mercury', 'Earth', 'Mars']);
    expect(q.options.map((o) => o.correct)).toEqual([false, true, false, false]);
  });

  it('takes the marks wherever they sit: before, after, boxes, ticks, and unlabelled lines from a Word list', () => {
    expect(shape('Pick one\n*Red\nBlue\nGreen')[0].right).toEqual(['Red']);
    expect(shape('Pick one\nRed\nBlue ✓\nGreen')[0].right).toEqual(['Blue']);
    expect(shape('Pick one\n[ ] Red\n[x] Blue\n[ ] Green')[0].right).toEqual(['Blue']);
    expect(shape('Pick one\n- Red\n- Blue (correct)\n- Green')[0].right).toEqual(['Blue']);
    expect(shape('Pick one\n(a) Red\n(b) *Blue\n(c) Green')[0].right).toEqual(['Blue']);
  });

  it('takes the right answer from an Answer line: a letter, a number or the text', () => {
    expect(shape('Q?\nA. Red\nB. Blue\nC. Green\nAnswer: B')[0].right).toEqual(['Blue']);
    expect(shape('Q?\nRed\nBlue\nGreen\nAnswer: 3')[0].right).toEqual(['Green']);
    expect(shape('Q?\nRed\nBlue\nGreen\nAnswer: blue')[0].right).toEqual(['Blue']);
    const multi = shape('Q?\nA. Red\nB. Blue\nC. Green\nAnswers: A, C')[0];
    expect(multi.kind).toBe('multiple');
    expect(multi.right).toEqual(['Red', 'Green']);
  });

  it('makes it Multiple answer when several are right, and says so when Multiple choice was asked for', () => {
    const p = parsePastedQuestions('Type: Multiple choice\nQ?\nRed *\nBlue *\nGreen');
    expect(p.questions[0].kind).toBe('multiple');
    expect(p.questions[0].notes[0]).toMatch(/Multiple answer/);
    expect(parsePastedQuestions('Type: Multiple answer\nQ?\nRed *\nBlue\nGreen').questions[0].kind).toBe('multiple');
  });

  it('reads true/false from an Answer line or marked True/False choices', () => {
    for (const src of ['The sky is blue.\nAnswer: True', 'Type: True/False\nThe sky is blue.\nAnswer: T', 'The sky is blue.\nTrue *\nFalse', 'The sky is blue.\na) True *\nb) False']) {
      const q = parsePastedQuestions(src).questions[0];
      expect(q.kind).toBe('truefalse');
      expect(q.options).toEqual([{ text: 'True', correct: true }, { text: 'False', correct: false }]);
    }
    expect(parsePastedQuestions('Grass is red.\nAnswer: false').questions[0].options[1].correct).toBe(true);
  });

  it('reads fill in the blank answers split by |', () => {
    const q = parsePastedQuestions('Type: Fill in the blank\nWater is ____.\nAnswer: H2O | h2o').questions[0];
    expect(q.kind).toBe('blank');
    expect(q.answers).toEqual(['H2O', 'h2o']);
    expect(parsePastedQuestions('The capital of France is ____.\nAnswer: Paris').questions[0].kind).toBe('blank');
  });

  it('reads matching from term = match lines, with -> or a tab too', () => {
    for (const sep of [' = ', ' -> ', '=', '\t']) {
      const q = parsePastedQuestions(`Match them.\nFrance${sep}Paris\nJapan${sep}Tokyo`).questions[0];
      expect(q.kind).toBe('matching');
      expect(q.pairs).toEqual([{ term: 'France', match: 'Paris' }, { term: 'Japan', match: 'Tokyo' }]);
    }
  });

  it('reads Title and Feedback lines, and several questions split by blank lines, numbering the report by line', () => {
    const p = parsePastedQuestions('Title: Planets\nQ1: Closest planet?\nVenus\nMercury *\nFeedback: Closest, yes.\n\n\n2) Is it round?\nAnswer: True\n\nNo question here at all\nOnly one thing');
    expect(p.questions).toHaveLength(2);
    expect(p.questions[0]).toMatchObject({ title: 'Planets', prompt: 'Closest planet?', generalFeedback: 'Closest, yes.', line: 1 });
    expect(p.questions[1].line).toBe(8);
    expect(p.skipped).toHaveLength(1);
    expect(p.skipped[0].line).toBe(11);
  });

  it('keeps going past what it cannot read, and says why', () => {
    const p = parsePastedQuestions('Pick\nRed\nBlue\n\nPick\nRed *\n\nType: Riddle\nWhat?\nA\nB\n\nPick\nRed\nBlue\nAnswer: Z\n\nTrue/false one\nTrue *\nFalse *');
    const reasons = p.skipped.map((s) => s.reason);
    expect(reasons[0]).toMatch(/No choice is marked/);
    expect(reasons[1]).toMatch(/at least two choices/);
    expect(reasons[2]).toMatch(/type "Riddle"/);
    expect(reasons[3]).toMatch(/"Z" is not one of its choices/);
    expect(p.questions).toHaveLength(0);
  });

  it('does not throw on odd input', () => {
    for (const s of ['', '   \n\n', '\t\t\n\t', 'Answer:', 'a,b,c\n"unclosed', '\u0000\u0001', 'x'.repeat(5000)]) expect(() => parsePastedQuestions(s)).not.toThrow();
    expect(parsePastedQuestions('').questions).toEqual([]);
  });
});

describe('paste questions: rows', () => {
  const header = ['Type', 'Question', 'Option 1', 'Option 2', 'Option 3', 'Correct', 'Feedback'];
  const tsv = (rows: string[][]) => rows.map((r) => r.join('\t')).join('\n');

  it('reads tab separated rows under a header, as pasted from Excel or a Word table', () => {
    const src = tsv([header, ['Multiple choice', 'Closest planet?', 'Venus', 'Mercury', 'Earth', 'B', 'Yes.'], ['', 'Round?', '', '', '', 'True', '']]);
    expect(pasteLayout(src)).toBe('tabs');
    const p = parsePastedQuestions(src);
    expect(p.skipped).toEqual([]);
    expect(p.questions.map((q) => q.kind)).toEqual(['single', 'truefalse']);
    expect(p.questions[0].options[1]).toEqual({ text: 'Mercury', correct: true });
    expect(p.questions[0].generalFeedback).toBe('Yes.');
    expect(p.questions[0].line).toBe(2);
    expect(p.questions[1].line).toBe(3);
  });

  it('knows a header by its words and in any column order', () => {
    const src = tsv([['Feedback', 'Correct answer', 'Choice A', 'Choice B', 'Prompt'], ['Yes', '2', 'Venus', 'Mercury', 'Closest planet?']]);
    const q = parsePastedQuestions(src).questions[0];
    expect(q.prompt).toBe('Closest planet?');
    expect(q.options[1].correct).toBe(true);
  });

  it('with no header: the first cell is the question and the rest are choices with * marks', () => {
    const src = tsv([['Closest planet?', 'Venus', 'Mercury *', 'Earth'], ['Colour of grass?', 'Green*', 'Red']]);
    const p = parsePastedQuestions(src);
    expect(p.questions.map((q) => q.options.filter((o) => o.correct).map((o) => o.text))).toEqual([['Mercury'], ['Green']]);
  });

  it('reads CSV with quotes, commas, doubled quotes and line breaks in a cell, and semicolons', () => {
    expect(csvRows('a,"b,c","say ""hi""","x\ny"\r\n1,2,3,4\r\n')).toEqual([['a', 'b,c', 'say "hi"', 'x\ny'], ['1', '2', '3', '4']]);
    const csv = 'Type,Question,Option 1,Option 2,Correct\r\nMultiple choice,"Which, if any?",A,B,B\r\n';
    expect(pasteLayout(csv)).toBe('csv');
    expect(parsePastedQuestions(csv).questions[0].prompt).toBe('Which, if any?');
    const semi = 'Type;Question;Option 1;Option 2;Correct\nMultiple choice;Which?;A;B;A';
    expect(parsePastedQuestions(semi).questions[0].options[0].correct).toBe(true);
  });

  it('puts blank answers and matching pairs in the option cells', () => {
    const src = tsv([header, ['Fill in the blank', 'Water is ____.', 'H2O', 'h2o', '', '', ''], ['Matching', 'Match.', 'a = 1', 'b = 2', '', '', '']]);
    const [blank, matching] = parsePastedQuestions(src).questions;
    expect(blank.answers).toEqual(['H2O', 'h2o']);
    expect(matching.pairs).toEqual([{ term: 'a', match: '1' }, { term: 'b', match: '2' }]);
  });

  it('skips a bad row with its row number and carries on', () => {
    const src = tsv([header, ['', 'No answer given', 'A', 'B', '', '', ''], ['', 'Fine', 'A', 'B', '', 'A', '']]);
    const p = parsePastedQuestions(src);
    expect(p.skipped).toHaveLength(1);
    expect(p.skipped[0]).toMatchObject({ line: 2 });
    expect(p.questions).toHaveLength(1);
  });
});

describe('the templates', () => {
  const expected = shape(tpl.EXAMPLES.flatMap((e, i) => [i ? '' : null, tpl.exampleLines(e).join('\n')]).filter((x: unknown) => x !== null).join('\n\n'));

  it('the worked examples are read as one of each question type', () => {
    expect(expected.map((q) => q.kind)).toEqual(['single', 'multiple', 'truefalse', 'blank', 'matching']);
    expect(expected[0].right).toEqual(['Mercury']);
    expect(expected[1].right).toEqual(['Dolphin', 'Bat']);
    expect(expected[3].answers).toEqual(['H2O', 'h2o']);
    expect(expected[4].pairs).toHaveLength(3);
  });

  it('the Word template, read back, gives the same five questions and nothing else', () => {
    const text = docxText(read('question-template.docx'));
    const p = parsePastedQuestions(text);
    expect(p.skipped).toEqual([]);
    expect(shape(text)).toEqual(expected);
  });

  it('the Excel template, read back, gives the same five questions and nothing else', () => {
    const text = xlsxText(read('question-template.xlsx'));
    expect(pasteLayout(text)).toBe('tabs');
    const p = parsePastedQuestions(text);
    expect(p.skipped).toEqual([]);
    expect(shape(text)).toEqual(expected);
  });

  it('the CSV template, read back, gives the same five questions and nothing else', () => {
    const text = new TextDecoder().decode(read('question-template.csv'));
    expect(pasteLayout(text)).toBe('csv');
    expect(parsePastedQuestions(text).skipped).toEqual([]);
    expect(shape(text)).toEqual(expected);
  });

  it('the committed files are what the script builds (run npm run templates:questions after a change)', () => {
    for (const [name, make] of Object.entries(tpl.TEMPLATE_FILES)) {
      const built = make();
      const onDisk = read(name);
      expect(Buffer.compare(Buffer.from(built), Buffer.from(onDisk)), name).toBe(0);
    }
  });

  it('a Word table and a Word list both come out of a .docx', async () => {
    const bytes = read('question-template.docx');
    const file = { name: 'q.docx', arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } as unknown as File;
    expect(await fileQuestionText(file)).toContain('Type: Multiple choice');
    const old = { name: 'q.doc' } as unknown as File;
    await expect(fileQuestionText(old)).rejects.toThrow(/Save it as/);
  });

  it('the questions it reads go into a project as kit questions', () => {
    const p: Project = createProject('Paste');
    const parse = parsePastedQuestions(new TextDecoder().decode(read('question-template.csv')));
    const done = applyGift(p, parse, p.artboards[0].id);
    expect(done.artboardIds).toHaveLength(5);
  });
});
