/**
 * Chart: a bar chart and a pie chart drawn from one data table (a list variable of label and value pairs) that redraw when the
 * data changes, each value shown on hover and focus, a table version of the same numbers, and a "your guess" page where the
 * learner predicts a value before it is revealed. The two charts are native Chart layers: they draw, scale, show their own
 * readout on hover and focus, move between items with the arrow keys and keep a hidden table for screen readers, so the starter
 * only wires a click (or Enter) on a mark, which gives `event.index`, to a readout line.
 */
import { createNode, type TemplateChecklistItem } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, gnode, heading, item, solid, text, type BrandedCtx, type BrandedStarter } from '../../kit';
import { BRAND_FONT } from '../../looks';
import { Flow, addVar, announce, bind, click, focus, graph, graphNote, goNext, goPrevious, set, type ActionStep } from '../../graph-kit';
import { fill, keyNavList, stack } from '../../parts';
import { heroButtons } from './helpers';

//Hours a week students spend on each kind of study, for a normal week and an exam week. Sample numbers: replace them
const NORMAL = [
  { label: 'Reading', value: 6 },
  { label: 'Lectures', value: 4 },
  { label: 'Assignments', value: 8 },
  { label: 'Group work', value: 3 },
  { label: 'Revision', value: 5 },
  { label: 'Online forums', value: 2 },
];
const EXAM = [
  { label: 'Reading', value: 5 },
  { label: 'Lectures', value: 3 },
  { label: 'Assignments', value: 4 },
  { label: 'Group work', value: 2 },
  { label: 'Revision', value: 14 },
  { label: 'Online forums', value: 2 },
];
const N = NORMAL.length;
const J = (s: string) => JSON.stringify(s);

const TOTAL = 'rows.reduce((s, r) => s + r.value, 0)';

/** The colours the slices (and a column per item) take in turn: categorical, from tokens that stay apart in every colourway. */
const sliceTokens = (ctx: BrandedCtx) => [ctx.L.button, ctx.L.success, ctx.L.link, ctx.L.warning, ctx.L.error, ctx.L.muted];

/** A native chart layer in the brand: text from the colourway, Open Sans, every colour a token. */
function chartLayer(ctx: BrandedCtx, name: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown>) {
  return createNode('chart', {
    name,
    x,
    y,
    width: w,
    height: h,
    color: ctx.L.text,
    fontFamily: BRAND_FONT,
    fontSize: 14,
    //The unit is one variable: every chart's numbers read it
    suffix: ' {unit}',
    gridlines: true,
    axisLabels: true,
    table: true,
    animate: true,
    ...extra,
  } as never);
}

export const chart: BrandedStarter = {
  key: 'explore/chart',
  set: 'explore',
  name: 'Chart',
  description: 'A bar chart and a pie chart drawn from one table of labels and values, with a table view too. They redraw when the numbers change, show each value on hover and focus, and a "your guess" page asks the learner to predict a value before it is revealed.',
  tags: ['chart', 'data', 'bar', 'pie', 'guess'],
  build(colourway) {
    const ctx = brandedProject(colourway, 'Chart');
    const { L, project } = ctx;
    const hero = brandedPage(ctx, 'Where does study time go?', { kind: 'hero', subtitle: 'Explore a week of study as a bar chart, a pie chart and a table, then take a guess.' });
    const page = brandedPage(ctx, 'Where does study time go?', { name: 'Chart', footer: 'Sample data: hours of study a week' });
    const guessPage = brandedPage(ctx, 'Take a guess', { name: 'Your guess', footer: 'Sample data: hours of study a week' });
    heroButtons(ctx, hero, [{ name: 'Start', label: 'Explore the chart', to: 'next', width: 220 }]);

    //The data: one list the whole page reads. Set it to another list (as the data buttons do) and everything redraws
    const rows = addVar(project, 'rows', 'list', NORMAL);
    addVar(project, 'datasets', 'list', [{ name: 'Normal week', rows: NORMAL }, { name: 'Exam week', rows: EXAM }]);
    addVar(project, 'unit', 'string', 'hours');
    const dataset = addVar(project, 'dataset', 'number', 1);
    addVar(project, 'views', 'list', [{ id: 'bar', name: 'Bar chart' }, { id: 'pie', name: 'Pie chart' }, { id: 'table', name: 'Table' }]);
    const view = addVar(project, 'view', 'string', 'bar');
    const pick = addVar(project, 'pick', 'number', 0);
    const target = addVar(project, 'target', 'number', 1);
    const guess = addVar(project, 'guess', 'number', 0);
    addVar(project, 'guessMax', 'number', 20);
    const revealed = addVar(project, 'revealed', 'boolean', false);
    //Live variables: worked out whenever what they read changes, so the table, the readout and the answer never repeat a formula
    addVar(project, 'rowsTotal', 'number', 0, { formula: TOTAL, live: true });
    addVar(project, 'readout', 'string', '', {
      formula: 'pick > 0 ? rows[pick - 1].label + ": " + rows[pick - 1].value + " " + unit + " (" + Math.round(rows[pick - 1].value / rowsTotal * 100) + "% of the total)" : "Hover over, or Tab to, a bar or slice to see its value. Click it, or press Enter, to keep it here."',
      live: true,
    });
    addVar(project, 'verdict', 'string', '', {
      formula: 'revealed ? "You guessed " + guess + " " + unit + ". The answer is " + rows[target - 1].value + ": " + (guess == rows[target - 1].value ? "exactly right!" : Math.abs(guess - rows[target - 1].value) + (guess > rows[target - 1].value ? " too high." : " too low.")) : ""',
      live: true,
    });

    // ================================================================ the chart page
    const box = contentBox(page);

    //The views and the data sets are two rows of toggle buttons, each one repeated button with one flow (event.childIndex)
    const pill = (name: string, on: string, width: number) => {
      const b = bind(button(ctx, name, name, 0, 0, width, false), {
        label: 'item.name',
        ariaPressed: on,
        'fill.color': `${on} ? ${J(L.button)} : ${J(L.background)}`,
        color: `${on} ? ${J(L.onButton)} : ${J(L.text)}`,
      });
      return Object.assign(b, { height: 36, cornerRadius: 18 });
    };
    const viewButtons = keyNavList('View buttons', 0, 0, 3 * 116 + 2 * 10, 36, { items: 'views', row: pill('View button', 'view == item.id', 116), orientation: 'horizontal', gap: 10, ariaLabel: 'View' });
    const dataButtons = keyNavList('Data buttons', 0, 0, 2 * 126 + 10, 36, { items: 'datasets', row: pill('Data button', 'dataset == index + 1', 126), orientation: 'horizontal', gap: 10, ariaLabel: 'Data' });
    const topRow = stack('Chart controls', 0, 0, box.width, { direction: 'row', justify: 'space-between', align: 'center', children: [viewButtons, dataButtons] });
    const subtitle = heading(ctx, 'Chart title', 'Hours a week spent on each kind of study', 0, 0, 100, { fontSize: 19 });
    const guessButton = Object.assign(button(ctx, 'Take a guess button', 'Take a guess', 0, 0, 170, true), { height: 38, cornerRadius: 19 });
    const titleRow = stack('Chart title row', 0, 0, box.width, { direction: 'row', align: 'center', children: [fill(subtitle), guessButton] });
    page.children.push(stack('Chart header', box.x, box.y, box.width, { gap: 10, children: [topRow, titleRow] }));

    const FY = box.y + 96;
    const CH = 300;
    //One data table, two charts over it. Each is a native layer: scale, hover and focus readout, arrow keys and a hidden table come with it
    const barChart = bind(
      chartLayer(ctx, 'Bar chart', box.x, FY, box.width, CH, { kind: 'column', data: 'rows', labelKey: 'label', valueKey: 'value', colors: [L.primary], varyColors: false, min: 0, legend: false, ariaLabel: 'Bar chart of hours a week on each kind of study' }),
      { visible: 'view == "bar"' }
    );
    const pieChart = bind(
      chartLayer(ctx, 'Pie chart', box.x, FY, box.width, CH, { kind: 'pie', data: 'rows', labelKey: 'label', valueKey: 'value', colors: sliceTokens(ctx), legend: true, ariaLabel: 'Pie chart of hours a week on each kind of study' }),
      { visible: 'view == "pie"' }
    );

    //The table version: a header, one repeated row for every item of "rows", and a total
    const TW = box.width - 128;
    const cells = (kind: 'head' | 'row' | 'total') => {
      const mk = (name: string, value: string, extra: Record<string, unknown> = {}) => text(ctx, name, value, 0, 0, 100, { fontSize: 18, ...(kind === 'head' ? { fontWeight: 700, color: L.onDeep } : kind === 'total' ? { fontWeight: 700 } : {}), ...extra });
      const pre = kind === 'head' ? 'Header' : kind === 'total' ? 'Total' : 'Row';
      const words = kind === 'head' ? ['Kind of study', 'Hours a week', 'Share'] : kind === 'total' ? ['Total', '{rowsTotal}', ''] : ['{item.label}', '{item.value}', '{Math.round(item.value / rowsTotal * 100)}%'];
      return [
        fill(mk(`${pre} category`, words[0])),
        mk(`${pre} value`, words[1], { align: 'right', layoutItem: { width: 170 } }),
        mk(`${pre} share`, words[2], { align: 'right', ...(kind === 'row' ? { color: L.muted } : {}), layoutItem: { width: 160 } }),
      ];
    };
    const tableRow = (name: string, kind: 'head' | 'row' | 'total', box2?: Record<string, unknown>, bindings?: Record<string, string>) => {
      const r = stack(name, 0, 0, TW, { direction: 'row', gap: 20, align: 'center', height: 38, padding: { top: 0, right: 16, bottom: 0, left: 16 }, children: cells(kind), box: box2 });
      return bindings ? bind(r, bindings) : r;
    };
    const header = tableRow('Table header', 'head', { fill: solid(L.deep), cornerRadii: [10, 10, 0, 0], cornerRadius: 0 });
    const tableRows = Object.assign(
      stack('Table rows', 0, 0, TW, { gap: 0, children: [tableRow('Table row', 'row', { fill: solid(L.surface) }, { 'fill.color': `index % 2 == 0 ? ${J(L.surface)} : "transparent"` })] }),
      { repeat: { items: 'rows', layout: 'none', gap: 0, columns: 1 } }
    );
    const rule = createNode('rect', { name: 'Table total line', x: 0, y: 0, width: TW, height: 2, fill: solid(L.border), stroke: null, decorative: true } as never);
    const totalRow = tableRow('Table total', 'total');
    const tableFrame = bind(stack('Data table', box.x + 64, FY, TW, { gap: 0, children: [header, tableRows, rule, totalRow], extra: { role: 'region', ariaLabel: 'Table of hours a week on each kind of study' } }), { visible: 'view == "table"' });
    page.children.push(barChart, pieChart, tableFrame);

    //The readout under the charts: what was clicked or arrowed to, with its share
    const readout = bind(text(ctx, 'Readout', '{readout}', box.x, box.y + 404, box.width, { fontSize: 18, fontWeight: 600, align: 'center' }), { visible: 'view != "table"' });
    page.children.push(readout);

    const g = new Flow(page);
    const chosen = (): ActionStep => set(pick, 'event.index == null ? 0 : event.index + 1');
    //A click (or Enter) on a bar or slice, and arrowing to one, both give event.index
    const firstMark: { event?: ReturnType<typeof gnode> } = {};
    for (const c of [barChart, pieChart]) {
      const events = [gnode('event.pointer', 0, 0, { target: c.id, type: 'click' }, 'Pick a mark'), gnode('event.focus', 0, 0, { target: c.id, type: 'focus' }, 'Pick a mark')];
      firstMark.event ??= events[0];
      g.join(events, [gnode(chosen()[0], 0, 0, chosen()[1])]);
    }
    graphNote(page, { anchor: firstMark.event, colour: 'sky', text: '**Click and arrowing both pick a mark.** `event.index` is the bar or slice (null away from them), and the +1 keeps 0 for "nothing picked". The pie has the same pair.' });
    const pg = graph(page);
    const viewFlow = pg.event('event.pointer', { target: viewButtons.id, type: 'click', childrenOnly: true }, 'View buttons');
    pg.run(viewFlow, set(view, 'views[event.childIndex].id'), set(pick, '0'), announce('views[event.childIndex].name'));
    graphNote(page, { anchor: viewFlow, colour: 'sky', text: '**One flow for all the buttons.** *Only when a child is hit* is on, so `event.childIndex` says which button was pressed and a new entry in `views` needs no new flow.' });
    const dataFlow = pg.event('event.pointer', { target: dataButtons.id, type: 'click', childrenOnly: true }, 'Data buttons');
    pg.run(dataFlow, set(dataset, 'event.childIndex + 1'), set(rows, 'datasets[event.childIndex].rows'), set(pick, '0'), announce('datasets[event.childIndex].name + ": chart updated"'));
    graphNote(page, { anchor: dataFlow, colour: 'sky', text: '**Switching data** copies that dataset into `rows`, then clears the pick so the readout cannot name a mark that is gone. [ ] Add a dataset to `datasets` and it gets a button.' });
    pg.run(click(pg, guessButton, 'Pages'), goNext());
    pg.run(pg.event('event.start', {}, 'Start with nothing picked'), set(pick, '0'));

    // ================================================================ the guess page
    const gbox = contentBox(guessPage);
    const prompt = text(ctx, 'Question', 'How many {unit} a week do students spend on {rows[target - 1].label}? Drag the slider to your guess, then press Reveal.', 0, 0, 100, { fontSize: 19, fontWeight: 600, lineHeight: 1.3 });
    const back = Object.assign(button(ctx, 'Back to the chart', 'Back to the chart', 0, 0, 190, false), { height: 38, cornerRadius: 19 });
    guessPage.children.push(stack('Guess header', gbox.x, gbox.y - 4, gbox.width, { direction: 'row', gap: 24, align: 'start', children: [fill(prompt), back] }));

    const GY = gbox.y + 56;
    //The guess chart: the same columns, with the one being guessed a hidden item (a dashed "?" with no value, so the scale cannot give it away) until it is revealed, and the learner's guess as a last bar
    const gchart = chartLayer(ctx, 'Guess chart', gbox.x, GY, gbox.width, 250, {
      kind: 'column',
      data: 'rows.map((r, i) => !revealed && i == target - 1 ? {label: r.label, hidden: true} : {label: r.label, value: r.value}).concat([{label: "Your guess", value: guess}])',
      labelKey: 'label',
      valueKey: 'value',
      colors: [...Array.from({ length: N }, () => L.primary), L.warning],
      varyColors: true,
      min: 0,
      max: 20,
      legend: false,
      ariaLabel: 'Bar chart of hours a week on each kind of study, with one bar hidden until you reveal it, and your guess as the last bar',
    });
    bind(gchart, { max: 'guessMax' });
    guessPage.children.push(gchart);

    const slider = createNode('input', {
      name: 'Guess slider',
      ...lookDefaults(project, 'input'),
      inputType: 'range',
      variableId: guess.id,
      min: 0,
      max: 20,
      step: 0.5,
      value: '0',
      x: 0,
      y: 0,
      width: 100,
      height: 32,
      fontFamily: BRAND_FONT,
      color: L.button,
      ariaLabel: 'Your guess',
      bindings: { max: 'guessMax', ariaDescription: '"Your guess: " + guess + " " + unit', disabled: 'revealed' },
    } as never);
    const guessText = text(ctx, 'Guess readout', 'Your guess: {guess} {unit}', 0, 0, 300, { fontSize: 20, fontWeight: 700 });
    const reveal = bind(button(ctx, 'Reveal button', 'Reveal', 0, 0, 180, true), { visible: '!revealed' });
    const nextBtn = bind(button(ctx, 'Next category button', 'Next one', 0, 0, 180, true), { visible: `revealed && target < ${N}` });
    const again = bind(button(ctx, 'Start again button', 'Start again', 0, 0, 180, true), { visible: `revealed && target >= ${N}` });
    const result = bind(text(ctx, 'Result', '{verdict}', 0, 0, 100, { fontSize: 19, fontWeight: 600, lineHeight: 1.3 }), { visible: 'verdict != ""' });
    const actions = stack('Guess actions', 0, 0, gbox.width, { direction: 'row', gap: 24, align: 'center', children: [reveal, nextBtn, again, fill(result)] });
    guessPage.children.push(stack('Guess controls', gbox.x, GY + 258, gbox.width, { gap: 10, children: [slider, guessText, actions] }));

    const gg = graph(guessPage);
    const fresh = ['action.resetVariables', { variables: [target.id, guess.id, revealed.id, pick.id] }] as ActionStep;
    const startFlow = gg.event('event.start', {}, 'Start over');
    gg.run(startFlow, fresh, focus(slider));
    graphNote(guessPage, { anchor: startFlow, colour: 'sky', text: '**Opening the page starts a fresh round:** Reset variables clears the question, the guess, the reveal and the pick, then focus goes to the slider so a keyboard user can answer straight away.' });
    //The Reveal button goes away when it is pressed, so the focus moves to whichever of Next and Start again shows
    const revealFlow = click(gg, reveal, 'Reveal');
    const shownNext = gg.run(revealFlow, set(revealed, 'true'), announce('verdict'));
    graphNote(guessPage, { anchor: revealFlow, colour: 'sky', text: '**revealed is what shows the answer.** The `verdict` line is live, so announcing it reads the same words as the screen. The If then moves focus to Next, or to Start again on the last question.' });
    const which = gg.then(shownNext, 'logic.if', { condition: `target < ${N}` });
    gg.then(which, 'action.focus', { op: 'focus', target: nextBtn.id }, 'true');
    gg.then(which, 'action.focus', { op: 'focus', target: again.id }, 'false');
    const nextFlow = click(gg, nextBtn, 'Next');
    gg.run(nextFlow, ['action.resetVariables', { variables: [guess.id, revealed.id] }], set(target, 'target + 1'), announce('"Next question: " + rows[target - 1].label'), focus(slider));
    graphNote(guessPage, { anchor: nextFlow, colour: 'sky', text: '**Next clears the guess and revealed, and moves target on one row.** The new question is announced and focus goes back to the slider. [ ] Add rows to `rows` for more questions to guess.' });
    gg.run(click(gg, again, 'Start again'), fresh, announce('"Starting again"'), focus(slider));
    gg.run(click(gg, back, 'Pages'), goPrevious());

    //Notes for whoever edits the template, below each page
    const below = (p: typeof page, x: number, w: number) => ({ x, y: p.height + 14, w, h: 96 });
    addNote(page, { ...below(page, 0, 440), text: '**Chart layers** The bar and pie charts both read `rows`. Scale, hover and focus readout, arrow keys and a hidden table for screen readers are native, so there is nothing to size by hand.', colour: 'sky' });
    addNote(page, { ...below(page, 456, 440), text: '**Live variables** `rowsTotal`, `readout` and `verdict` are worked out from `rows`, `pick` and the guess. A click or Enter on a mark gives `event.index`, which sets `pick`.', colour: 'sky' });
    addNote(page, { ...below(page, 912, 380), text: '[ ] Put your numbers in `rows` and `datasets`. Change `unit` and every chart\'s suffix follows (it reads `{unit}`).', colour: 'gold' });
    addNote(guessPage, { ...below(guessPage, 0, 440), text: '**One chart for the guess.** The bar being guessed is a hidden item (`hidden: true`, no value): a dashed "?" that is read out as hidden, until Reveal. Your guess is the last bar. Both come from the chart\'s Data expression.', colour: 'sky' });
    addNote(guessPage, { ...below(guessPage, 456, 440), text: '[ ] Set `guessMax` a little above your biggest value. The slider and the chart scale both follow it.', colour: 'gold' });

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the introduction on the first page', byName(hero, 'Page title'), hero),
      item('Put your own numbers in the "rows" list variable (Variables panel): a label and a value for each item. The bar chart, the pie, the table and the guess page all follow it, and redraw as soon as it changes', barChart, page),
      item('The two data buttons set "rows" from the "datasets" list (a name and its rows each). Change that list, or delete the buttons if you have one data set (a script, a data source or an Interactions node can set "rows" too)', dataButtons, page),
      item('Change the unit ("unit" variable, hours): every chart\'s Suffix reads it as {unit}, so it is the one place to change. Then the chart title and the table headings', subtitle, page),
      item('The charts take any number of items. Pie slice colours come from the colourway through six tokens (Colours in the Chart section); the table has a row for each item and grows with the list, so mind the room under it', pieChart, page),
      item('On the guess page, set the top of the scale: the "guessMax" variable (the slider and the chart both follow it), to a bit more than your biggest value', slider, guessPage),
      item('Rewrite the question and the answer message (the Question text, and the live "verdict" variable in the Variables panel)', prompt, guessPage),
      item('Change the footer lines on both pages', byName(page, 'Footer text'), page),
      item('Try it with the keyboard: Tab to a chart, arrow between bars or slices to hear each value, press Enter to keep one in the line below, and Tab to the slider on the guess page', barChart, page),
    ];
    return { project: ctx.project, checklist };
  },
};
