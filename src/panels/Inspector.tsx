import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { PropRow, PropSearchProvider, PropSearchStore } from '../lib/prop-search';
import { PropSearchBox } from './PropSearchBox';
import { LAYER_BLEND_OPTIONS } from '../lib/blend-modes';
import {
  LIGHT_LOOK,
  ANIMATABLE_PROPS,
  animatableProp,
  linearLine,
  radialCircle,
  EASING_NAMES,
  MODIFIER_SHAPES,
  MODIFIER_UNITS,
  defaultModifier,
  type Easing,
  type TextModifier,
  type TextModifierShape,
  type TextModifierUnit,
  CURSORS,
  nodeRuns,
  createNode,
  type InstanceNode,
  type DrawNode,
  type ImageNode,
  type ShaderNode,
  type ProgressNode,
  type ChartNode,
  type ConnectorNode,
  DRAW_API,
  DRAW_TEMPLATES,
  type DrawTemplate,
  defaultAutoLayout,
  type AutoLayout,
  type FrameNode,
  LINK_TARGETS,
  type LinkTarget,
  type Repeat,
  type Artboard,
  type GroupNode,
  type Blend,
  type ColorStop,
  type FitMode,
  type InputKind,
  type Paint,
  type Project,
  type SceneNode,
  type Shadow,
  type TextRun,
  type BrandPlace,
  type TextFit,
  type TextStyle,
  textAutoSize,
  textFitOf,
  paintFx,
  type Constraint,
  type ConstraintType,
  uid,
  walk,
  shownAmount,
} from 'interactives-player';
import { keyTime, store, useEditor, valueAt } from '../store/store';
import { getArtboard, isIdentifier, locate } from '../store/doc';
import { ColourwayRow } from './ColourwayRow';
import { CheckField, ColorField, IconButton, NumberField, Row, Section, SelectField, TextField, UnitField } from '../components/ui';
import { ExprField } from '../components/ExprField';
import { openBehaviours } from '../components/BehaviourDialog';
import { flowSentence, flowsForLayer } from '../lib/flow-describe';
import { removeFlow, setFlowOff, showInGraph } from '../lib/flow-actions';

/** What a joystick's X and Y expressions see on top of the project's. */
const POINTER_LOCALS = ['pointer'];
import { gapUnit, lineGapUnit, paddingOwnerWidth, paddingUnit, patchGap, patchLineGap, patchPadding } from '../lib/layout-units';
import { Icons } from '../components/icons';
import { assetKind } from '../lib/assets';
import { acceptFor, pickFiles, replaceAssetFile } from '../lib/insert';
import { updateFromFile } from '../lib/importers';
import { pointTracks } from '../lib/path-edit';
import { formatTracks, parseTracks } from '../lib/grid-tracks';
import { addAssetOption, createVariable, withQuickAdd } from '../lib/quick-add';
import { SearchPicker, type PickerOption } from '../components/SearchPicker';
import { CodeEditor } from '../components/CodeEditor';
import { AccessibilitySection, TabOrderSection } from './AccessibilitySections';
import { DialogSection, KeyNavSection } from './FrameA11ySections';
import { DragDropSections } from './DragDropSections';
import { QuestionPartNote, QuestionSection } from './QuestionSection';
import { KIND_LABEL, linkManager, useLinks } from '../lib/links';
import { ChildOrder } from '../components/ChildOrder';
import { LayoutAnimateFields } from '../components/LayoutAnimateFields';
import { GridAlignFields } from '../components/GridAlignFields';
import { PivotFields } from '../components/PivotFields';
import { AltPromptCard } from './AltPromptCard';
import { CropFields } from '../components/CropFields';
import { canCrop } from '../lib/crop';
import { LayoutItemSection } from './LayoutItemSection';
import { ReportingSection } from './ReportingSection';
import { OptimiseOutputFields } from './OptimiseOutput';
import { WeightSection } from './WeightSection';
import { RecordsSection } from './RecordsSection';
import { SensorsSection } from './SensorsSection';
import { CreditsSettingsFields } from './CreditsPanel';
import { CaptionsSection, VideoCaptions, VideoDescriptions } from './CaptionsSection';
import { VideoCues } from './VideoCuesSection';
import { ReadAloudSection } from './ReadAloudSection';
import { VariantsSection } from './VariantsSection';
import { MasterSection } from './MasterSection';
import { PageLinkSection } from './PageLinkSection';
import { PageNavSection } from './PageNavSection';
import { StepsSection } from './StepsSection';
import { blendExample } from '../lib/blend-example';
import { BindingsSection as BindingsSectionView } from './BindingsSection';
import { AnimateSection } from './AnimateSection';
import { TEXT_PRESETS } from '../lib/text-modifiers';
import { applyDrawTemplate } from '../lib/draw-templates';
import { useDrawProblem } from '../lib/draw-edit';
import { confirmDialog } from '../components/dialogs';
import { detach as detachFromLibrary } from '../lib/library-actions';
import { ShaderFilterFields, ShaderSection } from './ShaderInspector';
import { FillSection, PaintOrderSection, StrokeSection } from './PaintLayers';
import { ChartSection, ProgressSection } from './DataLayerInspectors';
import { ConnectorSection } from './ConnectorInspector';
import { addShaderFilter, removeShaderFilter } from '../lib/shader-uniform-edit';
import { BindSelectionSection, BonesArtboardSection, BoneSection, SkinSection } from './RigSection';
import { skinnable } from '../lib/rig';
import { FontField, FontPicker, type FontPick } from '../components/FontPicker';
import { ensureGoogleFont, firstFamily } from '../lib/font-catalog';
import { CornerRadii } from './CornerRadii';
import { hasCornerRadii } from '../lib/corner-radii';
import { pickedArtboardIds } from '../lib/artboard-groups';
import { ArtboardsSelection } from './ArtboardsSelection';


export function Inspector() {
  const s = useEditor((st) => ({
    project: st.project,
    selection: st.selection,
    artboardSelected: st.artboardSelected,
    artboardPicked: st.artboardPicked,
    activeArtboardId: st.activeArtboardId,
    timelineShown: st.timelineShown,
    activeTimelineId: st.activeTimelineId,
    playhead: st.playhead,
    recording: st.recording,
  }));
  // The search lives here (not in the box) so it survives clicking from layer to layer
  const [store] = useState(() => new PropSearchStore());
  const [query, setQueryState] = useState('');
  const box = useRef<HTMLInputElement>(null);
  const setQuery = (q: string) => {
    setQueryState(q);
    store.setQuery(q.trim());
  };
  const ab = getArtboard(s.project, s.activeArtboardId);
  if (!ab) return <aside className="inspector" />;
  const nodes = s.selection.map((id) => locate(ab, id)?.node).filter(Boolean) as SceneNode[];
  const pickedAbs = pickedArtboardIds(s);
  // "/" or Ctrl+F anywhere in the panel (outside a field you're typing in) goes to the search; Esc clears it
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const t = e.target as HTMLElement;
    const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable;
    if ((e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) || ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f')) {
      e.preventDefault();
      e.stopPropagation();
      box.current?.focus();
      box.current?.select();
    } else if (e.key === 'Escape' && query && !e.defaultPrevented) {
      e.preventDefault();
      setQuery('');
    }
  };
  return (
    <aside className={`inspector${query.trim() ? ' ps-on' : ''}`} tabIndex={-1} onKeyDown={onKeyDown}>
      <PropSearchProvider value={store}>
        <PropSearchBox store={store} query={query} setQuery={setQuery} inputRef={box} />
        {s.recording && s.timelineShown && <div className="recording-banner">Recording keyframes at {Math.round(s.playhead)} ms</div>}
        {nodes.length ? <NodeInspector nodes={nodes} ab={ab} project={s.project} /> : (
          // several artboards selected: what applies to all of them, instead of the active one's own settings
          pickedAbs.length > 1 ? <ArtboardsSelection ids={pickedAbs} project={s.project} /> : <ArtboardInspector ab={ab} project={s.project} />
        )}
      </PropSearchProvider>
    </aside>
  );
}

// ---------------------------------------------------------------- shared bits

export function useSetter(ids: string[]) {
  return (props: Record<string, unknown>, coalesce?: string) => store().setProps(ids, props, coalesce ?? `insp-${Object.keys(props).join(',')}-${ids.join(',')}`);
}

/** Value shown in the inspector: the timeline's value at the playhead when it animates the property. */
export function useShown(node: SceneNode) {
  const st = store().get();
  const ab = store().artboard();
  const tl = st.timelineShown ? ab?.timelines.find((t) => t.id === st.activeTimelineId) : undefined;
  return (prop: string): unknown => valueAt(tl, node, prop, st.playhead);
}

/** Keys the property at the playhead, for every layer in `ids` (the selection the field edits; just `node` without it). */
export function KeyButton({ node, prop, ids }: { node: SceneNode; prop: string; ids?: string[] }) {
  const s = useEditor((st) => ({ timelineShown: st.timelineShown, tl: st.activeTimelineId, playhead: st.playhead, project: st.project }));
  if (!s.timelineShown || !animatableProp(prop, node)) return null;
  const ab = store().artboard();
  const tl = ab?.timelines.find((t) => t.id === s.tl);
  const track = tl?.tracks.find((t) => t.nodeId === node.id && t.prop === prop);
  // Where a key added now would go (on whole frames, the frame's start), so the button lights up on the frame the key is read in
  const at = tl ? keyTime(tl, s.playhead) : Math.round(s.playhead);
  const onKey = track?.keys.some((k) => Math.abs(k.t - at) < 1);
  const targets = ids?.length ? ids : [node.id];
  return (
    <button
      className={`key-btn${track ? ' tracked' : ''}${onKey ? ' on-key' : ''}`}
      title={`${onKey ? 'Update the keyframe' : 'Add a keyframe'} for ${prop} at ${at} ms${targets.length > 1 ? ` on all ${targets.length} selected layers` : ''}${tl ? '' : ' (creates a timeline)'}`}
      onClick={() => store().keyCurrent(targets, prop)}
    >
      ◆
    </button>
  );
}

export function Num({ node, ids, prop, label, step, min, max, suffix, fallback = 0, title, scale }: { node: SceneNode; ids: string[]; prop: string; label: ReactNode; step?: number; min?: number; max?: number; suffix?: string; fallback?: number; title?: string; scale?: number }) {
  const shown = useShown(node);
  const set = useSetter(ids);
  const v = Number(shown(prop) ?? fallback);
  return (
    <div className="keyed">
      <NumberField label={label} title={title} value={v} step={step} min={min} max={max} suffix={suffix} scale={scale} onChange={(x) => set({ [prop]: x })} onCommit={() => store().commit()} />
      <KeyButton node={node} prop={prop} ids={ids} />
    </div>
  );
}

/**
 * Two numbers with a chain between them (W and H, Sx and Sy). Linked, changing one changes the other too, keeping the
 * ratio they had, for each selected layer. The chain is saved on the layer (`lockKey`), and the canvas's resize handles
 * keep the ratio of a layer with lockRatio on as well.
 */
export function LinkedPair({ node, ids, a, b, labelA, labelB, titleA, titleB, lockKey, step, min, scale, suffix }: { node: SceneNode; ids: string[]; a: string; b: string; labelA: string; labelB: string; titleA?: string; titleB?: string; lockKey: 'lockRatio' | 'lockScale'; step?: number; min?: number; scale?: number; suffix?: string }) {
  const shown = useShown(node);
  const locked = !!node[lockKey];
  const set = useSetter(ids);
  const change = (prop: string, other: string, x: number) => {
    if (!locked) return set({ [prop]: x });
    const ab = store().artboard();
    const changes = new Map<string, Record<string, unknown>>();
    for (const id of ids) {
      // the first layer by what's on screen (it may be animated), the others by their own values
      const nd = id === node.id ? null : ab ? (locate(ab, id)?.node as unknown as Record<string, unknown> | undefined) : undefined;
      const cur = Number(nd ? nd[prop] : shown(prop)) || 0;
      const oth = Number(nd ? nd[other] : shown(other)) || 0;
      const next = cur ? (oth * x) / cur : oth;
      const round = lockKey === 'lockRatio' ? Math.round(next * 100) / 100 : Math.round(next * 1000) / 1000;
      changes.set(id, { [prop]: x, [other]: round });
    }
    store().setEach(changes, `insp-${a}${b}-${ids.join(',')}`);
  };
  const what = lockKey === 'lockRatio' ? 'width and height' : 'width and height scale';
  return (
    <Row className="linked-pair">
      <div className="keyed">
        <NumberField label={labelA} title={titleA} value={Number(shown(a) ?? 0)} step={step} min={min} scale={scale} suffix={suffix} onChange={(x) => change(a, b, x)} onCommit={() => store().commit()} />
        <KeyButton node={node} prop={a} ids={ids} />
      </div>
      <button
        type="button"
        className={`lock-toggle link-toggle${locked ? ' on' : ''}`}
        aria-pressed={locked}
        aria-label={locked ? `Unlink ${what}` : `Link ${what}`}
        title={locked ? `Linked: changing one changes the other, keeping the ratio. Click to change ${what} separately` : `Link ${what}: changing one changes the other, keeping the ratio${lockKey === 'lockRatio' ? ' (the resize handles keep it too)' : ''}`}
        onClick={() => store().setProps(ids, { [lockKey]: locked ? undefined : true })}
      >
        {locked ? <Icons.link width={13} /> : <Icons.unlink width={13} />}
      </button>
      <div className="keyed">
        <NumberField label={labelB} title={titleB} value={Number(shown(b) ?? 0)} step={step} min={min} scale={scale} suffix={suffix} onChange={(x) => change(b, a, x)} onCommit={() => store().commit()} />
        <KeyButton node={node} prop={b} ids={ids} />
      </div>
    </Row>
  );
}

export function Color({ node, ids, prop, label }: { node: SceneNode; ids: string[]; prop: string; label: ReactNode }) {
  const shown = useShown(node);
  const set = useSetter(ids);
  return (
    <div className="keyed">
      <ColorField label={label} tokens value={String(shown(prop) ?? '#000000')} onChange={(c) => set({ [prop]: c })} onCommit={() => store().commit()} />
      <KeyButton node={node} prop={prop} ids={ids} />
    </div>
  );
}

// ---------------------------------------------------------------- paint

/** Where a gradient's points are edited: the numbers of its start and end (linear), or its centre and radius (radial), in px from the layer's top-left. */
function GradientPoints({ paint, onChange, box }: { paint: Extract<Paint, { type: 'linear' | 'radial' }>; onChange: (p: Paint) => void; box: { w: number; h: number } }) {
  const commit = () => store().commit();
  const r1 = (v: number) => Math.round(v * 100) / 100;
  if (paint.type === 'linear') {
    const l = linearLine(paint, box.w, box.h);
    if (!l.exact) {
      return (
        <button
          className="link-btn"
          title="Pin the start and end of the gradient to points on the layer (in px from its top-left corner), instead of running corner to corner along the angle. They stay put when the layer is resized and can be animated."
          onClick={() => onChange({ ...paint, from: { x: r1(l.x1), y: r1(l.y1) }, to: { x: r1(l.x2), y: r1(l.y2) } })}
        >
          Set start and end points
        </button>
      );
    }
    const pts = { from: { x: r1(l.x1), y: r1(l.y1) }, to: { x: r1(l.x2), y: r1(l.y2) } };
    const setPt = (which: 'from' | 'to', k: 'x' | 'y', v: number) => onChange({ ...paint, ...pts, [which]: { ...pts[which], [k]: v } });
    return (
      <>
        <Row>
          <NumberField label="From X" title="Where the first colour sits, in px from the layer's left edge" value={r1(l.x1)} suffix="px" onChange={(v) => setPt('from', 'x', v)} onCommit={commit} />
          <NumberField label="From Y" title="Where the first colour sits, in px from the layer's top edge" value={r1(l.y1)} suffix="px" onChange={(v) => setPt('from', 'y', v)} onCommit={commit} />
        </Row>
        <Row>
          <NumberField label="To X" title="Where the last colour sits, in px from the layer's left edge" value={r1(l.x2)} suffix="px" onChange={(v) => setPt('to', 'x', v)} onCommit={commit} />
          <NumberField label="To Y" title="Where the last colour sits, in px from the layer's top edge" value={r1(l.y2)} suffix="px" onChange={(v) => setPt('to', 'y', v)} onCommit={commit} />
        </Row>
        <button
          className="link-btn"
          title="Go back to a gradient that runs corner to corner along an angle (the angle of the current line is kept)"
          onClick={() => {
            const { from: _f, to: _t, ...rest } = paint;
            void _f;
            void _t;
            onChange({ ...rest, angle: r1((Math.atan2(l.y2 - l.y1, l.x2 - l.x1) * 180) / Math.PI + 90) });
          }}
        >
          Use angle instead of points
        </button>
      </>
    );
  }
  const c = radialCircle(paint, box.w, box.h);
  if (!c.exact) {
    return (
      <button
        className="link-btn"
        title="Pin the gradient to a centre and radius in px from the layer's top-left corner, instead of running from the middle to the farthest corner. They stay put when the layer is resized and can be animated."
        onClick={() => onChange({ ...paint, center: { x: r1(c.cx), y: r1(c.cy) }, radius: r1(c.r) })}
      >
        Set centre and radius
      </button>
    );
  }
  const base = { center: { x: r1(c.cx), y: r1(c.cy) }, radius: r1(c.r) };
  return (
    <>
      <Row>
        <NumberField label="Centre X" title="Where the first colour sits, in px from the layer's left edge" value={base.center.x} suffix="px" onChange={(v) => onChange({ ...paint, ...base, center: { ...base.center, x: v } })} onCommit={commit} />
        <NumberField label="Centre Y" title="Where the first colour sits, in px from the layer's top edge" value={base.center.y} suffix="px" onChange={(v) => onChange({ ...paint, ...base, center: { ...base.center, y: v } })} onCommit={commit} />
      </Row>
      <NumberField label="Radius" title="How far from the centre the last colour is reached, in px" value={base.radius} suffix="px" min={0.01} onChange={(v) => onChange({ ...paint, ...base, radius: v })} onCommit={commit} />
      <button
        className="link-btn"
        title="Go back to a gradient from the middle of the layer to its farthest corner"
        onClick={() => {
          const { center: _c, radius: _r, ...rest } = paint;
          void _c;
          void _r;
          onChange(rest);
        }}
      >
        Use the box instead of a centre and radius
      </button>
    </>
  );
}

/** `box` (the layer's size) is what the gradient points start from; without it a 100 x 100 box stands in. */
export function PaintField({ paint, onChange, project, allowNone = true, box }: { paint: Paint | null; onChange: (p: Paint | null) => void; project: Project; allowNone?: boolean; box?: { w: number; h: number } }) {
  const type = paint?.type ?? 'none';
  const stopsOf = (p: Paint | null): ColorStop[] =>
    p && (p.type === 'linear' || p.type === 'radial')
      ? p.stops
      : [
          { offset: 0, color: p?.type === 'solid' ? p.color : LIGHT_LOOK.button },
          { offset: 1, color: '#00c2a8' },
        ];
  // Changing the type keeps what the paint does besides its colour: opacity, blend, feather, offset
  const setType = (t: string) => {
    const change = (p: Paint | null) => onChange(p && paint ? { ...paintFx(paint), ...p } : p);
    if (t === 'none') change(null);
    else if (t === 'solid') change({ type: 'solid', color: paint && paint.type !== 'solid' && paint.type !== 'image' ? paint.stops[0]?.color ?? LIGHT_LOOK.surfaceMuted : LIGHT_LOOK.surfaceMuted });
    else if (t === 'linear') change({ type: 'linear', angle: 180, stops: stopsOf(paint) });
    else if (t === 'radial') change({ type: 'radial', stops: stopsOf(paint) });
    else if (t === 'image') change({ type: 'image', assetId: project.assets.find((a) => assetKind(a.mime) === 'image')?.id ?? '', fit: 'cover' });
  };
  const images = project.assets.filter((a) => assetKind(a.mime, a.name) === 'image');
  return (
    <div className="paint-field">
      <SelectField
        value={type}
        onChange={setType}
        options={[...(allowNone ? [{ value: 'none', label: 'None' }] : []), { value: 'solid', label: 'Solid' }, { value: 'linear', label: 'Linear gradient' }, { value: 'radial', label: 'Radial gradient' }, { value: 'image', label: 'Image' }]}
      />
      {paint?.type === 'solid' && <ColorField tokens value={paint.color} onChange={(c) => onChange({ ...paint, color: c })} onCommit={() => store().commit()} />}
      {(paint?.type === 'linear' || paint?.type === 'radial') && (
        <>
          {paint.type === 'linear' && !paint.from && !paint.to && <NumberField label="Angle" value={paint.angle} suffix="°" onChange={(a) => onChange({ ...paint, angle: a })} onCommit={() => store().commit()} />}
          <GradientPoints paint={paint} onChange={onChange} box={box ?? { w: 100, h: 100 }} />
          {paint.stops.map((stop, i) => (
            <Row key={i} className="stop-row">
              <ColorField tokens value={stop.color} onChange={(c) => onChange({ ...paint, stops: paint.stops.map((x, j) => (j === i ? { ...x, color: c } : x)) })} />
              <NumberField
                value={Math.round(stop.offset * 100)}
                suffix="%"
                min={0}
                max={100}
                onChange={(o) => onChange({ ...paint, stops: paint.stops.map((x, j) => (j === i ? { ...x, offset: o / 100 } : x)) })}
              />
              <IconButton icon={<Icons.trash />} title="Remove stop" disabled={paint.stops.length <= 2} onClick={() => onChange({ ...paint, stops: paint.stops.filter((_, j) => j !== i) })} />
            </Row>
          ))}
          <button className="link-btn" onClick={() => onChange({ ...paint, stops: [...paint.stops, { offset: 0.5, color: '#ffffff' }] })}>
            + Add stop
          </button>
        </>
      )}
      {paint?.type === 'image' && (
        <>
          <SelectField
            value={paint.assetId}
            onChange={(v) => onChange({ ...paint, assetId: v })}
            options={[{ value: '', label: images.length ? 'Choose image…' : 'Upload an image in Assets' }, ...images.map((a) => ({ value: a.id, label: a.name }))]}
          />
          <SelectField value={paint.fit} onChange={(v) => onChange({ ...paint, fit: v })} options={['cover', 'contain', 'fill'] as const} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- artboard + project

/** "2 min ago" for a time, refreshed while it's on screen. */
function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (!Number.isFinite(s)) return 'earlier';
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/** The design file this artboard was imported from: when it was last brought in, and Update from file. */
function LinkedFileSection({ ab }: { ab: Artboard }) {
  const src = ab.source!;
  const status = useLinks().find((l) => l.linkId === src.linkId);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  const state = status?.state ?? 'checking';
  //Only a file linked from this browser (before linking was turned off) can still be watched and re-read on its own
  const watched = state === 'connected' || state === 'needs-permission';
  const note =
    state === 'needs-permission'
      ? 'Click Re-import now (or Reconnect in the bar above) to allow reading the file again.'
      : state === 'missing'
        ? 'The linked file was moved, renamed or deleted. Use Update from file to pick it again.'
        : status?.error
          ? status.error
          : status?.changed
            ? 'The file has been saved since it was brought in. Re-import now to bring the changes in.'
            : '';
  return (
    <Section help="import#updating-a-design-file" title="Source file">
      <div className="link-info">
        <div className="link-title">
          From {src.fileName} <span className="link-sub">({KIND_LABEL[src.kind] ?? src.kind}, updated {ago(src.importedAt, now)})</span>
        </div>
        {note && <div className={`link-sub${status?.error || state === 'missing' ? ' err' : ''}`}>{note}</div>}
        <Row>
          <button
            className="btn"
            disabled={busy}
            title={`Pick the new version of ${src.fileName}. What changed in it comes in, and the edits made here are kept`}
            onClick={async () => {
              setBusy(true);
              try {
                await updateFromFile(src.linkId);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Updating…' : 'Update from file…'}
          </button>
          {watched && (
            <button className="btn" disabled={status?.busy} title="Read the linked file now and bring its changes in; your own edits are kept" onClick={() => void linkManager()?.reimportNow(src.linkId)}>
              {status?.busy ? 'Importing…' : 'Re-import now'}
            </button>
          )}
        </Row>
        {watched && <CheckField label="Watch for changes" title="Ask to re-import when the file is saved (looked at every few seconds while this tab is open)" value={!!status?.watch} onChange={(v) => void linkManager()?.setWatch(src.linkId, v)} />}
        <button className="link-btn" title="Forget which file these artboards came from. The layers stay as they are, and Update from file goes away" onClick={() => void linkManager()?.unlink(src.linkId)}>
          Forget source file
        </button>
      </div>
    </Section>
  );
}

/** Swap the file behind a picture or video for a new version of it, everywhere it's used (see replaceAssetFile). */
function ReplaceAssetButton({ assetId }: { assetId: string }) {
  const asset = useEditor((st) => st.project.assets.find((a) => a.id === assetId));
  if (!asset) return null;
  return (
    <Row>
      <button
        className="link-btn"
        title={`Pick a new version of ${asset.name}. Every layer, fill and action that uses it shows the new file`}
        onClick={async () => {
          const [file] = await pickFiles(acceptFor(asset.mime, asset.name), false);
          if (file) await replaceAssetFile(asset.id, file);
        }}
      >
        Replace file…
      </button>
    </Row>
  );
}

/** A copy of a library component: where it is from, which version, and Detach. */
function LibraryArtboardSection({ ab, project }: { ab: Artboard; project: Project }) {
  const link = ab.library!;
  const name = project.libraries?.find((l) => l.id === link.libraryId)?.name ?? 'a library';
  const override = useEditor((st) => st.brandOverride);
  const locked = !!link.brand && !override;
  return (
    <Section id="library-link" help={link.brand ? 'brand-kits' : 'libraries'} title={link.brand ? 'Brand kit' : 'Library'}>
      <p className="hint">
        {link.internal ? 'Used inside a library component. ' : ''}From <strong>{name}</strong>, version {link.version}. It is read-only here: its layers, timelines and interactions come from the library and are replaced when you update it. Instances of it in your own artboards, their inputs and your variables are yours.
        {link.brand && ' It is part of a brand kit, so it stays linked and locked. You can move it, and change the text the kit marks as editable. Instances of it keep its proportions and can be scaled between half and double its size.'}
      </p>
      <Row>
        <button
          className="btn"
          disabled={locked}
          title={locked ? 'Part of a brand kit, so it stays linked and locked' : 'Make a copy you can edit. It stops getting updates'}
          onClick={async () => {
            if (await confirmDialog({ title: 'Detach', message: `“${ab.name}” becomes a normal artboard you can edit. It will not get library updates any more.`, confirmLabel: 'Detach' })) detachFromLibrary(ab.id);
          }}
        >
          Detach to edit
        </button>
      </Row>
    </Section>
  );
}

function ArtboardInspector({ ab, project }: { ab: Artboard; project: Project }) {
  const setAb = (fn: (a: Artboard) => void, coalesce?: string) =>
    store().update(
      (d) => {
        const a = d.artboards.find((x) => x.id === ab.id);
        if (a) fn(a as Artboard);
      },
      { coalesce },
    );
  const setProject = (fn: (p: Project) => void, coalesce?: string) => store().update((d) => fn(d as Project), { coalesce });
  return (
    <>
      {ab.source?.linkId && <LinkedFileSection ab={ab} />}
      {ab.library && <LibraryArtboardSection ab={ab} project={project} />}
      <Section id="Artboard" help="artboards" title="Page">
        <TextField label="Name" value={ab.name} onChange={(v) => setAb((a) => (a.name = v), `ab-name-${ab.id}`)} />
        <Row className="linked-pair">
          <NumberField
            label="W"
            value={ab.width}
            min={1}
            onChange={(v) =>
              setAb((a) => {
                if (a.lockRatio && a.width) a.height = Math.max(1, Math.round((a.height * v) / a.width));
                a.width = Math.round(v);
              }, `ab-w-${ab.id}`)
            }
          />
          <button
            type="button"
            className={`lock-toggle link-toggle${ab.lockRatio ? ' on' : ''}`}
            aria-pressed={!!ab.lockRatio}
            aria-label={ab.lockRatio ? "Unlink the page's width and height" : "Link the page's width and height"}
            title={ab.lockRatio ? 'Linked: changing one changes the other, keeping the ratio. Click to change them separately' : 'Link width and height: changing one changes the other, keeping the ratio'}
            onClick={() => setAb((a) => void (a.lockRatio ? delete a.lockRatio : (a.lockRatio = true)))}
          >
            {ab.lockRatio ? <Icons.link width={13} /> : <Icons.unlink width={13} />}
          </button>
          <NumberField
            label="H"
            value={ab.height}
            min={1}
            onChange={(v) =>
              setAb((a) => {
                if (a.lockRatio && a.height) a.width = Math.max(1, Math.round((a.width * v) / a.height));
                a.height = Math.round(v);
              }, `ab-h-${ab.id}`)
            }
          />
        </Row>
        <SelectField
          label="Preset"
          value=""
          onChange={(v) => {
            const [w, h] = v.split('x').map(Number);
            if (w && h) setAb((a) => {
              a.width = w;
              a.height = h;
            });
          }}
          options={[
            { value: '', label: 'Size presets…' },
            { value: '1440x900', label: 'Desktop 1440 × 900' },
            { value: '1280x720', label: 'HD 1280 × 720' },
            { value: '1920x1080', label: 'Full HD 1920 × 1080' },
            { value: '768x1024', label: 'Tablet 768 × 1024' },
            { value: '390x844', label: 'Phone 390 × 844' },
            { value: '1080x1080', label: 'Square 1080 × 1080' },
            { value: '800x600', label: '800 × 600' },
          ]}
        />
        <PropRow k="Background" words={['colour', 'color', 'fill', 'backdrop', 'gradient', 'paint']}>
        <div className="field-label block">Background</div>
        <PaintField paint={ab.background} project={project} box={{ w: ab.width, h: ab.height }} onChange={(p) => setAb((a) => (a.background = p), `ab-bg-${ab.id}`)} />
        </PropRow>
        <CheckField label="Clip content to page" title="Preview and exports cut off whatever hangs outside the page. On the canvas it still shows faintly there (Preferences: Show layers outside clipped artboards)" value={ab.clip} onChange={(v) => setAb((a) => (a.clip = v))} />
        {project.settings.library && !ab.library && (
          <CheckField
            label="Publish to library"
            title="Offer this page as a component to projects that use this library. Publish from the Libraries tab"
            value={!!ab.publish}
            onChange={(v) => setAb((a) => (v ? (a.publish = true) : delete a.publish))}
          />
        )}
        {project.settings.library && !ab.library && ab.publish && (
          <SelectField
            label="Brand kit start"
            title="If this library is published as a brand kit: place this component in the first page of every project that starts from the kit (Add with starter items in the Libraries tab), at this spot"
            value={ab.brandPlace ?? ''}
            options={[
              { value: '', label: 'Not placed' },
              { value: 'top', label: 'Top, centred' },
              { value: 'bottom', label: 'Bottom, centred' },
              { value: 'top-left', label: 'Top left' },
              { value: 'top-right', label: 'Top right' },
              { value: 'bottom-left', label: 'Bottom left' },
              { value: 'bottom-right', label: 'Bottom right' },
              { value: 'center', label: 'Centre' },
            ]}
            onChange={(v) => setAb((a) => (v ? (a.brandPlace = v as BrandPlace) : delete a.brandPlace))}
          />
        )}
        <Row k="Start page" words={['make start page', 'start artboard', 'first page', 'home page', 'entry', 'duplicate page', 'duplicate artboard', 'copy', 'clone']}>
          <button className="btn" disabled={project.settings.startArtboardId === ab.id} onClick={() => setProject((p) => (p.settings.startArtboardId = ab.id))}>
            {project.settings.startArtboardId === ab.id ? 'Start page' : 'Make start page'}
          </button>
          <IconButton icon={<Icons.copy />} title="Duplicate page" onClick={() => store().duplicateArtboard(ab.id)} />
        </Row>
        <Row>
          <SelectField
            label="Use in"
            title="Place this page inside another page, as a component. You can also right-click it and choose Place in…, or drag its row from the Layers list onto the other page"
            value=""
            options={[{ value: '', label: 'Component in…' }, ...project.artboards.filter((a) => a.id !== ab.id).map((a) => ({ value: a.id, label: a.name }))]}
            onChange={(target) => {
              if (!target) return;
              const host = project.artboards.find((a) => a.id === target)!;
              const inst = createNode('instance', { name: ab.name, artboardId: ab.id, width: ab.width, height: ab.height, x: Math.round((host.width - ab.width) / 2), y: Math.round((host.height - ab.height) / 2) });
              store().addNodes([inst], { artboardId: target });
            }}
          />
          <IconButton icon={<Icons.trash />} title="Delete page" onClick={() => store().deleteArtboard(ab.id)} />
        </Row>
      </Section>
      <PageNavSection ids={[ab.id]} project={project} />
      <VariantsSection ab={ab} project={project} />
      <MasterSection ab={ab} project={project} />
      <TabOrderSection ab={ab} />
      <StepsSection ab={ab} project={project} />
      <JoysticksSection ab={ab} />
      <BlendsSection ab={ab} project={project} />
      <BonesArtboardSection ab={ab} />
      <WeightSection ab={ab} project={project} />
      <Section help="project-settings" title="Project">
        <ColourwayRow project={project} />
        <div className="labels-66">
          <TextField label="Name" value={project.name} onChange={(v) => setProject((p) => (p.name = v), 'project-name')} />
          <TextField label="Page title" value={project.settings.title} onChange={(v) => setProject((p) => (p.settings.title = v), 'project-title')} />
        </div>
        <TextField label="Description" value={project.settings.description} multiline onChange={(v) => setProject((p) => (p.settings.description = v), 'project-desc')} />
        <SelectField<FitMode>
          label="Fit"
          value={project.settings.fit}
          onChange={(v) => setProject((p) => (p.settings.fit = v))}
          options={[
            { value: 'contain', label: 'Contain (letterbox)' },
            { value: 'cover', label: 'Cover (crop)' },
            { value: 'fill', label: 'Stretch' },
            { value: 'width', label: 'Fit width (page height follows)' },
            { value: 'none', label: 'Actual size' },
          ]}
        />
        <ColorField label="Page background" value={project.settings.pageBackground} onChange={(c) => setProject((p) => (p.settings.pageBackground = c), 'page-bg')} />
        <CheckField
          label="Run scripts in the sandbox"
          title="Scripts run in a JavaScript VM (WASM) with only the ix API: no DOM, cookies or network. Turn off to let scripts reach the page (node.element)."
          value={!!project.settings.scriptSandbox}
          onChange={(v) => setProject((p) => (p.settings.scriptSandbox = v))}
        />
        {!project.settings.scriptSandbox && (
          <CheckField
            label="Run embedded HTML in the page"
            title="Embed layers with HTML normally run in a sandboxed frame that cannot reach the page. Turn on only for HTML you wrote and trust, if it needs the page. Ignored while scripts run in the sandbox."
            value={!!project.settings.trustedEmbeds}
            onChange={(v) => setProject((p) => (p.settings.trustedEmbeds = v))}
          />
        )}
        <TextField
          label="Allowed data hosts"
          title="Hosts that data may be loaded from, one per line, such as api.example.com or *.example.com. Leave empty to allow any http(s) host. Data sources, the Load data node and ix.loadData all follow it. Cookies are only sent to the page's own site."
          value={(project.settings.dataAllowList ?? []).join('\n')}
          multiline
          placeholder={'api.example.com\n*.example.com'}
          onChange={(v) => setProject((p) => (p.settings.dataAllowList = v ? v.split('\n') : undefined), 'project-data-hosts')}
        />
        <CheckField
          label="This project is a library"
          title="Share artboards marked Publish to library, plus this project's styles and assets, as components other projects can use (Libraries tab)"
          value={!!project.settings.library}
          onChange={(v) => setProject((p) => (p.settings.library = v))}
        />
        <CheckField
          label="Respect reduced motion"
          title="When the viewer's device asks for less motion, autoplaying timelines show their last frame and artboard transitions are instant"
          value={!!project.settings.reducedMotion}
          onChange={(v) => setProject((p) => (p.settings.reducedMotion = v))}
        />
        <NumberField
          label="Depth range"
          title="How far in pixels a layer with a depth of 100% moves as the pointer goes from the middle to an edge of the window. Layers are set up in their own Depth section"
          value={project.settings.parallax?.range ?? 40}
          min={0}
          max={400}
          suffix="px"
          onChange={(v) => setProject((p) => (p.settings.parallax = { ...p.settings.parallax, range: v === 40 ? undefined : v }), 'project-parallax-range')}
        />
        <CheckField
          label="Tilt moves depth layers"
          title="Phones and tablets: layers with a depth follow how the device is tilted, as well as the pointer. Off by default. On iPhones and iPads the viewer's first tap asks permission for the motion sensor; if they refuse (or there is no sensor) the layers follow the pointer only. Nothing moves for viewers who ask for less motion"
          value={!!project.settings.parallax?.tilt}
          onChange={(v) => setProject((p) => (p.settings.parallax = { ...p.settings.parallax, tilt: v ? true : undefined }))}
        />
        <OptimiseOutputFields project={project} />
      </Section>
      <CaptionsSection project={project} />
      <ReadAloudSection project={project} />
      <ReportingSection project={project} />
      <RecordsSection project={project} />
      <SensorsSection project={project} />
      <Section help="attributions" title="Credits" defaultOpen={false}>
        <CreditsSettingsFields />
        <p className="hint">The entries themselves are in the Attributions tab. They are your own record unless you turn the button on.</p>
        <Row k="Open Attributions" words={['credits', 'references', 'sources']}>
          <button className="btn" onClick={() => store().set({ bottomTab: 'credits', previewPlaying: false })} title="Open the Attributions tab">
            Open Attributions
          </button>
        </Row>
      </Section>
      <Section help="text" title="Fonts">
        {project.fonts.map((f, i) => (
          <Row key={i} className="font-row" k="Project fonts" words={[f.family, 'remove font', 'typeface']}>
            <span className="font-name" style={{ fontFamily: f.family }}>
              {f.family}
            </span>
            <span className="muted">{f.source}</span>
            <IconButton icon={<Icons.trash />} title="Remove font" onClick={() => setProject((p) => p.fonts.splice(i, 1))} />
          </Row>
        ))}
        <PropRow k="Add a font" words={['google fonts', 'typeface', 'upload font', 'font family']}>
        <FontPicker
          ariaLabel="Add a font"
          title="Search every Google font and add it to this project (the player loads it). Fonts you upload in Assets show here too"
          placeholder="Add a Google font…"
          clearOnPick
          system={false}
          project={project.fonts}
          typedLabel={(name) => `Add “${name}” as a Google font`}
          onPick={(o) => {
            if (o.kind !== 'system') setProject((p) => void ensureGoogleFont(p.fonts, o.family, [400, 600, 700], { force: true }));
          }}
        />
        </PropRow>
        <p className="hint">Upload .woff2/.ttf files in Assets to use your own fonts.</p>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- nodes

function NodeInspector({ nodes, ab, project }: { nodes: SceneNode[]; ab: Artboard; project: Project }) {
  const n = nodes[0];
  const ids = nodes.map((x) => x.id);
  const set = useSetter(ids);
  const single = nodes.length === 1;
  const sameType = nodes.every((x) => x.type === n.type);
  //A connector's box is the route between the two layers it joins, so there is nothing to place, size, turn or lay out
  const isConn = sameType && n.type === 'connector';
  return (
    <>
      {single && (n.type === 'image' || n.type === 'video') && <AltPromptCard node={n} projectId={project.id} />}
      <AlignBar count={nodes.length} shapes={nodes.filter((x) => !(x.type === 'group' || x.type === 'text' || x.type === 'link')).length} />
      {/* the layer's type heads its own section further down (Path, Text, ...), so this one is just "Layer" */}
      <Section id="layer-selection" help="fill-stroke" title={single ? 'Layer' : `${nodes.length} layers`}>
        {single && <TextField label="Name" value={n.name} onChange={(v) => set({ name: v }, `name-${n.id}`)} />}
        {!isConn && (
          <Row className="aligned-pair">
            <Num node={n} ids={ids} prop="x" label="X" />
            <span className="link-toggle link-gap" aria-hidden="true" />
            <Num node={n} ids={ids} prop="y" label="Y" />
          </Row>
        )}
        {isConn ? (
          <Row className="aligned-pair">
            <Num node={n} ids={ids} prop="opacity" label="Opacity" suffix="%" scale={100} step={5} min={0} max={100} fallback={1} />
          </Row>
        ) : sameType && n.type === 'bone' ? (
          <Row>
            <Num node={n} ids={ids} prop="width" label="Length" title="The bone's length (the layer's width)" min={0} />
            <Num node={n} ids={ids} prop="rotation" label="Rotation" suffix="°" />
          </Row>
        ) : (
          <>
            <LinkedPair node={n} ids={ids} a="width" b="height" labelA="W" labelB="H" lockKey="lockRatio" min={0} />
            <Row className="aligned-pair">
              <Num node={n} ids={ids} prop="rotation" label="Rotation" suffix="°" />
              <span className="link-toggle link-gap" aria-hidden="true" />
              <Num node={n} ids={ids} prop="opacity" label="Opacity" suffix="%" scale={100} step={5} min={0} max={100} fallback={1} />
            </Row>
          </>
        )}
        {!isConn && (
          <LinkedPair
            node={n}
            ids={ids}
            a="scaleX"
            b="scaleY"
            labelA={"Scale\u00a0W"}
            labelB={"Scale\u00a0H"}
            titleA="Scale across, as a percent of the layer's own width: 100% is as drawn, 200% twice as wide, -100% flips it (scaleX)"
            titleB="Scale down, as a percent of the layer's own height: 100% is as drawn, 200% twice as tall, -100% flips it (scaleY)"
            lockKey="lockScale"
            step={5}
            scale={100}
            suffix="%"
          />
        )}
        {!(sameType && (n.type === 'bone' || n.type === 'connector')) && <PivotFields originX={n.originX} originY={n.originY} onChange={(p) => set(p)} onCommit={() => store().commit()} />}
        <Row>
          <CheckField label="Visible" value={n.visible} onChange={(v) => set({ visible: v })} />
          <CheckField label="Locked" value={!!n.locked} onChange={(v) => set({ locked: v })} />
        </Row>
        {!isConn && <CheckField label="Use as mask" value={!!n.mask} onChange={(v) => set({ mask: v ? true : undefined })} />}
        {n.mask && !isConn && (
          <SelectField
            label="Mask mode"
            value={n.maskMode ?? 'alpha'}
            options={[
              { value: 'alpha', label: 'Alpha (shapes show)' },
              { value: 'inverted', label: 'Inverted (shapes cut out)' },
              { value: 'luminance', label: 'Luminance (brightness)' },
              { value: 'invertedLuminance', label: 'Inverted luminance' },
            ]}
            onChange={(v) => set({ maskMode: v === 'alpha' ? undefined : v })}
          />
        )}
        <SelectField label="Blend" value={n.blendMode ?? 'normal'} options={LAYER_BLEND_OPTIONS} onChange={(v) => set({ blendMode: v })} />
      </Section>
      {single && n.type === 'frame' && n.question && <QuestionSection frame={n} ab={ab} project={project} />}
      {single && n.questionPart && <QuestionPartNote node={n} ab={ab} />}
      {!isConn && <LayoutItemSection nodes={nodes} ab={ab} />}
      {sameType && <TypeSection nodes={nodes} project={project} />}
      {!single && <BindSelectionSection nodes={nodes} abId={ab.id} />}
      {single && skinnable(n) && <SkinSection node={n} abId={ab.id} />}
      {single && n.type === 'text' && project.settings.library && !ab.library && (
        <CheckField
          label="Editable in brand kit projects"
          title="If this library is published as a brand kit: whoever uses the kit can change what this text says (and nothing else about it). Everything else in the kit stays locked"
          value={!!n.brandEditable}
          onChange={(v) => set({ brandEditable: v ? true : undefined })}
        />
      )}
      {single && n.type === 'text' && <TextModifiersSection node={n} />}
      {sameType && 'fill' in n && <FillSection nodes={nodes} project={project} />}
      {sameType && 'stroke' in n && <StrokeSection nodes={nodes} project={project} />}
      {sameType && single && 'stroke' in n && !isConn && <PaintOrderSection nodes={nodes} />}
      <EffectsSection nodes={nodes} />
      {!isConn && <DepthSection nodes={nodes} project={project} />}
      {single && !isConn && <ConstraintsSection node={n} />}
      {single && !isConn && <PageLinkSection node={n} ab={ab} project={project} />}
      {!isConn && nodes.every((x) => x.type !== 'bone') && <AnimateSection nodes={nodes} />}
      <LinkCursorSection nodes={nodes} project={project} />
      {single && (n.type === 'group' || n.type === 'frame') && <SoloSection node={n} />}
      {single && (n.type === 'group' || n.type === 'frame') && n.children.length > 1 && <DrawOrderSection node={n} />}
      {single && (n.type === 'group' || n.type === 'frame') && <RepeatSection node={n} project={project} />}
      {single && (n.type === 'group' || n.type === 'frame') && <KeyNavSection node={n} project={project} />}
      {single && n.type === 'frame' && <DialogSection node={n} ab={ab} project={project} />}
      {single && <BindingsSectionView node={n} project={project} set={set} />}
      {single && <InteractionsSection node={n} ab={ab} />}
      <DragDropSections nodes={nodes} ab={ab} project={project} />
      <AccessibilitySection nodes={nodes} ab={ab} />
      {single && (
        <Section help="web-elements#accessibility" title="Advanced" defaultOpen={false}>
          <TextField label="CSS class" value={n.className ?? ''} onChange={(v) => set({ className: v || undefined })} />
          {n.type === 'text' && (
            <>
              <p className="hint">The toolbar that floats over the text while you edit it (double-click the text) is the normal way to style parts of it. This list is for fixing the runs by hand.</p>
              <RunsEditor node={n} />
            </>
          )}
          <div className="muted small">id: {n.id}</div>
        </Section>
      )}
    </>
  );
}

export function KeyRow({ node, prop, ids }: { node: SceneNode; prop: string; ids?: string[] }) {
  const shown = useEditor((st) => st.timelineShown);
  if (!shown) return null;
  return (
    <div className="key-row">
      <span className="muted small">Animate {(ANIMATABLE_PROPS.find((a) => a.prop === prop)?.label ?? prop).toLowerCase()}</span>
      <KeyButton node={node} prop={prop} ids={ids} />
    </div>
  );
}

function EffectsSection({ nodes }: { nodes: SceneNode[] }) {
  const n = nodes[0];
  const ids = nodes.map((x) => x.id);
  const set = useSetter(ids);
  const sh = n.shadow;
  const [blurOn, setBlurOn] = useState(false);
  const hasBlur = !!n.blur || blurOn;
  const setShadow = (patch: Partial<Shadow>) => set({ shadow: { ...(sh as Shadow), ...patch } }, 'shadow');
  const addShadow = () => set({ shadow: { x: 0, y: 4, blur: 12, spread: 0, color: 'rgba(0, 0, 0, 0.25)' } });
  const addBlur = () => {
    setBlurOn(true);
    set({ blur: 4 });
  };
  // Shader filter: image layers only (the shader reads the picture), not with a 9-slice
  const img = nodes.length === 1 && n.type === 'image' && !n.slice ? (n as ImageNode) : null;
  const filter = img?.shaderFilter ?? null;
  return (
    <Section
      help="fill-stroke#effects"
      title="Effects"
      defaultOpen={!!(sh || n.blur || filter)}
      actions={
        !(sh && hasBlur && (filter || !img)) && (
          <AddMenu
            title="Add an effect"
            items={[...(!sh ? [{ label: 'Shadow', onClick: addShadow }] : []), ...(!hasBlur ? [{ label: 'Layer blur', onClick: addBlur }] : []), ...(img && !filter ? [{ label: 'Shader filter', onClick: () => addShaderFilter(img.id) }] : [])]}
          />
        )
      }
    >
      {!sh && !hasBlur && !filter && <p className="hint">No effects. Use + to add a shadow or a blur{img ? ' (or a shader filter)' : ''}.</p>}
      {sh && (
        <div className="effect-item">
          <ItemHead label="Shadow" onRemove={() => set({ shadow: null })} />
          <Row>
            <Num node={n} ids={ids} prop="shadow.x" label="X" />
            <Num node={n} ids={ids} prop="shadow.y" label="Y" />
          </Row>
          <Row>
            <Num node={n} ids={ids} prop="shadow.blur" label="Blur" min={0} />
            <NumberField label="Spread" value={sh.spread} onChange={(v) => setShadow({ spread: v })} />
          </Row>
          <Color node={n} ids={ids} prop="shadow.color" label="Colour" />
          <CheckField label="Inner" title="Draw the shadow inside the shape instead of behind it" value={!!sh.inset} onChange={(v) => setShadow({ inset: v })} />
        </div>
      )}
      {hasBlur && (
        <div className="effect-item">
          <ItemHead
            label="Layer blur"
            onRemove={() => {
              setBlurOn(false);
              set({ blur: 0 });
            }}
          />
          <Num node={n} ids={ids} prop="blur" label="Amount" title="Blur radius in pixels" min={0} />
        </div>
      )}
      {img && filter && (
        <div className="effect-item">
          <ItemHead label="Shader filter" onRemove={() => removeShaderFilter(img.id)} />
          <ShaderFilterFields node={img} project={store().get().project} />
        </div>
      )}
    </Section>
  );
}

/** The name of something added to a section, with a clear way to remove it. */
function ItemHead({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <div className="item-head">
      <span>{label}</span>
      <IconButton icon={<Icons.close />} className="remove-btn" title={`Remove ${label.toLowerCase()}`} onClick={onRemove} />
    </div>
  );
}

/** A + button that offers a short list of things to add. */
function AddMenu({ title, items }: { title: string; items: { label: string; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 1) return <IconButton icon={<Icons.plus />} title={`Add ${items[0].label.toLowerCase()}`} onClick={items[0].onClick} />;
  return (
    <span className="add-menu">
      <IconButton icon={<Icons.plus />} title={title} onClick={() => setOpen(!open)} />
      {open && (
        <span className="add-menu-list" onMouseLeave={() => setOpen(false)}>
          {items.map((it) => (
            <button
              key={it.label}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              {it.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/** Shown while a range of a text layer is selected on the canvas: the style fields below then restyle just that range. */
function TextSelectionHint({ id }: { id: string }) {
  const sel = useEditor((s) => s.textSelection);
  const editing = useEditor((s) => s.editingTextId);
  if (editing !== id || !sel || sel.id !== id || sel.start === sel.end) return null;
  return <p className="hint">Styling the {sel.end - sel.start} selected characters. Click outside the text to style the whole layer.</p>;
}

/**
 * Rich text as a list: each run is a stretch of text with its own overrides (empty = the layer's own style).
 * Clearing a run's text removes it, and equal neighbours merge. Parts are cut on the canvas, by selecting a range.
 */
function RunsEditor({ node: n }: { node: Extract<SceneNode, { type: 'text' }> }) {
  const [open, setOpen] = useState(false);
  const runs = nodeRuns(n);
  const rich = !!n.runs?.length;
  const save = (next: TextRun[], coalesce?: string) => store().setTextRuns(n.id, next, coalesce);
  const edit = (i: number, patch: Partial<TextRun>, coalesce?: string) => save(runs.map((r, j) => (j === i ? { ...r, ...patch } : r)), coalesce);
  const clear = (i: number, key: keyof TextRun) => {
    const r = { ...runs[i] };
    delete r[key];
    save(runs.map((x, j) => (j === i ? r : x)));
  };
  const toggle = (i: number, key: 'underline' | 'strike' | 'italic', baseOn: boolean) => {
    const r = runs[i];
    const on = r[key] ?? baseOn;
    if (on === baseOn) edit(i, { [key]: !baseOn });
    else clear(i, key);
  };
  return (
    <PropRow k="Text runs" words={['rich text', 'styled stretch', 'bold part', 'mixed styles', 'inline style']}>
    <div className="runs">
      <button className="btn" onClick={() => setOpen(!open)} title="Every differently styled stretch of the text, one by one. The normal way: double-click the text on the canvas, select some of it and use the toolbar.">
        {open ? 'Hide text runs' : rich ? `Text runs (${runs.length})` : 'Text runs…'}
      </button>
      {open && (
        <>
          {runs.map((r, i) => {
            const bold = (r.fontWeight ?? n.fontWeight) >= 600;
            return (
              <div className="run-row" key={i}>
                <textarea
                  rows={1}
                  value={r.text}
                  onKeyDown={(e) => e.stopPropagation()}
                  onChange={(e) => edit(i, { text: e.target.value }, `run-${n.id}-${i}`)}
                />
                <div className="run-tools">
                  <IconButton icon={<b>B</b>} title="Bold" active={bold} onClick={() => edit(i, { fontWeight: bold ? (n.fontWeight >= 600 ? 400 : n.fontWeight) : 700 })} />
                  <IconButton icon={<i>I</i>} title="Italic" active={r.italic ?? n.fontStyle === 'italic'} onClick={() => toggle(i, 'italic', n.fontStyle === 'italic')} />
                  <IconButton icon={<u>U</u>} title="Underline" active={r.underline ?? n.textDecoration === 'underline'} onClick={() => toggle(i, 'underline', n.textDecoration === 'underline')} />
                  <IconButton icon={<s>S</s>} title="Strikethrough" active={r.strike ?? n.textDecoration === 'line-through'} onClick={() => toggle(i, 'strike', n.textDecoration === 'line-through')} />
                  <ColorField tokens value={r.color ?? n.color} onChange={(c) => edit(i, { color: c }, `run-color-${n.id}-${i}`)} onCommit={() => store().commit()} title="Colour of this run" />
                  <NumberField value={r.fontSize ?? n.fontSize} min={1} onChange={(v) => edit(i, { fontSize: v }, `run-size-${n.id}-${i}`)} onCommit={() => store().commit()} title="Size of this run" />
                </div>
                <div className="run-tools">
                  <TextField
                    placeholder="Link URL (optional)"
                    value={r.link?.url ?? ''}
                    commitOnBlur
                    onChange={(v) => edit(i, { link: v.trim() ? { url: v.trim(), target: '_blank' } : null })}
                  />
                  <button className="btn" title="Remove this run and its text" onClick={() => save(runs.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
          <button className="btn" onClick={() => save([...runs, { text: ' text', fontWeight: n.fontWeight >= 600 ? 400 : 700 }])}>
            Add run
          </button>
          {rich && (
            <button className="btn" title="Keep the text, drop all the per-run styling" onClick={() => save([{ text: n.text }])}>
              Clear run styling
            </button>
          )}
          <p className="hint">A binding on Text replaces all runs with the bound plain text.</p>
        </>
      )}
    </div>
    </PropRow>
  );
}

/** Auto text size: the tickbox, and the smallest and largest sizes it may pick (blank is any). Text layers, button labels and links. */
export function FitTextFields({ nodes }: { nodes: (SceneNode & { fitText?: TextFit | null })[] }) {
  const n = nodes[0];
  const ids = nodes.map((x) => x.id);
  const set = useSetter(ids);
  const fit = textFitOf(n);
  const shown = (v?: number | null) => (typeof v === 'number' && v > 0 ? String(v) : '');
  //Blank, "any" or anything that is not a positive number is "any": the key is left out
  const limit = (k: 'min' | 'max', v: string) => {
    const num = Number(v.trim());
    const next: TextFit = { ...fit };
    if (v.trim() !== '' && Number.isFinite(num) && num > 0) next[k] = Math.round(num * 100) / 100;
    else delete next[k];
    set({ fitText: next });
  };
  //Fitting needs a box that stays put, so a text layer goes to Fixed sizing (buttons and links have no Sizing)
  return (
    <>
      <CheckField
        label="Fit text to box"
        value={!!fit}
        onChange={(v) => set(v ? { fitText: {}, ...(nodes.every((x) => x.type === 'text') ? { autoSize: 'none' } : {}) } : { fitText: null })}
      />
      {fit && (
        <Row>
          <TextField label="Smallest" value={shown(fit.min)} placeholder="any" commitOnBlur onChange={(v) => limit('min', v)} />
          <TextField label="Largest" value={shown(fit.max)} placeholder="any" commitOnBlur onChange={(v) => limit('max', v)} />
        </Row>
      )}
    </>
  );
}

function TextStyleFields({ nodes, project }: { nodes: (SceneNode & TextStyle)[]; project: Project }) {
  const n = nodes[0];
  const ids = nodes.map((x) => x.id);
  const set = useSetter(ids);
  const mixedFont = nodes.some((x) => x.fontFamily !== n.fontFamily);
  //Picking a Google font the project doesn't list yet adds it (with the weights these layers use), in the same undo step
  const pickFont = (o: FontPick) => {
    const key = `font-${ids.join(',')}`;
    const wanted = nodes.flatMap((x) => [x.fontWeight, ...((x as { runs?: { fontWeight?: number }[] }).runs ?? []).map((r) => r.fontWeight ?? x.fontWeight)]);
    if (o.google) store().update((d) => void ensureGoogleFont(d.fonts, o.family, wanted), { coalesce: key });
    set({ fontFamily: o.stack }, key);
  };
  const setWeight = (w: number) => {
    const key = `weight-${ids.join(',')}`;
    //a weight the font was added without gets loaded too
    store().update((d) => void ensureGoogleFont(d.fonts, firstFamily(n.fontFamily), [w], { existing: true }), { coalesce: key });
    set({ fontWeight: w }, key);
  };
  return (
    <>
      <FontField label="Font" value={n.fontFamily} mixed={mixedFont} project={project.fonts} onPick={pickFont} />
      <Row>
        {textFitOf(n as { fitText?: TextFit | null }) ? (
          <div className="fit-off" title="The size is chosen for you while Fit text to box is on" {...({ inert: '' } as object)}>
            <Num node={n} ids={ids} prop="fontSize" label="Size" min={1} />
          </div>
        ) : (
          <Num node={n} ids={ids} prop="fontSize" label="Size" min={1} />
        )}
        <SelectField
          label="Weight"
          value={String(n.fontWeight)}
          options={['100', '200', '300', '400', '500', '600', '700', '800', '900']}
          onChange={(v) => setWeight(Number(v))}
        />
      </Row>
      <Row>
        <NumberField label="Line" value={n.lineHeight} step={0.05} min={0.5} onChange={(v) => set({ lineHeight: v })} />
        <Num node={n} ids={ids} prop="letterSpacing" label="Letter" step={0.1} />
      </Row>
      <Color node={n} ids={ids} prop="color" label="Colour" />
      <Row>
        <SelectField label="Align" value={n.align} options={['left', 'center', 'right', 'justify'] as const} onChange={(v) => set({ align: v })} />
        <SelectField label="V-align" value={n.verticalAlign} options={['top', 'middle', 'bottom'] as const} onChange={(v) => set({ verticalAlign: v })} />
      </Row>
      <CheckField label="Italic" value={n.fontStyle === 'italic'} onChange={(v) => set({ fontStyle: v ? 'italic' : 'normal' })} />
      <SelectField label="Case" value={n.textTransform ?? 'none'} options={['none', 'uppercase', 'lowercase', 'capitalize'] as const} onChange={(v) => set({ textTransform: v })} />
      <SelectField label="Decoration" value={n.textDecoration ?? 'none'} options={['none', 'underline', 'line-through'] as const} onChange={(v) => set({ textDecoration: v })} />
    </>
  );
}

/** Rect, ellipse, polygon and star become a path (same outline) so their points can be edited, bent and keyed. */
function ConvertToPath({ node }: { node: SceneNode }) {
  return (
    <Row k="Convert to path" words={['outline', 'vector', 'edit points', 'editable']}>
      <button className="btn" title="Turn this shape into a path with the same outline, so its points can be edited, bent and keyed" onClick={() => store().convertToPath(node.id)}>
        Convert to path
      </button>
    </Row>
  );
}

/** Shape morphing: key every point of the path at the playhead. */
function ShapeKeys({ node }: { node: SceneNode }) {
  const s = useEditor((st) => ({ timelineShown: st.timelineShown, tl: st.activeTimelineId, playhead: st.playhead, project: st.project }));
  const tl = s.timelineShown ? store().artboard()?.timelines.find((t) => t.id === s.tl) : undefined;
  const tracks = tl ? pointTracks(tl, node.id) : [];
  const at = tl ? keyTime(tl, s.playhead) : Math.round(s.playhead);
  const onKey = tracks.some((t) => t.keys.some((k) => Math.abs(k.t - at) < 1));
  return (
    <>
      <Row k="Key shape" words={['keyframe', 'morph', 'animate points', 'clear shape keys']}>
        <button
          className={`btn key-btn${tracks.length ? ' tracked' : ''}${onKey ? ' on-key' : ''}`}
          title={tl ? `Key the whole shape (every point and handle) at ${at} ms. Key it at one time, move the playhead, edit the points with recording on, and the shape morphs` : 'Key the whole shape at the playhead (creates a timeline)'}
          onClick={() => store().keyShape(node.id)}
        >
          ◆ Key shape
        </button>
        {tracks.length > 0 && (
          <button className="btn" title="Remove the shape keys of this layer from the open timeline" onClick={() => store().clearShapeKeys(node.id)}>
            Clear shape keys
          </button>
        )}
      </Row>
      {tracks.length > 0 && <p className="hint">{tracks.length} shape tracks in this timeline. Adding or deleting a point updates every key.</p>}
    </>
  );
}

/**
 * An input's value. Its variable is the ordinary data binding on `value`: this row is a shortcut that adds it in ⇄ Both
 * (typing writes the variable, the variable fills the box), and the Data bindings section below edits it from there.
 * Out keeps the box's own value, so the text field stays for it; In and Both take the value from the variable.
 */
function InputValue({ nodes, project, set }: { nodes: SceneNode[]; project: Project; set: (patch: Record<string, unknown>, coalesce?: string) => void }) {
  const n = nodes[0] as Extract<SceneNode, { type: 'input' }>;
  const single = nodes.length === 1;
  const expr = single ? n.bindings?.value : undefined;
  const mode = n.bindingModes?.value ?? 'in';
  const filled = expr !== undefined && mode !== 'out';
  const kind = n.inputType === 'checkbox' ? 'boolean' : n.inputType === 'number' || n.inputType === 'range' ? 'number' : 'string';
  const bindTo = (name: string) => set({ bindings: { ...n.bindings, value: name }, bindingModes: { ...n.bindingModes, value: 'both' } }, `bind-${n.id}`);
  const unbind = () => {
    const { value: _b, ...bindings } = n.bindings ?? {};
    const { value: _m, ...modes } = n.bindingModes ?? {};
    const { value: _c, ...converters } = n.converters ?? {};
    set({ bindings: Object.keys(bindings).length ? bindings : undefined, bindingModes: Object.keys(modes).length ? modes : undefined, converters: Object.keys(converters).length ? converters : undefined }, `bind-${n.id}`);
  };
  const options: PickerOption[] = project.variables.filter((v) => isIdentifier(v.name)).map((v) => ({ value: v.name, label: v.name, hint: v.type }));
  const label = mode === 'both' ? '⇄ Both' : mode === 'out' ? 'Out →' : '← In';
  return (
    <>
      {!filled && <TextField label="Value" value={n.value} onChange={(v) => set({ value: v })} />}
      {single && expr === undefined && (
        <PropRow k="Bind value" label="Variable" tip="Tie the box to a variable: typing writes it and it fills the box (a ⇄ Both data binding on Value, editable under Data bindings)" words={['bind', 'variable', 'data', 'two-way', 'both']}>
          <SearchPicker
            value=""
            options={options}
            onChange={bindTo}
            buttonLabel="Bind to a variable…"
            className="add-binding"
            title="Tie the box to a variable: typing writes it and it fills the box (a ⇄ Both data binding on Value)"
            searchPlaceholder="Search variables"
            actions={[{ label: '+ New variable…', onSelect: () => void createVariable(kind, n.name.replace(/\W+/g, '') || 'value').then((id) => {
              const v = id && store().get().project.variables.find((x) => x.id === id);
              if (v) bindTo(v.name);
            }) }]}
          />
        </PropRow>
      )}
      {single && expr !== undefined && (
        <PropRow k="Value binding" label="Variable" words={['bind', 'variable', 'data', 'two-way', 'both']}>
          <p className="hint" style={{ margin: 0 }}>
            Value is bound <strong>{label}</strong> {expr.trim() ? <code>{expr.trim()}</code> : 'to nothing yet'}: change it under Data bindings.{' '}
            <button type="button" className="link-btn" onClick={unbind}>
              Unbind
            </button>
          </p>
        </PropRow>
      )}
    </>
  );
}

function TypeSection({ nodes, project }: { nodes: SceneNode[]; project: Project }) {
  const n = nodes[0];
  const ids = nodes.map((x) => x.id);
  const set = useSetter(ids);
  const images = project.assets.filter((a) => assetKind(a.mime, a.name) === 'image');
  const videos = project.assets.filter((a) => assetKind(a.mime, a.name) === 'video');
  const sounds = project.assets.filter((a) => assetKind(a.mime, a.name) === 'audio');
  const radius = 'cornerRadius' in n ? <Num node={n} ids={ids} prop="cornerRadius" label="Radius" min={0} /> : null;
  switch (n.type) {
    case 'rect':
      return (
        <Section help="shapes#shape-settings" title="Rectangle">
          <CornerRadii nodes={nodes.filter(hasCornerRadii)} />
          {nodes.length === 1 && <ConvertToPath node={n} />}
        </Section>
      );
    case 'frame':
      return (
        <>
          <Section help="groups-frames" title="Frame">
            <CornerRadii nodes={nodes.filter(hasCornerRadii)} />
            <CheckField label="Clip content" value={n.clip || (!!n.scroll && n.scroll !== 'none')} onChange={(v) => set({ clip: v })} />
            <SelectField<'none' | 'vertical' | 'horizontal' | 'both'>
              label="Overflow"
              title="Let viewers scroll content that doesn't fit, like a scrollable panel (in Preview and the player)"
              value={n.scroll ?? 'none'}
              options={[
                { value: 'none', label: 'No scrolling' },
                { value: 'vertical', label: 'Scroll vertically' },
                { value: 'horizontal', label: 'Scroll horizontally' },
                { value: 'both', label: 'Scroll both ways' },
              ]}
              onChange={(v) => set({ scroll: v === 'none' ? undefined : v })}
            />
          </Section>
          {nodes.length === 1 && <AutoLayoutSection frame={n} />}
        </>
      );
    case 'polygon':
      return (
        <Section help="shapes#shape-settings" title="Polygon">
          <NumberField label="Sides" value={n.sides} min={3} max={64} onChange={(v) => set({ sides: Math.round(v) })} />
          {nodes.length === 1 && <ConvertToPath node={n} />}
        </Section>
      );
    case 'star':
      return (
        <Section help="shapes#shape-settings" title="Star">
          <NumberField label="Points" value={n.points} min={3} max={64} onChange={(v) => set({ points: Math.round(v) })} />
          <Num node={n} ids={ids} prop="innerRatio" label="Inner" step={0.05} min={0.05} max={1} />
          {nodes.length === 1 && <ConvertToPath node={n} />}
        </Section>
      );
    case 'path':
      return (
        <Section help="shapes#editing-points" title="Path">
          <Row>
            <SelectField label="Cap" value={n.lineCap ?? 'butt'} options={['butt', 'round', 'square'] as const} onChange={(v) => set({ lineCap: v })} />
            <SelectField label="Join" value={n.lineJoin ?? 'miter'} options={['miter', 'round', 'bevel'] as const} onChange={(v) => set({ lineJoin: v })} />
          </Row>
          <SelectField label="Fill rule" value={n.fillRule ?? 'nonzero'} options={['nonzero', 'evenodd'] as const} onChange={(v) => set({ fillRule: v })} />
          {nodes.length === 1 && (
            <Row>
              <CheckField
                label="Closed"
                value={n.paths.every((p) => p.closed)}
                onChange={(v) => set({ paths: n.paths.map((p) => ({ ...p, closed: v })) })}
              />
              <button className="btn" onClick={() => store().set({ editingPathId: n.id })}>
                Edit points
              </button>
            </Row>
          )}
          <p className="hint">Double-click a path to edit its points; double-click its outline to add one. Alt-click a point toggles curve/corner; Delete removes it. The Bend tool (W) drags an edge into a curve.</p>
          {nodes.length === 1 && <ShapeKeys node={n} />}
        </Section>
      );
    case 'ellipse':
      return (
        <Section help="shapes#shape-settings" title="Ellipse">
          {nodes.length === 1 && <ConvertToPath node={n} />}
        </Section>
      );
    case 'text':
      return (
        <Section help="text" title="Text">
          {nodes.length === 1 && <ExprField label="Text" template mono={false} value={n.text} multiline onChange={(v) => set({ text: v }, `text-${n.id}`)} />}
          <SelectField
            label="Sizing"
            title={textFitOf(n) ? 'Fixed while Fit text to box is on: the text is sized to the box, not the box to the text' : undefined}
            disabled={!!textFitOf(n)}
            value={textAutoSize(n)}
            options={[
              { value: 'width', label: 'Auto width' },
              { value: 'height', label: 'Auto height' },
              { value: 'none', label: 'Fixed' },
            ]}
            onChange={(v) => set({ autoSize: v })}
          />
          <FitTextFields nodes={nodes as (SceneNode & { fitText?: TextFit | null })[]} />
          <Row>
            {textAutoSize(n) === 'none' && (
              <SelectField<'visible' | 'hidden' | 'ellipsis'>
                label="Overflow"
                title="What happens to lines that don't fit the box: shown anyway, clipped at the box, or cut with an ellipsis"
                value={n.overflow ?? 'visible'}
                options={[
                  { value: 'visible', label: 'Show' },
                  { value: 'hidden', label: 'Clip' },
                  { value: 'ellipsis', label: 'Ellipsis …' },
                ]}
                onChange={(v) => set({ overflow: v })}
              />
            )}
            <CheckField label="Wrap lines" title="Break long lines at the box's width. Off keeps the lines as written" value={n.wrap !== false} onChange={(v) => set({ wrap: v })} />
          </Row>
          <NumberField
            label="Paragraph spacing"
            title="Extra space between paragraphs (the pieces of text between line breaks), in pixels. Not applied to text with modifiers"
            value={n.paragraphSpacing ?? 0}
            min={0}
            step={1}
            suffix="px"
            onChange={(v) => set({ paragraphSpacing: v > 0 ? v : undefined }, `para-gap-${n.id}`)}
            onCommit={() => store().commit()}
          />
          <TextSelectionHint id={n.id} />
          <TextStyleFields nodes={nodes as (SceneNode & TextStyle)[]} project={project} />
          <p className="hint">
            Insert variables with <code>{'{name}'}</code>, or any expression like <code>{'{score * 10}'}</code>.
          </p>
        </Section>
      );
    case 'image':
      return (
        <Section help="images-media#image-settings" title="Image">
          <SelectField
            label="Image"
            value={n.assetId ?? ''}
            onChange={withQuickAdd((v) => set({ assetId: v || null }), { asset: 'image' })}
            options={[{ value: '', label: images.length ? 'Choose…' : 'No image' }, ...images.map((a) => ({ value: a.id, label: a.name })), addAssetOption('image')]}
          />
          {n.assetId && <ReplaceAssetButton assetId={n.assetId} />}
          <SelectField label="Fit" value={n.fit} options={['cover', 'contain', 'fill'] as const} onChange={(v) => set({ fit: v })} />
          {nodes.length === 1 && canCrop(n) && <CropFields node={n} />}
          {radius}
          <CheckField
            label="9-slice scaling"
            title="Corners keep their size while the edges and middle stretch, so a panel or button image resizes without distortion"
            value={!!n.slice}
            onChange={(on) => set({ slice: on ? { top: 16, right: 16, bottom: 16, left: 16 } : null })}
          />
          {n.slice && (
            <Row>
              {(['top', 'right', 'bottom', 'left'] as const).map((k) => (
                <NumberField
                  key={k}
                  label={k[0].toUpperCase()}
                  title={`${k[0].toUpperCase() + k.slice(1)} inset in image pixels`}
                  value={n.slice![k]}
                  min={0}
                  onChange={(v) => set({ slice: { ...n.slice!, [k]: Math.round(v) } }, `slice-${n.id}`)}
                />
              ))}
            </Row>
          )}
          {n.slice && (
            <SelectField
              label="Fill edges"
              title="How the edges and middle fill their space: stretch the picture, or repeat it at its own size"
              value={n.sliceTile ?? 'stretch'}
              options={[
                { value: 'stretch', label: 'Stretch' },
                { value: 'repeat', label: 'Tile' },
              ]}
              onChange={(v) => set({ sliceTile: v === 'repeat' ? 'repeat' : 'stretch' })}
            />
          )}
        </Section>
      );
    case 'button':
      return (
        <Section help="web-elements" title="Button">
          {nodes.length === 1 && <ExprField label="Label" template mono={false} value={n.label} onChange={(v) => set({ label: v }, `label-${n.id}`)} />}
          {radius}
          <CheckField label="Disabled" value={!!n.disabled} onChange={(v) => set({ disabled: v })} />
          <NumberField label="Disabled look" title="How opaque the button looks while it is disabled: 0.5 by default, 1 for no dimming. Not used when this layer's opacity is bound, which dims it its own way" value={n.disabledOpacity ?? 0.5} min={0} max={1} step={0.05} onChange={(v) => set({ disabledOpacity: Math.min(1, Math.max(0, v)) === 0.5 ? undefined : Math.min(1, Math.max(0, v)) }, `disabled-look-${n.id}`)} />
          <FitTextFields nodes={nodes as (SceneNode & { fitText?: TextFit | null })[]} />
          <TextStyleFields nodes={nodes as (SceneNode & TextStyle)[]} project={project} />
          <p className="hint">Add a click interaction to make it do something.</p>
        </Section>
      );
    case 'input':
      return (
        <Section help="web-elements" title="Input">
          <SelectField<InputKind>
            label="Type"
            value={n.inputType}
            options={['text', 'number', 'email', 'password', 'textarea', 'checkbox', 'range', 'select']}
            onChange={(v) => set({ inputType: v })}
          />
          {n.inputType !== 'checkbox' && n.inputType !== 'range' && n.inputType !== 'select' && <TextField label="Placeholder" value={n.placeholder} onChange={(v) => set({ placeholder: v })} />}
          <InputValue nodes={nodes} project={project} set={set} />
          {(n.inputType === 'number' || n.inputType === 'range') && (
            <Row>
              <NumberField label="Min" value={n.min ?? 0} onChange={(v) => set({ min: v })} />
              <NumberField label="Max" value={n.max ?? 100} onChange={(v) => set({ max: v })} />
              <NumberField label="Step" value={n.step ?? 1} onChange={(v) => set({ step: v })} />
            </Row>
          )}
          {n.inputType === 'select' && <TextField label="Options" value={n.options ?? ''} multiline placeholder="One per line" onChange={(v) => set({ options: v })} />}
          {(n.inputType === 'text' || n.inputType === 'textarea' || n.inputType === 'email') && (
            <>
              <CheckField label="No browser help" title="Turns off the spellcheck underline, autocorrect, automatic capitals and autofill in this box. For a spelling test, so the browser does not mark or fix the word" value={!!n.noAssist} onChange={(v) => set({ noAssist: v || undefined })} />
              <CheckField label="Block paste and drop" title="Refuses text pasted or dragged into this box, so an answer has to be typed. For a spelling test" value={!!n.noPaste} onChange={(v) => set({ noPaste: v || undefined })} />
            </>
          )}
          {radius}
          <CheckField label="Disabled" value={!!n.disabled} onChange={(v) => set({ disabled: v })} />
          <NumberField label="Disabled look" title="How opaque the input looks while it is disabled: 0.5 by default, 1 for no dimming. Not used when this layer's opacity is bound, which dims it its own way" value={n.disabledOpacity ?? 0.5} min={0} max={1} step={0.05} onChange={(v) => set({ disabledOpacity: Math.min(1, Math.max(0, v)) === 0.5 ? undefined : Math.min(1, Math.max(0, v)) }, `disabled-look-${n.id}`)} />
          <TextStyleFields nodes={nodes as (SceneNode & TextStyle)[]} project={project} />
          {!project.variables.length && <p className="hint">Create a variable in the Variables tab to bind this input to.</p>}
        </Section>
      );
    case 'link':
      return (
        <Section help="links-cursors" title="Link">
          {nodes.length === 1 && <TextField label="Text" value={n.text} onChange={(v) => set({ text: v }, `text-${n.id}`)} />}
          <TextField label="URL" value={n.href} onChange={(v) => set({ href: v })} />
          <CheckField label="Open in new tab" value={n.newTab} onChange={(v) => set({ newTab: v })} />
          <FitTextFields nodes={nodes as (SceneNode & { fitText?: TextFit | null })[]} />
          <TextStyleFields nodes={nodes as (SceneNode & TextStyle)[]} project={project} />
        </Section>
      );
    case 'embed':
      return (
        <Section help="web-elements" title="Embed">
          <SelectField
            label="Mode"
            value={n.mode}
            options={[
              { value: 'html', label: 'Custom HTML / CSS / JS' },
              { value: 'iframe', label: 'Web page (iframe)' },
            ]}
            onChange={(v) => set({ mode: v })}
          />
          {n.mode === 'iframe' ? (
            <TextField label="URL" value={n.src} commitOnBlur onChange={(v) => set({ src: v })} />
          ) : (
            nodes.length === 1 && (
              <PropRow k="HTML" words={['embed code', 'iframe', 'markup', 'source', 'code']}>
              <div className="code-field">
                <div className="field-label block">HTML (scripts run in the published player, not on the canvas)</div>
                <CodeEditor language="html" value={n.html} onChange={(v) => set({ html: v }, `html-${n.id}`)} height={200} />
              </div>
              </PropRow>
            )
          )}
          {radius}
        </Section>
      );
    case 'video':
      return (
        <Section help="images-media#video" title="Video">
          <SelectField
            label="Video"
            value={n.assetId ?? ''}
            onChange={withQuickAdd((v) => set({ assetId: v || null }), { asset: 'video' })}
            options={[{ value: '', label: 'Use a URL' }, ...videos.map((a) => ({ value: a.id, label: a.name })), ...sounds.map((a) => ({ value: a.id, label: `${a.name} (sound only: shows the poster)` })), addAssetOption('video')]}
          />
          {n.assetId && <ReplaceAssetButton assetId={n.assetId} />}
          {!n.assetId && <TextField label="URL" value={n.src} commitOnBlur onChange={(v) => set({ src: v })} />}
          <Row>
            <CheckField label="Autoplay" value={n.autoplay} onChange={(v) => set({ autoplay: v })} />
            <CheckField label="Loop" value={n.loop} onChange={(v) => set({ loop: v })} />
          </Row>
          <Row>
            <CheckField label="Muted" value={n.muted} onChange={(v) => set({ muted: v })} />
            <CheckField label="Controls" value={n.controls} onChange={(v) => set({ controls: v })} />
          </Row>
          <SelectField label="Fit" value={n.fit} options={['cover', 'contain', 'fill'] as const} onChange={(v) => set({ fit: v })} />
          <NumberField label="Speed" title="How fast it plays: 1 is normal, 0.5 half speed, 2 double. The pitch stays where it was. To set it from a variable or a node, use a Playback speed binding or the Control video node" value={n.playbackRate ?? 1} step={0.25} min={0.0625} max={16} suffix="x" onChange={(v) => set({ playbackRate: v > 0 ? v : undefined }, `rate-${n.id}`)} onCommit={() => store().commit()} />
          <Row>
            <CheckField label="Speed buttons" title="Show Slower, Faster and a speed readout over the video for the viewer. Keys: < and > when the video or the buttons have focus" value={!!n.speedControl} onChange={(v) => set({ speedControl: v || undefined })} />
            <CheckField label="Frame step" title="Show Back and Forward one frame buttons over the video for the viewer (it pauses first). Keys: , and . when the video or the buttons have focus" value={!!n.frameStepControl} onChange={(v) => set({ frameStepControl: v || undefined })} />
          </Row>
          {n.frameStepControl && <NumberField label="Frames per second" title="What one frame is. Most video is 24, 25 or 30; 30 if you leave it" value={n.frameRate ?? 30} step={1} min={1} max={240} onChange={(v) => set({ frameRate: v > 0 ? v : undefined }, `fps-${n.id}`)} onCommit={() => store().commit()} />}
          {radius}
          <SelectField
            label="Poster"
            title="A picture shown before the video plays, and the whole time for a sound-only file. It sits under the video's own controls"
            value={n.posterAssetId ?? ''}
            onChange={withQuickAdd((v) => set({ posterAssetId: v || undefined }), { asset: 'image' })}
            options={[{ value: '', label: 'None' }, ...images.map((a) => ({ value: a.id, label: a.name })), addAssetOption('image')]}
          />
          <TextField label="Text when empty" title="What a video with no source says while playing. Empty draws a plain grey box. The editor always shows Choose a video" value={n.emptyText ?? ''} commitOnBlur onChange={(v) => set({ emptyText: v.trim() ? v : undefined })} />
          <p className="hint">To use where the video is, whether it's playing, how long it is or which chapter it is in, add a <strong>Data binding</strong> below (Playback position, Playing, Playback speed, Length, Chapter showing, Hold paused) and pick which way it goes.</p>
          <VideoCues node={n} set={(patch) => set(patch)} />
          <VideoCaptions node={n} set={(patch) => set(patch)} />
          <VideoDescriptions node={n} set={(patch) => set(patch)} />
        </Section>
      );
    case 'instance':
      return <InstanceSection node={n} project={project} />;
    case 'bone':
      return <BoneSection node={n} abId={store().get().activeArtboardId} />;
    case 'draw':
      return <DrawSection nodes={nodes as DrawNode[]} />;
    case 'progress':
      return <ProgressSection nodes={nodes as ProgressNode[]} project={project} />;
    case 'chart':
      return <ChartSection nodes={nodes as ChartNode[]} project={project} ab={store().artboard()} />;
    case 'connector':
      return <ConnectorSection nodes={nodes as ConnectorNode[]} project={project} ab={store().artboard()} />;
    case 'shader':
      return nodes.length === 1 ? <ShaderSection node={n as ShaderNode} project={project} /> : <p className="hint">Select one shader layer to edit its code and uniforms.</p>;
    case 'group':
      return (
        <Section help="groups-frames" title="Group">
          <CheckField
            label="Size to contents"
            title="Keep the group's box around its layers as they move and change (nothing moves on the canvas). Rotated or scaled groups and repeaters keep the box they have"
            value={(n as GroupNode).fitContents !== false}
            onChange={(v) => set({ fitContents: v ? undefined : false })}
          />
          {(n as GroupNode).fitContents !== false && (n.rotation || n.scaleX !== 1 || n.scaleY !== 1) ? <p className="hint">This group is rotated or scaled, so its box stays as it is (refitting it would move its pivot).</p> : null}
          <p className="hint">Double-click to select inside. Ctrl/⌘-click adds a layer inside to the selection.</p>
        </Section>
      );
    default:
      return null;
  }
}

const PIXEL_RATIOS = ['auto', '1', '2', '3'] as const;

/** A script layer: its draw script, frame rate, pixel ratio, and starter scripts. */
function DrawSection({ nodes }: { nodes: DrawNode[] }) {
  const n = nodes[0];
  const set = useSetter(nodes.map((x) => x.id));
  const problem = useDrawProblem(n.id);
  const ratio = typeof n.pixelRatio === 'number' ? String(n.pixelRatio) : 'auto';
  return (
    <Section help="script-layers" title="Script layer">
      <SelectField
        label="Start from"
        title="Replace the script with a starter: particles, a bar chart that reads a variable, waves, a clock. Undo brings the old one back"
        value=""
        options={[{ value: '', label: 'Choose a template…' }, ...DRAW_TEMPLATES.map((t: DrawTemplate) => ({ value: t.id, label: t.name }))]}
        onChange={(id) => id && applyDrawTemplate(nodes.map((x) => x.id), id)}
      />
      {nodes.length === 1 && (
        <PropRow k="Draw script" words={['code', 'javascript', 'canvas', 'draw function']}>
        <div className="code-field">
          <div className="field-label block">
            Draw script: <code>function draw(g, t, dt)</code>
          </div>
          <CodeEditor value={n.code} onChange={(v) => set({ code: v }, `code-${n.id}`)} height={280} />
        </div>
        </PropRow>
      )}
      {problem && <p className={problem.kind === 'error' ? 'hint error' : 'hint'}>{problem.kind === 'error' ? `Script error, the layer stopped: ${problem.message}` : problem.message}</p>}
      <Row>
        <NumberField label="FPS" title="Frame rate cap: 0 draws on every frame" value={n.fps} min={0} max={120} onChange={(v) => set({ fps: Math.max(0, Math.round(v)) })} />
        <SelectField
          label="Pixel ratio"
          title="Canvas pixels per layer pixel. Auto follows the screen's density and the artboard's scale; a higher number is sharper but slower"
          value={ratio}
          options={PIXEL_RATIOS.map((r) => ({ value: r, label: r === 'auto' ? 'Auto' : `${r}x` }))}
          onChange={(v) => set({ pixelRatio: v === 'auto' ? 'auto' : Number(v) })}
        />
      </Row>
      <CheckField
        label="Paint while editing"
        title="Draw the layer on the canvas while you edit: one still frame (at the timeline's time). Off shows a placeholder; Preview always runs it"
        value={n.runInEditor !== false}
        onChange={(v) => set({ runInEditor: v })}
      />
      <details className="draw-api">
        <summary>What can the script use?</summary>
        <ul className="hint">
          {DRAW_API.map(([sig, what]) => (
            <li key={sig}>
              <code>{sig}</code>: {what}
            </li>
          ))}
        </ul>
      </details>
    </Section>
  );
}

function InteractionsSection({ node, ab }: { node: SceneNode; ab: Artboard }) {
  const project = useEditor((st) => st.project);
  //What this layer does, as sentences, from the graph (lib/flow-describe.ts)
  const flows = flowsForLayer({ ab, project }, node.id, { limit: 6 });
  const add = (type: string) => {
    const id = `lg${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const maxY = ab.logic.nodes.reduce((m, l) => Math.max(m, l.y), 0);
    store().update((d) => {
      const a = d.artboards.find((x) => x.id === ab.id);
      a?.logic.nodes.push({ id, kind: 'event.pointer', x: 40, y: maxY + 140, params: { target: node.id, type } });
    });
    store().set({ bottomTab: 'logic', logicSelection: id });
  };
  return (
    <Section help="interactions" title="Interactions" defaultOpen>
      {flows.length ? (
        <ul className="flow-list" aria-label="What this layer does">
          {flows.map((f) => {
            const sentence = flowSentence(f);
            return (
              <li key={f.event.id} className={`flow-item${f.off ? ' off' : ''}${f.steps.length ? '' : ' empty'}`}>
                <div className="flow-sentence" title={f.steps.map((s) => s.summary).filter(Boolean).join('\n') || undefined}>
                  {sentence}.
                </div>
                <div className="flow-actions">
                  <button type="button" className="link-btn" aria-label={`Show in the graph: ${sentence}`} onClick={() => showInGraph(f.event.id)}>
                    Show in graph
                  </button>
                  <button type="button" className="link-btn" aria-label={`${f.off ? 'Turn on' : 'Turn off'}: ${sentence}`} aria-pressed={f.off} title={f.off ? 'It does nothing while it is off. Turn it back on' : 'Stop it doing anything for now, without removing it'} onClick={() => setFlowOff(ab.id, f.event.id, !f.off)}>
                    {f.off ? 'Turn on' : 'Turn off'}
                  </button>
                  <button type="button" className="link-btn danger" aria-label={`Remove: ${sentence}`} onClick={() => removeFlow(ab.id, f.event.id)}>
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="hint">Nothing happens when this layer is used yet.</p>
      )}
      <Row k="Add interaction" words={['on click', 'on hover', 'event', 'action', 'trigger', 'click', 'hover', 'behaviour', 'when', 'show', 'hide', 'page', 'sound', 'counter']}>
        <button className="btn" title="Choose what happens when this layer is clicked: go to a page, show or hide something, play a sound, count..." onClick={() => openBehaviours({ abId: ab.id, layerId: node.id, trigger: 'click' })}>
          + When clicked…
        </button>
        <button className="btn" title="Choose what happens when the pointer moves onto this layer" onClick={() => openBehaviours({ abId: ab.id, layerId: node.id, trigger: 'pointerenter' })}>
          + When hovered…
        </button>
      </Row>
      <Row k="Add an empty event" words={['empty', 'advanced', 'graph', 'on pointer', 'on click', 'on hover']}>
        <button className="btn small" title="Add just the On pointer event, with nothing joined to it, and build the rest in the graph" onClick={() => add('click')}>
          + On click (empty)
        </button>
        <button className="btn small" title="Add just the On pointer event, with nothing joined to it, and build the rest in the graph" onClick={() => add('pointerenter')}>
          + On hover (empty)
        </button>
      </Row>
      <CheckField
        label="Clickable while see-through"
        title="When playing, a layer that is partly see-through (layer opacity, or a fill and stroke opacity, under 100%) normally lets the pointer through to what's underneath: no link, no hand cursor, no clicks or hovers, for it and everything inside it. Tick this to keep it clickable anyway. Hidden layers are never clickable."
        value={!!node.interactiveWhenFaded}
        onChange={(v) => store().setProps([node.id], { interactiveWhenFaded: v || undefined })}
      />
      {shownAmount(node) < 1 && !node.interactiveWhenFaded && (flows.length > 0 || !!node.link?.url) ? <p className="hint">This layer is see-through ({Math.round(shownAmount(node) * 100)}%), so it can't be clicked while playing until it's fully showing.</p> : null}
      {node.interactiveWhenFaded ? <p className="hint">Ticked: this layer stays clickable (hand cursor, clicks, hovers) even while faded out.</p> : null}
    </Section>
  );
}

const CURSOR_LABELS: Record<string, string> = {
  auto: 'auto (browser decides)',
  default: 'default (arrow)',
  pointer: 'pointer (hand)',
  grab: 'grab (open hand)',
  grabbing: 'grabbing (closed hand)',
  move: 'move (four arrows)',
  text: 'text (I-beam)',
  crosshair: 'crosshair',
  help: 'help (arrow and ?)',
  wait: 'wait (busy)',
  progress: 'progress (arrow, busy)',
  'not-allowed': 'not-allowed',
  'zoom-in': 'zoom-in',
  'zoom-out': 'zoom-out',
  none: 'none (hidden)',
};

const DEPTH_PRESETS: { value: string; label: string; amount: number }[] = [
  { value: 'small', label: 'Small (20%)', amount: 20 },
  { value: 'medium', label: 'Medium (50%)', amount: 50 },
  { value: 'large', label: 'Large (100%)', amount: 100 },
];

/** Parallax: how far this layer shifts as the viewer moves the pointer (or tilts the phone), for a layered-postcard look. */
export function DepthSection({ nodes, project }: { nodes: SceneNode[]; project: Project }) {
  const n = nodes[0];
  const set = useSetter(nodes.map((x) => x.id));
  const depth = n.depth ?? 0;
  const preset = depth === 0 ? 'none' : DEPTH_PRESETS.find((p) => p.amount === Math.abs(depth) && depth > 0)?.value ?? 'custom';
  const dragged = !!n.draggable && n.draggable.enabled !== false;
  return (
    <Section help="fill-stroke#depth-parallax" title="Depth" defaultOpen={!!n.depth}>
      <SelectField
        label="Depth"
        title="How far this layer shifts as the viewer moves the pointer (or tilts a phone, if the project allows it). Nearer layers move more than far ones, which gives a layered-postcard look. Only in Preview and the exported player, never on the canvas"
        value={preset}
        options={[{ value: 'none', label: 'None (stays still)' }, ...DEPTH_PRESETS, ...(preset === 'custom' ? [{ value: 'custom', label: 'Custom' }] : [])]}
        onChange={(v) => set({ depth: v === 'none' ? undefined : DEPTH_PRESETS.find((p) => p.value === v)?.amount ?? depth })}
      />
      <NumberField
        label="Amount"
        title="Percent of the project's depth range (see Project settings). Positive layers are nearer and move against the pointer, negative ones move with it"
        value={depth}
        min={-100}
        max={100}
        suffix="%"
        onChange={(v) => set({ depth: v ? v : undefined }, 'depth')}
      />
      {n.depth ? (
        <p className="hint">
          Moves up to {Math.round((Math.abs(depth) / 100) * (project.settings.parallax?.range ?? 40))} px{depth < 0 ? ', with the pointer' : ', against the pointer'}. Everything inside the layer goes with it.
          {dragged ? ' A layer people can drag holds still.' : ''} Nothing moves for viewers who ask for less motion.
        </p>
      ) : (
        <p className="hint">Give a background a small depth and the foreground a large one. Set the range, and whether phones tilt, in Project settings.</p>
      )}
    </Section>
  );
}

function LinkCursorSection({ nodes, project }: { nodes: SceneNode[]; project: Project }) {
  const n = nodes[0];
  const set = useSetter(nodes.map((x) => x.id));
  const images = project.assets.filter((a) => assetKind(a.mime, a.name) === 'image');
  const link = n.link;
  return (
    <>
    <Section help="links-cursors#link" title="Link" defaultOpen={!!link}>
      <ExprField
        label="Link"
        template
        mono={false}
        value={link?.url ?? ''}
        placeholder="https://… (makes the whole layer a link)"
        commitOnBlur
        onChange={(url) => set({ link: url.trim() ? { url: url.trim(), target: link?.target ?? '_blank' } : null })}
      />
      {link && (
        <SelectField<LinkTarget> label="Open in" value={link.target} options={LINK_TARGETS as { value: LinkTarget; label: string }[]} onChange={(t) => set({ link: { ...link, target: t } })} />
      )}
    </Section>
    <Section help="links-cursors#cursor" title="Cursor on hover" defaultOpen={!!(n.cursor || n.cursorImage)}>
      <SelectField
        label="Cursor"
        title="The mouse cursor shown while the pointer is over this layer (and its children), like CSS :hover { cursor }. Automatic shows a pointer if the layer is a link or clickable"
        value={n.cursor ?? ''}
        options={[{ value: '', label: 'Automatic' }, ...CURSORS.map((c) => ({ value: c, label: CURSOR_LABELS[c] ?? c }))]}
        onChange={(v) => set({ cursor: v || undefined })}
      />
      <SelectField
        label="Image"
        value={n.cursorImage ?? ''}
        options={[{ value: '', label: 'No custom cursor image' }, ...images.map((a) => ({ value: a.id, label: a.name })), addAssetOption('image')]}
        onChange={withQuickAdd((v) => set({ cursorImage: v || null, cursorHotspot: v ? n.cursorHotspot ?? { x: 0, y: 0 } : undefined }), { asset: 'image' })}
      />
      {n.cursorImage && (
        <Row>
          <NumberField label="Hot x" value={n.cursorHotspot?.x ?? 0} min={0} onChange={(x) => set({ cursorHotspot: { x, y: n.cursorHotspot?.y ?? 0 } })} />
          <NumberField label="Hot y" value={n.cursorHotspot?.y ?? 0} min={0} onChange={(y) => set({ cursorHotspot: { x: n.cursorHotspot?.x ?? 0, y } })} />
        </Row>
      )}
      <p className="hint">
        Shown on hover in Preview and the exported player. Automatic gives a pointer to links and to layers with a click, press or release interaction. Interactions (Set cursor) and scripts (<code>ix.setCursor</code>, <code>node.set('cursor', …)</code>) can change it while running. Images over 32×32 px may be ignored by browsers.
      </p>
    </Section>
    </>
  );
}

/** Show one child at a time. The active child can be keyed on the timeline and set from interactions. */
function SoloSection({ node }: { node: SceneNode & { children: SceneNode[]; solo?: { active: string | null } | null } }) {
  const set = useSetter([node.id]);
  const shown = useShown(node);
  const on = !!node.solo;
  const active = String(shown('solo.active') ?? '');
  return (
    <Section help="groups-frames#solo-groups" title="Solo" defaultOpen={on}>
      <CheckField label="Solo" value={on} onChange={(v) => set({ solo: v ? { active: node.children[0]?.id ?? null } : null })} />
      {on && (
        <div className="keyed">
          <SelectField
            label="Active child"
            value={node.children.some((c) => c.id === active) ? active : ''}
            options={[{ value: '', label: '(none)' }, ...node.children.map((c) => ({ value: c.id, label: c.name }))]}
            onChange={(v) => set({ 'solo.active': v || null })}
          />
          <KeyButton node={node} prop="solo.active" />
        </div>
      )}
    </Section>
  );
}

/** Reorder the children over time: change the order here with Record on (or press the key button) to key it. */
function DrawOrderSection({ node }: { node: SceneNode & { children: SceneNode[]; drawOrder?: string[] | null } }) {
  const set = useSetter([node.id]);
  const shown = useShown(node);
  const order = shown('drawOrder') as string[] | null | undefined;
  return (
    <Section help="groups-frames#draw-order" title="Draw order" defaultOpen={!!node.drawOrder?.length}>
      <div className="keyed">
        <span className="field-label" title="Which child is drawn in front. Key it on the timeline to change the stacking over time">
          Front to back
        </span>
        <KeyButton node={node} prop="drawOrder" />
      </div>
      <ChildOrder children={node.children} order={order} onChange={(next) => set({ drawOrder: next })} />
      {!!node.drawOrder?.length && (
        <button className="btn" title="Go back to the layer order in the layers panel" onClick={() => set({ drawOrder: null })}>
          Reset to layer order
        </button>
      )}
    </Section>
  );
}

export function RepeatSection({ node, project }: { node: SceneNode & { repeat?: Repeat | null; children: SceneNode[] }; project: Project }) {
  const set = useSetter([node.id]);
  const rep = node.repeat;
  const update = (patch: Partial<Repeat>) => set({ repeat: { ...(rep as Repeat), ...patch } }, `repeat-${node.id}`);
  const lists = project.dataSources.map((d) => d.name);
  return (
    <Section help="repeaters" title="Repeat (list)" defaultOpen={!!rep}>
      <CheckField
        label="Repeat the first child for each item"
        value={!!rep}
        onChange={(on) => set({ repeat: on ? { items: lists[0] ?? '[1, 2, 3]', layout: 'vertical', gap: 8, columns: 2 } : null })}
      />
      {rep && (
        <>
          <ExprField label="Items" value={rep.items} commitOnBlur placeholder="products" onChange={(v) => update({ items: v })} />
          <Row>
            <SelectField
              label="Layout"
              value={rep.layout}
              options={[
                { value: 'vertical', label: 'Column' },
                { value: 'horizontal', label: 'Row' },
                { value: 'grid', label: 'Grid' },
                { value: 'none', label: 'Free (bind x/y)' },
              ]}
              onChange={(v) => update({ layout: v })}
            />
          </Row>
          <Row>
            <NumberField label="Gap" value={rep.gap} min={0} onChange={(v) => update({ gap: v })} />
            {rep.layout === 'grid' && <NumberField label="Cols" value={rep.columns} min={1} onChange={(v) => update({ columns: Math.round(v) })} />}
          </Row>
          {rep.layout === 'grid' && (
            <Row>
              <SelectField
                label="Fill order"
                value={rep.direction ?? 'rows'}
                options={[
                  { value: 'rows', label: 'Rows first' },
                  { value: 'columns', label: 'Columns first' },
                ]}
                onChange={(v) => update({ direction: v === 'columns' ? 'columns' : undefined })}
              />
            </Row>
          )}
          <p className="hint">
            Inside the copies, text slots and bindings can use <code>item</code> and <code>index</code>, e.g. <code>{'{item.name}'}</code>. Clicks on a copy put its position in <code>event.index</code>.
            {lists.length ? ` Data: ${lists.join(', ')}.` : ' Add a data source in the Data tab, or use any array expression.'}
          </p>
          {!node.children.length && <p className="error small">Put a layer inside this {node.type} to use as the template.</p>}
        </>
      )}
    </Section>
  );
}

function AlignBar({ count, shapes }: { count: number; shapes: number }) {
  const st = store();
  const b = (icon: keyof typeof Icons, title: string, fn: () => void, disabled = false) => {
    const I = Icons[icon];
    return <IconButton key={title} icon={<I width={16} />} title={title} onClick={fn} disabled={disabled} />;
  };
  return (
    <PropRow k="Align and boolean" words={['align', 'distribute', 'left', 'right', 'centre', 'center', 'top', 'bottom', 'union', 'subtract', 'intersect', 'exclude', 'combine shapes', 'boolean']}>
    <div className="align-bar">
      {b('alignLeft', 'Align left', () => st.align('left'))}
      {b('alignHCenter', 'Align horizontal centres', () => st.align('hcenter'))}
      {b('alignRight', 'Align right', () => st.align('right'))}
      {b('alignTop', 'Align top', () => st.align('top'))}
      {b('alignVCenter', 'Align vertical centres', () => st.align('vcenter'))}
      {b('alignBottom', 'Align bottom', () => st.align('bottom'))}
      {b('distH', 'Distribute horizontally (3+)', () => st.distribute('horizontal'), count < 3)}
      {b('distV', 'Distribute vertically (3+)', () => st.distribute('vertical'), count < 3)}
      {shapes >= 2 && (
        <>
          <span className="align-sep" />
          {b('union', 'Union', () => st.booleanSelection('union'))}
          {b('subtract', 'Subtract (from the bottom-most)', () => st.booleanSelection('subtract'))}
          {b('intersect', 'Intersect', () => st.booleanSelection('intersect'))}
          {b('exclude', 'Exclude overlap', () => st.booleanSelection('exclude'))}
        </>
      )}
    </div>
    </PropRow>
  );
}

export function AutoLayoutSection({ frame }: { frame: FrameNode }) {
  const set = useSetter([frame.id]);
  const L = frame.layout;
  const update = (patch: Partial<AutoLayout>) => set({ layout: { ...(L as AutoLayout), ...patch } }, `layout-${frame.id}`);
  const pad = L?.padding;
  // A percent here is a share of the width of the auto-layout frame this one is in (its own width when it is not in one)
  const ownerW = paddingOwnerWidth(frame, store().artboard() ? locate(store().artboard()!, frame.id)?.parent : null);
  const gapField = (label: string, title?: string) => (
    <UnitField label={label} title={title} value={L!.gap} unit={gapUnit(L!)} min={0} ownerW={ownerW} onChange={(v, u) => update(patchGap(L!, v, u))} />
  );
  const lineGapField = (label: string, title?: string) => (
    <UnitField label={label} title={title} value={L!.crossGap ?? L!.gap} unit={lineGapUnit(L!)} min={0} ownerW={ownerW} onChange={(v, u) => update(patchLineGap(L!, v, u))} />
  );
  return (
    <Section help="auto-layout" title="Auto layout" defaultOpen={!!L} actions={!L && <IconButton icon={<Icons.plus />} title="Add auto layout" onClick={() => set({ layout: defaultAutoLayout('column') })} />}>
      {L && pad && (
        <>
          <Row>
            <SelectField
              label="Layout"
              title="Children flow along a row or column, or sit in the cells of a grid"
              value={L.grid ? (L.grid.stack ? 'stack' : 'grid') : 'flow'}
              options={[
                { value: 'flow', label: 'Row or column' },
                { value: 'grid', label: 'Grid' },
                { value: 'stack', label: 'Stack' },
              ]}
              onChange={(v) => {
                const { grid: _grid, ...flow } = L;
                // (a stack keeps the grid's tracks, which it ignores, so going back to Grid finds them again)
                const tracks = L.grid ?? { columns: [{ type: 'fr' as const, value: 1 }, { type: 'fr' as const, value: 1 }], rows: [] };
                const { stack: _stack, ...plain } = tracks;
                set({ layout: v === 'flow' ? flow : { ...L, grid: v === 'stack' ? { ...plain, stack: true } : plain } }, `layout-${frame.id}`);
              }}
            />
          </Row>
          {L.grid?.stack ? (
            <GridAlignFields grid={L.grid} onChange={(grid) => update({ grid })} />
          ) : L.grid ? (
            <>
              <TextField label="Columns" title="Sizes of the columns: px, %, fr (a share of what is left) or auto. Like 100px 25% 1fr auto" value={formatTracks(L.grid.columns)} onChange={(v) => update({ grid: { ...L.grid!, columns: parseTracks(v) } })} />
              <TextField label="Rows" title="Sizes of the rows, written the same way. Rows past the ones listed are auto" value={formatTracks(L.grid.rows)} onChange={(v) => update({ grid: { ...L.grid!, rows: parseTracks(v) } })} />
              <Row>
                {gapField('Column gap')}
                {lineGapField('Row gap')}
              </Row>
              <GridAlignFields grid={L.grid} onChange={(grid) => update({ grid })} />
            </>
          ) : (
            <>
              <Row>
                <SelectField
                  label="Direction"
                  value={L.direction}
                  options={[
                    { value: 'column', label: 'Column ↓' },
                    { value: 'row', label: 'Row →' },
                  ]}
                  onChange={(v) => update({ direction: v })}
                />
                {gapField('Gap')}
              </Row>
              <Row>
                <SelectField
                  label="Justify"
                  value={L.justify}
                  options={[
                    { value: 'start', label: 'Start' },
                    { value: 'center', label: 'Centre' },
                    { value: 'end', label: 'End' },
                    { value: 'space-between', label: 'Space between' },
                  ]}
                  onChange={(v) => update({ justify: v })}
                />
              </Row>
              <Row>
                <SelectField
                  label="Align"
                  value={L.align}
                  options={[
                    { value: 'start', label: 'Start' },
                    { value: 'center', label: 'Centre' },
                    { value: 'end', label: 'End' },
                    { value: 'stretch', label: 'Stretch' },
                  ]}
                  onChange={(v) => update({ align: v })}
                />
              </Row>
            </>
          )}
          <div className="field-label block">Padding (top, right, bottom, left)</div>
          <Row>
            {(['top', 'right', 'bottom', 'left'] as const).map((k) => (
              <UnitField key={k} value={pad[k]} unit={paddingUnit(L, k)} min={0} ownerW={ownerW} title={`${k[0].toUpperCase()}${k.slice(1)} padding, in px or as a percent (type 10%) of the width around the frame`} onChange={(v, u) => update(patchPadding(L, k, v, u))} />
            ))}
          </Row>
          <Row>
            {!L.grid && <CheckField label="Wrap" value={L.wrap} onChange={(v) => update({ wrap: v })} />}
            <CheckField label="Hug width" value={L.hugWidth} onChange={(v) => update({ hugWidth: v })} />
            <CheckField label="Hug height" value={L.hugHeight} onChange={(v) => update({ hugHeight: v })} />
          </Row>
          {L.wrap && !L.grid && lineGapField('Line gap', 'The space between wrapped rows (or columns). Empty uses Gap')}
          <LayoutAnimateFields value={L.animate} onChange={(animate) => update({ animate })} />
          <Row k="Remove auto layout" words={['delete layout', 'stop stacking']}>
            <button className="btn" onClick={() => set({ layout: null })}>
              Remove auto layout
            </button>
          </Row>
          <p className="hint">Children are placed in layer order (reorder them in Layers). Hidden layers take no space, also at runtime.</p>
        </>
      )}
    </Section>
  );
}

function InstanceSection({ node, project }: { node: InstanceNode; project: Project }) {
  const set = useSetter([node.id]);
  const ab = store().artboard();
  const target = project.artboards.find((a) => a.id === node.artboardId);
  const [inputs, setInputs] = useState(JSON.stringify(node.inputs ?? {}, null, 0));
  return (
    <Section help="instances" id="Instance" title="Component">
      <SelectField
        label="Artboard"
        value={node.artboardId}
        options={[{ value: '', label: 'Choose…' }, ...project.artboards.filter((a) => a.id !== ab?.id).map((a) => ({ value: a.id, label: a.name }))]}
        onChange={(v) => set({ artboardId: v })}
      />
      <SelectField
        label="Fit"
        value={node.fit}
        options={[
          { value: 'fill', label: 'Stretch to the box' },
          { value: 'contain', label: 'Contain' },
          { value: 'cover', label: 'Cover' },
          { value: 'none', label: 'Actual size, centred' },
        ]}
        onChange={(v) => set({ fit: v })}
      />
      {target && (
        <Row k="Reset size" words={['edit artboard', 'match artboard', 'original size']}>
          <button className="btn" onClick={() => set({ width: target.width, height: target.height })}>
            Reset size
          </button>
          <button className="btn" onClick={() => store().set({ activeArtboardId: target.id, artboardSelected: true, selection: [] })}>
            Edit {target.name}
          </button>
        </Row>
      )}
      <TextField
        label="Inputs"
        mono
        commitOnBlur
        value={inputs}
        placeholder='{"level": 3}'
        onChange={(v) => {
          setInputs(v);
          try {
            const parsed = v.trim() ? JSON.parse(v) : {};
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) set({ inputs: Object.keys(parsed).length ? parsed : undefined });
          } catch {
            store().toast('Inputs must be JSON, e.g. {"level": 3}', 'error');
          }
        }}
      />
      <p className="hint">An instance runs its artboard on its own in the player: its timelines, interactions and variables. Inputs set its variables' starting values by name.</p>
    </Section>
  );
}

const UNIT_LABELS: Record<TextModifierUnit, string> = { letter: 'Letters', word: 'Words', line: 'Lines' };
const SHAPE_LABELS: Record<TextModifierShape, string> = { square: 'Square', 'ramp-up': 'Ramp up', 'ramp-down': 'Ramp down', triangle: 'Triangle', round: 'Round', smooth: 'Smooth', falloff: 'Falloff (ramps)' };

/** A number with a slider under it and a keyframe button, for a text modifier's range. */
function ModRange({ node, prop, label, title, min, max, step = 1, fallback = 0 }: { node: SceneNode; prop: string; label: ReactNode; title: string; min: number; max: number; step?: number; fallback?: number }) {
  const shown = useShown(node);
  const set = useSetter([node.id]);
  const v = Number(shown(prop) ?? fallback);
  return (
    <div className="mod-range">
      <Num node={node} ids={[node.id]} prop={prop} label={label} title={title} step={step} min={min} max={max} suffix="%" fallback={fallback} />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, v))}
        title={title}
        aria-label={typeof label === 'string' ? label : prop}
        onChange={(e) => set({ [prop]: Number(e.target.value) })}
        onPointerUp={() => store().commit()}
        onKeyUp={() => store().commit()}
      />
    </div>
  );
}

/**
 * Text modifiers: per-letter, per-word or per-line animation. Each modifier has a range over the units (start, end,
 * offset, shape) and the changes it makes inside that range. The offset and the amounts can be keyed like any property.
 */
function TextModifiersSection({ node }: { node: Extract<SceneNode, { type: 'text' }> }) {
  const set = useSetter([node.id]);
  const list = node.modifiers ?? [];
  const update = (i: number, patch: Partial<TextModifier>) => set({ modifiers: list.map((m, j) => (j === i ? { ...m, ...patch } : m)) }, `modifier-${node.id}-${i}-${Object.keys(patch).join(',')}`);
  return (
    <Section
      help="text-modifiers"
      title="Text modifiers"
      defaultOpen={list.length > 0}
      actions={<IconButton icon={<Icons.plus />} title="Add a text modifier: animate letters, words or lines one after another" onClick={() => store().addTextModifier(node.id)} />}
    >
      <Row k="Text animation presets" words={['presets', 'animate letters', 'typewriter', 'wave', 'fade in']}>
        <span className="field-label" title="Ready-made animations: each adds a modifier and a timeline for it">
          Presets
        </span>
        {TEXT_PRESETS.map((p) => (
          <button key={p.id} className="btn" title={p.tip} onClick={() => store().applyTextPreset(node.id, p.id)}>
            {p.label}
          </button>
        ))}
      </Row>
      {!list.length && <p className="hint">Animate letters, words or lines one after another. Try a preset, or add a modifier and key its offset.</p>}
      {list.map((raw, i) => {
        const m = { ...defaultModifier(), ...raw };
        const P = (k: string) => `modifiers.${i}.${k}`;
        return (
          <div key={i} className="constraint text-modifier">
            <Row>
              <SelectField<TextModifierUnit> label="Per" title="What the range counts: single letters, words, or lines as laid out" value={m.unit} options={MODIFIER_UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u] }))} onChange={(v) => update(i, { unit: v })} />
              <IconButton icon={<Icons.trash />} title="Remove this modifier (and its keyframes)" onClick={() => store().removeTextModifier(node.id, i)} />
            </Row>
            <ModRange node={node} prop={P('start')} label="Start" title="Where the range starts, as a percent of the text" min={0} max={100} fallback={0} />
            <ModRange node={node} prop={P('end')} label="End" title="Where the range ends, as a percent of the text" min={0} max={100} fallback={100} />
            <ModRange node={node} prop={P('offset')} label="Offset" title="Slides the whole range along the text, past either end. Key it to make things happen one after another" min={-100} max={100} fallback={0} />
            <Row>
              <SelectField<TextModifierShape> label="Shape" title="How strongly units are hit across the range" value={m.shape} options={MODIFIER_SHAPES.map((sh) => ({ value: sh, label: SHAPE_LABELS[sh] }))} onChange={(v) => update(i, { shape: v })} />
              <SelectField<string> label="Ease" title="Easing applied to the weights" value={typeof m.ease === 'string' ? m.ease : 'linear'} options={EASING_NAMES.map((e) => ({ value: e, label: e }))} onChange={(v) => update(i, { ease: v === 'linear' ? undefined : (v as Easing) })} />
            </Row>
            <Row>
              <CheckField label="Randomize" title="Hit the units in a scrambled (but repeatable) order" value={!!m.randomize} onChange={(v) => update(i, { randomize: v || undefined })} />
              {m.randomize && <NumberField label="Seed" title="Another seed, another order" value={m.seed ?? 0} step={1} onChange={(v) => update(i, { seed: Math.round(v) })} onCommit={() => store().commit()} />}
            </Row>
            {m.shape === 'falloff' && (
              <>
                <ModRange node={node} prop={P('falloffStart')} label="Ramp up to" title="Where the weight reaches full, as a percent of the text. It climbs in a straight line from Start. At or before Start there is no ramp" min={0} max={100} fallback={m.start} />
                <ModRange node={node} prop={P('falloffEnd')} label="Ramp down from" title="Where the weight starts to fall, as a percent of the text. It falls in a straight line to End. At or after End there is no ramp" min={0} max={100} fallback={m.end} />
              </>
            )}
            <ModRange node={node} prop={P('strength')} label="Strength" title="How much of the modifier applies" min={0} max={100} fallback={100} />
            <p className="hint">At full strength, inside the range:</p>
            <Row>
              <Num node={node} ids={[node.id]} prop={P('x')} label="X" title="Move right by this many pixels" />
              <Num node={node} ids={[node.id]} prop={P('y')} label="Y" title="Move down by this many pixels" />
            </Row>
            <Row>
              <Num node={node} ids={[node.id]} prop={P('rotation')} label="↻" suffix="°" title="Turn by this many degrees, around the centre of each unit" />
              <Num node={node} ids={[node.id]} prop={P('scale')} label="Scale" step={0.05} fallback={1} title="Scale each unit (1 = unchanged)" />
            </Row>
            <Num node={node} ids={[node.id]} prop={P('opacity')} label="Opacity" step={0.05} min={0} max={1} fallback={1} title="Fade each unit to this opacity (1 = unchanged, 0 = invisible)" />
            <Row>
              <Num node={node} ids={[node.id]} prop={P('letterSpacing')} label="Spacing" suffix="px" title="Add this much letter spacing (the text reflows)" />
              <Num node={node} ids={[node.id]} prop={P('blur')} label="Blur" suffix="px" min={0} title="Blur each unit by this many pixels" />
            </Row>
            <CheckField label="Tint" title="Mix each unit's colour toward a colour" value={!!m.color} onChange={(v) => update(i, { color: v ? '#ff3d71' : undefined })} />
            {m.color && <Color node={node} ids={[node.id]} prop={P('color')} label="Colour" />}
          </div>
        );
      })}
    </Section>
  );
}

const CONSTRAINT_TYPES: { value: ConstraintType; label: string; tip: string }[] = [
  { value: 'followPath', label: 'Follow path', tip: 'Place this layer along another layer’s outline' },
  { value: 'copyPosition', label: 'Copy position', tip: 'Take another layer’s position' },
  { value: 'copyRotation', label: 'Copy rotation', tip: 'Take another layer’s rotation' },
  { value: 'copyScale', label: 'Copy scale', tip: 'Take another layer’s scale' },
  { value: 'ik', label: 'IK (reach a target)', tip: 'Turn this bone and its parents so this bone’s tip reaches the target layer' },
  { value: 'distance', label: 'Distance', tip: 'Keep this layer a set distance from the target layer' },
];

/** The options the copy constraints share: which values to read, a factor, adding to the layer's own value, and limits. */
function CopyOptions({ c, onChange }: { c: Constraint; onChange: (patch: Partial<Constraint>) => void }) {
  const rot = c.type === 'copyRotation';
  const scale = c.type === 'copyScale';
  const limited = c.min !== undefined || c.max !== undefined || c.minY !== undefined || c.maxY !== undefined;
  const range = rot ? { min: -180, max: 180 } : scale ? { min: 0, max: 2 } : { min: 0, max: 1000 };
  return (
    <>
      <SelectField<'world' | 'local'>
        label="Read"
        title="World: where the other layer ends up on the artboard. Local: its own position, rotation or scale inside its parent"
        value={c.space ?? (scale ? 'local' : 'world')}
        options={[
          { value: 'world', label: 'World values' },
          { value: 'local', label: 'Local values' },
        ]}
        onChange={(v) => onChange({ space: v })}
      />
      <Row>
        <NumberField label="Factor" title="Multiplies the copied value: 1 copies it as is, 0.5 follows half as far, -1 mirrors it" value={c.factor ?? 1} step={0.1} onChange={(v) => onChange({ factor: v })} />
        <CheckField label="Add to own" title={scale ? 'Multiply this layer’s own scale by the copied one instead of replacing it' : 'Add the copied value to this layer’s own instead of replacing it'} value={!!c.additive} onChange={(v) => onChange({ additive: v })} />
      </Row>
      <CheckField
        label="Limit"
        title="Keep the result within a range"
        value={limited}
        onChange={(v) => onChange(v ? { min: range.min, max: range.max, ...(rot ? {} : { minY: range.min, maxY: range.max }) } : { min: undefined, max: undefined, minY: undefined, maxY: undefined })}
      />
      {limited && (
        <Row>
          <NumberField label={rot ? 'Min' : 'Min x'} title="The lowest value allowed" value={c.min ?? range.min} onChange={(v) => onChange({ min: v })} />
          <NumberField label={rot ? 'Max' : 'Max x'} title="The highest value allowed" value={c.max ?? range.max} onChange={(v) => onChange({ max: v })} />
        </Row>
      )}
      {limited && !rot && (
        <Row>
          <NumberField label="Min y" title="The lowest vertical value allowed" value={c.minY ?? range.min} onChange={(v) => onChange({ minY: v })} />
          <NumberField label="Max y" title="The highest vertical value allowed" value={c.maxY ?? range.max} onChange={(v) => onChange({ maxY: v })} />
        </Row>
      )}
      {c.type === 'copyScale' && (
        <Row>
          <CheckField label="Copy x" title="Take the other layer's horizontal scale" value={c.copyX !== false} onChange={(v) => onChange({ copyX: v })} />
          <CheckField label="Copy y" title="Take the other layer's vertical scale" value={c.copyY !== false} onChange={(v) => onChange({ copyY: v })} />
        </Row>
      )}
    </>
  );
}

/** Follow path / copy transform constraints, applied by the player after timelines and bindings. */
function ConstraintsSection({ node }: { node: SceneNode }) {
  const set = useSetter([node.id]);
  const ab = useEditor((st) => getArtboard(st.project, st.activeArtboardId));
  const list = node.constraints ?? [];
  const targets: { value: string; label: string }[] = [];
  if (ab) walk(ab.children, (x) => x.id !== node.id && targets.push({ value: x.id, label: x.name }));
  const update = (i: number, patch: Partial<Constraint>) => set({ constraints: list.map((c, j) => (j === i ? { ...c, ...patch } : c)) }, `constraint-${node.id}-${i}`);
  const add = (type: ConstraintType) =>
    set({
      constraints: [
        ...list,
        { id: uid('k'), type, target: targets[0]?.value ?? '', strength: 1, ...(type === 'followPath' ? { distance: 0, orient: false } : type === 'ik' ? { bones: 2 } : type === 'distance' ? { distance: 100, mode: 'exact' as const } : {}) },
      ],
    });
  return (
    <Section
      help="constraints"
      title="Constraints"
      defaultOpen={list.length > 0}
      actions={<IconButton icon={<Icons.plus />} title="Add a constraint" onClick={() => add('followPath')} />}
    >
      {!list.length && <p className="hint">Tie this layer to another: follow a path, or copy its position, rotation or scale.</p>}
      {list.map((c, i) => (
        <div key={c.id} className="constraint">
          <Row>
            <SelectField<ConstraintType> label="Type" title={CONSTRAINT_TYPES.find((t) => t.value === c.type)?.tip} value={c.type} options={CONSTRAINT_TYPES} onChange={(v) => update(i, { type: v, ...(v === 'ik' ? { bones: c.bones ?? 2 } : v === 'distance' ? { distance: c.distance && c.distance > 1 ? c.distance : 100 } : {}) })} />
            <IconButton icon={<Icons.trash />} title="Remove constraint" onClick={() => set({ constraints: list.filter((_, j) => j !== i) })} />
          </Row>
          <SelectField label="Target" title={c.type === 'followPath' ? 'The shape or path to follow' : c.type === 'ik' ? 'The layer the bone tip reaches for' : c.type === 'distance' ? 'The layer to keep the distance from' : 'The layer to copy from'} value={c.target} options={[{ value: '', label: 'Choose a layer…' }, ...targets]} onChange={(v) => update(i, { target: v })} />
          {c.type === 'followPath' && (
            <>
              <Num node={node} ids={[node.id]} prop={`constraints.${i}.distance`} label="Distance" title="How far along the path, 0 (start) to 1 (end). Animate it to move along the path" step={0.01} min={0} max={1} />
              <CheckField label="Orient along path" title="Turn the layer to face along the path" value={!!c.orient} onChange={(v) => update(i, { orient: v })} />
            </>
          )}
          {c.type === 'ik' && (
            <>
              {node.type !== 'bone' && <p className="hint">IK works on bones: put this constraint on the bone at the end of the chain.</p>}
              <NumberField label="Chain bones" title="How many bones to turn, counting this one and its parents (1 points one bone at the target; 2 or 3 are a limb)" value={c.bones ?? 2} step={1} min={1} max={8} onChange={(v) => update(i, { bones: Math.max(1, Math.round(v)) })} />
              <CheckField label="Bend the other way" title="Put the elbow or knee on the other side" value={!!c.invertBend} onChange={(v) => update(i, { invertBend: v })} />
            </>
          )}
          {c.type === 'distance' && (
            <>
              <Num node={node} ids={[node.id]} prop={`constraints.${i}.distance`} label="Distance" title="How far from the target, px. Animate it to pull in or push out" step={1} min={0} suffix="px" fallback={100} />
              <SelectField<'within' | 'outside' | 'exact'>
                label="Mode"
                title="Exactly at the distance, no farther than it, or no nearer"
                value={c.mode ?? 'exact'}
                options={[
                  { value: 'exact', label: 'Exactly' },
                  { value: 'within', label: 'No farther than' },
                  { value: 'outside', label: 'No nearer than' },
                ]}
                onChange={(v) => update(i, { mode: v })}
              />
            </>
          )}
          {(c.type === 'copyPosition' || c.type === 'followPath') && (
            <Row>
              <NumberField label="Off x" title="Added to the constrained x position" value={c.offsetX ?? 0} onChange={(v) => update(i, { offsetX: v })} />
              <NumberField label="Off y" title="Added to the constrained y position" value={c.offsetY ?? 0} onChange={(v) => update(i, { offsetY: v })} />
            </Row>
          )}
          {c.type === 'copyPosition' && (
            <Row>
              <CheckField label="Copy x" title="Take the other layer's x position" value={c.copyX !== false} onChange={(v) => update(i, { copyX: v })} />
              <CheckField label="Copy y" title="Take the other layer's y position" value={c.copyY !== false} onChange={(v) => update(i, { copyY: v })} />
            </Row>
          )}
          {(c.type === 'copyRotation' || (c.type === 'followPath' && c.orient)) && (
            <NumberField label="Angle +" title="Added to the constrained rotation, in degrees" value={c.angleOffset ?? 0} onChange={(v) => update(i, { angleOffset: v })} suffix="°" />
          )}
          {(c.type === 'copyPosition' || c.type === 'copyRotation' || c.type === 'copyScale') && <CopyOptions c={c} onChange={(patch) => update(i, patch)} />}
          <Num node={node} ids={[node.id]} prop={`constraints.${i}.strength`} label="Strength" title="Mix between the layer's own value (0) and the constrained one (1)" step={0.01} min={0} max={1} fallback={1} />
        </div>
      ))}
    </Section>
  );
}

/** Joysticks: timelines positioned by expressions instead of time. */
function JoysticksSection({ ab }: { ab: Artboard }) {
  const list = ab.joysticks ?? [];
  const update = (fn: (js: NonNullable<Artboard['joysticks']>) => void, coalesce?: string) =>
    store().update(
      (d) => {
        const a = d.artboards.find((x) => x.id === ab.id);
        if (!a) return;
        a.joysticks ??= [];
        fn(a.joysticks);
      },
      { coalesce },
    );
  const tls = [{ value: '', label: 'None' }, ...ab.timelines.map((t) => ({ value: t.id, label: t.name }))];
  const layers = [{ value: '', label: 'None' }];
  walk(ab.children, (x) => void layers.push({ value: x.id, label: x.name }));
  return (
    <Section
      help="joysticks"
      title="Joysticks"
      defaultOpen={list.length > 0}
      actions={
        <IconButton
          icon={<Icons.plus />}
          title="Add a joystick: scrub timelines from numbers, e.g. the pointer position"
          onClick={() => update((js) => void js.push({ id: uid('j'), name: `Joystick ${js.length + 1}`, xTimeline: ab.timelines[0]?.id ?? null, x: 'pointer.x / artboard.width', yTimeline: null, y: 'pointer.y / artboard.height' }))}
        />
      }
    >
      {!list.length && <p className="hint">Set timeline positions from numbers instead of time: dials, gauges, eyes that follow the pointer.</p>}
      {list.map((j, i) => (
        <div key={j.id} className="constraint">
          <Row>
            <TextField label="Name" value={j.name} onChange={(v) => update((js) => void (js[i].name = v), `joy-name-${j.id}`)} />
            <IconButton icon={<Icons.trash />} title="Remove joystick" onClick={() => update((js) => void js.splice(i, 1))} />
          </Row>
          <SelectField label="X timeline" title="Timeline positioned by the X value" value={j.xTimeline ?? ''} options={tls} onChange={(v) => update((js) => void (js[i].xTimeline = v || null))} />
          <ExprField label="X value" locals={POINTER_LOCALS} title="Expression from 0 to 1. pointer {x, y}, artboard {width, height} and every variable are in scope" value={j.x} commitOnBlur onChange={(v) => update((js) => void (js[i].x = v))} />
          <SelectField label="Y timeline" title="Optional second timeline, positioned by the Y value" value={j.yTimeline ?? ''} options={tls} onChange={(v) => update((js) => void (js[i].yTimeline = v || null))} />
          {j.yTimeline && <ExprField label="Y value" locals={POINTER_LOCALS} title="Expression from 0 to 1" value={j.y ?? ''} commitOnBlur onChange={(v) => update((js) => void (js[i].y = v))} />}
          <SelectField
            label="Handle"
            title="A layer the pointer drags around. Where its origin sits inside the area below is handle.x and handle.y (0 to 1) in the expressions"
            value={j.handle ?? ''}
            options={layers}
            onChange={(v) =>
              update((js) => {
                js[i].handle = v || null;
                if (v && !js[i].area) js[i].area = { x: 0, y: 0, width: ab.width, height: ab.height };
              })
            }
          />
          {j.handle && j.area && (
            <>
              <Row>
                <NumberField label="Area X" title="Left edge of the handle's range, in artboard pixels" value={j.area.x} onChange={(v) => update((js) => void (js[i].area!.x = v), `joy-ax-${j.id}`)} onCommit={() => store().commit()} />
                <NumberField label="Y" title="Top edge of the handle's range" value={j.area.y} onChange={(v) => update((js) => void (js[i].area!.y = v), `joy-ay-${j.id}`)} onCommit={() => store().commit()} />
              </Row>
              <Row>
                <NumberField label="Area W" title="Width of the handle's range (handle.x is 1 at this distance from the left edge)" value={j.area.width} min={1} onChange={(v) => update((js) => void (js[i].area!.width = v), `joy-aw-${j.id}`)} onCommit={() => store().commit()} />
                <NumberField label="H" title="Height of the handle's range" value={j.area.height} min={1} onChange={(v) => update((js) => void (js[i].area!.height = v), `joy-ah-${j.id}`)} onCommit={() => store().commit()} />
              </Row>
            </>
          )}
        </div>
      ))}
    </Section>
  );
}

/** Blends: several timelines' poses mixed by weights that come from number variables. */
function BlendsSection({ ab, project }: { ab: Artboard; project: Project }) {
  const list = ab.blends ?? [];
  const update = (fn: (bs: Blend[]) => void, coalesce?: string) =>
    store().update(
      (d) => {
        const a = d.artboards.find((x) => x.id === ab.id);
        if (!a) return;
        a.blends ??= [];
        fn(a.blends);
      },
      { coalesce },
    );
  const tls = [{ value: '', label: 'Choose timeline…' }, ...ab.timelines.map((t) => ({ value: t.id, label: t.name }))];
  const numberVars = project.variables.filter((v) => v.type === 'number');
  const vars = (empty: string) => [{ value: '', label: empty }, ...numberVars.map((v) => ({ value: v.id, label: v.name }))];
  return (
    <Section
      help="blends"
      title="Blends"
      defaultOpen={list.length > 0}
      actions={
        <IconButton
          icon={<Icons.plus />}
          title="Add a blend: mix several timelines by a number, e.g. idle, walk and run by speed"
          onClick={() => update((bs) => void bs.push({ id: uid('bl'), name: `Blend ${bs.length + 1}`, mode: '1d', variable: numberVars[0]?.id ?? null, entries: ab.timelines.slice(0, 2).map((t, i) => ({ timeline: t.id, value: i })) }))}
        />
      }
    >
      {!list.length && <p className="hint">Mix several timelines by a number: blend idle, walk and run by speed, or layer a lean on top of a loop. Start one with a Play blend node.</p>}
      {!list.length && (
        <PropRow k="Build a blend example" words={['example', 'demo', 'pose', 'blend']}>
        <button
          className="link-btn"
          title="Add a circle, two pose timelines, a 0 to 1 variable with a labelled slider ('Drag me: blend weight') on the artboard, and a blend between the poses. Then open Preview and drag that slider"
          onClick={() => {
            const ex = blendExample(ab, project.variables.map((v) => v.name));
            store().update((d) => {
              const a = d.artboards.find((x) => x.id === ab.id);
              if (!a) return;
              d.variables.push(ex.variable);
              a.children.push(...ex.nodes);
              a.timelines.push(...ex.timelines);
              (a.blends ??= []).push(ex.blend);
            });
            store().toast('Added an example blend. Click Preview (top right) and drag the slider labelled “Drag me: blend weight” under the ball: it mixes between the two timelines.');
          }}
        >
          Build an example to try
        </button>
        </PropRow>
      )}
      {list.map((b, i) => {
        const oneD = b.mode === '1d';
        return (
          <div key={b.id} className="constraint">
            <Row>
              <TextField label="Name" value={b.name} onChange={(v) => update((bs) => void (bs[i].name = v), `blend-name-${b.id}`)} />
              <IconButton icon={<Icons.trash />} title="Remove blend" onClick={() => update((bs) => void bs.splice(i, 1))} />
            </Row>
            <SelectField<Blend['mode']>
              label="Mode"
              title="1D: one number picks a position between the entries. Direct: each entry has its own weight. Additive: each entry's change is added on top of the layer"
              value={b.mode}
              options={[
                { value: '1d', label: '1D (by one number)' },
                { value: 'direct', label: 'Direct (weight per timeline)' },
                { value: 'additive', label: 'Additive (on top)' },
              ]}
              onChange={(v) => update((bs) => void (bs[i].mode = v))}
            />
            {oneD && <SelectField label="Input" title="The number variable that picks the position" value={b.variable ?? ''} options={vars(numberVars.length ? 'Choose variable…' : 'No number variables yet')} onChange={(v) => update((bs) => void (bs[i].variable = v || null))} />}
            {!oneD && <NumberField label="Full weight at" title="The variable value that means full weight: 1 for 0 to 1, 100 for percentages" value={b.range ?? 1} min={0.0001} onChange={(v) => update((bs) => void (bs[i].range = v), `blend-range-${b.id}`)} />}
            <CheckField label="Start with the artboard" value={!!b.autoplay} onChange={(v) => update((bs) => void (bs[i].autoplay = v || undefined))} />
            {b.entries.map((e, k) => (
              <Row key={k}>
                <SelectField label={k === 0 ? 'Timelines' : undefined} value={e.timeline ?? ''} options={tls} onChange={(v) => update((bs) => void (bs[i].entries[k].timeline = v || null))} />
                {oneD ? (
                  <NumberField title="Where this timeline sits along the input" value={e.value ?? k} step={0.1} onChange={(v) => update((bs) => void (bs[i].entries[k].value = v), `blend-val-${b.id}-${k}`)} />
                ) : (
                  <>
                    <SelectField title="Variable giving this timeline's weight" value={e.weightVariable ?? ''} options={vars('Fixed weight')} onChange={(v) => update((bs) => void (bs[i].entries[k].weightVariable = v || null))} />
                    {!e.weightVariable && <NumberField title="Fixed weight, 0 to 1" value={e.weight ?? 1} step={0.1} min={0} max={1} onChange={(v) => update((bs) => void (bs[i].entries[k].weight = v), `blend-w-${b.id}-${k}`)} />}
                  </>
                )}
                <IconButton icon={<Icons.trash />} title="Remove from blend" onClick={() => update((bs) => void bs[i].entries.splice(k, 1))} />
              </Row>
            ))}
            <IconButton
              icon={<Icons.plus />}
              title="Add a timeline to this blend"
              onClick={() => update((bs) => void bs[i].entries.push({ timeline: ab.timelines.find((t) => !b.entries.some((e) => e.timeline === t.id))?.id ?? null, value: Math.max(-1, ...b.entries.map((e, k) => e.value ?? k)) + 1 }))}
            />
          </div>
        );
      })}
    </Section>
  );
}
