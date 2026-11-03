import { useState, type ReactNode } from 'react';
import {
  ANIMATABLE_PROPS,
  getPath,
  sampleKeys,
  type Artboard,
  type BlendMode,
  type ColorStop,
  type FitMode,
  type InputKind,
  type Paint,
  type Project,
  type SceneNode,
  type Shadow,
  type Stroke,
  type TextStyle,
} from 'interactives-player';
import { store, useEditor } from '../store/store';
import { getArtboard, isIdentifier, locate } from '../store/doc';
import { CheckField, ColorField, IconButton, NumberField, Row, Section, SelectField, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { assetKind } from '../lib/assets';
import { CodeEditor } from '../components/CodeEditor';

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
  if (s.bottomTab !== 'timeline' || !ANIMATABLE_PROPS.some((a) => a.prop === prop)) return null;
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

function Num({ node, ids, prop, label, step, min, max, suffix }: { node: SceneNode; ids: string[]; prop: string; label: ReactNode; step?: number; min?: number; max?: number; suffix?: string }) {
  const shown = useShown(node);
  const set = useSetter(ids);
  const v = Number(shown(prop) ?? 0);
  return (
    <div className="keyed">
      <NumberField label={label} value={v} step={step} min={min} max={max} suffix={suffix} onChange={(x) => set({ [prop]: x })} onCommit={() => store().commit()} />
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
      <Section title="Artboard">
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
          <IconButton icon={<Icons.trash />} title="Delete artboard" onClick={() => store().deleteArtboard(ab.id)} />
        </Row>
      </Section>
      <Section title="Project">
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
      </Section>
      <Section title="Fonts">
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
      <Section title={single ? <span className="type-chip">{n.type}</span> : `${nodes.length} layers`}>
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
        <SelectField label="Blend" value={n.blendMode ?? 'normal'} options={BLEND} onChange={(v) => set({ blendMode: v })} />
      </Section>
      {sameType && <TypeSection nodes={nodes} project={project} />}
      {sameType && 'fill' in n && (
        <Section title="Fill">
          <PaintField paint={n.fill} project={project} onChange={(p) => set({ fill: p }, `fill-${ids.join()}`)} />
          {n.fill?.type === 'solid' && <KeyRow node={n} prop="fill.color" />}
        </Section>
      )}
      {sameType && 'stroke' in n && <StrokeSection nodes={nodes} project={project} />}
      <EffectsSection nodes={nodes} />
      {single && <BindingsSection node={n} project={project} />}
      {single && <InteractionsSection node={n} ab={ab} />}
      {single && (
        <Section title="Advanced" defaultOpen={false}>
          <TextField label="Cursor" value={n.cursor ?? ''} placeholder="auto (pointer when clickable)" onChange={(v) => set({ cursor: v || undefined })} />
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
  return (
    <Section
      title="Stroke"
      actions={!s && <IconButton icon={<Icons.plus />} title="Add stroke" onClick={() => set({ stroke: { paint: { type: 'solid', color: '#111111' }, width: 1 } })} />}
    >
      {s && (
        <>
          <PaintField paint={s.paint} allowNone={false} project={project} onChange={(p) => set({ stroke: { ...s, paint: p! } }, 'stroke-paint')} />
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
            <IconButton icon={<Icons.trash />} title="Remove stroke" onClick={() => set({ stroke: null })} />
          </Row>
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
  const setShadow = (patch: Partial<Shadow>) => set({ shadow: { ...(sh as Shadow), ...patch } }, 'shadow');
  return (
    <Section
      title="Effects"
      defaultOpen={!!(sh || n.blur)}
      actions={!sh && <IconButton icon={<Icons.plus />} title="Add shadow" onClick={() => set({ shadow: { x: 0, y: 4, blur: 12, spread: 0, color: 'rgba(0, 0, 0, 0.25)' } })} />}
    >
      {sh && (
        <>
          <div className="field-label block">Shadow</div>
          <Row>
            <Num node={n} ids={ids} prop="shadow.x" label="X" />
            <Num node={n} ids={ids} prop="shadow.y" label="Y" />
          </Row>
          <Row>
            <Num node={n} ids={ids} prop="shadow.blur" label="Blur" min={0} />
            <NumberField label="Spread" value={sh.spread} onChange={(v) => setShadow({ spread: v })} />
          </Row>
          <Color node={n} ids={ids} prop="shadow.color" label="Colour" />
          <Row>
            <CheckField label="Inner" value={!!sh.inset} onChange={(v) => setShadow({ inset: v })} />
            <IconButton icon={<Icons.trash />} title="Remove shadow" onClick={() => set({ shadow: null })} />
          </Row>
        </>
      )}
      <Num node={n} ids={ids} prop="blur" label="Layer blur" min={0} />
    </Section>
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
      return <Section title="Rectangle">{radius}</Section>;
    case 'frame':
      return (
        <Section title="Frame">
          {radius}
          <CheckField label="Clip content" value={n.clip} onChange={(v) => set({ clip: v })} />
        </Section>
      );
    case 'polygon':
      return (
        <Section title="Polygon">
          <NumberField label="Sides" value={n.sides} min={3} max={64} onChange={(v) => set({ sides: Math.round(v) })} />
        </Section>
      );
    case 'star':
      return (
        <Section title="Star">
          <NumberField label="Points" value={n.points} min={3} max={64} onChange={(v) => set({ points: Math.round(v) })} />
          <Num node={n} ids={ids} prop="innerRatio" label="Inner" step={0.05} min={0.05} max={1} />
        </Section>
      );
    case 'path':
      return (
        <Section title="Path">
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
        <Section title="Text">
          {nodes.length === 1 && <TextField label="Text" value={n.text} multiline onChange={(v) => set({ text: v }, `text-${n.id}`)} />}
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
          <TextStyleFields nodes={nodes as (SceneNode & TextStyle)[]} project={project} />
          <p className="hint">
            Insert variables with <code>{'{name}'}</code>, or any expression like <code>{'{score * 10}'}</code>.
          </p>
        </Section>
      );
    case 'image':
      return (
        <Section title="Image">
          <SelectField
            label="Image"
            value={n.assetId ?? ''}
            onChange={(v) => set({ assetId: v || null })}
            options={[{ value: '', label: images.length ? 'Choose…' : 'Upload in Assets' }, ...images.map((a) => ({ value: a.id, label: a.name }))]}
          />
          <SelectField label="Fit" value={n.fit} options={['cover', 'contain', 'fill'] as const} onChange={(v) => set({ fit: v })} />
          {radius}
        </Section>
      );
    case 'button':
      return (
        <Section title="Button">
          {nodes.length === 1 && <TextField label="Label" value={n.label} onChange={(v) => set({ label: v }, `label-${n.id}`)} />}
          {radius}
          <CheckField label="Disabled" value={!!n.disabled} onChange={(v) => set({ disabled: v })} />
          <TextStyleFields nodes={nodes as (SceneNode & TextStyle)[]} project={project} />
          <p className="hint">Add a click interaction to make it do something.</p>
        </Section>
      );
    case 'input':
      return (
        <Section title="Input">
          <SelectField<InputKind>
            label="Type"
            value={n.inputType}
            options={['text', 'number', 'email', 'password', 'textarea', 'checkbox', 'range', 'select']}
            onChange={(v) => set({ inputType: v })}
          />
          <SelectField label="Variable" value={n.variableId ?? ''} options={varOptions} onChange={(v) => set({ variableId: v || null })} />
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
        <Section title="Link">
          {nodes.length === 1 && <TextField label="Text" value={n.text} onChange={(v) => set({ text: v }, `text-${n.id}`)} />}
          <TextField label="URL" value={n.href} onChange={(v) => set({ href: v })} />
          <CheckField label="Open in new tab" value={n.newTab} onChange={(v) => set({ newTab: v })} />
          <TextStyleFields nodes={nodes as (SceneNode & TextStyle)[]} project={project} />
        </Section>
      );
    case 'embed':
      return (
        <Section title="Embed">
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
        <Section title="Video">
          <SelectField
            label="Video"
            value={n.assetId ?? ''}
            onChange={(v) => set({ assetId: v || null })}
            options={[{ value: '', label: 'Use a URL' }, ...videos.map((a) => ({ value: a.id, label: a.name }))]}
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
    case 'group':
      return (
        <Section title="Group">
          <p className="hint">Double-click to select inside. Ctrl/⌘-click selects deep layers directly.</p>
        </Section>
      );
    default:
      return null;
  }
}

function BindingsSection({ node, project }: { node: SceneNode; project: Project }) {
  const set = useSetter([node.id]);
  const bindings = node.bindings ?? {};
  const entries = Object.entries(bindings);
  const [prop, setProp] = useState('opacity');
  const update = (next: Record<string, string>) => set({ bindings: Object.keys(next).length ? next : undefined }, `bind-${node.id}`);
  return (
    <Section title="Data bindings" defaultOpen={entries.length > 0}>
      {entries.map(([p, expr]) => (
        <Row key={p} className="binding-row">
          <span className="mono small binding-prop">{p}</span>
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
      ))}
      <Row>
        <SelectField value={prop} options={ANIMATABLE_PROPS.map((a) => ({ value: a.prop, label: a.label }))} onChange={setProp} />
        <button className="btn" disabled={prop in bindings} onClick={() => update({ ...bindings, [prop]: project.variables[0]?.name ?? '' })}>
          Bind
        </button>
      </Row>
      <p className="hint">
        A binding sets the property from variables every frame, e.g. <code>visible</code> ← <code>lives &gt; 0</code>, <code>width</code> ← <code>progress * 3</code>.
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
    <Section title="Interactions" defaultOpen>
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
