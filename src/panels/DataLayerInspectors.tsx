import { useMemo } from 'react';
import { chartData, chartOverflow, evaluate, type Artboard, type ChartKind, type ChartNode, type ProgressNode, type Project, type SceneNode } from 'interactives-player';
import { store } from '../store/store';
import { CheckField, ColorField, IconButton, NumberField, Row, Section, SelectField, TextField } from '../components/ui';
import { ExprField } from '../components/ExprField';
import { Icons } from '../components/icons';
import { FontField, type FontPick } from '../components/FontPicker';
import { ensureGoogleFont } from '../lib/font-catalog';
import { lookFor } from '../lib/themes';
import { previewScope } from '../lib/data';
import { Color, KeyRow, Num, PaintField, useSetter } from './Inspector';
import { PropRow } from '../lib/prop-search';
import { SectionBlurb } from '../components/SectionBlurb';

/** A progress layer: the value it shows, how it grows, its bar, and what assistive tech is told. The track is the Fill and Stroke sections. */
export function ProgressSection({ nodes, project }: { nodes: ProgressNode[]; project: Project }) {
  const n = nodes[0];
  const ids = nodes.map((x) => x.id);
  const set = useSetter(ids);
  return (
    <Section help="progress-bars" title="Progress bar">
      <Row>
        <Num node={n} ids={ids} prop="value" label="Value" title="How far along it is. Bind it to a variable (Bindings) so the bar follows a score, a step or a timer; a timeline can animate it" />
        <Num node={n} ids={ids} prop="max" label="Max" min={0} title="The value that is a full bar" />
      </Row>
      <Row>
        <SelectField<'horizontal' | 'vertical'>
          label="Direction"
          title="Which way the bar grows"
          value={n.orientation}
          options={[
            { value: 'horizontal', label: 'Across' },
            { value: 'vertical', label: 'Up' },
          ]}
          onChange={(v) => set({ orientation: v })}
        />
        <CheckField label="From the far end" title="Grow from the right (or the top) instead of the left (or the bottom)" value={!!n.reverse} onChange={(v) => set({ reverse: v ? true : undefined })} />
      </Row>
      <Num node={n} ids={ids} prop="cornerRadius" label="Radius" min={0} />
      <div className="field-label block">Bar</div>
      <PropRow k="Bar fill" words={['bar colour', 'progress colour', 'fill']}>
        <PaintField paint={n.barFill} allowNone={false} project={project} box={{ w: n.width, h: n.height }} onChange={(p) => set({ barFill: p })} />
        {n.barFill?.type === 'solid' && <KeyRow node={n} ids={ids} prop="barFill.color" />}
      </PropRow>
      <SelectField<'progressbar' | 'meter' | 'none'>
        label="Tells screen readers"
        title="What it is to assistive technology: a progress bar (work towards a goal), a meter (a measurement in a range), or nothing at all. Name it in Accessibility"
        value={n.semantics}
        options={[
          { value: 'progressbar', label: 'It is a progress bar' },
          { value: 'meter', label: 'It is a meter' },
          { value: 'none', label: 'Nothing' },
        ]}
        onChange={(v) => set({ semantics: v })}
      />
      {n.semantics !== 'none' && (
        <ExprField
          label="Spoken value"
          template
          mono={false}
          value={n.valueText ?? ''}
          placeholder="{percent}%"
          locals={['value', 'max', 'percent']}
          title="What a screen reader says for the value. {value}, {max} and {percent} are the numbers, and variables work too: Step {step} of 5. Blank says the percentage"
          onChange={(v) => set({ valueText: v || undefined }, `valuetext-${n.id}`)}
        />
      )}
      <SectionBlurb text="The track is the layer's Fill and Stroke below." name="Progress bar" help={['progress-bars', 'look']} />
    </Section>
  );
}

const KINDS: { value: ChartKind; label: string }[] = [
  { value: 'column', label: 'Column' },
  { value: 'bar', label: 'Bar (sideways)' },
  { value: 'line', label: 'Line' },
  { value: 'pie', label: 'Pie' },
  { value: 'donut', label: 'Donut' },
];

/** A number field that can be left blank (null): for a fixed end of the axis, and for decimals. */
function MaybeNumber({ label, title, value, placeholder, onChange }: { label: string; title?: string; value: number | null; placeholder: string; onChange: (v: number | null) => void }) {
  return (
    <TextField
      label={label}
      title={title}
      value={value === null || value === undefined ? '' : String(value)}
      placeholder={placeholder}
      onChange={(t) => {
        const x = t.trim();
        if (x === '') onChange(null);
        else if (Number.isFinite(Number(x))) onChange(Number(x));
      }}
    />
  );
}

/** What the data expression gives right now, as the chart reads it: the first few items, or what is wrong. */
export function chartPreview(project: Project, ab: Artboard | undefined, n: Pick<ChartNode, 'data' | 'labelKey' | 'valueKey' | 'hiddenKey'>): { items: { label: string; value: number; hidden?: boolean }[]; total: number; problem: string | null } {
  const src = n.data?.trim();
  if (!src) return { items: [], total: 0, problem: 'Write an expression for the list to chart, such as a list variable or a data source.' };
  let raw: unknown;
  try {
    raw = evaluate(src, { vars: previewScope(project, ab) });
  } catch (e) {
    return { items: [], total: 0, problem: `The expression has a problem: ${e instanceof Error ? e.message : String(e)}` };
  }
  const all = chartData(raw, n.labelKey, n.valueKey, n.hiddenKey);
  const more = chartOverflow(raw);
  if (!all.length) return { items: [], total: 0, problem: 'The expression gives no items. It should give a list (of numbers, objects or [label, value] pairs) or an object of label: value.' };
  return { items: all.slice(0, 8), total: all.length + more, problem: null };
}

/** A chart layer: kind, data (with a preview of what it reads), colours, axis, labels, and the extras. */
export function ChartSection({ nodes, project, ab }: { nodes: ChartNode[]; project: Project; ab: Artboard | undefined }) {
  const n = nodes[0];
  const ids = nodes.map((x) => x.id);
  const set = useSetter(ids);
  const single = nodes.length === 1;
  const circle = n.kind === 'pie' || n.kind === 'donut';
  const preview = useMemo(() => (single ? chartPreview(project, ab, n) : null), [single, project, ab, n.data, n.labelKey, n.valueKey, n.hiddenKey]);
  const pickFont = (o: FontPick) => {
    const key = `font-${ids.join(',')}`;
    if (o.google) store().update((d) => void ensureGoogleFont(d.fonts, o.family, [400, 600]), { coalesce: key });
    set({ fontFamily: o.stack }, key);
  };
  const colors = n.colors ?? [];
  const setColors = (list: string[]) => {
    set({ colors: list });
    store().commit();
  };
  const look = lookFor(project.themes);
  const palette = [look.button, look.link, look.success, look.warning, look.error, look.muted];
  return (
    <Section help="charts" title="Chart">
      <SelectField<ChartKind> label="Kind" title="Column and bar charts compare items, a line follows them in order, pie and donut charts show shares of a whole" value={n.kind} options={KINDS} onChange={(v) => set({ kind: v })} />
      {single && (
        <ExprField
          label="Data"
          mono
          multiline
          rows={3}
          value={n.data}
          placeholder="scores"
          title="An expression that gives the list to chart: a list variable or a data source (scores), or a list written out. Items can be numbers, objects ({label, value}) or [label, value] pairs; an object of label: value works too"
          onChange={(v) => set({ data: v }, `chart-data-${n.id}`)}
        />
      )}
      <Row>
        <TextField label="Label key" title="Which field of each item is its name. Blank picks label, name, title or the first text" value={n.labelKey} placeholder="label" onChange={(v) => set({ labelKey: v }, `chart-lk-${n.id}`)} />
        <TextField label="Value key" title="Which field of each item is its number. Blank picks value, y, count or the first number" value={n.valueKey} placeholder="value" onChange={(v) => set({ valueKey: v }, `chart-vk-${n.id}`)} />
      </Row>
      <TextField label="Hidden key" title="An item with this field set to true is a placeholder: a dashed empty mark with a ?, read out as hidden, left out of the axis unless it has a number too. Blank uses hidden" value={n.hiddenKey ?? ''} placeholder="hidden" onChange={(v) => set({ hiddenKey: v || undefined }, `chart-hk-${n.id}`)} />
      {preview && (
        <div className="chart-preview" aria-label="What the chart reads from its data">
          {preview.problem ? (
            <p className="hint error">{preview.problem}</p>
          ) : (
            <table className="small">
              <caption className="muted small">
                {preview.total} {preview.total === 1 ? 'item' : 'items'}
              </caption>
              <tbody>
                {preview.items.map((it, i) => (
                  <tr key={i}>
                    <th scope="row">{it.label}</th>
                    <td>{it.hidden ? 'hidden' : it.value}</td>
                  </tr>
                ))}
                {preview.total > preview.items.length && (
                  <tr>
                    <td colSpan={2} className="muted">
                      and {preview.total - preview.items.length} more
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
      <div className="field-label block">Colours</div>
      {colors.map((c, i) => (
        <Row key={i} className="stop-row" k={`Chart colour ${i + 1}`} words={["chart colours", "series colour"]}>
          <ColorField tokens value={c} onChange={(x) => set({ colors: colors.map((y, j) => (j === i ? x : y)) }, `chart-colors-${ids.join(',')}`)} onCommit={() => store().commit()} />
          <IconButton icon={<Icons.trash />} title="Remove this colour" disabled={colors.length <= 1} onClick={() => setColors(colors.filter((_, j) => j !== i))} />
        </Row>
      ))}
      <Row k="Chart colours" words={['add colour', 'palette', 'series colour']}>
        <button className="link-btn" onClick={() => setColors([...colors, palette[colors.length % palette.length]])}>
          + Add colour
        </button>
      </Row>
      {!circle && <CheckField label="A colour for each item" title="Give each item the next colour in the list, instead of all of them the first" value={!!n.varyColors} onChange={(v) => set({ varyColors: v })} />}
      <Row>
        <Color node={n} ids={ids} prop="color" label="Text colour" />
      </Row>
      <FontField label="Font" value={n.fontFamily} project={project.fonts} onPick={pickFont} />
      <Num node={n} ids={ids} prop="fontSize" label="Size" min={4} />
      {!circle && (
        <Row>
          <MaybeNumber label="Axis min" title="The bottom of the value axis. Blank fits the data (and zero)" value={n.min} placeholder="Auto" onChange={(v) => set({ min: v })} />
          <MaybeNumber label="Axis max" title="The top of the value axis. Blank fits the data" value={n.max} placeholder="Auto" onChange={(v) => set({ max: v })} />
        </Row>
      )}
      {n.kind === 'donut' && <NumberField label="Hole" title="The size of the donut's hole, as a share of its radius" value={n.hole} step={0.05} min={0.1} max={0.95} onChange={(v) => set({ hole: v })} />}
      <Row>
        {!circle && <CheckField label="Gridlines" value={n.gridlines} onChange={(v) => set({ gridlines: v })} />}
        {!circle && <CheckField label="Axis labels" title="The numbers along the value axis and the names of the items" value={n.axisLabels} onChange={(v) => set({ axisLabels: v })} />}
      </Row>
      <Row>
        <CheckField label="Value labels" title="Write each item's value on its mark" value={n.valueLabels} onChange={(v) => set({ valueLabels: v })} />
        <CheckField label="Legend" title="List the items with their colours (when each item has its own)" value={n.legend} onChange={(v) => set({ legend: v })} />
      </Row>
      <Row>
        <MaybeNumber label="Decimals" title="How many decimals values are written with. Blank is as short as it can be" value={n.decimals} placeholder="Auto" onChange={(v) => set({ decimals: v === null ? null : Math.max(0, Math.min(10, Math.round(v))) })} />
        <TextField label="Prefix" title="Written before every value, such as $. Variables work in braces: {unit}" value={n.prefix} onChange={(v) => set({ prefix: v }, `chart-prefix-${n.id}`)} />
        <TextField label="Suffix" title="Written after every value, such as % or kg. Variables work in braces: {unit}" value={n.suffix} onChange={(v) => set({ suffix: v }, `chart-suffix-${n.id}`)} />
      </Row>
      <CheckField label="Grow in" title="The marks grow in when the chart first appears. Not for viewers who ask their device for less motion" value={n.animate} onChange={(v) => set({ animate: v })} />
      <CheckField label="Table for screen readers" title="The same numbers as a table that only a screen reader finds. Leave it on unless a text alternative says it all" value={n.table} onChange={(v) => set({ table: v })} />
      <SectionBlurb text="Hover or Tab to a bar, slice or point to read it. Give the chart a text alternative in Accessibility." name="Chart" help={['charts', 'reading-it']} />
    </Section>
  );
}

export type DataLayer = Extract<SceneNode, { type: 'progress' | 'chart' }>;
