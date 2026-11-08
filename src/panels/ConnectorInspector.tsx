import { useMemo } from 'react';
import { type Artboard, type ConnectorEnd, type ConnectorNode, type ConnectorSide, type Project } from 'interactives-player';
import { store } from '../store/store';
import { drawnBox, locate } from '../store/doc';
import { NumberField, Row, Section, SelectField, TextField } from '../components/ui';
import { ExprField } from '../components/ExprField';
import { FontField, type FontPick } from '../components/FontPicker';
import { ensureGoogleFont } from '../lib/font-catalog';
import { Color, Num, useSetter } from './Inspector';
import { endLayerId, inRepeaterTemplate } from '../canvas/connect';

const SIDES: { value: ConnectorSide; label: string }[] = [
  { value: 'auto', label: 'Auto (the side that faces the other end)' },
  { value: 'top', label: 'Top' },
  { value: 'right', label: 'Right' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
];

/** The layers of the artboard a connector could join, in layer order, as a flat list (a connector can't join a connector). */
export function joinableLayers(ab: Artboard | undefined): { id: string; name: string; depth: number }[] {
  const out: { id: string; name: string; depth: number }[] = [];
  const visit = (list: Artboard['children'], depth: number) => {
    for (const n of list) {
      if (n.type !== 'connector' && n.type !== 'bone') out.push({ id: n.id, name: n.name, depth });
      if ('children' in n) visit(n.children, depth + 1);
    }
  };
  if (ab) visit(ab.children, 0);
  return out;
}

/** One end: the layer it hangs on (or a loose point), which side, how far along it, and which copy of a repeated layer. */
function EndEditor({ which, node, ab, layers, set }: { which: 'from' | 'to'; node: ConnectorNode; ab: Artboard | undefined; layers: ReturnType<typeof joinableLayers>; set: (patch: Record<string, unknown>, key?: string) => void }) {
  const end = node[which];
  const id = endLayerId(end) ?? '';
  const copy = typeof end.layer === 'object' && end.layer ? end.layer : null;
  const loose = !id;
  const title = which === 'from' ? 'Start' : 'End';
  const put = (patch: Partial<ConnectorEnd>, key?: string) => set({ [which]: { ...end, ...patch } }, key ?? `conn-${which}-${node.id}`);
  const pick = (v: string) => {
    if (!v) {
      //Let go of the layer but keep the spot the end is at
      const g = ab ? drawnBox(ab, node).computed : undefined;
      const at = g ? { x: Math.round(drawnBox(ab!, node).x + (which === 'from' ? g.start.x : g.end.x)), y: Math.round(drawnBox(ab!, node).y + (which === 'from' ? g.start.y : g.end.y)) } : { x: 0, y: 0 };
      set({ [which]: { layer: '', ...at } });
      return;
    }
    const layer = ab && inRepeaterTemplate(ab, v) ? { repeat: v, index: '0' } : v;
    set({ [which]: { layer, ...(end.side ? { side: end.side } : {}), ...(end.offset ? { offset: end.offset } : {}) } });
  };
  const inTemplate = !!ab && !!id && inRepeaterTemplate(ab, id);
  return (
    <>
      <div className="field-label block">{title}</div>
      <SelectField
        label="On layer"
        title="The layer this end hangs on. The connector follows it when it moves, changes size or is animated. Loose point leaves the end at a spot on the artboard"
        value={id}
        options={[{ value: '', label: 'A loose point' }, ...layers.map((l) => ({ value: l.id, label: `${' '.repeat(Math.min(l.depth, 4))}${l.name}` }))]}
        onChange={pick}
      />
      {loose ? (
        <Row>
          <NumberField label="X" value={end.x ?? 0} onChange={(v) => put({ x: v })} onCommit={() => store().commit()} />
          <NumberField label="Y" value={end.y ?? 0} onChange={(v) => put({ y: v })} onCommit={() => store().commit()} />
        </Row>
      ) : (
        <>
          <Row>
            <SelectField<ConnectorSide> label="Side" title="Which side of the layer the line meets. Auto picks the side that faces the other end" value={end.side ?? 'auto'} options={SIDES} onChange={(v) => put({ side: v === 'auto' ? undefined : v })} />
            <NumberField label="Slide" title="Moves the end along its side, in px from the middle (right or down is positive)" value={end.offset ?? 0} step={4} onChange={(v) => put({ offset: v || undefined })} onCommit={() => store().commit()} />
          </Row>
          {(copy || inTemplate) && (
            <ExprField
              label="Which copy"
              mono
              value={copy?.index ?? '0'}
              locals={['item', 'index']}
              title="The layer is repeated (a repeater makes a copy per item). An expression says which copy this end joins, counting from 0: a fixed number, or something like item.from when this connector is itself in a repeater over a list of links"
              onChange={(v) => set({ [which]: { ...end, layer: { repeat: copy?.repeat ?? id, index: v } } }, `conn-copy-${which}-${node.id}`)}
            />
          )}
        </>
      )}
    </>
  );
}

/** A connector layer: where it goes from and to, how it is routed and ended, and its label. The line is the Stroke section, the label's background the Fill. */
export function ConnectorSection({ nodes, project, ab }: { nodes: ConnectorNode[]; project: Project; ab: Artboard | undefined }) {
  const n = nodes[0];
  const ids = nodes.map((x) => x.id);
  const set = useSetter(ids);
  const single = nodes.length === 1;
  const layers = useMemo(() => joinableLayers(ab), [ab]);
  const pickFont = (o: FontPick) => {
    const key = `font-${ids.join(',')}`;
    if (o.google) store().update((d) => void ensureGoogleFont(d.fonts, o.family, [400, 600]), { coalesce: key });
    set({ fontFamily: o.stack }, key);
  };
  // A connector whose layer went away is hidden: say so
  const gone = single && ab ? ([n.from, n.to].some((e) => { const id = endLayerId(e); return !!id && !locate(ab, id); })) : false;
  return (
    <Section help="connectors" title="Connector">
      <SelectField<ConnectorNode['route']>
        label="Route"
        title="Straight goes edge to edge, elbow turns in right angles round both layers, curved bends smoothly"
        value={n.route}
        options={[
          { value: 'straight', label: 'Straight' },
          { value: 'elbow', label: 'Elbow (right angles)' },
          { value: 'curved', label: 'Curved' },
        ]}
        onChange={(v) => set({ route: v })}
      />
      {single && (
        <>
          <EndEditor which="from" node={n} ab={ab} layers={layers} set={set} />
          <EndEditor which="to" node={n} ab={ab} layers={layers} set={set} />
          {gone && <p className="hint error">A layer this connector joined is gone, so the connector is hidden. Pick another layer.</p>}
        </>
      )}
      <div className="field-label block">Ends</div>
      <Row>
        <SelectField<ConnectorNode['startCap']>
          label="Start"
          value={n.startCap}
          options={[
            { value: 'none', label: 'Plain' },
            { value: 'arrow', label: 'Arrow' },
            { value: 'dot', label: 'Dot' },
          ]}
          onChange={(v) => set({ startCap: v })}
        />
        <SelectField<ConnectorNode['endCap']>
          label="End"
          value={n.endCap}
          options={[
            { value: 'none', label: 'Plain' },
            { value: 'arrow', label: 'Arrow' },
            { value: 'dot', label: 'Dot' },
          ]}
          onChange={(v) => set({ endCap: v })}
        />
      </Row>
      <Row>
        <Num node={n} ids={ids} prop="capSize" label="Cap size" min={0} title="The arrow or dot's size in px. 0 sizes it from the line's width" />
        <Num node={n} ids={ids} prop="gap" label="Gap" min={0} title="How far the line stops short of each layer" />
      </Row>
      <Num node={n} ids={ids} prop="cornerRadius" label="Corner radius" min={0} title="Rounds the corners of an elbow, and the corners of the label's background" />
      <div className="field-label block">Label</div>
      <ExprField
        label="Text"
        template
        mono={false}
        value={n.label}
        placeholder="Yes"
        title="Words on a background chip on the line. Variables work in braces: {score}. Leave blank for no label. The label is decoration: give an important connector a text alternative (Accessibility) too"
        onChange={(v) => set({ label: v }, `conn-label-${ids.join(',')}`)}
      />
      {n.label.trim() !== '' && (
        <>
          <Num node={n} ids={ids} prop="labelAt" label="Position" step={0.05} min={0} max={1} title="How far along the line the label sits: 0 is the start, 1 the end" />
          <Row>
            <Color node={n} ids={ids} prop="color" label="Text colour" />
          </Row>
          <FontField label="Font" value={n.fontFamily} project={project.fonts} onPick={pickFont} />
          <Row>
            <Num node={n} ids={ids} prop="fontSize" label="Size" min={4} />
            <TextField label="Weight" value={n.fontWeight ? String(n.fontWeight) : ''} placeholder="400" onChange={(v) => { const w = Number(v); set({ fontWeight: Number.isFinite(w) && w >= 100 && w <= 900 ? w : undefined }, `conn-weight-${ids.join(',')}`); }} />
          </Row>
        </>
      )}
      <p className="hint">The line is the Stroke below (dash it, or animate its Trim end to draw it in); the label&apos;s background is the Fill. A connector is hidden while either layer is hidden or missing. Its own position and size follow the route, so there is nothing to move: move the layers.</p>
    </Section>
  );
}
