import type { Artboard, LayoutItem, LayoutSize, SceneNode } from 'interactives-player';
import { CheckField, NumberField, Row, Section, SelectField, TextField } from '../components/ui';
import { store } from '../store/store';
import { locate } from '../store/doc';
import { SIDES, commonValue, parentLayoutKind, patchLayoutItem, sizeMode, type LayoutKind } from '../lib/layout-item';

const SIZES: { value: LayoutSize; label: string }[] = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'hug', label: 'Hug' },
  { value: 'fill', label: 'Fill' },
  { value: 'percent', label: 'Percent' },
];

type BasisMode = 'none' | 'px' | 'percent' | 'content';
const basisMode = (it: LayoutItem): BasisMode => (it.basisPercent !== undefined ? 'percent' : it.basis === 'content' ? 'content' : typeof it.basis === 'number' ? 'px' : 'none');

type Position = NonNullable<LayoutItem['position']>;
const POSITIONS: { value: Position; label: string }[] = [
  { value: 'flow', label: 'In flow' },
  { value: 'absolute', label: 'Absolute' },
  { value: 'ignore', label: 'Ignore' },
];

const SIDE_TITLE = { top: 'top', right: 'right', bottom: 'bottom', left: 'left' } as const;

/**
 * The "Layout item" section: how a layer sits in its parent's auto layout (size mode, margins, grow and basis, aspect ratio,
 * wrapping text, grid cell). Shown when every selected layer is a child of an auto-layout frame of the same kind; only the
 * settings that kind of layout reads are shown. Writes the layer's `layoutItem` through the store, so undo and live editing
 * work, and several selected layers change together.
 */
export function LayoutItemSection({ nodes, ab }: { nodes: SceneNode[]; ab: Artboard }) {
  const kinds = nodes.map((n) => parentLayoutKind(locate(ab, n.id)?.parent));
  const kind = kinds[0];
  if (!kind) return null;
  if (kinds.some((k) => k !== kind)) {
    return (
      <Section help="auto-layout#child-sizing" title="Layout item">
        <p className="hint">The selected layers sit in different kinds of layout. Select layers from one frame to edit how they sit in it.</p>
      </Section>
    );
  }
  return <ItemFields nodes={nodes} kind={kind} />;
}

function ItemFields({ nodes, kind }: { nodes: SceneNode[]; kind: LayoutKind }) {
  const item = (n: SceneNode): LayoutItem => n.layoutItem ?? {};
  /** Change every selected layer's item; `make` reads that layer's own item, so values that differ between them survive. */
  const change = (make: (it: LayoutItem, n: SceneNode) => Partial<LayoutItem>, coalesce?: string) =>
    store().setEach(new Map(nodes.map((n) => [n.id, { layoutItem: patchLayoutItem(n.layoutItem, make(item(n), n)) }])), coalesce ? `${coalesce}-${nodes.map((n) => n.id).join(',')}` : undefined);
  const get = <T,>(read: (it: LayoutItem, n: SceneNode) => T) => commonValue(nodes, (n) => read(item(n), n));

  const row = kind === 'row';
  const flowLayout = row || kind === 'column';
  const grid = kind === 'grid';
  const position = get((it) => it.position ?? 'flow');
  const inFlow = nodes.every((n) => (item(n).position ?? 'flow') === 'flow');
  const absolute = nodes.every((n) => item(n).position === 'absolute');
  const w = get((it) => sizeMode(it, 'width'));
  const h = get((it) => sizeMode(it, 'height'));
  const allText = nodes.every((n) => n.type === 'text');
  const mainKey = row ? 'width' : 'height';
  const mainFill = flowLayout && inFlow && nodes.every((n) => sizeMode(item(n), mainKey) === 'fill');
  // Aspect ratio makes a hugging size follow the other one: in a grid only the height does
  const ratioSet = nodes.some((n) => !!item(n).aspectRatio);
  const oneHug = nodes.every((n) =>
    grid ? sizeMode(item(n), 'height') === 'hug' && sizeMode(item(n), 'width') !== 'hug' : (sizeMode(item(n), 'width') === 'hug') !== (sizeMode(item(n), 'height') === 'hug'),
  );
  const showAspect = inFlow && kind !== 'stack' && (ratioSet || oneHug);

  const sizeField = (axis: 'width' | 'height', label: string, value: LayoutSize, mixed: boolean) => (
    <SelectField
      label={label}
      title={
        axis === 'width'
          ? 'Fixed keeps its own width. Hug fits the contents (frames and text). Fill takes the free room (or stretches across). Percent is a share of the frame'
          : 'Fixed keeps its own height. Hug fits the contents (frames and text). Fill takes the free room (or stretches across). Percent is a share of the frame'
      }
      value={mixed ? ('' as LayoutSize) : value}
      options={mixed ? [{ value: '' as LayoutSize, label: 'Mixed' }, ...SIZES] : SIZES}
      onChange={(v) => v && change(() => ({ [axis]: v, ...(v === 'percent' ? { [`${axis}Percent`]: 100 } : {}) }))}
    />
  );
  const percentField = (axis: 'width' | 'height', label: string) => {
    const key = axis === 'width' ? 'widthPercent' : 'heightPercent';
    const v = get((it) => it[key] ?? 100);
    return (
      <NumberField
        label={label}
        title={`The ${axis} as a share of the frame's inner ${axis} (or of the cell, in a grid)`}
        value={v.value}
        mixed={v.mixed}
        min={0}
        suffix="%"
        onChange={(p) => change(() => ({ [key]: p }), key)}
      />
    );
  };

  const margin = (it: LayoutItem) => ({ top: 0, right: 0, bottom: 0, left: 0, ...it.margin });
  const basis = get((it) => basisMode(it));
  const aspect = get((it) => it.aspectRatio ?? 0);
  const derive = get((it) => it.aspectDerive ?? 'either');
  const col = get((it) => it.gridColumn ?? 0);
  const rowAt = get((it) => it.gridRow ?? 0);
  const colSpan = get((it) => it.gridColumnSpan ?? 1);
  const rowSpan = get((it) => it.gridRowSpan ?? 1);
  const num = (v: number) => (Number.isFinite(v) ? v : 0);

  return (
    <Section help="auto-layout#child-sizing" title="Layout item">
      <Row>
        <SelectField
          label="Position"
          title="In flow: laid out with its siblings. Absolute: pinned by insets from the frame's edges. Ignore: keeps its own x and y and takes no room"
          value={position.mixed ? ('' as Position) : position.value}
          options={position.mixed ? [{ value: '' as Position, label: 'Mixed' }, ...POSITIONS] : POSITIONS}
          onChange={(v) => v && change(() => ({ position: v }))}
        />
      </Row>
      {absolute && (
        <>
          <div className="field-label block">Inset from the frame (left, top, right, bottom)</div>
          <div className="li-insets">
            {(['left', 'top', 'right', 'bottom'] as const).map((side) => (
              <InsetField
                key={side}
                side={side}
                value={commonValue(nodes, (n) => item(n).inset?.[side]).value}
                onChange={(v) => change((it) => ({ inset: { ...it.inset, [side]: v } }), `inset-${side}`)}
              />
            ))}
          </div>
        </>
      )}
      {position.value !== 'ignore' && (
        <>
          <Row>
            {sizeField('width', 'W', w.value, w.mixed)}
            {sizeField('height', 'H', h.value, h.mixed)}
          </Row>
          {nodes.some((n) => sizeMode(item(n), 'width') === 'percent' || sizeMode(item(n), 'height') === 'percent') && (
            <Row>
              {w.value === 'percent' && percentField('width', 'Width %')}
              {h.value === 'percent' && percentField('height', 'Height %')}
            </Row>
          )}
          {mainFill && (
            <>
              <Row>
                <NumberField
                  label="Grow"
                  value={num(get((it) => it.grow ?? 1).value)}
                  mixed={get((it) => it.grow ?? 1).mixed}
                  min={0}
                  step={0.5}
                  onChange={(v) => change(() => ({ grow: v }), 'grow')}
                />
              </Row>
              <Row>
                <SelectField
                  label="Basis"
                  value={basis.mixed ? ('' as BasisMode) : basis.value}
                  options={[
                    ...(basis.mixed ? [{ value: '' as BasisMode, label: 'Mixed' }] : []),
                    { value: 'none', label: 'Zero' },
                    { value: 'px', label: 'Pixels' },
                    { value: 'percent', label: 'Percent' },
                    { value: 'content', label: 'Content' },
                  ]}
                  onChange={(m) =>
                    m &&
                    change((_, n) => {
                      if (m === 'none') return { basis: undefined, basisPercent: undefined };
                      if (m === 'content') return { basis: 'content', basisPercent: undefined };
                      if (m === 'percent') return { basis: undefined, basisPercent: 50 };
                      return { basis: Math.max(1, Math.round(n[mainKey])), basisPercent: undefined };
                    })
                  }
                />
                {!basis.mixed && (basis.value === 'px' || basis.value === 'percent') && (
                  <NumberField
                    title={basis.value === 'px' ? 'The size the layer starts from before the free room is shared, in px' : "The size the layer starts from, as a share of the frame's inner size"}
                    value={num(get((it) => (basisMode(it) === 'percent' ? it.basisPercent : typeof it.basis === 'number' ? it.basis : 0)).value ?? 0)}
                    min={0}
                    suffix={basis.value === 'px' ? 'px' : '%'}
                    onChange={(v) => change(() => (basis.value === 'px' ? { basis: v, basisPercent: undefined } : { basisPercent: v, basis: undefined }), 'basis')}
                  />
                )}
              </Row>
            </>
          )}
          {showAspect && (
            <>
              <Row>
                <NumberField label="Aspect" value={num(aspect.value)} mixed={aspect.mixed} min={0} step={0.1} onChange={(v) => change(() => ({ aspectRatio: v > 0 ? v : undefined }), 'aspect')} />
                <button
                  type="button"
                  className="btn li-small-btn"
                  title="Set the ratio from the layer's current width and height"
                  disabled={nodes.some((n) => !(n.width > 0 && n.height > 0))}
                  onClick={() => change((_, n) => ({ aspectRatio: Math.round((n.width / n.height) * 1000) / 1000 }))}
                >
                  From size
                </button>
              </Row>
              {ratioSet && !grid && (
                <Row>
                  <SelectField
                    label="Derive"
                    title="Which side may follow the ratio: whichever one hugs, or only the height (from the width)"
                    value={derive.mixed ? ('' as 'either') : (derive.value as 'either' | 'height')}
                    options={[...(derive.mixed ? [{ value: '' as 'either', label: 'Mixed' }] : []), { value: 'either', label: 'Either side' }, { value: 'height', label: 'Height only' }]}
                    onChange={(v) => v && change(() => ({ aspectDerive: v }))}
                  />
                </Row>
              )}
            </>
          )}
          {allText && flowLayout && inFlow && (
            <>
              <Row>
                <CheckField label="Wrap text" value={get((it) => !!it.wrapText).value} onChange={(v) => change(() => ({ wrapText: v }))} />
              </Row>
              {nodes.some((n) => n.type === 'text' && n.autoSize !== 'width') && <p className="hint">Wrapping applies to text with Sizing set to Auto width.</p>}
            </>
          )}
        </>
      )}
      {inFlow && grid && (
        <>
          <Row>
            <NumberField
              label="Column"
              title="Which column it starts in: 1 is the first, negative counts back from the last. 0 takes the next free cell"
              value={num(col.value)}
              mixed={col.mixed}
              step={1}
              onChange={(v) => change(() => ({ gridColumn: Math.round(v) }), 'col')}
            />
            <NumberField
              label="Row"
              title="Which row it starts in: 1 is the first, negative counts back from the last. 0 takes the next free cell"
              value={num(rowAt.value)}
              mixed={rowAt.mixed}
              step={1}
              onChange={(v) => change(() => ({ gridRow: Math.round(v) }), 'row')}
            />
          </Row>
          <Row>
            <NumberField
              label="Col span"
              title="How many columns it covers"
              value={num(colSpan.value)}
              mixed={colSpan.mixed}
              min={1}
              step={1}
              onChange={(v) => change(() => ({ gridColumnSpan: Math.max(1, Math.round(v)) }), 'colspan')}
            />
            <NumberField
              label="Row span"
              title="How many rows it covers"
              value={num(rowSpan.value)}
              mixed={rowSpan.mixed}
              min={1}
              step={1}
              onChange={(v) => change(() => ({ gridRowSpan: Math.max(1, Math.round(v)) }), 'rowspan')}
            />
          </Row>
        </>
      )}
      {inFlow && kind !== 'stack' && (
        <>
          <div className="field-label block">Margin (top, right, bottom, left)</div>
          <Row>
            {SIDES.map((side) => (
              <NumberField
                key={side}
                title={`Space ${SIDE_TITLE[side]} of the layer, outside it`}
                value={num(commonValue(nodes, (n) => margin(item(n))[side]).value)}
                mixed={commonValue(nodes, (n) => margin(item(n))[side]).mixed}
                onChange={(v) => change((it) => ({ margin: { ...margin(it), [side]: v } }), `margin-${side}`)}
              />
            ))}
          </Row>
          {flowLayout && (
            <div
              className="li-auto"
              role="group"
              aria-label="Auto margins"
              title="An auto margin takes the free room of the line, split equally between the auto sides: it pushes the layer to the end or centres it, ahead of the frame's Justify. Across the line, both sides centre it"
            >
              <span className="field-label">Auto margin</span>
              {SIDES.map((side) => (
                <CheckField
                  key={side}
                  label={side[0].toUpperCase() + side.slice(1)}
                  title={`The ${side} margin takes the free room`}
                  value={commonValue(nodes, (n) => !!item(n).marginAuto?.[side]).value}
                  onChange={(v) => change((it) => ({ marginAuto: { ...it.marginAuto, [side]: v } }))}
                />
              ))}
            </div>
          )}
        </>
      )}
    </Section>
  );
}

/** An inset that may be left out: empty means "not pinned to this edge". */
function InsetField({ side, value, onChange }: { side: 'left' | 'top' | 'right' | 'bottom'; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <TextField
      label={side[0].toUpperCase() + side.slice(1)}
      title={`Distance from the frame's ${side} edge, in px. Empty leaves this edge free; left and right (or top and bottom) both set stretch a layer that is not fixed size`}
      commitOnBlur
      value={value === undefined ? '' : String(Math.round(value * 100) / 100)}
      placeholder="auto"
      onChange={(t) => {
        const n = Number(t.trim());
        if (!t.trim()) onChange(undefined);
        else if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}
