//Puts the questions a GIFT file held (see gift.ts) into a project: one artboard per question, each built by the question kit's own
//"Add question", so they are ordinary kit questions afterwards. Then the report of what was left out.
import { createArtboard, type FrameNode, type Project, type Question } from 'interactives-player';
import { uniqueName } from '../store/doc';
import { store } from '../store/store';
import { track } from './analytics';
import { pickFiles } from './insert';
import { parseGift, giftReportLines, type GiftParse, type GiftQuestion } from './gift';
import { addQuestion, setQuestionSettings } from './question-kit';

/** Past this a file's questions are not all made: a hundred artboards is already a lot to scroll the canvas through. */
export const MAX_IMPORT = 100;
const PER_ROW = 4;
const GAP = 100;

const GIFT_ACCEPT = '.gift,.txt,text/plain';

/** What the kit question needs changed from a fresh one of its kind. */
function settingsFor(g: GiftQuestion): Partial<Question> {
  const patch: Partial<Question> = { prompt: g.prompt };
  if (g.generalFeedback) patch.feedbackCorrect = `Correct! ${g.generalFeedback}`;
  if (g.kind === 'blank') patch.blanks = [{ id: 'b1', label: '', answers: g.answers, ...(g.tolerance ? { tolerance: g.tolerance } : {}) }];
  else if (g.kind === 'matching') patch.pairs = g.pairs.map((p, i) => ({ id: `p${i + 1}`, term: p.term, match: p.match }));
  else patch.options = g.options.map((o, i) => ({ id: `o${i + 1}`, text: o.text, ...(o.correct ? { correct: true } : {}), ...(o.feedback ? { feedback: o.feedback } : {}) }));
  return patch;
}

const nameFor = (g: GiftQuestion, n: number) => (g.title || `Question ${n}`).slice(0, 60);

export interface GiftApplied {
  artboardIds: string[];
  /** The questions past MAX_IMPORT, which were not made. */
  left: GiftQuestion[];
}

/**
 * Add each question to the project on its own artboard, in rows below what is already on the canvas. An open artboard with
 * nothing on it (a new project's Home) takes the first one instead of being left empty. Pure over the draft, like the kit's own functions.
 */
export function applyGift(d: Project, parse: GiftParse, activeId?: string | null): GiftApplied {
  const todo = parse.questions.slice(0, MAX_IMPORT);
  const names = d.artboards.map((a) => a.name);
  const left = d.artboards.length ? Math.min(...d.artboards.map((a) => a.canvasX)) : 0;
  const top = d.artboards.length ? Math.max(...d.artboards.map((a) => a.canvasY + a.height)) + GAP : 0;
  const idle = d.artboards.find((a) => a.id === activeId && !a.children.length && !a.logic.nodes.length);
  const out: string[] = [];
  let made = 0;
  todo.forEach((g, i) => {
    let ab = i === 0 ? idle : undefined;
    if (!ab) {
      const col = made % PER_ROW;
      const row = Math.floor(made / PER_ROW);
      ab = createArtboard({ name: uniqueName(names, nameFor(g, i + 1)), canvasX: left + col * (800 + GAP), canvasY: top + row * (600 + GAP) });
      d.artboards.push(ab);
      names.push(ab.name);
      made++;
    }
    const frameId = addQuestion(d, ab.id, g.kind);
    if (!frameId) return;
    setQuestionSettings(d, ab.id, frameId, settingsFor(g));
    //A long question runs past the default artboard height, so grow it to hold the card
    const frame = ab.children.find((c) => c.id === frameId) as FrameNode | undefined;
    if (frame && typeof frame.height === 'number') ab.height = Math.max(ab.height, Math.ceil(frame.y + frame.height + 40));
    out.push(ab.id);
  });
  return { artboardIds: out, left: parse.questions.slice(MAX_IMPORT) };
}

//importers.ts has the same one, but it drags the exporter (and the built player) in, which a unit test of this file does not want
const showReport = (title: string, lines: string[], mark?: number) => {
  const s = store();
  if (mark !== undefined) lines.length ? s.setReportUndo(title, lines, mark) : s.toastUndo(title, mark);
  else lines.length ? s.set({ report: { title, lines } }) : s.toast(title);
};

/**
 * Put a parse into the open project (on artboards, as kit questions) and say what happened. Shared by the GIFT file command and
 * Paste questions; `source` is what the report calls where they came from, `thing` what analytics records.
 */
export function addParsed(parse: GiftParse, source: string, thing: string): number {
  const s = store();
  const lines = giftReportLines(parse);
  if (!parse.questions.length) {
    track('feature', 'question-import', { thing: `${thing}-empty` });
    showReport(`No questions found in ${source}`, lines.length ? lines : ['Nothing in it was a question.']);
    return 0;
  }
  let applied: GiftApplied = { artboardIds: [], left: [] };
  const mark = s.historyMark();
  s.update((d) => void (applied = applyGift(d as Project, parse, s.get().activeArtboardId)));
  track('feature', 'question-import', { thing });
  if (applied.left.length) lines.push(`Only the first ${MAX_IMPORT} questions were added. ${applied.left.length} more were not. Add the rest separately.`);
  const first = applied.artboardIds[0];
  if (first) {
    s.set({ activeArtboardId: first, artboardSelected: true, selection: [] });
  }
  const n = applied.artboardIds.length;
  showReport(`Imported ${n} question${n === 1 ? '' : 's'} from ${source}${parse.skipped.length ? `, ${parse.skipped.length} left out` : ''}`, lines, mark);
  return n;
}

/** The Import questions command: pick a GIFT file, add its questions, and say what was left out. */
export async function importGiftFile(): Promise<void> {
  const [file] = await pickFiles(GIFT_ACCEPT, false);
  if (!file) return;
  let parse: GiftParse;
  try {
    parse = parseGift(await file.text());
  } catch {
    store().toast('That file could not be read as GIFT.', 'error');
    return;
  }
  const lines = giftReportLines(parse);
  if (!parse.questions.length) {
    track('feature', 'question-import', { thing: 'gift-empty' });
    showReport(`No questions found in ${file.name}`, lines.length ? lines : ['The file has no GIFT questions in it.']);
    return;
  }
  addParsed(parse, file.name, 'gift');
}
