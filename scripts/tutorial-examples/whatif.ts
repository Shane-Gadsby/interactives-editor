//The what-if tutorial's finished project: three sliders tied to number variables, three live variables worked out from them,
//text that writes the money out with fmt(), and a column chart that redraws as a slider moves. No interactions at all
import { createNode, uid, type Project, type SceneNode, type Variable } from 'interactives-player';
import { lookDefaults } from '../../src/lib/themes';
import { blankProject, type TutorialExample } from './kit';

function layer<T extends SceneNode['type']>(p: Project, type: T, props: Record<string, unknown>) {
  return createNode(type, { ...lookDefaults(p, type), ...props } as never);
}
const words = (p: Project, name: string, text: string, x: number, y: number, width: number, fontSize: number, extra: Record<string, unknown> = {}) =>
  layer(p, 'text', { name, text, x, y, width, height: Math.ceil(fontSize * 1.4), fontSize, ...extra });

function build(): Project {
  const p = blankProject('Weekly budget');
  const ab = p.artboards[0];
  const v = (name: string, initial: number, formula?: string): Variable => {
    const x: Variable = { id: uid('v'), name, type: 'number', initial, ...(formula ? { formula, live: true } : {}) };
    p.variables.push(x);
    return x;
  };
  //The inputs (three on sliders, one fixed) and what is worked out from them
  v('hours', 15);
  v('pay', 28);
  v('rent', 220);
  v('food', 150);
  v('income', 0, 'hours * pay');
  v('spending', 0, 'rent + food');
  v('leftover', 0, 'income - spending');

  //A slider: an Input field of type range, its Value bound both ways to the variable
  const slider = (name: string, variable: string, min: number, max: number, step: number, y: number, a11y: string) =>
    layer(p, 'input', { name, inputType: 'range', min, max, step, value: '0', x: 40, y, width: 320, height: 32, ariaLabel: a11y, bindings: { value: variable }, bindingModes: { value: 'both' } });

  ab.children.push(
    words(p, 'Title', 'What if? A week of student money', 40, 30, 720, 30, { fontWeight: 700, role: 'heading', headingLevel: 1 }),
    words(p, 'Hours label', 'Hours of paid work: {hours}', 40, 100, 320, 18),
    slider('Hours slider', 'hours', 0, 40, 1, 128, 'Hours of paid work a week'),
    words(p, 'Pay label', 'Pay per hour: ${fmt(pay, 2)}', 40, 180, 320, 18),
    slider('Pay slider', 'pay', 20, 40, 0.5, 208, 'Pay per hour in dollars'),
    words(p, 'Rent label', 'Rent: ${rent} a week', 40, 260, 320, 18),
    slider('Rent slider', 'rent', 100, 500, 10, 288, 'Rent a week in dollars'),
    words(p, 'Food line', 'Food and bills: ${food} a week', 40, 340, 320, 18),
    words(p, 'Income line', 'Income: ${fmt(income, 2, true)}', 40, 400, 320, 20, { fontWeight: 700 }),
    words(p, 'Spending line', 'Spending: ${fmt(spending, 2, true)}', 40, 436, 320, 20, { fontWeight: 700 }),
    words(p, 'Left over line', '{leftover < 0 ? "Short by $" + fmt(-leftover, 2, true) : "Left over: $" + fmt(leftover, 2, true)}', 40, 472, 320, 20, { fontWeight: 700 }),
    layer(p, 'chart', {
      name: 'Budget chart',
      kind: 'column',
      data: '[{label: "Income", value: income}, {label: "Rent", value: rent}, {label: "Food and bills", value: food}, {label: "Left over", value: leftover}]',
      labelKey: 'label',
      valueKey: 'value',
      varyColors: true,
      valueLabels: true,
      prefix: '$',
      decimals: 0,
      x: 400,
      y: 100,
      width: 360,
      height: 400,
      ariaLabel: 'Column chart of a week of income, rent, food and bills, and what is left over',
    }),
  );
  return p;
}

export const example: TutorialExample = {
  key: 'tut-whatif',
  topic: 'tutorial-whatif',
  title: 'What-if budget explorer',
  description: 'Three sliders for hours, pay and rent, with the income, spending, what is left over and a chart worked out again as you drag: the What-if explorer tutorial\'s project.',
  tags: ['slider', 'formula', 'chart', 'variables', 'model'],
  build,
  notes: [
    { text: '**No interactions at all.** Each slider\'s Value is bound to a variable (Input section, Variable). income, spending and leftover are Worked out with Keep up to date ticked, in the Variables tab.' },
    { text: '**Money written out with fmt().** A text slot like `{fmt(income, 2, true)}` gives two decimals and a comma every three digits. The chart has its own Prefix and Decimals instead.', colour: 'sky' },
  ],
};
