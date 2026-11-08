/**
 * Small helpers the assessment starters share: a hero page with its Start button, a panel, and the pass at the end that makes the
 * question kit's frames sit in the brand. Variables and the interaction graph builders are in ../../graph-kit.ts (re-exported here).
 */
import { createNode, walk, type Artboard, type FrameNode, type LogicNode, type NoteColour, type Project, type Question, type SceneNode, type TextNode } from 'interactives-player';
import { addQuestion, partsOf, setQuestionSettings, syncQuestion } from '../../../question-kit';
import { lookDefaults } from '../../../themes';
import { BRAND_FONT } from '../../looks';
import { addNote, brandedPage, button, contentBox, navBarY, solid, stroke, text, type BrandedCtx } from '../../kit';
import { fill, progressBar, stack } from '../../parts';
import { after, bind, click, goNext, goPrevious, graph } from '../../graph-kit';

export { addVar as variable, after, announce, bind, clearVar, click, go, goNext, goPrevious, graph, graphNote, setVar, toggleVar } from '../../graph-kit';
export { addNote };

/** A sticky note under a page (outside its bounds, so never over content): one to three lines, `**bold**` the key word, `[ ]` for what the author must do. */
export function noteBelow(page: Artboard, n: { text: string; x?: number; w?: number; colour?: NoteColour }) {
  return addNote(page, { x: n.x ?? 0, y: page.height + 14, w: n.w ?? 440, h: 84, text: n.text, colour: n.colour ?? 'sky' });
}

/** The wire the question kit made for a slot of a question (`check:action`, `reset:action`, `option:action`...) on a page. */
export function kitNode(page: Artboard, slot: string): LogicNode {
  const n = page.logic.nodes.find((x) => x.kit?.slot === slot);
  if (!n) throw new Error(`no question node ${slot} on ${page.name}`);
  return n;
}

/** A hero page with its Start button, the way every starter opens. */
export function heroPage(ctx: BrandedCtx, title: string, subtitle: string, label = 'Start'): { page: Artboard; start: SceneNode } {
  const page = brandedPage(ctx, title, { kind: 'hero', subtitle });
  const start = button(ctx, 'Start button', label, 48, page.height * 0.42 + 190, 200);
  page.children.push(start);
  return { page, start };
}

/** A small caption in the muted colour, e.g. under a card. */
export const note = (ctx: BrandedCtx, name: string, value: string, x: number, y: number, width: number, extra: Record<string, unknown> = {}) =>
  text(ctx, name, value, x, y, width, { fontSize: 15, color: ctx.L.muted, ...extra });

/** A panel: a frame on the warm grey surface that its children sit in. */
export function panel(ctx: BrandedCtx, name: string, x: number, y: number, width: number, height: number, children: SceneNode[] = [], extra: Record<string, unknown> = {}): FrameNode {
  return createNode('frame', { name, x, y, width, height, cornerRadius: 16, fill: solid(ctx.L.surface), stroke: null, clip: false, children, ...extra }) as FrameNode;
}

/**
 * The question kit builds with the toolbox's plain look. Brings a kit frame into the brand: pill buttons, rounder corners, and
 * the input boxes on tokens (their factory defaults are plain colours).
 */
export function brandQuestionFrame(ctx: BrandedCtx, frame: FrameNode): void {
  frame.cornerRadius = 16;
  walk(frame.children, (n) => {
    if (n.type === 'button') {
      //a pill (the small hint button) keeps to its own height
      n.cornerRadius = Math.min(22, n.height / 2);
      n.fontWeight = 600;
      //edges that stand off the card by 3:1, the same as the starters' own buttons (kit.ts button)
      if (n.questionPart === 'check') n.stroke = stroke(ctx.L.onButton);
      else {
        n.fill = solid(ctx.L.background);
        n.stroke = stroke(ctx.L.border);
        n.color = ctx.L.text;
      }
    }
    //The kit's orange and muted small text on the grey card is too faint
    if (n.type === 'text' && (n.questionPart === 'score' || n.questionPart === 'blankAnswer')) n.color = ctx.L.text;
    if (n.type === 'input') Object.assign(n, lookDefaults(ctx.project, 'input'), { cornerRadius: 10 });
    if (n.type === 'text' || n.type === 'button' || n.type === 'input') n.fontFamily = BRAND_FONT;
  });
}

export { stroke };

/**
 * The score page every quiz here ends on, laid out as one auto layout column so nothing can land on anything else: a card with the
 * big score on the left, the message and the buttons beside it, then whatever `below` holds (a review list, a row of result chips).
 * `message` is the text of the heading (`{...}` expressions are fine), `messageColor` an expression for its colour.
 */
export function scorePage(ctx: BrandedCtx, page: Artboard, o: { label: string; score: string; caption?: string; lines?: TextNode[]; message: string; messageColor?: string; buttons: SceneNode[]; below?: SceneNode[]; scoreSize?: number }) {
  const { L } = ctx;
  const body = contentBox(page);
  const scoreLabel = text(ctx, 'Score label', o.label, 0, 0, 100, { fontSize: 18, fontWeight: 600, color: L.muted });
  const score = text(ctx, 'Score', o.score, 0, 0, 100, { fontSize: o.scoreSize ?? 56, fontWeight: 700, lineHeight: 1.1 });
  const kids: SceneNode[] = [scoreLabel, score];
  if (o.caption) kids.push(text(ctx, 'Score words', o.caption, 0, 0, 100, { fontSize: 18, color: L.muted }));
  kids.push(...(o.lines ?? []));
  const card = stack('Score card', 0, 0, 380, { gap: 8, padding: 28, box: { fill: solid(L.surface), cornerRadius: 16 }, children: kids });
  const message = text(ctx, 'Result message', o.message, 0, 0, 100, { fontSize: 26, fontWeight: 600, lineHeight: 1.3, role: 'heading', headingLevel: 2, ...(o.messageColor ? { bindings: { color: o.messageColor } } : {}) });
  const buttons = stack('Result buttons', 0, 0, 100, { direction: 'row', gap: 12, align: 'start', children: o.buttons });
  //three buttons are wider than the column beside the score: they wrap onto a second line instead of running off the page
  buttons.layout!.wrap = true;
  const side = fill(stack('Result column', 0, 0, 100, { gap: 20, children: [message, buttons] }));
  const top = stack('Score row', 0, 0, body.width, { direction: 'row', gap: 40, align: 'start', children: [card, side] });
  const column = stack('Result body', body.x, body.y, body.width, { gap: 24, children: [top, ...(o.below ?? [])] });
  page.children.push(column);
  return { card, message, score, body: column };
}

/**
 * A question that goes through the rows of a list variable once (a question bank run, `end: 'finish'`), on its own page, for the rapid
 * quizzes: the question kit keeps the position, the score and the missed rows (`<prefix>_set...`), so the starter has no counters. The
 * kit's frame is trimmed to what a quick question needs (no Check button when `autoCheck`: picking an option checks it, no Hint), the
 * Next button reads "See my result" on the last one and its "set done" output goes to the next page, and a progress bar and the running
 * score sit above it. `explain` is an expression for the explanation shown under the verdict.
 */
export function bankQuestion(ctx: BrandedCtx, project: Project, play: Artboard, o: { kind: 'single' | 'truefalse'; name: string; items: string; patch: Partial<Question>; noun: string; explain?: (P: string) => string; explainWhen?: (P: string) => string; nextWhen?: (P: string) => string; progressLabel: string; tally?: boolean; compose?: boolean }) {
  const box = contentBox(play);
  const id = addQuestion(project, play.id, o.kind, { at: { x: box.x, y: box.y } })!;
  setQuestionSettings(project, play.id, id, { points: 1, attempts: 1, reveal: true, report: null, ...o.patch, bank: { items: o.items, order: 'sequence', end: 'finish' } });
  const frame = play.children.find((c) => c.id === id) as FrameNode;
  const P = frame.question!.prefix;
  frame.name = o.name;
  frame.layout = { ...frame.layout!, gap: 12, padding: { top: 16, right: 24, bottom: 16, left: 24 } };
  //Picking an option is the answer: no Check button and no Hint, and the explanation under the verdict
  const row = partsOf(frame).buttons[0] as FrameNode;
  row.children = row.children.filter((c) => c.questionPart === 'reset');
  Object.assign(partsOf(frame).prompt[0], { fontSize: 26 });
  const explanation = o.explain ? bind(text(ctx, 'Explanation', `{${o.explain(P)}}`, 0, 0, 200, { fontSize: 18, lineHeight: 1.35, autoSize: 'height' }), { visible: o.explainWhen?.(P) ?? `${P}_answered` }) : null;
  if (explanation) frame.children.splice(frame.children.findIndex((c) => c.questionPart === 'feedback') + 1, 0, explanation);
  syncQuestion(project, play.id, id);
  brandQuestionFrame(ctx, frame);
  //after the sync, which sets the Next button's own wording and when it shows
  const next = partsOf(frame).reset[0];
  next.bindings = { ...next.bindings, label: `${P}_setLeft == 0 ? "See my result" : "Next ${o.noun}"`, ...(o.nextWhen ? { visible: o.nextWhen(P) } : {}) };
  const bar = fill(progressBar(ctx, `${o.noun[0].toUpperCase()}${o.noun.slice(1)}s answered`, 0, 0, 100, { value: `${P}_setCount - ${P}_setLeft`, max: `${P}_setCount`, label: o.progressLabel, valueText: '{value} of {max} answered' }));
  const tally = text(ctx, 'Running tally', `Correct so far: {${P}_setScore} of {${P}_setCount - ${P}_setLeft}`, 0, 0, 100, { fontSize: 18, fontWeight: 600, color: ctx.L.muted, autoSize: 'width', align: 'right' });
  const progressRow = stack('Progress row', 0, 0, box.width, { direction: 'row', gap: 24, align: 'center', children: o.tally === false ? [bar] : [bar, tally] });
  //the frame leaves the page for a stack: this one, or the caller's own
  play.children = play.children.filter((c) => c.id !== id);
  const body = stack('Play body', box.x, box.y, box.width, { gap: 16, children: [progressRow, frame] });
  if (o.compose !== false) play.children.push(body);
  //Picking an option checks it straight away, and the last Next goes on to the result
  const check = after(play, kitNode(play, 'option:action'), 'action.questionCheck', { question: frame.id });
  after(play, kitNode(play, 'reset:action'), 'action.artboard', { to: 'next', transition: 'fade', duration: 250 }, 'done');
  //The page can be reached again after a review of the missed ones, which has dealt the first of them already: arriving keeps the row showing
  kitNode(play, 'start:action').params.next = false;
  return { frame, P, body, next, explanation, check, progressRow };
}

/**
 * Back and Next on the bottom bar of a question page (Back at the left of the content box, Next at the right), the same place on every
 * page. Next goes to the next page in the page order and waits for the question (`prefix`) to be finished, and reads "See my score" on
 * the page before the last; Back goes to the page before. They are the last layers on the page, so the tab order is the question, then
 * Back, then Next.
 */
export function questionNav(ctx: BrandedCtx, page: Artboard, prefix: string) {
  const box = contentBox(page);
  const y = navBarY(page);
  const next = bind(button(ctx, 'Next button', 'Next', box.x + box.width - 170, y, 170), { disabled: `!${prefix}_locked`, label: 'pageNumber == pageCount - 1 ? "See my score" : "Next"' });
  const back = button(ctx, 'Back button', 'Back', box.x, y, 110, false);
  page.children.push(back, next);
  const g = graph(page);
  const nextClick = click(g, next, 'Navigation');
  g.run(nextClick, goNext());
  g.run(click(g, back, 'Navigation'), goPrevious());
  return { next, back, nextClick };
}
