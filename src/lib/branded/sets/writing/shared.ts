//Pieces the writing starters share: text boxes bound to variables, word counts, save and load of the learner's user data, the page row buttons and the "go to the first part that is still empty" chain.
import { createNode, type Artboard, type FrameNode, type InputNode, type LogicNode, type SceneNode, type Variable } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { BRAND_FONT } from '../../looks';
import { button, solid, stroke, text, type BrandedCtx } from '../../kit';
import { bind, click, go, graph, heroPage, setVar } from '../assessment/shared';

export { bind, click, go, graph, setVar, variable } from '../assessment/shared';
export { addVar, goNext, goPrevious } from '../../graph-kit';

/** The save and load nodes of the learner's user data: kept on the Link for StudyDesk under the signed in person, in the browser anywhere else. */
export const saveData = (vars: Variable[]): [string, Record<string, unknown>] => ['action.saveUserData', { variables: vars.map((v) => v.id) }];
export const loadData = (vars: Variable[]): [string, Record<string, unknown>] => ['action.loadUserData', { variables: vars.map((v) => v.id) }];

/** Words in a text variable, as an expression. */
export const words = (name: string) => `(${name}.trim() ? ${name}.trim().split(/\\s+/).length : 0)`;
/** True when a text variable has nothing written in it. */
export const empty = (name: string) => `${name}.trim() == ""`;

/** A multi line text box tied to a variable: what the learner types is the variable, and a loaded variable fills the box. */
export function textBox(ctx: BrandedCtx, name: string, v: Variable, x: number, y: number, width: number, height: number, placeholder: string, label: string): InputNode {
  return createNode('input', {
    name,
    x,
    y,
    width,
    height,
    inputType: 'textarea',
    variableId: v.id,
    placeholder,
    ariaLabel: label,
    ...lookDefaults(ctx.project, 'input'),
    stroke: stroke(ctx.L.border, 2),
    cornerRadius: 10,
    fontSize: 17,
    fontFamily: BRAND_FONT,
  } as Partial<InputNode>);
}

/**
 * A clickable row (a progress list entry or a step pill): a frame with a decorative label that the page's graph clicks. `done` is
 * an expression that puts a tick in front of the label, `current` paints it as the page you are on.
 */
export function navRow(ctx: BrandedCtx, name: string, label: string, x: number, y: number, width: number, height: number, opts: { done: string; current: boolean; ariaLabel?: string; fontSize?: number }): FrameNode {
  const { L } = ctx;
  const t = text(ctx, 'Row label', `{${opts.done} ? "✓" : "○"}  ${label}`, 14, (height - 22) / 2, width - 24, { fontSize: opts.fontSize ?? 16, fontWeight: opts.current ? 700 : 600, color: opts.current ? L.onButton : L.text, decorative: true, wrap: false, height: 22, autoSize: 'none' });
  const row = createNode('frame', {
    name,
    x,
    y,
    width,
    height,
    cornerRadius: 10,
    fill: solid(opts.current ? L.button : L.background),
    stroke: stroke(opts.current ? L.button : L.border, 1.5),
    clip: false,
    role: 'button',
    focusable: true,
    cursor: 'pointer',
    ariaLabel: opts.ariaLabel ?? label,
    children: [t],
  }) as FrameNode;
  bind(row, { ariaLabel: `${JSON.stringify((opts.ariaLabel ?? label) + ': ')} + (${opts.done} ? "written" : "not written yet")` });
  return row;
}

/** A hero with a Start button and, for someone coming back to saved writing, a Continue button in its place. */
export function writingHero(ctx: BrandedCtx, title: string, subtitle: string, startLabel: string, welcomeBack: string, returning: Variable) {
  const { L } = ctx;
  const { page, start } = heroPage(ctx, title, subtitle, startLabel);
  const resume = button(ctx, 'Continue button', 'Continue where I left off', 48, start.y, 280, false);
  const welcome = text(ctx, 'Welcome back', welcomeBack, 48, start.y + 62, 600, { fontSize: 17, color: L.onGradient });
  bind(start, { visible: `!${returning.name}` });
  bind(resume, { visible: returning.name });
  bind(welcome, { visible: returning.name });
  page.children.push(resume, welcome);
  return { page, start, resume, welcome };
}

/** Before the activity opens, load what the learner saved last time; if anything came back, they are returning. */
export function loadOnOpen(page: Artboard, vars: Variable[], returning: Variable): void {
  const g = graph(page);
  const open = g.event('event.beforeLoad', {}, 'Bring back what was saved');
  const load = g.then(open, loadData(vars)[0], loadData(vars)[1]);
  g.then(load, ...setVar(returning, 'true'), 'out');
}

/** The Continue button: go to the first of these pages whose variable is still empty, or `last` when all are written. */
export function continueChain(page: Artboard, button: SceneNode, steps: [Variable, Artboard][], last: Artboard): void {
  const g = graph(page);
  let from: LogicNode = click(g, button, 'Continue');
  let port = 'out';
  for (const [v, to] of steps) {
    const test = g.then(from, 'logic.if', { condition: empty(v.name) }, port);
    g.then(test, 'action.artboard', go(to)[1], 'true');
    from = test;
    port = 'false';
  }
  g.then(from, 'action.artboard', go(last)[1], port);
}

/** The text as it reads in the export: a title, then each part under its heading in capitals. */
export function reportExpr(title: string, parts: [string, Variable][], missing: string): string {
  const body = parts.map(([head, v]) => `${JSON.stringify(`\n\n${head.toUpperCase()}\n`)} + (${v.name}.trim() || ${JSON.stringify(missing)})`).join(' + ');
  return `${JSON.stringify(title.toUpperCase())} + ${body}`;
}

/** A mailto link carrying the whole text: the one way the player can hand written work to somebody (it cannot write files or the clipboard). */
export const mailExpr = (subject: string, bodyVar: string) => `"mailto:?subject=" + encodeURIComponent(${JSON.stringify(subject)}) + "&body=" + encodeURIComponent(${bodyVar})`;
