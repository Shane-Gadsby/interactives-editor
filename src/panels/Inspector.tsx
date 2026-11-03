import { useEffect, useState, type ReactNode } from 'react';
import {
  nodeTypeLabel,
  ANIMATABLE_PROPS,
  animatableProp,
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
  DRAW_API,
  DRAW_TEMPLATES,
  type DrawTemplate,
  defaultAutoLayout,
  type AutoLayout,
  type FrameNode,
  LINK_TARGETS,
  type LinkTarget,
  type Repeat,
  getPath,
  sampleKeys,
  type Artboard,
  type Blend,
  type BlendMode,
  type ColorStop,
  type FitMode,
  type InputKind,
  type Paint,
  type Project,
  type SceneNode,
  type Shadow,
  type Stroke,
  type TextRun,
  type TextStyle,
  type Constraint,
  type ConstraintType,
  type Converter,
  uid,
  walk,
} from 'interactives-player';
import { store, useEditor } from '../store/store';
import { getArtboard, isIdentifier, locate } from '../store/doc';
import { CheckField, ColorField, IconButton, NumberField, Row, Section, SelectField, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { assetKind } from '../lib/assets';
import { addAssetOption, addVariableOption, withQuickAdd } from '../lib/quick-add';
import { CodeEditor } from '../components/CodeEditor';
import { KIND_LABEL, linkManager, useLinks } from '../lib/links';
import { ChildOrder } from '../components/ChildOrder';
import { blendExample } from '../lib/blend-example';
import { ConvertersEditor } from '../components/Converters';
import { TEXT_PRESETS } from '../lib/text-modifiers';
import { applyDrawTemplate } from '../lib/draw-templates';
import { useDrawProblem } from '../lib/draw-edit';

const BLEND: BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'difference', 'exclusion'];
const FONT_FAMILIES = ['Inter, system-ui, sans-serif', 'system-ui, sans-serif', 'Georgia, serif', '"Times New Roman", serif', 'Arial, Helvetica, sans-serif', '"Courier New", monospace', 'ui-monospace, monospace'];

export function Inspector() {
  const s = useEditor((st) => ({
    project: st.project,
    selection: st.selection,
    artboardSelected: st.artboardSelected,
    activeArtboardId: st.activeArtboardId,
    bottomTab: st.bottomTab,
    activeTimelineId: st.activeTimelineId,
    playhead: st.playhead,
    recording: st.recording,
  }));
  const ab = getArtboard(s.project, s.activeArtboardId);
  if (!ab) return <aside className="inspector" />;
  const nodes = s.selection.map((id) => locate(ab, id)?.node).filter(Boolean) as SceneNode[];
  return (
    <aside className="inspector">
      {s.recording && s.bottomTab === 'timeline' && <div className="recording-banner">Recording keyframes at {Math.round(s.playhead)} ms</div>}
      {nodes.length ? <NodeInspector nodes={nodes} ab={ab} project={s.project} /> : <ArtboardInspector ab={ab} project={s.project} />}
    </aside>
  );
}

// ---------------------------------------------------------------- shared bits

function useSetter(ids: string[]) {
  return (props: Record<string, unknown>, coalesce?: string) => store().setProps(ids, props, coalesce ?? `insp-${Object.keys(props).join(',')}-${ids.join(',')}`);
}

/** Value shown in the inspector: the timeline's value at the playhead when it animates the property. */
function useShown(node: SceneNode) {
  const st = store().get();
  const ab = store().artboard();
  const tl = st.bottomTab === 'timeline' ? ab?.timelines.find((t) => t.id === st.activeTimelineId) : undefined;
  return (prop: string): unknown => {
    const track = tl?.tracks.find((t) => t.nodeId === node.id && t.prop === prop);
    if (track && track.keys.length) return sampleKeys(track.keys, st.playhead);
    return getPath(node, prop);
  };
}

function KeyButton({ node, prop }: { node: SceneNode; prop: string }) {
  const s = useEditor((st) => ({ bottomTab: st.bottomTab, tl: st.activeTimelineId, playhead: st.playhead, project: st.project }));
  if (s.bottomTab !== 'timeline' || !animatableProp(prop)) return null;
  const ab = store().artboard();
  const tl = ab?.timelines.find((t) => t.id === s.tl);
  const track = tl?.tracks.find((t) => t.nodeId === node.id && t.prop === prop);
  const onKey = track?.keys.some((k) => Math.abs(k.t - s.playhead) < 1);
  return (
    <button
      className={`key-btn${track ? ' tracked' : ''}${onKey ? ' on-key' : ''}`}
      title={tl ? `Add keyframe for ${prop} at ${Math.round(s.playhead)} ms` : `Add keyframe (creates a timeline)`}
      onClick={() => store().keyCurrent(node.id, prop)}
    >
      ◆
    </button>
  );
}

function Num({ node, ids, prop, label, step, min, max, suffix, fallback = 0, title }: { node: SceneNode; ids: string[]; prop: string; label: ReactNode; step?: number; min?: number; max?: number; suffix?: string; fallback?: number; title?: string }) {
  const shown = useShown(node);
  const set = useSetter(ids);
  const v = Number(shown(prop) ?? fallback);
  return (
    <div className="keyed">
      <NumberField label={label} title={title} value={v} step={step} min={min} max={max} suffix={suffix} onChange={(x) => set({ [prop]: x })} onCommit={() => store().commit()} />
      <KeyButton node={node} prop={prop} />
    </div>
  );
}

function Color({ node, ids, prop, label }: { node: SceneNode; ids: string[]; prop: string; label: ReactNode }) {
  const shown = useShown(node);
  const set = useSetter(ids);
  return (
    <div className="keyed">
      <ColorField label={label} value={String(shown(prop) ?? '#000000')} onChange={(c) => set({ [prop]: c })} onCommit={() => store().commit()} />
      <KeyButton node={node} prop={prop} />
    </div>
  );
}

// ---------------------------------------------------------------- paint

export function PaintField({ paint, onChange, project, allowNone = true }: { paint: Paint | null; onChange: (p: Paint | null) => void; project: Project; allowNone?: boolean }) {
  const type = paint?.type ?? 'none';
  const stopsOf = (p: Paint | null): ColorStop[] =>
    p && (p.type === 'linear' || p.type === 'radial')
      ? p.stops
      : [
          { offset: 0, color: p?.type === 'solid' ? p.color : '#3b5bfd' },
          { offset: 1, color: '#00c2a8' },
        ];
  const setType = (t: string) => {
    if (t === 'none') onChange(null);
    else if (t === 'solid') onChange({ type: 'solid', color: paint && paint.type !== 'solid' && paint.type !== 'image' ? paint.stops[0]?.color ?? '#d9d9d9' : '#d9d9d9' });
    else if (t === 'linear') onChange({ type: 'linear', angle: 180, stops: stopsOf(paint) });
    else if (t === 'radial') onChange({ type: 'radial', stops: stopsOf(paint) });
    else if (t === 'image') onChange({ type: 'image', assetId: project.assets.find((a) => assetKind(a.mime) === 'image')?.id ?? '', fit: 'cover' });
  };
  const images = project.assets.filter((a) => assetKind(a.mime, a.name) === 'image');
  return (
    <div className="paint-field">
      <SelectField
        value={type}
        onChange={setType}
        options={[...(allowNone ? [{ value: 'none', label: 'None' }] : []), { value: 'solid', label: 'Solid' }, { value: 'linear', label: 'Linear gradient' }, { value: 'radial', label: 'Radial gradient' }, { value: 'image', label: 'Image' }]}
      />
      {paint?.type === 'solid' && <ColorField value={paint.color} onChange={(c) => onChange({ ...paint, color: c })} onCommit={() => store().commit()} />}
      {(paint?.type === 'linear' || paint?.type === 'radial') && (
        <>
          {paint.type === 'linear' && <NumberField label="Angle" value={paint.angle} suffix="°" onChange={(a) => onChange({ ...paint, angle: a })} onCommit={() => store().commit()} />}
          {paint.stops.map((stop, i) => (
            <Row key={i} className="stop-row">
              <ColorField value={stop.color} onChange={(c) => onChange({ ...paint, stops: paint.stops.map((x, j) => (j === i ? { ...x, color: c } : x)) })} />
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

/** The file this artboard is linked to: when it was last brought in, and the controls for it. */
function LinkedFileSection({ ab }: { ab: Artboard }) {
  const src = ab.source!;
  const status = useLinks().find((l) => l.linkId === src.linkId);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  const state = status?.state ?? 'checking';
  const mine = state === 'connected' || state === 'needs-permission';
  const note =
    state === 'no-handle'
      ? `Linked from ${src.by ? `${src.by}’s` : 'another'} browser; this one can’t read the file. It updates here when they save.`
      : state === 'needs-permission'
        ? 'Click Re-import now (or Reconnect in the bar above) to allow reading the file again.'
        : state === 'missing'
          ? 'The file was moved, renamed or deleted.'
          : status?.error
            ? status.error
            : '';
  return (
    <Section help="import" title="Linked file">
      <div className="link-info">
        <div className="link-title">
          Linked to {src.fileName} <span className="link-sub">({KIND_LABEL[src.kind] ?? src.kind}, updated {ago(src.importedAt, now)})</span>
        </div>
        {note && <div className={`link-sub${status?.error || state === 'missing' ? ' err' : ''}`}>{note}</div>}
        <Row>
          <button className="btn" disabled={!mine || status?.busy} title="Read the file now and bring its changes in; your own edits are kept" onClick={() => void linkManager()?.reimportNow(src.linkId)}>
            {status?.busy ? 'Importing…' : 'Re-import now'}
          </button>
          <button className="btn" title="Stop watching the file. The layers stay in the project as they are" onClick={() => void linkManager()?.unlink(src.linkId)}>
            Unlink (keep as embedded)
          </button>
        </Row>
        <CheckField label="Watch for changes" title="Re-import automatically when the file is saved (checked every couple of seconds while this tab is open)" value={!!status?.watch && mine} onChange={(v) => void linkManager()?.setWatch(src.linkId, v)} />
      </div>
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
  const [font, setFont] = useState('');
  return (
    <>
      {ab.source?.linkId && <LinkedFileSection ab={ab} />}
      <Section help="artboards" title="Artboard">
        <TextField label="Name" value={ab.name} onChange={(v) => setAb((a) => (a.name = v), `ab-name-${ab.id}`)} />
        <Row>
          <NumberField label="W" value={ab.width} min={1} onChange={(v) => setAb((a) => (a.width = Math.round(v)), `ab-w-${ab.id}`)} />
          <NumberField label="H" value={ab.height} min={1} onChange={(v) => setAb((a) => (a.height = Math.round(v)), `ab-h-${ab.id}`)} />
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
        <div className="field-label block">Background</div>
        <PaintField paint={ab.background} project={project} onChange={(p) => setAb((a) => (a.background = p), `ab-bg-${ab.id}`)} />
        <CheckField label="Clip content to artboard" value={ab.clip} onChange={(v) => setAb((a) => (a.clip = v))} />
        <Row>
          <button className="btn" disabled={project.settings.startArtboardId === ab.id} onClick={() => setProject((p) => (p.settings.startArtboardId = ab.id))}>
            {project.settings.startArtboardId === ab.id ? 'Start artboard' : 'Make start artboard'}
          </button>
          <IconButton icon={<Icons.copy />} title="Duplicate artboard" onClick={() => store().duplicateArtboard(ab.id)} />
        </Row>
        <Row>
          <SelectField
            label="Use in"
            value=""
            options={[{ value: '', label: 'Place as an instance in…' }, ...project.artboards.filter((a) => a.id !== ab.id).map((a) => ({ value: a.id, label: a.name }))]}
            onChange={(target) => {
              if (!target) return;
              const host = project.artboards.find((a) => a.id === target)!;
              const inst = createNode('instance', { name: ab.name, artboardId: ab.id, width: ab.width, height: ab.height, x: Math.round((host.width - ab.width) / 2), y: Math.round((host.height - ab.height) / 2) });
              store().addNodes([inst], { artboardId: target });
            }}
          />
          <IconButton icon={<Icons.trash />} title="Delete artboard" onClick={() => store().deleteArtboard(ab.id)} />
        </Row>
      </Section>
      <JoysticksSection ab={ab} />
      <BlendsSection ab={ab} project={project} />
      <Section help="project-settings" title="Project">
        <TextField label="Name" value={project.name} onChange={(v) => setProject((p) => (p.name = v), 'project-name')} />
        <TextField label="Page title" value={project.settings.title} onChange={(v) => setProject((p) => (p.settings.title = v), 'project-title')} />
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
        <ColorField label="Page bg" value={project.settings.pageBackground} onChange={(c) => setProject((p) => (p.settings.pageBackground = c), 'page-bg')} />
        <CheckField
          label="Run scripts in the sandbox"
          title="Scripts run in a JavaScript VM (WASM) with only the ix API: no DOM, cookies or network. Turn off to let scripts reach the page (node.element)."
          value={!!project.settings.scriptSandbox}
          onChange={(v) => setProject((p) => (p.settings.scriptSandbox = v))}
        />
        <CheckField
          label="Respect reduced motion"
          title="When the viewer's device asks for less motion, autoplaying timelines show their last frame and artboard transitions are instant"
          value={!!project.settings.reducedMotion}
          onChange={(v) => setProject((p) => (p.settings.reducedMotion = v))}
        />
      </Section>
      <Section help="text" title="Fonts">
        {project.fonts.map((f, i) => (
          <Row key={i} className="font-row">
            <span className="font-name" style={{ fontFamily: f.family }}>
              {f.family}
            </span>
            <span className="muted">{f.source}</span>
            <IconButton icon={<Icons.trash />} title="Remove font" onClick={() => setProject((p) => p.fonts.splice(i, 1))} />
          </Row>
        ))}
        <Row>
          <TextField value={font} placeholder="Google font, e.g. Poppins" onChange={setFont} />
          <button
            className="btn"
            disabled={!font.trim()}
            onClick={() => {
              setProject((p) => p.fonts.push({ family: font.trim(), source: 'google', weights: [400, 500, 600, 700] }));
              setFont('');
            }}
          >
            Add
          </button>
        </Row>
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
  return (
    <>
      <AlignBar count={nodes.length} shapes={nodes.filter((x) => !(x.type === 'group' || x.type === 'text' || x.type === 'link')).length} />
      <Section help="fill-stroke" title={single ? <span className="type-chip">{nodeTypeLabel(n.type)}</span> : `${nodes.length} layers`}>
        {single && <TextField label="Name" value={n.name} onChange={(v) => set({ name: v }, `name-${n.id}`)} />}
        <Row>
          <Num node={n} ids={ids} prop="x" label="X" />
          <Num node={n} ids={ids} prop="y" label="Y" />
        </Row>
        <Row>
          <Num node={n} ids={ids} prop="width" label="W" min={0} />
          <Num node={n} ids={ids} prop="height" label="H" min={0} />
        </Row>
        <Row>
          <Num node={n} ids={ids} prop="rotation" label="↻" suffix="°" />
          <Num node={n} ids={ids} prop="opacity" label="α" step={0.05} min={0} max={1} />
        </Row>
        <Row>
          <Num node={n} ids={ids} prop="scaleX" label="Sx" step={0.05} />
          <Num node={n} ids={ids} prop="scaleY" label="Sy" step={0.05} />
        </Row>
        <Row>
          <NumberField label="Ox" title="Transform origin X (0-1)" value={n.originX} step={0.05} min={0} max={1} onChange={(v) => set({ originX: v })} />
          <NumberField label="Oy" title="Transform origin Y (0-1)" value={n.originY} step={0.05} min={0} max={1} onChange={(v) => set({ originY: v })} />
        </Row>
        <Row>
          <CheckField label="Visible" value={n.visible} onChange={(v) => set({ visible: v })} />
          <CheckField label="Locked" value={!!n.locked} onChange={(v) => set({ locked: v })} />
        </Row>
        <CheckField label="Use as mask" value={!!n.mask} onChange={(v) => set({ mask: v ? true : undefined })} />
        <SelectField label="Blend" value={n.blendMode ?? 'normal'} options={BLEND} onChange={(v) => set({ blendMode: v })} />
      </Section>
      {sameType && <TypeSection nodes={nodes} project={project} />}
      {single && n.type === 'text' && <TextModifiersSection node={n} />}
      {sameType && 'fill' in n && <FillSection nodes={nodes} project={project} />}
      {sameType && 'stroke' in n && <StrokeSection nodes={nodes} project={project} />}
      <EffectsSection nodes={nodes} />
      {single && <ConstraintsSection node={n} />}
      <LinkCursorSection nodes={nodes} project={project} />
      {single && (n.type === 'group' || n.type === 'frame') && <SoloSection node={n} />}
      {single && (n.type === 'group' || n.type === 'frame') && n.children.length > 1 && <DrawOrderSection node={n} />}
      {single && (n.type === 'group' || n.type === 'frame') && <RepeatSection node={n} project={project} />}
      {single && <BindingsSection node={n} project={project} />}
      {single && <InteractionsSection node={n} ab={ab} />}
      {single && (
        <Section help="web-elements#accessibility" title="Advanced" defaultOpen={false}>
          <TextField label="ARIA label" value={n.ariaLabel ?? ''} onChange={(v) => set({ ariaLabel: v || undefined })} />
          <TextField label="CSS class" value={n.className ?? ''} onChange={(v) => set({ className: v || undefined })} />
          <div className="muted small">id: {n.id}</div>
        </Section>
      )}
    </>
  );
}

function KeyRow({ node, prop }: { node: SceneNode; prop: string }) {
  const s = useEditor((st) => st.bottomTab);
  if (s !== 'timeline') return null;
  return (
    <div className="key-row">
      <span className="muted small">Animate {prop}</span>
      <KeyButton node={node} prop={prop} />
    </div>
  );
}

function StrokeSection({ nodes, project }: { nodes: SceneNode[]; project: Project }) {
  const n = nodes[0] as SceneNode & { stroke: Stroke | null };
  const set = useSetter(nodes.map((x) => x.id));
  const s = n.stroke;
  const shownStroke = useShown(n)('stroke.paint.color');
  return (
    <Section
      help="fill-stroke#stroke"
      title="Stroke"
      actions={
        s ? (
          <IconButton icon={<Icons.close />} className="remove-btn" title="Remove stroke" onClick={() => set({ stroke: null })} />
        ) : (
          <IconButton icon={<Icons.plus />} title="Add stroke" onClick={() => set({ stroke: { paint: { type: 'solid', color: '#111111' }, width: 1 } })} />
        )
      }
    >
      {s && (
        <>
          <PaintField
            paint={s.paint.type === 'solid' && typeof shownStroke === 'string' ? { ...s.paint, color: shownStroke } : s.paint}
            allowNone={false}
            project={project}
            onChange={(p) => (p?.type === 'solid' && s.paint.type === 'solid' ? set({ 'stroke.paint.color': p.color }, 'stroke-paint') : set({ stroke: { ...s, paint: p! } }, 'stroke-paint'))}
          />
          <Row>
            <Num node={n} ids={nodes.map((x) => x.id)} prop="stroke.width" label="W" min={0} />
            <TextField
              label="Dash"
              value={(s.dash ?? []).join(' ')}
              placeholder="e.g. 4 2"
              commitOnBlur
              onChange={(v) => {
                const dash = v.split(/[\s,]+/).map(Number).filter((x) => x > 0);
                set({ stroke: { ...s, dash: dash.length ? dash : undefined } });
              }}
            />
          </Row>
          {(n.type === 'path' || n.type === 'polygon' || n.type === 'star' || n.type === 'rect' || n.type === 'ellipse') && (
            <Row>
              <Num node={n} ids={nodes.map((x) => x.id)} prop="stroke.trimStart" label="Trim" title="Trim start: where the drawn part of the stroke begins (% of its length). Animate it to draw lines on" min={0} max={100} suffix="%" />
              <Num node={n} ids={nodes.map((x) => x.id)} prop="stroke.trimEnd" label="to" title="Trim end: where the drawn part ends (% of its length)" min={0} max={100} suffix="%" fallback={100} />
              <Num node={n} ids={nodes.map((x) => x.id)} prop="stroke.trimOffset" label="Off" title="Trim offset: slides the drawn part along the outline (%)" min={-100} max={200} suffix="%" />
            </Row>
          )}
          {(n.type === 'path' || n.type === 'polygon' || n.type === 'star') && <p className="hint">Vector strokes are centred on the path; box strokes sit inside the edge.</p>}
        </>
      )}
    </Section>
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
  return (
    <Section
      help="fill-stroke#effects"
      title="Effects"
      defaultOpen={!!(sh || n.blur)}
      actions={
        !(sh && hasBlur) && (
          <AddMenu
            title="Add an effect"
            items={[...(!sh ? [{ label: 'Shadow', onClick: addShadow }] : []), ...(!hasBlur ? [{ label: 'Layer blur', onClick: addBlur }] : [])]}
          />
        )
      }
    >
      {!sh && !hasBlur && <p className="hint">No effects. Use + to add a shadow or a blur.</p>}
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
    <div className="runs">
      <button className="btn" onClick={() => setOpen(!open)} title="Style parts of the text differently. On the canvas: double-click the text, select a range and press Ctrl/Cmd+B, I or U.">
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
                  <ColorField value={r.color ?? n.color} onChange={(c) => edit(i, { color: c }, `run-color-${n.id}-${i}`)} onCommit={() => store().commit()} title="Colour of this run" />
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
  );
}

function TextStyleFields({ nodes, project }: { nodes: (SceneNode & TextStyle)[]; project: Project }) {
  const n = nodes[0];
  const ids = nodes.map((x) => x.id);
  const set = useSetter(ids);
  const families = [...new Set([...project.fonts.map((f) => (f.family.includes(' ') ? `"${f.family}"` : f.family)), ...FONT_FAMILIES, n.fontFamily])];
  return (
    <>
      <SelectField label="Font" value={n.fontFamily} options={families.map((f) => ({ value: f, label: f.replace(/"/g, '').split(',')[0] }))} onChange={(v) => set({ fontFamily: v })} />
      <Row>
        <Num node={n} ids={ids} prop="fontSize" label="Size" min={1} />
        <SelectField
          label="Weight"
          value={String(n.fontWeight)}
          options={['100', '200', '300', '400', '500', '600', '700', '800', '900']}
          onChange={(v) => set({ fontWeight: Number(v) })}
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
      <Row>
        <CheckField label="Italic" value={n.fontStyle === 'italic'} onChange={(v) => set({ fontStyle: v ? 'italic' : 'normal' })} />
        <SelectField label="Case" value={n.textTransform ?? 'none'} options={['none', 'uppercase', 'lowercase', 'capitalize'] as const} onChange={(v) => set({ textTransform: v })} />
      </Row>
      <SelectField label="Decoration" value={n.textDecoration ?? 'none'} options={['none', 'underline', 'line-through'] as const} onChange={(v) => set({ textDecoration: v })} />
    </>
  );
}

function TypeSection({ nodes, project }: { nodes: SceneNode[]; project: Project }) {
  const n = nodes[0];
  const ids = nodes.map((x) => x.id);
  const set = useSetter(ids);
  const varOptions = [{ value: '', label: 'Not bound' }, ...project.variables.map((v) => ({ value: v.id, label: `${v.name} (${v.type})` }))];
  const images = project.assets.filter((a) => assetKind(a.mime, a.name) === 'image');
  const videos = project.assets.filter((a) => assetKind(a.mime, a.name) === 'video');
  const radius = 'cornerRadius' in n ? <Num node={n} ids={ids} prop="cornerRadius" label="Radius" min={0} /> : null;
  switch (n.type) {
    case 'rect':
      return <Section help="shapes#shape-settings" title="Rectangle">{radius}</Section>;
    case 'frame':
      return (
        <>
          <Section help="groups-frames" title="Frame">
            {radius}
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
        </Section>
      );
    case 'star':
      return (
        <Section help="shapes#shape-settings" title="Star">
          <NumberField label="Points" value={n.points} min={3} max={64} onChange={(v) => set({ points: Math.round(v) })} />
          <Num node={n} ids={ids} prop="innerRatio" label="Inner" step={0.05} min={0.05} max={1} />
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
          <p className="hint">Double-click a path to edit its points. Alt-click a point toggles curve/corner; Delete removes it.</p>
        </Section>
      );
    case 'text':
      return (
        <Section help="text" title="Text">
          {nodes.length === 1 && <TextField label="Text" value={n.text} multiline onChange={(v) => set({ text: v }, `text-${n.id}`)} />}
          {nodes.length === 1 && <RunsEditor node={n} />}
          <SelectField
            label="Sizing"
            value={n.autoSize}
            options={[
              { value: 'width', label: 'Auto width' },
              { value: 'height', label: 'Auto height' },
              { value: 'none', label: 'Fixed' },
            ]}
            onChange={(v) => set({ autoSize: v })}
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
          <SelectField label="Fit" value={n.fit} options={['cover', 'contain', 'fill'] as const} onChange={(v) => set({ fit: v })} />
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
        </Section>
      );
    case 'button':
      return (
        <Section help="web-elements" title="Button">
          {nodes.length === 1 && <TextField label="Label" value={n.label} onChange={(v) => set({ label: v }, `label-${n.id}`)} />}
          {radius}
          <CheckField label="Disabled" value={!!n.disabled} onChange={(v) => set({ disabled: v })} />
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
          <SelectField
            label="Variable"
            value={n.variableId ?? ''}
            options={[...varOptions, addVariableOption()]}
            onChange={withQuickAdd((v) => set({ variableId: v || null }), {
              variableType: n.inputType === 'checkbox' ? 'boolean' : n.inputType === 'number' || n.inputType === 'range' ? 'number' : 'string',
              variableName: n.name.replace(/\W+/g, '') || 'value',
            })}
          />
          {n.inputType !== 'checkbox' && n.inputType !== 'range' && n.inputType !== 'select' && <TextField label="Placeholder" value={n.placeholder} onChange={(v) => set({ placeholder: v })} />}
          {!n.variableId && <TextField label="Value" value={n.value} onChange={(v) => set({ value: v })} />}
          {(n.inputType === 'number' || n.inputType === 'range') && (
            <Row>
              <NumberField label="Min" value={n.min ?? 0} onChange={(v) => set({ min: v })} />
              <NumberField label="Max" value={n.max ?? 100} onChange={(v) => set({ max: v })} />
              <NumberField label="Step" value={n.step ?? 1} onChange={(v) => set({ step: v })} />
            </Row>
          )}
          {n.inputType === 'select' && <TextField label="Options" value={n.options ?? ''} multiline placeholder="One per line" onChange={(v) => set({ options: v })} />}
          {radius}
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
              <div className="code-field">
                <div className="field-label block">HTML (scripts run in the published player, not on the canvas)</div>
                <CodeEditor language="html" value={n.html} onChange={(v) => set({ html: v }, `html-${n.id}`)} height={200} />
              </div>
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
            options={[{ value: '', label: 'Use a URL' }, ...videos.map((a) => ({ value: a.id, label: a.name })), addAssetOption('video')]}
          />
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
          {radius}
        </Section>
      );
    case 'instance':
      return <InstanceSection node={n} project={project} />;
    case 'draw':
      return <DrawSection nodes={nodes as DrawNode[]} />;
    case 'group':
      return (
        <Section help="groups-frames" title="Group">
          <p className="hint">Double-click to select inside. Ctrl/⌘-click selects deep layers directly.</p>
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
        <div className="code-field">
          <div className="field-label block">
            Draw script: <code>function draw(g, t, dt)</code>
          </div>
          <CodeEditor value={n.code} onChange={(v) => set({ code: v }, `code-${n.id}`)} height={280} />
        </div>
      )}
      {problem && <p className={problem.kind === 'error' ? 'hint error' : 'hint'}>{problem.kind === 'error' ? `Script error, the layer stopped: ${problem.message}` : problem.message}</p>}
      <Row>
        <NumberField label="FPS" title="Frame rate cap: 0 draws on every frame" value={n.fps} min={0} max={120} onChange={(v) => set({ fps: Math.max(0, Math.round(v)) })} />
        <SelectField
          label="Pixels"
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

function BindingsSection({ node, project }: { node: SceneNode; project: Project }) {
  const set = useSetter([node.id]);
  const bindings = node.bindings ?? {};
  const converters = node.converters ?? {};
  const entries = Object.entries(bindings);
  const [prop, setProp] = useState('opacity');
  const update = (next: Record<string, string>, conv: Record<string, Converter[]> = converters) => {
    const keep = Object.fromEntries(Object.entries(conv).filter(([k, list]) => k in next && list.length));
    set({ bindings: Object.keys(next).length ? next : undefined, converters: Object.keys(keep).length ? keep : undefined }, `bind-${node.id}`);
  };
  const kindOf = (p: string) => animatableProp(p)?.kind;
  return (
    <Section help="bindings" title="Data bindings" defaultOpen={entries.length > 0}>
      {entries.map(([p, expr]) => (
        <div key={p} className="binding">
          <Row className="binding-row">
            <span className="mono small binding-prop" title={`${p} (${kindOf(p) ?? 'any'})`}>
              {p}
            </span>
            <TextField value={expr} mono commitOnBlur placeholder="expression" onChange={(v) => update({ ...bindings, [p]: v })} />
            <IconButton
              icon={<Icons.trash />}
              title="Remove binding"
              onClick={() => {
                const next = { ...bindings };
                delete next[p];
                update(next);
              }}
            />
          </Row>
          <ConvertersEditor list={converters[p] ?? []} expr={expr} variables={project.variables} onChange={(list) => update(bindings, { ...converters, [p]: list })} />
        </div>
      ))}
      <Row>
        <SelectField value={prop} options={ANIMATABLE_PROPS.map((a) => ({ value: a.prop, label: a.label }))} onChange={setProp} />
        <button className="btn" disabled={prop in bindings} onClick={() => update({ ...bindings, [prop]: project.variables[0]?.name ?? '' })}>
          Bind
        </button>
      </Row>
      <p className="hint">
        A binding sets the property from variables every frame, e.g. <code>visible</code> ← <code>lives &gt; 0</code>, <code>width</code> ← <code>progress * 3</code>. Add a converter to format a number as text, invert a flag, remap a range or look up a choice.
        {project.variables.some((v) => !isIdentifier(v.name)) && ' Some variable names are not valid identifiers and cannot be used in expressions.'}
      </p>
    </Section>
  );
}

function InteractionsSection({ node, ab }: { node: SceneNode; ab: Artboard }) {
  const events = ab.logic.nodes.filter((l) => l.params.target === node.id);
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
      {events.length ? (
        events.map((e) => (
          <button key={e.id} className="interaction-chip" onClick={() => store().set({ bottomTab: 'logic', logicSelection: e.id })}>
            {e.kind.replace(/^\w+\./, '')} {String(e.params.type ?? '')}
          </button>
        ))
      ) : (
        <p className="hint">No interactions on this layer yet.</p>
      )}
      <Row>
        <button className="btn" onClick={() => add('click')}>
          + On click
        </button>
        <button className="btn" onClick={() => add('pointerenter')}>
          + On hover
        </button>
      </Row>
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

function LinkCursorSection({ nodes, project }: { nodes: SceneNode[]; project: Project }) {
  const n = nodes[0];
  const set = useSetter(nodes.map((x) => x.id));
  const images = project.assets.filter((a) => assetKind(a.mime, a.name) === 'image');
  const link = n.link;
  return (
    <>
    <Section help="links-cursors#link" title="Link" defaultOpen={!!link}>
      <TextField
        label="Link"
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
        title="The mouse cursor shown while the pointer is over this layer (and its children), like CSS :hover { cursor }"
        value={n.cursor ?? ''}
        options={[{ value: '', label: 'Automatic: pointer if it is a link or clickable' }, ...CURSORS.map((c) => ({ value: c, label: CURSOR_LABELS[c] ?? c }))]}
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

function RepeatSection({ node, project }: { node: SceneNode & { repeat?: Repeat | null; children: SceneNode[] }; project: Project }) {
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
          <TextField label="Items" mono value={rep.items} commitOnBlur placeholder="products" onChange={(v) => update({ items: v })} />
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

/** Fill, showing the timeline's colour at the playhead; a colour change becomes a keyframe while recording. */
function FillSection({ nodes, project }: { nodes: SceneNode[]; project: Project }) {
  const n = nodes[0] as SceneNode & { fill: Paint | null };
  const ids = nodes.map((x) => x.id);
  const set = useSetter(ids);
  const shown = useShown(n);
  const color = shown('fill.color');
  const paint: Paint | null = n.fill?.type === 'solid' && typeof color === 'string' ? { ...n.fill, color } : n.fill;
  return (
    <Section
      help="fill-stroke"
      title="Fill"
      actions={
        n.fill ? (
          <IconButton icon={<Icons.close />} className="remove-btn" title="Remove fill" onClick={() => set({ fill: null })} />
        ) : (
          <IconButton icon={<Icons.plus />} title="Add fill" onClick={() => set({ fill: { type: 'solid', color: '#d9d9d9' } })} />
        )
      }
    >
      <PaintField
        paint={paint}
        project={project}
        onChange={(p) => {
          // Only the colour moved: set fill.color, so recording turns it into a keyframe.
          if (p?.type === 'solid' && n.fill?.type === 'solid') set({ 'fill.color': p.color }, `fill-${ids.join()}`);
          else set({ fill: p }, `fill-${ids.join()}`);
        }}
      />
      {n.fill?.type === 'solid' && <KeyRow node={n} prop="fill.color" />}
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
  );
}

function AutoLayoutSection({ frame }: { frame: FrameNode }) {
  const set = useSetter([frame.id]);
  const L = frame.layout;
  const update = (patch: Partial<AutoLayout>) => set({ layout: { ...(L as AutoLayout), ...patch } }, `layout-${frame.id}`);
  const pad = L?.padding;
  return (
    <Section help="auto-layout" title="Auto layout" defaultOpen={!!L} actions={!L && <IconButton icon={<Icons.plus />} title="Add auto layout" onClick={() => set({ layout: defaultAutoLayout('column') })} />}>
      {L && pad && (
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
            <NumberField label="Gap" value={L.gap} min={0} onChange={(v) => update({ gap: v })} />
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
          <div className="field-label block">Padding (top, right, bottom, left)</div>
          <Row>
            {(['top', 'right', 'bottom', 'left'] as const).map((k) => (
              <NumberField key={k} value={pad[k]} min={0} onChange={(v) => update({ padding: { ...pad, [k]: v } })} />
            ))}
          </Row>
          <Row>
            <CheckField label="Wrap" value={L.wrap} onChange={(v) => update({ wrap: v })} />
            <CheckField label="Hug width" value={L.hugWidth} onChange={(v) => update({ hugWidth: v })} />
            <CheckField label="Hug height" value={L.hugHeight} onChange={(v) => update({ hugHeight: v })} />
          </Row>
          <Row>
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
    <Section help="instances" title="Instance">
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
        <Row>
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
const SHAPE_LABELS: Record<TextModifierShape, string> = { square: 'Square', 'ramp-up': 'Ramp up', 'ramp-down': 'Ramp down', triangle: 'Triangle', round: 'Round', smooth: 'Smooth' };

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
      <Row>
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
];

/** Follow path / copy transform constraints, applied by the player after timelines and bindings. */
function ConstraintsSection({ node }: { node: SceneNode }) {
  const set = useSetter([node.id]);
  const ab = useEditor((st) => getArtboard(st.project, st.activeArtboardId));
  const list = node.constraints ?? [];
  const targets: { value: string; label: string }[] = [];
  if (ab) walk(ab.children, (x) => x.id !== node.id && targets.push({ value: x.id, label: x.name }));
  const update = (i: number, patch: Partial<Constraint>) => set({ constraints: list.map((c, j) => (j === i ? { ...c, ...patch } : c)) }, `constraint-${node.id}-${i}`);
  const add = (type: ConstraintType) =>
    set({ constraints: [...list, { id: uid('k'), type, target: targets[0]?.value ?? '', strength: 1, ...(type === 'followPath' ? { distance: 0, orient: false } : {}) }] });
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
            <SelectField<ConstraintType> label="Type" title={CONSTRAINT_TYPES.find((t) => t.value === c.type)?.tip} value={c.type} options={CONSTRAINT_TYPES} onChange={(v) => update(i, { type: v })} />
            <IconButton icon={<Icons.trash />} title="Remove constraint" onClick={() => set({ constraints: list.filter((_, j) => j !== i) })} />
          </Row>
          <SelectField label="Target" title={c.type === 'followPath' ? 'The shape or path to follow' : 'The layer to copy from'} value={c.target} options={[{ value: '', label: 'Choose a layer…' }, ...targets]} onChange={(v) => update(i, { target: v })} />
          {c.type === 'followPath' && (
            <>
              <Num node={node} ids={[node.id]} prop={`constraints.${i}.distance`} label="Distance" title="How far along the path, 0 (start) to 1 (end). Animate it to move along the path" step={0.01} min={0} max={1} />
              <CheckField label="Orient along path" title="Turn the layer to face along the path" value={!!c.orient} onChange={(v) => update(i, { orient: v })} />
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
          <TextField label="X value" mono title="Expression from 0 to 1. pointer {x, y}, artboard {width, height} and every variable are in scope" value={j.x} commitOnBlur onChange={(v) => update((js) => void (js[i].x = v))} />
          <SelectField label="Y timeline" title="Optional second timeline, positioned by the Y value" value={j.yTimeline ?? ''} options={tls} onChange={(v) => update((js) => void (js[i].yTimeline = v || null))} />
          {j.yTimeline && <TextField label="Y value" mono title="Expression from 0 to 1" value={j.y ?? ''} commitOnBlur onChange={(v) => update((js) => void (js[i].y = v))} />}
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
        <button
          className="link-btn"
          title="Add a circle, two pose timelines, a 0 to 1 variable with a slider, and a blend between the poses. Open Preview and drag the slider"
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
            store().toast('Added an example blend. Open Preview and drag the slider: the ball mixes between the two timelines.');
          }}
        >
          Build an example to try
        </button>
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
