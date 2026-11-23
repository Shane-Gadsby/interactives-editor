import type { ReactNode } from 'react';
import { uid, walk, type Artboard, type Draggable, type DropZone, type Project, type SceneNode, type ZoneGroup, variableLabelAndName } from 'interactives-player';
import { store } from '../store/store';
import { CheckField, IconButton, NumberField, Row, Section, SelectField, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { usePrefs } from '../lib/prefs';
import { addVariableOption, withQuickAdd } from '../lib/quick-add';
import { ExprField } from '../components/ExprField';

/** Tags as people type them: words separated by commas. */
const tagsText = (tags?: string[]) => (tags ?? []).join(', ');
const parseTags = (text: string) => [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))];

/** A draggable's own values as lines of `name: value`, and back (numbers and true/false come back as themselves). */
const dataText = (data?: Draggable['data']) => Object.entries(data ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n');
function parseData(text: string): Draggable['data'] {
  const out: NonNullable<Draggable['data']> = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Za-z_$][\w$]*)\s*[:=]\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    const raw = m[2];
    out[m[1]] = raw === 'true' ? true : raw === 'false' ? false : raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw;
  }
  return Object.keys(out).length ? out : undefined;
}

/** The names of the number values the page's draggables carry, for what a zone or group counts. */
function numberKeys(ab: Artboard): string[] {
  const keys = new Set<string>();
  walk(ab.children, (n) => {
    for (const [k, v] of Object.entries(n.draggable?.data ?? {})) if (typeof v === 'number') keys.add(k);
  });
  return [...keys];
}

/** Layers, or one of those values: what a capacity counts. The one set now stays in the list even when no layer has it yet. */
const countOptions = (ab: Artboard, current?: string) => [{ value: '', label: 'layers' }, ...[...new Set([...numberKeys(ab), ...(current ? [current] : [])])].map((k) => ({ value: k, label: k }))];

/** Change the artboard's zone groups. */
const setGroups = (abId: string, change: (list: ZoneGroup[]) => void) =>
  store().update((d) => {
    const a = d.artboards.find((x) => x.id === abId);
    if (!a) return;
    const list = a.zoneGroups ?? [];
    change(list);
    if (list.length) a.zoneGroups = list;
    else delete a.zoneGroups;
  });

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
  if (repeated.has(n.id)) return 'Layers made by a repeater cannot be dragged this way (every copy would move). Tick Reorder by dragging, or Takes items from, on the repeater instead.';
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
  { value: 'fill', label: 'Fill the zone (take its size and corners)' },
];

/** The drop zones on the page, id to name. */
function zoneNames(ab: Artboard): Map<string, string> {
  const out = new Map<string, string>();
  walk(ab.children, (x) => void (x.dropZone && out.set(x.id, x.name)));
  return out;
}

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
          <TextField
            label="Only these zones"
            title="The drop zones this layer may go in, by name, separated by commas, whatever their tags say: a piece that may move within its column but not out of it. Empty: any zone that takes its tags"
            value={(d!.onlyZones ?? []).map((id) => zoneNames(ab).get(id) ?? id).join(', ')}
            placeholder="Any zone"
            commitOnBlur
            onChange={(v) => {
              const byName = new Map([...zoneNames(ab)].map(([id, name]) => [name.toLowerCase(), id]));
              set({ onlyZones: parseTags(v).map((t) => byName.get(t.toLowerCase()) ?? t) });
            }}
          />
          <TextField
            label="Its own values"
            title="Values of its own, one a line as name: value (units: 2, code: MSC6100). A zone or zone group can count a number one instead of layers, a zone's Takes it when reads item.data.units, and sum('Year 1', 'units') adds them up in any formula"
            value={dataText(d!.data)}
            placeholder={'units: 2\ncode: MSC6100'}
            multiline
            mono
            rows={2}
            commitOnBlur
            onChange={(v) => set({ data: parseData(v) })}
          />
          <CheckField label="Stays behind when picked up" title="Keeps its place in the stack while it is held, instead of coming up over everything else on the page" value={!!d!.stayBehind} onChange={(v) => set({ stayBehind: v ? true : undefined })} />
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
            <NumberField label="Holds" title="How many layers fit in the zone, or how much of a value they carry (units). 0 is no limit" value={z!.capacity ?? 0} min={0} onChange={(v) => set({ capacity: v > 0 ? (z!.capacityBy ? v : Math.round(v)) : undefined })} />
            <SelectField<string>
              title="What Holds counts: layers, or one of the values the draggable layers carry (their Its own values), added up. A layer without that value counts as 1"
              label="of"
              value={z!.capacityBy ?? ''}
              options={countOptions(ab, z!.capacityBy)}
              onChange={(v) => set({ capacityBy: v || undefined })}
            />
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
          <ExprField
            label="Takes it when"
            title="A formula that has to be true for the zone to take a layer: item.name, item.tags, item.data (its own values), zone.name, zone.count, zone.total (what Holds counts, without the held layer), zone.groups. Give a text instead of false and that text is the reason, read out and handed to On refused. Zones that would take what is held are the ones marked as places it could go"
            value={z!.acceptsWhen ?? ''}
            placeholder='e.g. zone.count < 3 || "This trimester is full"'
            locals={['item', 'zone']}
            commitOnBlur
            onChange={(v) => set({ acceptsWhen: v.trim() || undefined })}
          />
          <CheckField
            label="Arrange what it holds"
            title="Lays the layers in the zone out in rows that wrap, in the order they came, and grows or shrinks the zone to fit them. A list of cards that closes up when one is taken out"
            value={!!z!.arrange}
            onChange={(v) => set({ arrange: v ? { gap: 8 } : undefined })}
          />
          {z!.arrange && (
            <Row>
              <NumberField label="Gap" title="Space between the layers and round the edge" suffix="px" value={z!.arrange.gap} min={0} onChange={(v) => set({ arrange: { ...z!.arrange!, gap: Math.max(0, v) } }, `zone-gap-${ids.join(',')}`)} />
              <NumberField label="Least rows" title="The rows an empty zone keeps room for, so there is still somewhere to drop" value={z!.arrange.minRows ?? 1} min={0} onChange={(v) => set({ arrange: { ...z!.arrange!, minRows: Math.max(0, Math.round(v)) } })} />
              <SelectField<'arrival' | 'name'>
                label="Order"
                value={z!.arrange.order ?? 'arrival'}
                options={[
                  { value: 'arrival', label: 'As they came' },
                  { value: 'name', label: 'By name' },
                ]}
                onChange={(v) => set({ arrange: { ...z!.arrange!, order: v === 'arrival' ? undefined : v } })}
              />
              <CheckField label="Fit its height" title="The zone grows and shrinks with what it holds" value={z!.arrange.hug !== false} onChange={(v) => set({ arrange: { ...z!.arrange!, hug: v ? undefined : false } })} />
            </Row>
          )}
          <ZoneGroupsField ab={ab} groups={z!.groups ?? []} set={(groups) => set({ groups })} />
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

/**
 * The page's zone groups, with this zone's own in them ticked. A group is shared by its zones, so its name, limit and words
 * are edited here from any of them.
 */
function ZoneGroupsField({ ab, groups, set }: { ab: Artboard; groups: string[]; set: (groups: string[]) => void }) {
  const list = ab.zoneGroups ?? [];
  const edit = (id: string, patch: Partial<ZoneGroup>) =>
    setGroups(ab.id, (l) => {
      const g = l.find((x) => x.id === id);
      if (!g) return;
      Object.assign(g, patch);
      for (const k of Object.keys(patch) as (keyof ZoneGroup)[]) if (g[k] === undefined) delete g[k];
    });
  const add = () => {
    const id = uid('zg');
    let n = list.length + 1;
    while (list.some((g) => g.name === `Group ${n}`)) n++;
    setGroups(ab.id, (l) => void l.push({ id, name: `Group ${n}` }));
    set([...groups, id]);
  };
  return (
    <div className="zone-groups">
      <div className="small">Zone groups</div>
      {list.map((g) => {
        const inIt = groups.includes(g.id);
        const members = (() => {
          let c = 0;
          walk(ab.children, (n) => void (n.dropZone?.groups?.includes(g.id) && c++));
          return c;
        })();
        return (
          <div key={g.id} className="zone-group">
            <CheckField
              label={`${g.name} (${members} ${members === 1 ? 'zone' : 'zones'})`}
              title={`Count this zone in ${g.name}: a drop that would take the group over its limit is refused`}
              value={inIt}
              onChange={(v) => set(v ? [...groups, g.id] : groups.filter((x) => x !== g.id))}
            />
            {inIt && (
              <div className="zone-group-edit">
                <TextField label="Name" title="What it's called in formulas (count('Year 1'), sum('Year 1', 'units')) and in what the learner hears" value={g.name} commitOnBlur onChange={(v) => v.trim() && edit(g.id, { name: v.trim() })} />
                <Row>
                  <NumberField label="Holds" title="The most the zones in the group hold between them: layers, or the total of a value. 0 is no limit (it's still there to count)" value={g.capacity ?? 0} min={0} onChange={(v) => edit(g.id, { capacity: v > 0 ? v : undefined })} />
                  <SelectField<string> label="of" title="What the group counts: layers, or one of the draggables' own values added up" value={g.capacityBy ?? ''} options={countOptions(ab, g.capacityBy)} onChange={(v) => edit(g.id, { capacityBy: v || undefined })} />
                </Row>
                <TextField
                  label="When full, say"
                  title="What the learner hears when a drop would take the group over. {name}, {capacity} and {total} are filled in"
                  value={g.fullText ?? ''}
                  placeholder="{name} is full."
                  commitOnBlur
                  onChange={(v) => edit(g.id, { fullText: v.trim() || undefined })}
                />
                <button className="link-btn small" onClick={() => setGroups(ab.id, (l) => void l.splice(l.findIndex((x) => x.id === g.id), 1))} title={`Delete ${g.name} from the page. Its zones stay as they are`}>
                  Delete this group
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button className="btn small" onClick={add} title="A new group of zones counted together (a year of trimesters, a shelf), with this zone in it">
        + New zone group
      </button>
    </div>
  );
}
