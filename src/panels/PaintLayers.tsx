import { useEffect, useRef, useState } from 'react';
import { PropRow } from '../lib/prop-search';
import { PAINT_BLEND_OPTIONS } from '../lib/blend-modes';
import { LIGHT_LOOK, fillList, fillPath, formatColor, movePaint, orderedPaints, paintToCss, parseColor, orderWithAdded, orderWithRemoved, paintFields, paintOrder, strokeList, strokePath, type BlendMode, type Paint, type PaintEntry, type PaintKind, type Project, type SceneNode, type ShapeStyle, type Stroke } from 'interactives-player';
import { store } from '../store/store';
import { assetUrls } from '../lib/assets';
import { IconButton, Row, Section, SelectField, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { KeyRow, Num, PaintField, useSetter, useShown } from './Inspector';

/**
 * The Fill and Stroke sections. A shape has a list of fills and a list of strokes (`fill` + `fills`, `stroke` +
 * `strokes`, see ShapeStyle). Each list is shown front-most first, like the layers panel, and each entry has an eye, up
 * and down buttons (or drag its heading), a remove button, and its own controls with the diamond key buttons.
 */


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
        <SelectField label="Blend" title="How this paint mixes with what is under it" value={(get('blend') as BlendMode | undefined) ?? 'normal'} options={PAINT_BLEND_OPTIONS} onChange={(v) => set({ [`${prefix}.blend`]: v === 'normal' ? undefined : v })} />
      </Row>
      <Row>
        <Num node={n} ids={ids} prop={`${prefix}.feather`} label="Feather" title="Soft blur of this paint alone, in pixels. With an offset and a dark, see-through colour it makes a drop shadow" min={0} />
        <Num node={n} ids={ids} prop={`${prefix}.offsetX`} label="X" title="Shift this paint sideways, in pixels" />
        <Num node={n} ids={ids} prop={`${prefix}.offsetY`} label="Y" title="Shift this paint down, in pixels" />
      </Row>
    </>
  );
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
  // Structure changes are undo steps of their own; the paint order follows an added or removed paint
  const strokes = strokeList(n);
  const order = paintOrder(n);
  const write = (next: Paint[], nextOrder: PaintKind[] = order) => {
    store().setProps(ids, paintFields(next, strokes, nextOrder));
    store().commit();
  };
  const remove = (i: number) => write(list.filter((_, j) => j !== i), orderWithRemoved(order, 'fill', i));
  const rows = list.map((p, i) => ({ p, i })).reverse();
  return (
    <Section
      id="fill"
      help="fill-stroke"
      title={n.type === 'progress' ? 'Track fill' : 'Fill'}
      actions={!(simple && list.length) && <IconButton icon={<Icons.plus />} title="Add fill" onClick={() => write([...list, { type: 'solid', color: list.length ? LIGHT_LOOK.background : LIGHT_LOOK.surfaceMuted }], orderWithAdded(order, 'fill'))} />}
    >
      {rows.map(({ p, i }) => {
        const prefix = fillPath(i, n);
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
              onRemove={() => remove(i)}
            />
            <PropRow k={label} words={['colour', 'color', 'gradient', 'paint', 'solid', 'background', 'image fill']}>
              <PaintField
                paint={paint}
                project={project}
                box={{ w: n.width, h: n.height }}
                onChange={(np) => {
                  if (!np) remove(i);
                  // Only the colour moved: set its colour, so recording turns it into a keyframe
                  else if (np.type === 'solid' && p.type === 'solid') set({ [`${prefix}.color`]: np.color }, `fill-${i}-${ids.join()}`);
                  else write(list.map((x, j) => (j === i ? np : x)));
                }}
              />
            </PropRow>
            {p.type === 'solid' && <KeyRow node={n} ids={ids} prop={`${prefix}.color`} />}
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
  const fills = fillList(n);
  const order = paintOrder(n);
  const write = (next: Stroke[], nextOrder: PaintKind[] = order) => {
    store().setProps(ids, paintFields(fills, next, nextOrder));
    store().commit();
  };
  const trimmable = n.type === 'path' || n.type === 'polygon' || n.type === 'star' || n.type === 'rect' || n.type === 'ellipse';
  const rows = list.map((s, i) => ({ s, i })).reverse();
  return (
    <Section
      help="fill-stroke#stroke"
      title="Stroke"
      actions={!(simple && list.length) && <IconButton icon={<Icons.plus />} title="Add stroke" onClick={() => write([...list, { paint: { type: 'solid', color: '#111111' }, width: 1 }], orderWithAdded(order, 'stroke'))} />}
    >
      {rows.map(({ s, i }) => {
        const prefix = strokePath(i, n);
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
              onRemove={() => write(list.filter((_, j) => j !== i), orderWithRemoved(order, 'stroke', i))}
            />
            <PropRow k={label} words={['outline', 'border', 'colour', 'color', 'line', 'gradient']}>
              <PaintField
                paint={s.paint.type === 'solid' && typeof color === 'string' ? { ...s.paint, color } : s.paint}
                allowNone={false}
                project={project}
                box={{ w: n.width, h: n.height }}
                onChange={(p) => (p?.type === 'solid' && s.paint.type === 'solid' ? set({ [`${prefix}.paint.color`]: p.color }, `stroke-paint-${i}`) : set({ [`${prefix}.paint`]: p! }, `stroke-paint-${i}`))}
              />
            </PropRow>
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

// The paint-order row being dragged: its position in the list (bottom to top)
let draggingOrder: number | null = null;

/** What a paint is, in a few characters: its colour (with opacity when it is see-through), or the kind of gradient or image. */
export function paintName(p: Paint): string {
  if (p.type === 'linear') return 'Linear gradient';
  if (p.type === 'radial') return 'Radial gradient';
  if (p.type === 'image') return 'Image';
  const c = parseColor(p.color);
  if (!c) return p.color;
  return c[3] >= 1 ? formatColor(c) : `${formatColor([c[0], c[1], c[2], 1])} ${Math.round(c[3] * 100)}%`;
}

/** The identifying text of a paint-order row after its Fill/Stroke label: the paint's own name, and a stroke's width. */
export function entryDetail(e: PaintEntry): string {
  const paint = 'paint' in e.paint ? e.paint.paint : e.paint;
  const name = paintName(paint);
  return 'paint' in e.paint ? `${name}, ${Math.round(e.paint.width * 100) / 100}px` : name;
}

/** A small chip showing a paint: its colour, gradient or image. */
function swatchOf(p: Paint | Stroke): string {
  const paint = 'paint' in p ? p.paint : p;
  return paint.type === 'image' && !assetUrls.resolve(paint.assetId) ? 'repeating-conic-gradient(#999 0% 25%, #ccc 0% 50%) 0 0 / 6px 6px' : paintToCss(paint, assetUrls.resolve);
}

/** The row's name in the Fill and Stroke sections: "Fill" for the only one, "Fill 2" among several. */
function entryLabel(e: PaintEntry, fills: number, strokes: number): string {
  return e.kind === 'fill' ? (fills > 1 ? `Fill ${e.index + 1}` : 'Fill') : strokes > 1 ? `Stroke ${e.index + 1}` : 'Stroke';
}

/**
 * Which paint is over which, for a shape with both fills and strokes. Fills and strokes are listed in their own
 * sections; here they share one list, front-most first, so a stroke can go under a fill or between two fills
 * (`paintOrder`). Moving a paint past one of its own kind swaps their places in that list (the fill list gets reordered),
 * so each row says what it holds (a swatch, the colour or gradient, a stroke's width) and not just its number: the
 * number stays where it is while the paints trade places. The row that was moved is highlighted, and keyboard focus
 * follows it, so pressing the same arrow again keeps moving the same paint.
 */
export function PaintOrderSection({ nodes }: { nodes: SceneNode[] }) {
  const n = nodes[0] as Painted;
  const ids = nodes.map((x) => x.id);
  const [over, setOver] = useState<number | null>(null);
  // The position the moved paint ended at, until its highlight fades
  const [moved, setMoved] = useState<{ pos: number; text: string } | null>(null);
  const follow = useRef<{ pos: number; dir: 'up' | 'down' } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const all = single(n) ? [] : orderedPaints(n);
  const entries = JSON.stringify(all.map((e) => [e.kind, e.index, entryDetail(e)]));
  useEffect(() => {
    const f = follow.current;
    if (!f) return;
    follow.current = null;
    // Keep the focus on the paint that moved: at an end of the list its button is disabled, so use the other one
    const row = list.current?.querySelector(`[data-pos="${f.pos}"]`);
    const btn = row?.querySelector<HTMLButtonElement>(`button[data-dir="${f.dir}"]:not(:disabled)`) ?? row?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    btn?.focus();
  }, [entries]);
  useEffect(() => {
    if (!moved) return;
    const t = setTimeout(() => setMoved(null), 1200);
    return () => clearTimeout(t);
  }, [moved]);
  if (single(n)) return null;
  if (!all.some((e) => e.kind === 'fill') || !all.some((e) => e.kind === 'stroke')) return null;
  const fills = all.filter((e) => e.kind === 'fill').length;
  const strokes = all.length - fills;
  const move = (from: number, to: number, by: 'button' | 'drag' = 'drag') => {
    if (from === to || to < 0 || to >= all.length) return;
    const e = all[from];
    store().setProps(ids, movePaint(n, from, to));
    store().commit();
    if (by === 'button') follow.current = { pos: to, dir: to > from ? 'up' : 'down' };
    const place = all.length - to;
    setMoved({ pos: to, text: `${entryLabel(e, fills, strokes)} moved ${to > from ? 'up' : 'down'}: ${place === 1 ? 'front-most' : place === all.length ? 'back-most' : `${place} from the front`}` });
  };
  return (
    <Section help="fill-stroke#paint-order" title="Paint order">
      <div ref={list} className="paint-order-list">
        {all
          .map((e, i) => ({ e, i }))
          .reverse()
          .map(({ e, i }) => {
            const label = entryLabel(e, fills, strokes);
            const detail = entryDetail(e);
            const hidden = e.paint.visible === false;
            return (
              <div
                key={`${e.kind}${e.index}`}
                data-pos={i}
                className={`item-head paint-head paint-order-row${over === i ? ' drop' : ''}${moved?.pos === i ? ' moved' : ''}${hidden ? ' off' : ''}`}
                draggable
                onDragStart={(ev) => {
                  draggingOrder = i;
                  ev.dataTransfer?.setData('text/plain', `order:${i}`);
                }}
                onDragOver={(ev) => {
                  if (draggingOrder !== null) {
                    ev.preventDefault();
                    setOver(i);
                  }
                }}
                onDragLeave={() => setOver(null)}
                onDrop={(ev) => {
                  ev.preventDefault();
                  setOver(null);
                  if (draggingOrder !== null) move(draggingOrder, i);
                  draggingOrder = null;
                }}
                onDragEnd={() => (draggingOrder = null)}
              >
                <span className="paint-head-name" title={hidden ? `${label}: ${detail} (hidden)` : `${label}: ${detail}`}>
                  <span className="paint-swatch" style={{ background: swatchOf(e.paint) }} />
                  <span className="paint-order-label">{label}</span>
                  <span className="paint-order-detail">{detail}</span>
                </span>
                <span className="paint-head-tools">
                  <button type="button" className="mini" data-dir="up" title={`Move ${label.toLowerCase()} up in the paint order (in front)`} aria-label={`Move ${label.toLowerCase()} (${detail}) up in the paint order (in front)`} disabled={i === all.length - 1} onClick={() => move(i, i + 1, 'button')}>
                    ↑
                  </button>
                  <button type="button" className="mini" data-dir="down" title={`Move ${label.toLowerCase()} down in the paint order (behind)`} aria-label={`Move ${label.toLowerCase()} (${detail}) down in the paint order (behind)`} disabled={i === 0} onClick={() => move(i, i - 1, 'button')}>
                    ↓
                  </button>
                </span>
              </div>
            );
          })}
      </div>
      {/* What just happened, for screen readers */}
      <span className="sr-only" role="status" aria-live="polite">
        {moved?.text ?? ''}
      </span>
    </Section>
  );
}
