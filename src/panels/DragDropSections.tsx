import type { ReactNode } from 'react';
import { walk, type Artboard, type Draggable, type DropZone, type Project, type SceneNode, variableLabelAndName } from 'interactives-player';
import { store } from '../store/store';
import { CheckField, IconButton, NumberField, Row, Section, SelectField, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { usePrefs } from '../lib/prefs';
import { addVariableOption, withQuickAdd } from '../lib/quick-add';

/** Tags as people type them: words separated by commas. */
const tagsText = (tags?: string[]) => (tags ?? []).join(', ');
const parseTags = (text: string) => [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))];

/** Settings with the empty ones left out, so a layer only carries what was changed. */
function tidy<T extends object>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && !(Array.isArray(v) && !v.length)) out[k] = v;
  return out as T;
}

/** What is wrong with where a draggable layer sits, if anything. */
function placement(n: SceneNode, ab: Artboard): string | null {
  // A repeater copies its first child, so that child (and what is in it) cannot be dragged
  const repeated = new Set<string>();
  let parent: SceneNode | null = null;
  walk(ab.children, (x, up) => {
    if (x.id === n.id) parent = up;
    const c = x as SceneNode & { repeat?: { items?: string } | null; children?: SceneNode[] };
    if (c.repeat?.items?.trim() && c.children?.length) walk([c.children[0]], (t) => void repeated.add(t.id));
  });
  if (repeated.has(n.id)) return 'Layers made by a repeater cannot be dragged (every copy would move). Use a layer outside the repeater instead.';
  const p = parent as SceneNode | null;
  if (p && p.type === 'frame' && p.layout && n.layoutItem?.position !== 'ignore') return 'This layer sits in an auto layout flow, which puts it back where it belongs. Set its Position (Layout section) to Ignore to drag it.';
  return null;
}

/** Is a drop zone drawn over a draggable layer next to it, which would stop the layer being picked up there? */
function zoneOverItems(n: SceneNode, ab: Artboard): boolean {
  let bad = false;
  const scan = (nodes: SceneNode[]) => {
    const zone = nodes.findIndex((x) => x.id === n.id);
    if (zone >= 0) bad = nodes.slice(0, zone).some((x) => x.draggable && x.draggable.enabled !== false);
    for (const x of nodes) if ('children' in x) scan((x as SceneNode & { children: SceneNode[] }).children);
  };
  scan(ab.children);
  return bad;
}

type Choice<T extends string> = { value: T; label: string }[];

const AXES: Choice<NonNullable<Draggable['axis']>> = [
  { value: 'both', label: 'Anywhere' },
  { value: 'x', label: 'Left and right only' },
  { value: 'y', label: 'Up and down only' },
];
const MISS: Choice<NonNullable<Draggable['onMiss']>> = [
  { value: 'stay', label: 'Stays where it was let go' },
  { value: 'return', label: 'Goes back to where it started' },
];
const HIT: Choice<NonNullable<Draggable['hit']>> = [
  { value: 'center', label: 'The layer’s centre' },
  { value: 'pointer', label: 'The pointer' },
  { value: 'overlap', label: 'Whichever zone it overlaps most' },
];
const TAP: Choice<'auto' | 'on' | 'off'> = [
  { value: 'auto', label: 'Automatic (off if it has a click)' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];
const FULL: Choice<NonNullable<DropZone['whenFull']>> = [
  { value: 'reject', label: 'Refuse the new layer' },
  { value: 'swap', label: 'Swap with the layer that is there' },
];
const SNAP: Choice<NonNullable<DropZone['snap']>> = [
  { value: 'none', label: 'Stay where it was dropped' },
  { value: 'center', label: 'Centre in the zone' },
  { value: 'topLeft', label: 'Top left corner of the zone' },
];

function layersOf(ab: Artboard, except: string[]): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  walk(ab.children, (x) => {
    if (!except.includes(x.id)) out.push({ value: x.id, label: x.name });
  });
  return out;
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="hint">{children}</p>;
}

/**
 * The Draggable and Drop zone sections. A layer can be one, the other, or both (a tile that can be dropped on and moved
 * again). What they do is described in the Drag and drop help topic.
 */
export function DragDropSections({ nodes, ab, project }: { nodes: SceneNode[]; ab: Artboard; project: Project }) {
  return (
    <>
      <DraggableSection nodes={nodes} ab={ab} project={project} />
      <DropZoneSection nodes={nodes} ab={ab} project={project} />
    </>
  );
}

function DraggableSection({ nodes, ab, project }: { nodes: SceneNode[]; ab: Artboard; project: Project }) {
  const n = nodes[0];
  const ids = nodes.map((x) => x.id);
  const d = n.draggable;
  const single = nodes.length === 1;
  const accessibility = usePrefs().accessibility;
  const set = (patch: Partial<Draggable>, coalesce?: string) => store().setProps(ids, { draggable: tidy({ ...(d ?? {}), ...patch }) }, coalesce ?? `drag-${Object.keys(patch).join(',')}-${ids.join(',')}`);
  const on = !!d;
  const textVars = project.variables.filter((v) => v.type === 'string' || v.type === 'enum');
  const warn = single && d ? placement(n, ab) : null;
  const tap: 'auto' | 'on' | 'off' = d?.tapToMove === undefined ? 'auto' : d.tapToMove ? 'on' : 'off';
  return (
    <Section
      help="drag-and-drop"
      title="Draggable"
      defaultOpen={on}
      actions={
        on ? (
          <IconButton icon={<Icons.trash />} title="Stop this layer being draggable" onClick={() => store().setProps(ids, { draggable: undefined })} />
        ) : (
          <IconButton icon={<Icons.plus />} title="Let people drag this layer (mouse, touch and keyboard)" onClick={() => store().setProps(ids, { draggable: {} })} />
        )
      }
    >
      {!on && <div className="muted small">Not draggable. The + lets people drag it with the mouse or a finger, and move it with the keyboard.</div>}
      {on && (
        <>
          <CheckField label="Can be dragged" title="Untick to lock the layer (an Allow dragging node does this while the project runs)" value={d!.enabled !== false} onChange={(v) => set({ enabled: v ? undefined : false })} />
          <TextField
            label="Tags"
            title="Words that say what this layer is, separated by commas, e.g. fruit, red. A drop zone takes the layer when they share a tag"
            value={tagsText(d!.tags)}
            placeholder="e.g. mammal, warm-blooded"
            commitOnBlur
            onChange={(v) => set({ tags: parseTags(v) })}
          />
          <SelectField<NonNullable<Draggable['axis']>> label="Moves" title="Lock the movement to one direction (a slider handle, a sorting lane)" value={d!.axis ?? 'both'} options={AXES} onChange={(v) => set({ axis: v === 'both' ? undefined : v })} />
          <SelectField
            label="Stays inside"
            title="Keep the layer inside its parent, the artboard or another layer while it is dragged"
            value={d!.bounds ?? 'none'}
            options={[{ value: 'none', label: 'Nothing (anywhere)' }, { value: 'parent', label: 'Its parent' }, { value: 'artboard', label: 'The artboard' }, ...layersOf(ab, ids).map((l) => ({ value: l.value, label: `Layer: ${l.label}` }))]}
            onChange={(v) => set({ bounds: v === 'none' ? undefined : v })}
          />
          <SelectField<NonNullable<Draggable['onMiss']>>
            label="Dropped off a zone"
            title="What happens when it is let go where no zone takes it (no zone there, the wrong tag, or full)"
            value={d!.onMiss ?? 'stay'}
            options={MISS}
            onChange={(v) => set({ onMiss: v === 'stay' ? undefined : v })}
          />
          <SelectField<NonNullable<Draggable['hit']>>
            label="Zone decided by"
            title="Which spot is tested against the drop zones when the layer is let go"
            value={d!.hit ?? 'center'}
            options={HIT}
            onChange={(v) => set({ hit: v === 'center' ? undefined : v })}
          />
          <Row>
            <NumberField label="Grid" title="Snap the position to a grid of this many pixels while dragging. 0 is off" value={d!.grid ?? 0} min={0} onChange={(v) => set({ grid: v > 0 ? v : undefined })} />
            <NumberField label="Glide" title="How long the layer glides into a zone or back, in ms (no gliding when the viewer asked for less motion)" suffix="ms" value={d!.glideMs ?? 180} min={0} step={20} onChange={(v) => set({ glideMs: v === 180 ? undefined : v })} />
          </Row>
          <SelectField<'auto' | 'on' | 'off'>
            label="Tap to move"
            title="Tapping the layer picks it up and tapping a drop zone puts it there: a way to do it without dragging. Automatic turns it off for a layer that has an On pointer click event"
            value={tap}
            options={TAP}
            onChange={(v) => set({ tapToMove: v === 'auto' ? undefined : v === 'on' })}
          />
          <CheckField label="Hold to drag on touch" title="On a touch screen the finger must rest a moment before the layer follows it, so a scrolling frame can still be scrolled by swiping from the layer" value={!!d!.holdToDrag} onChange={(v) => set({ holdToDrag: v ? true : undefined })} />
          <NumberField label="Key step" title="How far an arrow key nudges the layer when it has no drop zone to go to (Shift: five times as far, Alt: a tenth)" suffix="px" value={d!.step ?? 10} min={1} onChange={(v) => set({ step: v === 10 ? undefined : v })} />
          {single && (
            <>
              <TextField
                label="Name read out"
                title="The name a screen reader says when the layer is picked up and dropped. Empty uses the text alternative, then the layer name"
                value={d!.label ?? ''}
                placeholder={n.ariaLabel || n.name}
                commitOnBlur
                onChange={(v) => set({ label: v.trim() || undefined })}
              />
              <SelectField
                label="Zone variable"
                title="A text variable that holds the name of the drop zone this layer is in (empty when it is in none). Read it for scoring, or show it"
                value={d!.zoneVariable ?? ''}
                options={[{ value: '', label: 'None' }, ...textVars.map((v) => ({ value: v.id, label: variableLabelAndName(v) })), addVariableOption()]}
                onChange={withQuickAdd((v) => set({ zoneVariable: v || undefined }), { variableType: 'string', variableName: `${n.name.replace(/\W+/g, '')}Zone` || 'zone' })}
              />
            </>
          )}
          <CheckField label="Do not announce" title="Screen readers are told when the layer is picked up, moved and dropped. Tick this to say it yourself with Announce nodes" value={!!d!.silent} onChange={(v) => set({ silent: v ? true : undefined })} />
          {warn && <div className="drag-warn small">{warn}</div>}
          <Hint>
            Space or Enter picks it up from the keyboard, the arrow keys choose a drop zone and Space drops it. Dragging changes the layer’s X and Y, so do not animate those at the same time.
            {!accessibility && ' Accessibility is off in your preferences, so Preview does not do the keyboard, tap or announcements.'}
          </Hint>
        </>
      )}
    </Section>
  );
}

function DropZoneSection({ nodes, ab, project }: { nodes: SceneNode[]; ab: Artboard; project: Project }) {
  const n = nodes[0];
  const ids = nodes.map((x) => x.id);
  const z = n.dropZone;
  const single = nodes.length === 1;
  const set = (patch: Partial<DropZone>, coalesce?: string) => store().setProps(ids, { dropZone: tidy({ ...(z ?? {}), ...patch }) }, coalesce ?? `zone-${Object.keys(patch).join(',')}-${ids.join(',')}`);
  const on = !!z;
  const listVars = project.variables.filter((v) => v.type === 'list');
  return (
    <Section
      help="drag-and-drop#drop-zones"
      title="Drop zone"
      defaultOpen={on}
      actions={
        on ? (
          <IconButton icon={<Icons.trash />} title="Stop this layer being a drop zone" onClick={() => store().setProps(ids, { dropZone: undefined })} />
        ) : (
          <IconButton icon={<Icons.plus />} title="Make this layer a place draggable layers can be dropped" onClick={() => store().setProps(ids, { dropZone: {} })} />
        )
      }
    >
      {!on && <div className="muted small">Not a drop zone. The + makes this layer a place draggable layers can be dropped.</div>}
      {on && (
        <>
          <CheckField label="Takes layers" title="Untick to close the zone (an Allow dragging node does this while the project runs)" value={z!.enabled !== false} onChange={(v) => set({ enabled: v ? undefined : false })} />
          <TextField
            label="Takes tags"
            title="The tags of the draggable layers it takes, separated by commas. Empty takes any draggable layer"
            value={tagsText(z!.accepts)}
            placeholder="Any layer"
            commitOnBlur
            onChange={(v) => set({ accepts: parseTags(v) })}
          />
          <Row>
            <NumberField label="Holds" title="How many layers fit in the zone. 0 is no limit" value={z!.capacity ?? 0} min={0} onChange={(v) => set({ capacity: v > 0 ? Math.round(v) : undefined })} />
          </Row>
          {(z!.capacity ?? 0) > 0 && (
            <SelectField<NonNullable<DropZone['whenFull']>>
              label="When full"
              title="Swap sends the layer that has been there longest back to where the new one came from"
              value={z!.whenFull ?? 'reject'}
              options={FULL}
              onChange={(v) => set({ whenFull: v === 'reject' ? undefined : v })}
            />
          )}
          <SelectField<NonNullable<DropZone['snap']>> label="Dropped layers" title="Where a layer settles once the zone takes it. Layers sent by the keyboard go to the centre when this is left alone" value={z!.snap ?? 'none'} options={SNAP} onChange={(v) => set({ snap: v === 'none' ? undefined : v })} />
          <CheckField label="Outline when a layer is over it" title="Draws an outline round the zone while a layer it takes is over it (and a fainter one while something is being dragged). Untick if the artwork shows it already" value={z!.highlight !== false} onChange={(v) => set({ highlight: v ? undefined : false })} />
          {single && (
            <>
              <TextField
                label="Name read out"
                title="The name a screen reader says for the zone. Empty uses the text alternative, then the layer name"
                value={z!.label ?? ''}
                placeholder={n.ariaLabel || n.name}
                commitOnBlur
                onChange={(v) => set({ label: v.trim() || undefined })}
              />
              <SelectField
                label="Contents variable"
                title="A list variable that holds the names of the layers in the zone, oldest first. Check it for scoring"
                value={z!.contentsVariable ?? ''}
                options={[{ value: '', label: 'None' }, ...listVars.map((v) => ({ value: v.id, label: variableLabelAndName(v) })), addVariableOption()]}
                onChange={withQuickAdd((v) => set({ contentsVariable: v || undefined }), { variableType: 'list', variableName: `${n.name.replace(/\W+/g, '')}Contents` || 'contents' })}
              />
            </>
          )}
          {single && zoneOverItems(n, ab) && <div className="drag-warn small">This zone is drawn over draggable layers, so they cannot be picked up where they overlap it. Move it behind them.</div>}
          <Hint>Layers go in the zone when their centre is over it (change this on the draggable layer). Put zones behind the layers that go in them.</Hint>
        </>
      )}
    </Section>
  );
}
