//Pieces the writing starters share: text boxes bound to variables, the hero with its Start and Continue buttons and the report text. (What the learner writes is user data on the variables themselves, so there is no save and load to share.)
import { createNode, type InputNode, type Variable } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { BRAND_FONT } from '../../looks';
import { button, stroke, text, type BrandedCtx } from '../../kit';
import { bind, heroPage } from '../assessment/shared';

export { bind, click, go, graph, setVar, variable } from '../assessment/shared';
export { addVar, goNext, goPrevious } from '../../graph-kit';

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

/** The text as it reads in the export: a title, then each part under its heading in capitals. */
export function reportExpr(title: string, parts: [string, Variable][], missing: string): string {
  const body = parts.map(([head, v]) => `${JSON.stringify(`\n\n${head.toUpperCase()}\n`)} + (${v.name}.trim() || ${JSON.stringify(missing)})`).join(' + ');
  return `${JSON.stringify(title.toUpperCase())} + ${body}`;
}
