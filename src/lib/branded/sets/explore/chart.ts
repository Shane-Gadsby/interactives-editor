/**
 * Chart: a bar chart and a pie chart drawn from one data table (a list variable of label and value pairs) that redraw when the
 * data changes, with each value shown on hover and focus, a table version of the same numbers, and a "your guess" page where
 * the learner predicts a value before it is revealed. The bars are plain layers sized by bindings and the pie is six thick
 * trimmed outlines, so everything follows the colourway and works without a script layer.
 */
import { createNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { brandedPage, brandedProject, button, byName, contentBox, heading, item, solid, text, type BrandedCtx, type BrandedStarter } from '../../kit';
import { BRAND_FONT } from '../../looks';
import { Flow, announce, focusOn, goTo, heroButtons, ifNode, n, onClick, setVar, small, variable, wait } from './helpers';

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

//The top of the scale: the biggest value rounded up to a multiple of 4, so the four gridlines are whole numbers
const MAX = 'rows.reduce((m, r) => Math.max(m, r.value), 0)';
const SCALE = `Math.max(4, Math.ceil(${MAX} / 4) * 4)`;
const TOTAL = 'rows.reduce((s, r) => s + r.value, 0)';
const SHARE = (k: string | number) => `Math.round(rows[${k}].value / ${TOTAL} * 100)`;

/** The colour of the k-th slice and legend swatch: categorical, from tokens that stay apart in every colourway. */
const sliceToken = (ctx: BrandedCtx, k: number) => [ctx.L.button, ctx.L.success, ctx.L.link, ctx.L.warning, ctx.L.error, ctx.L.muted][k];

interface Plot {
  /** Left edge of the plot and its width, in the parent frame. */
  left: number;
  width: number;
  top: number;
  height: number;
}

/** Gridlines with a number at each, from a scale expression. */
function gridlines(ctx: BrandedCtx, into: SceneNode[], plot: Plot, scale: string) {
  for (let k = 0; k <= 4; k++) {
    const y = plot.top + plot.height - (k * plot.height) / 4;
    into.push(createNode('rect', { name: `Gridline ${k}`, x: plot.left, y, width: plot.width, height: k === 0 ? 2 : 1, fill: solid(k === 0 ? ctx.L.border : ctx.L.divider), stroke: null, decorative: true } as never));
    into.push(text(ctx, `Scale ${k}`, `{Math.round(${scale} / 4 * ${k} * 10) / 10}`, plot.left - 56, y - 10, 48, { fontSize: 13, color: ctx.L.muted, align: 'right', decorative: true }));
  }
}

/** One bar column: the bar, its value (on hover and focus) and its label. A focusable layer that says its value out loud. */
function barColumn(ctx: BrandedCtx, k: number, plot: Plot, scale: string, o: { barVisible?: string; hidden?: string; labelGap?: number } = {}): SceneNode {
  const colW = plot.width / N;
  const barW = Math.min(84, colW - 24);
  const v = `rows[${k}].value`;
  const h = `${v} / ${scale} * ${plot.height}`;
  const bar = createNode('rect', {
    name: `Bar ${k + 1}`,
    x: (colW - barW) / 2,
    y: plot.height + 0,
    width: barW,
    height: 0,
    cornerRadius: 0,
    cornerRadii: [8, 8, 0, 0],
    fill: solid(ctx.L.button),
    stroke: null,
    decorative: true,
    bindings: {
      height: h,
      y: `${plot.height} - ${h}`,
      opacity: 'pick == 0 || pick == ' + (k + 1) + ' ? 1 : 0.5',
      ...(o.barVisible ? { visible: o.barVisible } : {}),
    },
  } as never);
  const value = text(ctx, `Bar ${k + 1} value`, `{${v}}`, 0, 0, colW, {
    fontSize: 18,
    fontWeight: 700,
    align: 'center',
    decorative: true,
    bindings: { y: `${plot.height} - ${h} - 28`, visible: `pick == ${k + 1}` + (o.hidden ? ` && !(${o.hidden})` : '') },
  });
  const label = text(ctx, `Bar ${k + 1} label`, `{rows[${k}].label}`, 0, plot.height + 8, colW, { fontSize: 14, align: 'center', decorative: true });
  const spoken = `rows[${k}].label + ": " + ${v} + " " + unit`;
  return createNode('frame', {
    name: `Bar column ${k + 1}`,
    x: plot.left + k * colW,
    y: plot.top,
    width: colW,
    height: plot.height + 30,
    fill: null,
    stroke: null,
    clip: false,
    role: 'image',
    focusable: true,
    bindings: { ariaLabel: o.hidden ? `${o.hidden} ? rows[${k}].label + ": hidden until you reveal it" : ${spoken}` : spoken },
    children: [bar, value, label],
  } as never);
}

/** Hover and focus on a layer set `pick` to its number, and leaving or blurring clears it again. */
function pickOn(flow: Flow, pick: ReturnType<typeof variable>, target: SceneNode, k: number) {
  const set = setVar(pick, String(k + 1));
  const clear = (): ReturnType<typeof setVar> => setVar(pick, `pick == ${k + 1} ? 0 : pick`);
  flow.chain(n('event.pointer', { target: target.id, type: 'pointerenter' }, 'Show a value'), set);
  flow.chain(n('event.pointer', { target: target.id, type: 'pointerleave' }, 'Show a value'), clear());
  flow.chain(n('event.focus', { target: target.id, type: 'focus' }, 'Show a value'), setVar(pick, String(k + 1)));
  flow.chain(n('event.focus', { target: target.id, type: 'blur' }, 'Show a value'), clear());
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
    heroButtons(ctx, hero, [{ name: 'Start', label: 'Explore the chart', to: page, width: 220 }]);

    //The data: one list the whole page reads. Set it to another list (as the data buttons do) and everything redraws
    const rows = variable(ctx, 'rows', 'list', JSON.stringify(NORMAL, null, 1));
    variable(ctx, 'datasetA', 'list', JSON.stringify(NORMAL, null, 1));
    variable(ctx, 'datasetB', 'list', JSON.stringify(EXAM, null, 1));
    variable(ctx, 'unit', 'string', 'hours');
    const dataset = variable(ctx, 'dataset', 'number', 1);
    const view = variable(ctx, 'view', 'string', 'bar');
    const pick = variable(ctx, 'pick', 'number', 0);
    const angle = variable(ctx, 'angle', 'number', 0);
    const target = variable(ctx, 'target', 'number', 1);
    const guess = variable(ctx, 'guess', 'number', 0);
    variable(ctx, 'guessMax', 'number', 20);
    const revealed = variable(ctx, 'revealed', 'boolean', false);
    const verdict = variable(ctx, 'verdict', 'string', '');

    // ================================================================ the chart page
    const box = contentBox(page);
    const flow = new Flow(page);

    const views = [{ id: 'bar', name: 'Bar chart' }, { id: 'pie', name: 'Pie chart' }, { id: 'table', name: 'Table' }];
    views.forEach((vw, i) => {
      const b = small(button(ctx, `${vw.name} button`, vw.name, box.x + i * 126, box.y, 116, false), 36);
      const on = `view == ${J(vw.id)}`;
      Object.assign(b, { bindings: { 'fill.color': `${on} ? ${J(L.button)} : ${J(L.background)}`, color: `${on} ? ${J(L.onButton)} : ${J(L.text)}`, ariaDescription: `${on} ? "Showing now" : ""` } });
      page.children.push(b);
      flow.chain(onClick(b, 'Views'), setVar(view, J(vw.id)), announce(`"${vw.name}"`));
    });
    const sets = [{ name: 'Normal week', list: 'datasetA' }, { name: 'Exam week', list: 'datasetB' }];
    const setButtons = sets.map((s, i) => {
      const b = small(button(ctx, `${s.name} button`, s.name, box.x + box.width - 2 * 136 + i * 126 - 0, box.y, 126, false), 36);
      const on = `dataset == ${i + 1}`;
      Object.assign(b, { bindings: { 'fill.color': `${on} ? ${J(L.button)} : ${J(L.background)}`, color: `${on} ? ${J(L.onButton)} : ${J(L.text)}`, ariaDescription: `${on} ? "Showing now" : ""` } });
      page.children.push(b);
      flow.chain(onClick(b, 'Data'), setVar(dataset, String(i + 1)), setVar(rows, s.list), announce(`"${s.name}: chart updated"`));
      return b;
    });
    const subtitle = heading(ctx, 'Chart title', 'Hours a week spent on each kind of study', box.x, box.y + 46, 600, { fontSize: 19 });
    const guessButton = small(button(ctx, 'Take a guess button', 'Take a guess', box.x + box.width - 170, box.y + 42, 170, true), 38);
    page.children.push(subtitle, guessButton);
    flow.chain(onClick(guessButton, 'Pages'), goTo(guessPage));

    const FY = box.y + 84;
    const plot: Plot = { left: 56, width: box.width - 56, top: 30, height: 240 };

    //---- bar chart
    const barKids: SceneNode[] = [];
    gridlines(ctx, barKids, plot, SCALE);
    const columns = Array.from({ length: N }, (_, k) => barColumn(ctx, k, plot, SCALE));
    barKids.push(...columns);
    const barChart = createNode('frame', { name: 'Bar chart', x: box.x, y: FY, width: box.width, height: 310, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'Bar chart of hours a week on each kind of study', bindings: { visible: 'view == "bar"', ariaDescription: 'rows.map(r => r.label + " " + r.value).join(", ")' }, children: barKids } as never);

    //---- pie chart: each slice is a circle with a thick outline, trimmed to its share of the way round
    const P = 128;
    const CX = 190;
    const CY = 160;
    const pieKids: SceneNode[] = [];
    //The pie is one frame (so the pointer on any slice counts as on the pie), a plain disc under the slices to catch the pointer
    const hit = createNode('ellipse', { name: 'Pie hit area', x: 0, y: 0, width: P * 2, height: P * 2, fill: solid(L.background), stroke: null, decorative: true } as never);
    const slices = Array.from({ length: N }, (_, k) => {
      const before = `rows.slice(0, ${k}).reduce((s, r) => s + r.value, 0) / ${TOTAL} * 100`;
      return createNode('ellipse', {
        name: `Slice ${k + 1}`,
        x: P / 2,
        y: P / 2,
        width: P,
        height: P,
        fill: null,
        stroke: { paint: solid(sliceToken(ctx, k)), width: P, align: 'center', trimStart: 0, trimEnd: 0 },
        decorative: true,
        bindings: {
          'stroke.trimStart': before,
          'stroke.trimEnd': `${before} + rows[${k}].value / ${TOTAL} * 100`,
          'stroke.opacity': `pick == 0 || pick == ${k + 1} ? 1 : 0.4`,
        },
      } as never);
    });
    const pie = createNode('frame', { name: 'Pie', x: CX - P, y: CY - P, width: P * 2, height: P * 2, fill: null, stroke: null, clip: false, decorative: true, children: [hit, ...slices] } as never);
    pieKids.push(pie);
    const legend = Array.from({ length: N }, (_, k) => {
      const hi = createNode('rect', { name: `Legend ${k + 1} highlight`, x: 0, y: 0, width: 548, height: 40, cornerRadius: 10, fill: solid(L.surface), stroke: null, decorative: true, bindings: { opacity: `pick == ${k + 1} ? 1 : 0` } } as never);
      const swatch = createNode('rect', { name: `Legend ${k + 1} swatch`, x: 10, y: 8, width: 24, height: 24, cornerRadius: 6, fill: solid(sliceToken(ctx, k)), stroke: null, decorative: true } as never);
      return createNode('frame', {
        name: `Legend ${k + 1}`,
        x: 380,
        y: 18 + k * 46,
        width: 548,
        height: 40,
        fill: null,
        stroke: null,
        clip: false,
        role: 'image',
        focusable: true,
        bindings: { ariaLabel: `rows[${k}].label + ": " + rows[${k}].value + " " + unit + ", " + ${SHARE(k)} + " percent"` },
        children: [
          hi,
          swatch,
          text(ctx, `Legend ${k + 1} label`, `{rows[${k}].label}`, 46, 8, 270, { fontSize: 18, decorative: true }),
          text(ctx, `Legend ${k + 1} value`, `{rows[${k}].value} {unit}`, 310, 8, 120, { fontSize: 18, fontWeight: 700, align: 'right', decorative: true }),
          text(ctx, `Legend ${k + 1} share`, `{${SHARE(k)}}%`, 440, 9, 96, { fontSize: 16, color: L.muted, align: 'right', decorative: true }),
        ],
      } as never);
    });
    pieKids.push(...legend);
    const pieChart = createNode('frame', { name: 'Pie chart', x: box.x, y: FY, width: box.width, height: 310, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'Pie chart of hours a week on each kind of study', bindings: { visible: 'view == "pie"', ariaDescription: `rows.map(r => r.label + " " + Math.round(r.value / ${TOTAL} * 100) + " percent").join(", ")` }, children: pieKids } as never);

    //---- the table version: every number as text, in rows
    const tableKids: SceneNode[] = [];
    const TX = 64;
    const TW = box.width - 128;
    const rowH = 38;
    const cell = (name: string, value: string, x: number, w: number, y: number, extra: Record<string, unknown> = {}) => text(ctx, name, value, x, y + 7, w, { fontSize: 18, ...extra });
    tableKids.push(createNode('rect', { name: 'Table header band', x: TX, y: 0, width: TW, height: rowH, cornerRadii: [10, 10, 0, 0], cornerRadius: 0, fill: solid(L.deep), stroke: null, decorative: true } as never));
    tableKids.push(cell('Header category', 'Kind of study', TX + 16, 340, 0, { fontWeight: 700, color: L.onDeep }));
    tableKids.push(cell('Header value', 'Hours a week', TX + 380, 170, 0, { fontWeight: 700, color: L.onDeep, align: 'right' }));
    tableKids.push(cell('Header share', 'Share', TX + 580, 160, 0, { fontWeight: 700, color: L.onDeep, align: 'right' }));
    for (let k = 0; k < N; k++) {
      const y = rowH * (k + 1);
      if (k % 2 === 0) tableKids.push(createNode('rect', { name: `Table row ${k + 1} band`, x: TX, y, width: TW, height: rowH, cornerRadius: 0, fill: solid(L.surface), stroke: null, decorative: true } as never));
      tableKids.push(cell(`Row ${k + 1} category`, `{rows[${k}].label}`, TX + 16, 340, y));
      tableKids.push(cell(`Row ${k + 1} value`, `{rows[${k}].value}`, TX + 380, 170, y, { align: 'right' }));
      tableKids.push(cell(`Row ${k + 1} share`, `{${SHARE(k)}}%`, TX + 580, 160, y, { align: 'right', color: L.muted }));
    }
    const ty = rowH * (N + 1);
    tableKids.push(createNode('rect', { name: 'Table total line', x: TX, y: ty, width: TW, height: 2, fill: solid(L.border), stroke: null, decorative: true } as never));
    tableKids.push(cell('Total category', 'Total', TX + 16, 340, ty + 2, { fontWeight: 700 }));
    tableKids.push(cell('Total value', `{${TOTAL}}`, TX + 380, 170, ty + 2, { fontWeight: 700, align: 'right' }));
    const tableFrame = createNode('frame', { name: 'Data table', x: box.x, y: FY, width: box.width, height: 310, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'Table of hours a week on each kind of study', bindings: { visible: 'view == "table"' }, children: tableKids } as never);
    page.children.push(barChart, pieChart, tableFrame);

    //The readout under the bar and pie charts, and what to do
    const readout = text(ctx, 'Readout', `{pick > 0 ? rows[pick - 1].label + ": " + rows[pick - 1].value + " " + unit + " (" + ${SHARE('pick - 1')} + "% of the total)" : "Hover over, or Tab to, a bar, a slice or a label to see its value."}`, box.x, box.y + 404, box.width, {
      fontSize: 18,
      fontWeight: 600,
      align: 'center',
      bindings: { visible: 'view != "table"' },
    });
    page.children.push(readout);

    //Hover and focus: bars, legend rows, and the pie itself (the angle round from the top says which slice the pointer is on)
    columns.forEach((c, k) => pickOn(flow, pick, c, k));
    legend.forEach((l, k) => pickOn(flow, pick, l, k));
    const pieX = box.x + CX;
    const pieY = FY + CY;
    flow.chain(
      n('event.pointer', { target: pie.id, type: 'pointermove' }, 'Pie hover'),
      setVar(angle, `((Math.atan2(event.x - ${pieX}, ${pieY} - event.y) / (2 * Math.PI)) + 1) % 1 * 100`),
      setVar(pick, `Math.hypot(event.x - ${pieX}, event.y - ${pieY}) > ${P} ? 0 : rows.filter((r, i) => rows.slice(0, i + 1).reduce((s, q) => s + q.value, 0) / ${TOTAL} * 100 <= angle).length + 1`)
    );
    flow.chain(n('event.pointer', { target: pie.id, type: 'pointerleave' }, 'Pie hover'), setVar(pick, '0'));
    flow.chain(n('event.start'), setVar(pick, '0'));

    // ================================================================ the guess page
    const gbox = contentBox(guessPage);
    const gflow = new Flow(guessPage);
    const prompt = text(ctx, 'Question', 'How many {unit} a week do students spend on {rows[target - 1].label}? Drag the slider to your guess, then press Reveal.', gbox.x, gbox.y - 4, gbox.width - 200, { fontSize: 19, fontWeight: 600, lineHeight: 1.3 });
    const back = small(button(ctx, 'Back to the chart', 'Back to the chart', gbox.x + gbox.width - 190, gbox.y - 2, 190, false), 38);
    guessPage.children.push(prompt, back);
    gflow.chain(onClick(back, 'Pages'), goTo(page));

    const GY = gbox.y + 52;
    const gplot: Plot = { left: 56, width: gbox.width - 56, top: 20, height: 200 };
    const gkids: SceneNode[] = [];
    gridlines(ctx, gkids, gplot, 'guessMax');
    const gcolumns = Array.from({ length: N }, (_, k) => barColumn(ctx, k, gplot, 'guessMax', { barVisible: `revealed || target != ${k + 1}`, hidden: `!revealed && target == ${k + 1}` }));
    gkids.push(...gcolumns);
    //The column being guessed holds a question mark until it is revealed
    const gcolW = gplot.width / N;
    const gbarW = Math.min(84, gcolW - 24);
    const mystery = createNode('rect', {
      name: 'Mystery bar',
      x: 0,
      y: gplot.top,
      width: gbarW,
      height: gplot.height,
      cornerRadius: 10,
      fill: null,
      stroke: { paint: solid(L.muted), width: 2, dash: [8, 6] },
      decorative: true,
      bindings: { visible: '!revealed', x: `${gplot.left} + (target - 1) * ${gcolW} + ${(gcolW - gbarW) / 2}` },
    } as never);
    const questionMark = text(ctx, 'Mystery mark', '?', 0, gplot.top + gplot.height / 2 - 28, gcolW, { fontSize: 48, fontWeight: 700, color: L.muted, align: 'center', decorative: true, bindings: { visible: '!revealed', x: `${gplot.left} + (target - 1) * ${gcolW}` } });
    //The learner's guess, drawn as a see-through bar over the column, so after the reveal it sits beside the real one
    const guessBar = createNode('rect', {
      name: 'Guess bar',
      x: 0,
      y: gplot.top + gplot.height,
      width: gbarW,
      height: 0,
      cornerRadii: [8, 8, 0, 0],
      cornerRadius: 0,
      fill: { type: 'solid', color: L.button },
      stroke: { paint: solid(L.button), width: 2, dash: [6, 4] },
      decorative: true,
      bindings: {
        x: `${gplot.left} + (target - 1) * ${gcolW} + ${(gcolW - gbarW) / 2}`,
        height: `guess / guessMax * ${gplot.height}`,
        y: `${gplot.top} + ${gplot.height} - guess / guessMax * ${gplot.height}`,
        'fill.opacity': 'revealed ? 0.2 : 0.5',
      },
    } as never);
    const gchart = createNode('frame', { name: 'Guess chart', x: gbox.x, y: GY, width: gbox.width, height: 252, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'Bar chart of hours a week on each kind of study, with one bar hidden', children: [...gkids, mystery, questionMark, guessBar] } as never);
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
      x: gbox.x + 56,
      y: GY + 262,
      width: gbox.width - 56,
      height: 32,
      fontFamily: BRAND_FONT,
      color: L.button,
      ariaLabel: 'Your guess',
      bindings: { ariaDescription: '"Your guess: " + guess + " " + unit', visible: '!revealed' },
    } as never);
    const guessText = text(ctx, 'Guess readout', 'Your guess: {guess} {unit}', gbox.x, GY + 300, 300, { fontSize: 20, fontWeight: 700 });
    const reveal = button(ctx, 'Reveal button', 'Reveal', gbox.x, GY + 336, 180, true);
    reveal.bindings = { visible: '!revealed' };
    const nextBtn = button(ctx, 'Next category button', 'Next one', gbox.x, GY + 336, 180, true);
    nextBtn.bindings = { visible: `revealed && target < ${N}` };
    const again = button(ctx, 'Start again button', 'Start again', gbox.x, GY + 336, 180, true);
    again.bindings = { visible: `revealed && target >= ${N}` };
    const result = text(ctx, 'Result', '{verdict}', gbox.x + 204, GY + 340, gbox.width - 204, { fontSize: 19, fontWeight: 600, lineHeight: 1.3, bindings: { visible: 'verdict != ""' } });
    guessPage.children.push(slider, guessText, reveal, nextBtn, again, result);

    gflow.chain(n('event.start'), setVar(target, '1'), setVar(guess, '0'), setVar(revealed, 'false'), setVar(verdict, '""'), setVar(pick, '0'), wait(80), focusOn(slider));
    gflow.chain(
      onClick(reveal, 'Reveal'),
      setVar(revealed, 'true'),
      setVar(
        verdict,
        `"You guessed " + guess + " " + unit + ". The answer is " + rows[target - 1].value + ": " + (guess == rows[target - 1].value ? "exactly right!" : Math.abs(guess - rows[target - 1].value) + (guess > rows[target - 1].value ? " too high." : " too low."))`
      ),
      announce('verdict')
    );
    //The Reveal button goes away when it is pressed, so the focus moves on to what comes next
    gflow.gate([onClick(reveal, 'Move the focus')], ifNode(`target < ${N}`), [wait(120), focusOn(nextBtn)]);
    gflow.gate([onClick(reveal, 'Move the focus')], ifNode(`target >= ${N}`), [wait(120), focusOn(again)]);
    gflow.chain(onClick(nextBtn, 'Next'), setVar(target, 'target + 1'), setVar(guess, '0'), setVar(revealed, 'false'), setVar(verdict, '""'), announce('"Next question: " + rows[target - 1].label'), focusOn(slider));
    gflow.chain(onClick(again, 'Start again'), setVar(target, '1'), setVar(guess, '0'), setVar(revealed, 'false'), setVar(verdict, '""'), announce('"Starting again"'), focusOn(slider));
    gcolumns.forEach((c, k) => pickOn(gflow, pick, c, k));

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the introduction on the first page', byName(hero, 'Page title'), hero),
      item('Put your own numbers in the "rows" list variable (Variables panel): a label and a value for each of the six items. The bars, the pie, the table and the guess page all follow it, and redraw as soon as it changes', barChart, page),
      item('The two data buttons set "rows" from the "datasetA" and "datasetB" lists. Change those lists and the button names, or delete the buttons if you have one data set (a script, a data source or an Interactions node can set "rows" too)', setButtons[0], page),
      item('Change the unit ("unit" variable, hours), the chart title and the table headings (the text in the Data table frame)', subtitle, page),
      item('The chart is built for six items. To change that, duplicate or delete a Bar column and a Legend row, add or remove its table row, and give a slice and its colour; copy the hover and focus flows (Interactions tab)', columns[0], page),
      item('Pie slice colours come from the colourway through six tokens (Slice 1 to 6, Legend swatches). Change a slice and its legend swatch together', slices[0], page),
      item('On the guess page, set the top of the scale: the "guessMax" variable and the slider\'s Max (Inspector) together, to a bit more than your biggest value', slider, guessPage),
      item('Rewrite the question and the answer message (Question text, and the Set variable: verdict node in the Interactions tab)', prompt, guessPage),
      item('Change the footer lines on both pages', byName(page, 'Footer text'), page),
      item('Try it with the keyboard: Tab to each bar or legend row to hear its value, and Tab to the slider on the guess page, then the arrow keys', columns[0], page),
    ];
    return { project: ctx.project, checklist };
  },
};

