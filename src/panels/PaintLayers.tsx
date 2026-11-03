import { useState } from 'react';
import { fillFields, fillList, fillPath, strokeFields, strokeList, strokePath, type BlendMode, type Paint, type Project, type SceneNode, type ShapeStyle, type Stroke } from 'interactives-player';
import { store } from '../store/store';
import { IconButton, Row, Section, SelectField, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { KeyRow, Num, PaintField, useSetter, useShown } from './Inspector';

/**
 * The Fill and Stroke sections. A shape has a list of fills and a list of strokes (`fill` + `fills`, `stroke` +
 * `strokes`, see ShapeStyle). Each list is shown front-most first, like the layers panel, and each entry has an eye, up
 * and down buttons (or drag its heading), a remove button, and its own controls with the diamond key buttons.
 */

const BLEND: BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'difference', 'exclusion'];

type Painted = SceneNode & ShapeStyle;

/** Buttons and inputs draw only their one fill and stroke. */
const single = (n: SceneNode) => n.type === 'button' || n.type === 'input';

// The entry being dragged: kind and its index in the list (bottom to top)
let dragging: { kind: 'fill' | 'stroke'; index: number } | null = null;

interface HeadProps {
  kind: 'fill' | 'stroke';
  label: string;
  index: number;
  count: number;
  visible: boolean;
  simple: boolean;
  onVisible: (v: boolean) => void;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
}

function LayerHead({ kind, label, index, count, visible, simple, onVisible, onMove, onRemove }: HeadProps) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`item-head paint-head${over ? ' drop' : ''}`}
      draggable={!simple && count > 1}
      onDragStart={(e) => {
        dragging = { kind, index };
        e.dataTransfer?.setData('text/plain', `${kind}:${index}`);
      }}
      onDragOver={(e) => {
        if (dragging?.kind === kind) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (dragging?.kind === kind && dragging.index !== index) onMove(dragging.index, index);
        dragging = null;
      }}
      onDragEnd={() => (dragging = null)}
    >
      <span className="paint-head-name">
        {!simple && <IconButton icon={visible ? <Icons.eye /> : <Icons.eyeOff />} title={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} onClick={() => onVisible(!visible)} />}
        {label}
      </span>
      <span className="paint-head-tools">
        {!simple && count > 1 && (
          <>
            <button type="button" className="mini" title={`Move ${label.toLowerCase()} up (in front)`} disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
              ↑
            </button>
            <button type="button" className="mini" title={`Move ${label.toLowerCase()} down (behind)`} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
              ↓
            </button>
          </>
        )}
        <IconButton icon={<Icons.close />} className="remove-btn" title={`Remove ${label.toLowerCase()}`} onClick={onRemove} />
      </span>
    </div>
  );
}

/** Opacity, blend, feather and offset: what a paint does besides its colour. */
function FxFields({ n, ids, prefix, set }: { n: Painted; ids: string[]; prefix: string; set: (props: Record<string, unknown>, coalesce?: string) => void }) {
  const shown = useShown(n);
  const get = (k: string) => shown(`${prefix}.${k}`);
  return (
    <>
      <Row>
        <Num node={n} ids={ids} prop={`${prefix}.opacity`} label="α" title="Opacity of this paint alone (0 to 1)" step={0.05} min={0} max={1} fallback={1} />
        <SelectField label="Blend" title="How this paint mixes with what is under it" value={(get('blend') as BlendMode | undefined) ?? 'normal'} options={BLEND} onChange={(v) => set({ [`${prefix}.blend`]: v === 'normal' ? undefined : v })} />
      </Row>
      <Row>
        <Num node={n} ids={ids} prop={`${prefix}.feather`} label="Feather" title="Soft blur of this paint alone, in pixels. With an offset and a dark, see-through colour it makes a drop shadow" min={0} />
        <Num node={n} ids={ids} prop={`${prefix}.offsetX`} label="X" title="Shift this paint sideways, in pixels" />
        <Num node={n} ids={ids} prop={`${prefix}.offsetY`} label="Y" title="Shift this paint down, in pixels" />
      </Row>
    </>
  );
}

/** The fields to write for a changed list: the first entry is the base paint, the rest the extra ones (removed when none). */
function listProps(kind: 'fill' | 'stroke', next: (Paint | Stroke)[]): Record<string, unknown> {
  return kind === 'fill'
    ? { ...fillFields(next as Paint[]), fills: next.length > 1 ? next.slice(1) : undefined }
    : { ...strokeFields(next as Stroke[]), strokes: next.length > 1 ? next.slice(1) : undefined };
}

function moved<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, x);
  return next;
}

/** Fills, showing the timeline's colours at the playhead; a colour change becomes a keyframe while recording. */
export function FillSection({ nodes, project }: { nodes: SceneNode[]; project: Project }) {
  const n = nodes[0] as Painted;
  const ids = nodes.map((x) => x.id);
  const set = useSetter(ids);
  const shown = useShown(n);
  const list = fillList(n);
  const simple = single(n);
  // Structure changes are undo steps of their own
  const write = (next: Paint[]) => {
    store().setProps(ids, listProps('fill', next));
    store().commit();
  };
  const rows = list.map((p, i) => ({ p, i })).reverse();
  return (
    <Section
      help="fill-stroke"
      title="Fill"
      actions={!(simple && list.length) && <IconButton icon={<Icons.plus />} title="Add fill" onClick={() => write([...list, { type: 'solid', color: list.length ? '#ffffff' : '#d9d9d9' }])} />}
    >
      {rows.map(({ p, i }) => {
        const prefix = fillPath(i);
        const color = shown(`${prefix}.color`);
        const paint: Paint = p.type === 'solid' && typeof color === 'string' ? { ...p, color } : p;
        const label = list.length > 1 ? `Fill ${i + 1}` : 'Fill';
        return (
          <div key={i} className="effect-item paint-item">
            <LayerHead
              kind="fill"
              label={label}
              index={i}
              count={list.length}
              simple={simple}
              visible={p.visible !== false}
              onVisible={(v) => set({ [`${prefix}.visible`]: v ? undefined : false })}
              onMove={(from, to) => write(moved(list, from, to))}
              onRemove={() => write(list.filter((_, j) => j !== i))}
            />
            <PaintField
              paint={paint}
              project={project}
              onChange={(np) => {
                if (!np) write(list.filter((_, j) => j !== i));
                // Only the colour moved: set its colour, so recording turns it into a keyframe
                else if (np.type === 'solid' && p.type === 'solid') set({ [`${prefix}.color`]: np.color }, `fill-${i}-${ids.join()}`);
                else write(list.map((x, j) => (j === i ? np : x)));
              }}
            />
            {p.type === 'solid' && <KeyRow node={n} prop={`${prefix}.color`} />}
            {!simple && <FxFields n={n} ids={ids} prefix={prefix} set={set} />}
          </div>
        );
      })}
      {!list.length && <p className="hint">No fill. Use + to add one.</p>}
    </Section>
  );
}

const CAPS = [{ value: '', label: 'Default' }, { value: 'butt', label: 'Butt' }, { value: 'round', label: 'Round' }, { value: 'square', label: 'Square' }];
const JOINS = [{ value: '', label: 'Default' }, { value: 'miter', label: 'Miter' }, { value: 'round', label: 'Round' }, { value: 'bevel', label: 'Bevel' }];
const ALIGNS = [{ value: '', label: 'Default' }, { value: 'center', label: 'Centre' }, { value: 'inside', label: 'Inside' }, { value: 'outside', label: 'Outside' }];

export function StrokeSection({ nodes, project }: { nodes: SceneNode[]; project: Project }) {
  const n = nodes[0] as Painted;
  const ids = nodes.map((x) => x.id);
  const set = useSetter(ids);
  const shown = useShown(n);
  const list = strokeList(n);
  const simple = single(n);
  const write = (next: Stroke[]) => {
    store().setProps(ids, listProps('stroke', next));
    store().commit();
  };
  const trimmable = n.type === 'path' || n.type === 'polygon' || n.type === 'star' || n.type === 'rect' || n.type === 'ellipse';
  const rows = list.map((s, i) => ({ s, i })).reverse();
  return (
    <Section
      help="fill-stroke#stroke"
      title="Stroke"
      actions={!(simple && list.length) && <IconButton icon={<Icons.plus />} title="Add stroke" onClick={() => write([...list, { paint: { type: 'solid', color: '#111111' }, width: 1 }])} />}
    >
      {rows.map(({ s, i }) => {
        const prefix = strokePath(i);
        const color = shown(`${prefix}.paint.color`);
        const label = list.length > 1 ? `Stroke ${i + 1}` : 'Stroke';
        return (
          <div key={i} className="effect-item paint-item">
            <LayerHead
              kind="stroke"
              label={label}
              index={i}
              count={list.length}
              simple={simple}
              visible={s.visible !== false}
              onVisible={(v) => set({ [`${prefix}.visible`]: v ? undefined : false })}
              onMove={(from, to) => write(moved(list, from, to))}
              onRemove={() => write(list.filter((_, j) => j !== i))}
            />
            <PaintField
              paint={s.paint.type === 'solid' && typeof color === 'string' ? { ...s.paint, color } : s.paint}
              allowNone={false}
              project={project}
              onChange={(p) => (p?.type === 'solid' && s.paint.type === 'solid' ? set({ [`${prefix}.paint.color`]: p.color }, `stroke-paint-${i}`) : set({ [`${prefix}.paint`]: p! }, `stroke-paint-${i}`))}
            />
            <Row>
              <Num node={n} ids={ids} prop={`${prefix}.width`} label="W" min={0} />
              <TextField
                label="Dash"
                value={(s.dash ?? []).join(' ')}
                placeholder="e.g. 4 2"
                commitOnBlur
                onChange={(v) => {
                  const dash = v.split(/[\s,]+/).map(Number).filter((x) => x > 0);
                  set({ [`${prefix}.dash`]: dash.length ? dash : undefined });
                }}
              />
            </Row>
            {trimmable && (
              <Row>
                <Num node={n} ids={ids} prop={`${prefix}.trimStart`} label="Trim" title="Trim start: where the drawn part of the stroke begins (% of its length). Animate it to draw lines on" min={0} max={100} suffix="%" />
                <Num node={n} ids={ids} prop={`${prefix}.trimEnd`} label="to" title="Trim end: where the drawn part ends (% of its length)" min={0} max={100} suffix="%" fallback={100} />
                <Num node={n} ids={ids} prop={`${prefix}.trimOffset`} label="Off" title="Trim offset: slides the drawn part along the outline (%)" min={-100} max={200} suffix="%" />
              </Row>
            )}
            {!simple && (
              <>
                <Row>
                  <SelectField label="Cap" value={s.cap ?? ''} options={CAPS} onChange={(v) => set({ [`${prefix}.cap`]: v || undefined })} />
                  <SelectField label="Join" value={s.join ?? ''} options={JOINS} onChange={(v) => set({ [`${prefix}.join`]: v || undefined })} />
                </Row>
                <SelectField
                  label="Align"
                  title="Where the stroke sits on the outline. Default: centred for vector shapes, inside for boxes"
                  value={s.align ?? ''}
                  options={ALIGNS}
                  onChange={(v) => set({ [`${prefix}.align`]: v || undefined })}
                />
                <FxFields n={n} ids={ids} prefix={prefix} set={set} />
              </>
            )}
          </div>
        );
      })}
      {!list.length && <p className="hint">No stroke. Use + to add one.</p>}
      {list.length > 0 && (n.type === 'path' || n.type === 'polygon' || n.type === 'star') && <p className="hint">Vector strokes are centred on the path unless you pick Inside or Outside; box strokes sit inside the edge.</p>}
    </Section>
  );
}
