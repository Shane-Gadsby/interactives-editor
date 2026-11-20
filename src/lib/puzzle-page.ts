import { createArtboard, createNode, uid, type Artboard, type LogicEdge, type LogicNode, type Project, type Question, type QuestionKind, type SceneNode } from 'interactives-player';
import { addQuestion, setQuestionSettings } from './question-kit';
import { STAGE_H, STAGE_W } from './story';

/**
 * A puzzle's frame: the number, title and value along the top, the hints and the coins down the side, a memo to scribble on,
 * Skip, and the big Right and Not quite moments. Plain layers bound to `puzzle.*` and wired with the puzzle nodes, so it
 * restyles like anything else and needs no wiring of its own. A question on the page answers the puzzle when it's checked.
 */

const INK = '#f5f2ea';
const DARK = '#15141c';
const BAND = 'rgba(12, 11, 18, 0.88)';
const PANEL = '#232130';
const ACCENT = '#c8a24a';
const solid = (color: string) => ({ type: 'solid' as const, color });

/** The frame's top bar, by name: a page that has it already has the frame. */
export const PUZZLE_FRAME_NAME = 'Puzzle bar';

type Wiring = { nodes: LogicNode[]; edges: LogicEdge[] };

function onClick(w: Wiring, target: SceneNode, ...actions: { kind: string; params?: Record<string, unknown> }[]): void {
  const y = 40 + w.nodes.length * 40;
  const ev: LogicNode = { id: uid('n'), kind: 'event.pointer', x: 40, y, params: { type: 'click', target: target.id } };
  w.nodes.push(ev);
  let prev = ev;
  actions.forEach((a, i) => {
    const n: LogicNode = { id: uid('n'), kind: a.kind, x: 320 + i * 260, y, params: a.params ?? {} };
    w.nodes.push(n);
    w.edges.push({ id: uid('e'), from: prev.id, fromPort: 'out', to: n.id, toPort: 'in' });
    prev = n;
  });
}

const text = (name: string, value: string, x: number, y: number, width: number, height: number, extra: Record<string, unknown> = {}) =>
  createNode('text', { name, text: value, x, y, width, height, fontSize: 20, color: INK, autoSize: 'none', ...extra } as never);

const button = (name: string, label: string, x: number, y: number, width: number, extra: Record<string, unknown> = {}) =>
  createNode('button', { name, label, x, y, width, height: 48, fontSize: 18, fontWeight: 600, cornerRadius: 12, fill: solid('rgba(255, 255, 255, 0.92)'), color: DARK, ...extra } as never);

/** The frame's layers and wiring for a page `w` by `h`. The puzzle itself goes in the space left of the side column, under the band. */
export function puzzleFrame(w = STAGE_W, h = STAGE_H): { layers: SceneNode[]; wiring: Wiring } {
  const wiring: Wiring = { nodes: [], edges: [] };
  const side = 220;
  const sx = w - side - 24;

  //Along the top: Puzzle 1, its title, what it's worth and the coins
  const band = createNode('rect', { name: 'Band', x: 0, y: 0, width: w, height: 64, fill: solid(BAND), decorative: true } as never);
  const label = text('Number', 'Puzzle 1', 24, 14, 150, 36, { fontSize: 22, fontWeight: 700, color: ACCENT, bindings: { text: 'puzzle.label' } });
  const title = text('Title', 'The puzzle', 180, 14, w - 180 - 460, 36, { fontSize: 22, fontWeight: 600, role: 'heading', headingLevel: 1, overflow: 'ellipsis', bindings: { text: 'puzzle.title' } });
  const value = text('Value', '30 points', w - 440, 18, 200, 30, { align: 'right', bindings: { text: "puzzle.solved && !puzzle.right ? 'Solved: ' + puzzle.score + ' points' : puzzle.value + ' points'" } });
  const coins = text('Coins', 'Hint coins: 3', w - 224, 18, 200, 30, { align: 'right', bindings: { text: "'Hint coins: ' + puzzle.coins" } });
  const top = createNode('frame', { name: PUZZLE_FRAME_NAME, x: 0, y: 0, width: w, height: 64, fill: null, children: [band, label, title, value, coins] });

  //Down the side: a button for each hint (what it costs until it's open), the memo and Skip
  const hint = button('Hint button', 'Hint 1', 0, 0, side, {
    height: 44,
    fontSize: 16,
    bindings: {
      label: "item.open ? item.label : item.label + ' (' + item.cost + (item.cost == 1 ? ' coin)' : ' coins)')",
      disabled: '!item.open && !item.canOpen',
      'fill.color': `item.open ? '${ACCENT}' : 'rgba(255, 255, 255, 0.92)'`,
    },
  });
  const hints = createNode('frame', { name: 'Hints', x: sx, y: 88, width: side, height: 212, fill: null, repeat: { items: 'puzzle.hints', layout: 'vertical', gap: 12, columns: 1 }, children: [hint] });
  onClick(wiring, hint, { kind: 'action.puzzleHint', params: { do: 'open', hint: 'event.index + 1' } });
  const noHints = text('No hints', 'No hints for this one.', sx, 88, side, 30, { fontSize: 16, color: 'rgba(245, 242, 234, 0.7)', bindings: { visible: 'puzzle.hints.length == 0' } });
  const short = text('Not enough coins', 'Not enough hint coins. Look around for more.', sx, 310, side, 52, { fontSize: 15, lineHeight: 1.3, color: '#f2b8a0', bindings: { visible: 'puzzle.short' } });
  const memo = button('Memo', 'Memo', sx, h - 148, side, { bindings: { label: "puzzle.memo ? 'Close the memo' : 'Memo'", ariaPressed: "puzzle.memo ? 'true' : 'false'" } });
  onClick(wiring, memo, { kind: 'action.puzzleMemo', params: { to: 'toggle' } });
  const skip = button('Skip', 'Skip for now', sx, h - 84, side, { fill: solid('rgba(255, 255, 255, 0.14)'), color: INK, bindings: { label: "puzzle.solved ? 'Back' : 'Skip for now'" } });
  onClick(wiring, skip, { kind: 'action.puzzleLeave', params: { skip: true } });

  //The memo: a sketch pad over the puzzle, to work things out on
  const pad = createNode('rect', { name: 'Memo pad', x: 0, y: 64, width: sx - 24, height: h - 64, fill: solid('rgba(255, 252, 235, 0.16)'), sketch: { colour: '#fff3b0', size: 4 }, ariaLabel: 'Memo: draw here to work the puzzle out', bindings: { visible: 'puzzle.memo' } } as never);

  //A hint being read
  const cw = 560;
  const cx = (sx - 24 - cw) / 2;
  const cardHead = text('Hint heading', 'Hint 1', 24, 20, cw - 48, 32, { fontSize: 22, fontWeight: 700, color: ACCENT, role: 'heading', headingLevel: 2, bindings: { text: 'puzzle.hintLabel' } });
  const cardText = text('Hint words', 'The hint.', 24, 64, cw - 48, 84, { fontSize: 19, lineHeight: 1.45, autoSize: 'height', bindings: { text: 'puzzle.hintText' } });
  const cardClose = button('Close the hint', 'Got it', 24, 164, 160, { height: 44, fill: solid(ACCENT) });
  onClick(wiring, cardClose, { kind: 'action.puzzleHint', params: { do: 'close' } });
  const card = createNode('frame', { name: 'Hint card', x: cx, y: 150, width: cw, height: 232, fill: solid(PANEL), cornerRadius: 16, stroke: { color: ACCENT, width: 2 }, role: 'dialog', ariaLabel: 'Hint', children: [cardHead, cardText, cardClose], bindings: { visible: 'puzzle.showing > 0' } } as never);

  //The big moments: right, and not quite
  const dim = (name: string, visible: string) => createNode('rect', { name, x: 0, y: 0, width: w, height: h, fill: solid('rgba(8, 8, 14, 0.72)'), decorative: true, bindings: { visible } } as never);
  const pw = 520;
  const px = (w - pw) / 2;
  const rightHead = text('Right heading', 'Solved!', 0, 36, pw, 70, { fontSize: 56, fontWeight: 800, color: ACCENT, align: 'center', role: 'heading', headingLevel: 2 });
  const rightWords = text('Right words', '30 points', 0, 116, pw, 36, { fontSize: 22, align: 'center', bindings: { text: "puzzle.replay || puzzle.won == 0 ? 'Solved again. Well done.' : puzzle.won + ' points'" } });
  const onward = button('Continue', 'Continue', (pw - 220) / 2, 184, 220, { fill: solid(ACCENT) });
  onClick(wiring, onward, { kind: 'action.puzzleLeave', params: { skip: false } });
  const right = createNode('frame', { name: 'Right', x: px, y: (h - 270) / 2, width: pw, height: 270, fill: solid(PANEL), cornerRadius: 20, role: 'dialog', ariaLabel: 'Solved', children: [rightHead, rightWords, onward], bindings: { visible: 'puzzle.right' } } as never);
  const wrongHead = text('Wrong heading', 'Not quite.', 0, 36, pw, 64, { fontSize: 48, fontWeight: 800, color: '#f2b8a0', align: 'center', role: 'heading', headingLevel: 2 });
  const wrongWords = text('Wrong words', 'It is worth 27 points now.', 0, 110, pw, 34, { fontSize: 20, align: 'center', bindings: { text: "'It is worth ' + puzzle.value + ' points now.'" } });
  const again = button('Try the puzzle again', 'Try again', pw / 2 - 230, 178, 220, { fill: solid(ACCENT) });
  const leave = button('Leave it for now', 'Leave it for now', pw / 2 + 10, 178, 220, { fill: solid('rgba(255, 255, 255, 0.14)'), color: INK });
  onClick(wiring, again, { kind: 'action.puzzleAnswer', params: { answer: 'again' } });
  onClick(wiring, leave, { kind: 'action.puzzleLeave', params: { skip: true } });
  const wrong = createNode('frame', { name: 'Not quite', x: px, y: (h - 260) / 2, width: pw, height: 260, fill: solid(PANEL), cornerRadius: 20, role: 'dialog', ariaLabel: 'Not quite', children: [wrongHead, wrongWords, again, leave], bindings: { visible: 'puzzle.wrong' } } as never);

  //Top level, not in a frame over the page: a frame that size would take the clicks meant for the puzzle under it
  return { layers: [pad, top, hints, noHints, short, memo, skip, card, dim('Right dim', 'puzzle.right'), right, dim('Not quite dim', 'puzzle.wrong'), wrong], wiring };
}

/** Make a page a puzzle: its settings (worth 30, no hints) and the frame on top, unless the frame is there already. */
export function makePuzzle(d: Project, abId: string): void {
  const ab = d.artboards.find((a) => a.id === abId);
  if (!ab) return;
  if (!ab.puzzle) ab.puzzle = { value: 30, hints: [] };
  if (ab.children.some((c) => c.name === PUZZLE_FRAME_NAME)) return;
  const { layers, wiring } = puzzleFrame(ab.width, ab.height);
  ab.children.push(...layers);
  const dy = Math.max(0, ...ab.logic.nodes.map((n) => n.y + 80));
  for (const n of wiring.nodes) n.y += dy;
  ab.logic.nodes.push(...wiring.nodes);
  ab.logic.edges.push(...wiring.edges);
}

/** A new puzzle page with a question of a kind in the middle and the frame around it. Returns the page's id. */
export function addPuzzlePage(d: Project, opts: { kind?: QuestionKind; name?: string; title?: string; hints?: string[]; bigHint?: string; value?: number; question?: Partial<Question> } = {}): string {
  const count = d.artboards.filter((a) => a.puzzle).length + 1;
  const last = d.artboards.reduce((m, a) => Math.max(m, a.canvasX + a.width), 0);
  const name = opts.name ?? `Puzzle ${count}`;
  const page = createArtboard({ name, width: STAGE_W, height: STAGE_H, background: solid(DARK), canvasX: last + 160, canvasY: 0 } as Partial<Artboard>);
  page.puzzle = {
    //Hints that fit the kit's own sample question (which prime), so a new puzzle plays straight away
    title: opts.title ?? 'Prime time',
    value: opts.value ?? 30,
    hints: opts.hints ?? ['A prime number can only be divided evenly by 1 and by itself.', 'Any number ending in 5 can be divided by 5.', '9 is 3 times 3.'],
    bigHint: opts.bigHint ?? '21 is 3 times 7, so only one is left.',
  };
  d.artboards.push(page);
  //The question sits in the room left of the side column, the kit's Check answer marks the puzzle
  const qid = addQuestion(d, page.id, opts.kind ?? 'single', { at: { x: Math.round((STAGE_W - 244 - 640) / 2), y: 96 } });
  if (qid) setQuestionSettings(d, page.id, qid, { attempts: 0, hints: [], reveal: false, ...(opts.question ?? {}) });
  makePuzzle(d, page.id);
  return page.id;
}
