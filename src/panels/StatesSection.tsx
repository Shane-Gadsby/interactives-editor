import { STATE_LABELS, uid, type LayerState, type SceneNode } from 'interactives-player';
import { store } from '../store/store';
import { ColorField, IconButton, NumberField, Row, Section, SelectField, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { SectionBlurb } from '../components/SectionBlurb';
import { ExprField } from '../components/ExprField';

/**
 * A layer's states: the looks it takes on when it's hovered, pressed, focused, disabled, or whenever an expression is true.
 * One row per state, each holding the handful of properties it changes, so nobody writes the same ternary into five bindings.
 */
export function StatesSection({ node }: { node: SceneNode }) {
  const states = node.states ?? [];
  const setStates = (f: (list: LayerState[]) => void, coalesce?: string) =>
    store().update(
      (d) => {
        const n = findNode(d.artboards.flatMap((a) => a.children), node.id);
        if (!n) return;
        n.states ??= [];
        f(n.states);
        if (!n.states.length) delete n.states;
      },
      coalesce ? { coalesce } : undefined,
    );

  return (
    <Section id="states" help="layer-states" title="States" defaultOpen={states.length > 0}>
      <SectionBlurb text="Looks this layer takes on: hovered, pressed, right, wrong, picked. One place, not five bindings." name="States" help={['layer-states']} />
      {states.map((st, i) => (
        <div className="state-row" key={st.id}>
          <Row>
            <SelectField
              label="When"
              title="What turns this look on"
              value={st.when}
              options={(['hover', 'pressed', 'focus', 'disabled', 'expr'] as const).map((w) => ({ value: w, label: STATE_LABELS[w] }))}
              onChange={(w) => setStates((list) => void (list[i].when = w))}
            />
            <IconButton icon={<Icons.chevronUp />} title="Move up" disabled={i === 0} onClick={() => setStates((list) => void list.splice(i - 1, 0, list.splice(i, 1)[0]))} />
            <IconButton icon={<Icons.chevronDown />} title="Move down" disabled={i === states.length - 1} onClick={() => setStates((list) => void list.splice(i + 1, 0, list.splice(i, 1)[0]))} />
            <IconButton icon={<Icons.trash />} title="Remove this state" onClick={() => setStates((list) => void list.splice(i, 1))} />
          </Row>
          {st.when === 'expr' && (
            <>
              <TextField
                label="Name"
                title="What to call this state, so the list reads as it should"
                value={st.name ?? ''}
                placeholder="Correct"
                onChange={(v) => setStates((list) => (v.trim() ? (list[i].name = v) : delete list[i].name), `state-name-${st.id}`)}
              />
              <ExprField
                label="While"
                title="The state is on while this is true, for example item.state == &quot;right&quot;"
                value={st.expr ?? ''}
                onChange={(v) => setStates((list) => void (list[i].expr = v), `state-expr-${st.id}`)}
              />
            </>
          )}
          <StateProps state={st} onChange={(props) => setStates((list) => void (list[i].props = props), `state-props-${st.id}`)} />
        </div>
      ))}
      <Row k="Add state" words={['hover', 'pressed', 'focus', 'disabled', 'correct', 'wrong', 'selected', 'picked']}>
        <button className="btn" onClick={() => setStates((list) => void list.push({ id: uid('st'), when: 'hover', props: {} }))}>
          Add a state
        </button>
      </Row>
    </Section>
  );
}

/** The handful of properties a state changes: a fixed, useful set rather than every property there is. */
const SLOTS: { prop: string; label: string; kind: 'colour' | 'number'; title: string }[] = [
  { prop: 'fill.color', label: 'Fill', kind: 'colour', title: 'The fill colour in this state' },
  { prop: 'stroke.paint.color', label: 'Line', kind: 'colour', title: 'The stroke colour in this state' },
  { prop: 'color', label: 'Text', kind: 'colour', title: 'The text colour in this state' },
  { prop: 'opacity', label: 'Opacity', kind: 'number', title: 'How see-through it is in this state, 0 to 1' },
  { prop: 'scaleX', label: 'Scale W', kind: 'number', title: 'Width scale in this state, 1 is its own size' },
  { prop: 'scaleY', label: 'Scale H', kind: 'number', title: 'Height scale in this state, 1 is its own size' },
  { prop: 'cornerRadius', label: 'Radius', kind: 'number', title: 'Corner radius in this state' },
];

function StateProps({ state, onChange }: { state: LayerState; onChange: (props: Record<string, unknown>) => void }) {
  const props = state.props ?? {};
  const put = (prop: string, value: unknown) => {
    const next = { ...props };
    if (value === undefined || value === '') delete next[prop];
    else next[prop] = value;
    onChange(next);
  };
  return (
    <>
      {SLOTS.map((sl) =>
        sl.kind === 'colour' ? (
          <Row key={sl.prop}>
            <ColorField label={sl.label} title={sl.title} tokens value={props[sl.prop] === undefined ? '' : String(props[sl.prop])} onChange={(v) => put(sl.prop, v)} />
            {props[sl.prop] !== undefined && <IconButton icon={<Icons.close />} title={`Leave ${sl.label.toLowerCase()} alone in this state`} onClick={() => put(sl.prop, undefined)} />}
          </Row>
        ) : props[sl.prop] === undefined ? null : (
          <Row key={sl.prop}>
            <NumberField label={sl.label} title={sl.title} value={Number(props[sl.prop])} onChange={(v) => put(sl.prop, v)} />
            <IconButton icon={<Icons.close />} title={`Leave ${sl.label.toLowerCase()} alone in this state`} onClick={() => put(sl.prop, undefined)} />
          </Row>
        ),
      )}
      <SelectField
        label="Also change"
        title="Another property this state changes"
        value=""
        options={[
          { value: '', label: 'Choose…' },
          ...SLOTS.filter((sl) => sl.kind === 'number' && props[sl.prop] === undefined).map((sl) => ({ value: sl.prop, label: sl.label })),
        ]}
        onChange={(prop) => prop && put(prop, prop === 'opacity' ? 1 : prop.startsWith('scale') ? 1 : 0)}
      />
    </>
  );
}

function findNode(list: SceneNode[], id: string): SceneNode | null {
  for (const n of list) {
    if (n.id === id) return n;
    if ('children' in n && Array.isArray(n.children)) {
      const hit = findNode(n.children as SceneNode[], id);
      if (hit) return hit;
    }
  }
  return null;
}
