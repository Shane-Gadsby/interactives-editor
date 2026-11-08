import {
  LAYER_ROLES,
  a11yContext,
  isActivatable,
  isNativeControl,
  isTabStop,
  nodeTypeLabel,
  tabStops,
  walk,
  type Artboard,
  type LayerRole,
  type SceneNode,
} from 'interactives-player';
import { store } from '../store/store';
import { IconButton, NumberField, Row, Section, SelectField, TextField } from '../components/ui';
import { usePrefs } from '../lib/prefs';

type RoleChoice = '' | LayerRole | 'decorative';
type TabChoice = 'auto' | 'yes' | 'no';

const roleOf = (n: SceneNode): RoleChoice => (n.decorative ? 'decorative' : n.role ?? '');

/** Why a layer is in the Tab sequence, in words. */
function why(n: SceneNode, ab: Artboard): string {
  const cx = a11yContext(ab);
  if (isNativeControl(n)) return n.type === 'link' || n.link ? 'link' : n.type;
  if (n.focusable === true) return 'set to always';
  if (cx.clicks.has(n.id)) return 'On pointer click';
  if (n.draggable && n.draggable.enabled !== false) return 'draggable';
  if (n.role === 'button' || n.role === 'checkbox') return `${n.role} role`;
  if (cx.focus.has(n.id)) return 'On focus';
  return '';
}

/**
 * The layer's Accessibility section: what it is to assistive technology (role, text alternative, description, hidden when
 * purely visual) and whether keyboards can reach it. The fields are plain layer properties; what they do while playing
 * depends on the Accessibility preference.
 */
export function AccessibilitySection({ nodes, ab }: { nodes: SceneNode[]; ab: Artboard }) {
  const n = nodes[0];
  const ids = nodes.map((x) => x.id);
  const single = nodes.length === 1;
  const set = (props: Record<string, unknown>, coalesce?: string) => store().setProps(ids, props, coalesce ?? `a11y-${Object.keys(props).join(',')}-${ids.join(',')}`);
  const native = nodes.every(isNativeControl);
  const someNative = nodes.some(isNativeControl);
  const on = usePrefs().accessibility;
  const cx = a11yContext(ab);
  const role = roleOf(n);
  const stop = single && isTabStop(n, cx);
  const tab: TabChoice = n.focusable === true ? 'yes' : n.focusable === false ? 'no' : 'auto';
  const open = !!(n.role || n.decorative || n.ariaDescription || n.ariaLabel || n.sayAs || n.focusable !== undefined || (single && stop));
  const nameHint = n.type === 'image' || n.type === 'video' || n.type === 'draw' || n.type === 'shader' || n.type === 'chart' ? 'Describe what it shows' : n.type === 'progress' ? 'What it measures, e.g. "Course progress"' : 'What it is or does, e.g. "Next question"';
  return (
    <Section help="accessibility" title="Accessibility" defaultOpen={open}>
      {!native && (
        <SelectField<RoleChoice>
          label="Role"
          title="What this layer is to a screen reader. Button and checkbox also make it a tab stop that Enter and Space click. Decorative hides it from assistive technology"
          value={someNative ? '' : role}
          options={[
            { value: '', label: 'None (plain shape)' },
            ...LAYER_ROLES.map((r) => ({ value: r.value as RoleChoice, label: r.label })),
            { value: 'decorative', label: 'Decorative (hidden from screen readers)' },
          ]}
          onChange={(v) => set({ role: v && v !== 'decorative' ? v : undefined, decorative: v === 'decorative' ? true : undefined })}
        />
      )}
      {native && <div className="muted small">A real control: it already takes the keyboard and has its own role.</div>}
      {role !== 'decorative' && single && (
        <TextField
          label="Text alternative"
          title="The name a screen reader announces: an image's alt text, or what a clickable shape does"
          value={n.ariaLabel ?? ''}
          placeholder={nameHint}
          commitOnBlur
          onChange={(v) => set({ ariaLabel: v || undefined })}
        />
      )}
      {role !== 'decorative' && single && (
        <TextField
          label="Description"
          title="A longer explanation read after the name (aria-description)"
          value={n.ariaDescription ?? ''}
          placeholder="Optional: how to use it, or what to notice"
          multiline
          rows={2}
          commitOnBlur
          onChange={(v) => set({ ariaDescription: v || undefined })}
        />
      )}
      {role !== 'decorative' && single && (
        <TextField
          label="Say it like"
          title="Read aloud (the Listen button and the Read aloud node) says this for the layer instead of its text. For an abbreviation, a formula, a name or a mixed-language phrase a voice gets wrong. Empty: the layer's own text is read"
          value={n.sayAs ?? ''}
          placeholder="Optional: how a voice should say it"
          multiline
          rows={2}
          commitOnBlur
          onChange={(v) => set({ sayAs: v || undefined })}
        />
      )}
      {role === 'heading' && (
        <NumberField label="Level" title="Heading level, 1 (page title) to 6" value={n.headingLevel ?? 2} min={1} max={6} onChange={(v) => set({ headingLevel: Math.min(6, Math.max(1, Math.round(v))) })} />
      )}
      {role === 'checkbox' && <div className="muted small">Bind “Checked (checkbox role)” in Data bindings to the variable that holds the state.</div>}
      {!native && role !== 'decorative' && (
        <SelectField<TabChoice>
          label="Tab stop"
          title="Can a keyboard reach this layer with Tab? Automatic: yes when it has an On pointer click, On focus or a button or checkbox role"
          value={someNative ? 'auto' : tab}
          options={[
            { value: 'auto', label: 'Automatic' },
            { value: 'yes', label: 'Always' },
            { value: 'no', label: 'Never' },
          ]}
          onChange={(v) => set({ focusable: v === 'auto' ? undefined : v === 'yes' })}
        />
      )}
      {single && !native && role !== 'decorative' && (
        <div className="muted small">
          {stop ? `Reachable with Tab (${why(n, ab)}).${isActivatable(n, cx) ? ' Enter and Space click it.' : ''}` : 'Not reachable with Tab.'}
          {!on && ' Accessibility is off in your preferences, so Preview ignores this.'}
        </div>
      )}
      {single && role === 'decorative' && (n.link || cx.clicks.has(n.id)) && <div className="muted small">It has a click, but decorative layers are skipped by Tab and screen readers. Pick another role if people need to use it.</div>}
    </Section>
  );
}

/** The artboard's Tab sequence: the layers a keyboard visits, in order, with arrows to change it. */
export function TabOrderSection({ ab }: { ab: Artboard }) {
  const stops = tabStops(ab);
  const explicit = stops.some((n) => typeof n.tabOrder === 'number');
  // Writing the whole sequence as numbers keeps it unambiguous: moving one layer never leaves two with the same place
  const reorder = (from: number, to: number) => {
    const ids = stops.map((n) => n.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    store().update((d) => {
      const a = d.artboards.find((x) => x.id === ab.id);
      if (!a) return;
      walk(a.children as SceneNode[], (n) => {
        const i = ids.indexOf(n.id);
        if (i >= 0) n.tabOrder = i + 1;
      });
    });
  };
  const reset = () =>
    store().update((d) => {
      const a = d.artboards.find((x) => x.id === ab.id);
      if (a) walk(a.children as SceneNode[], (n) => void delete n.tabOrder);
    });
  if (!stops.length) return null;
  return (
    <Section help="accessibility#tab-order" title="Tab order" defaultOpen={explicit || stops.length > 1}>
      <div className="muted small">The order Tab visits these layers. By default it follows the layer order.</div>
      <ol className="tab-order">
        {stops.map((n, i) => (
          <li key={n.id}>
            <button className="tab-order-name" title="Select this layer" onClick={() => store().select([n.id])}>
              <span className="muted">{i + 1}.</span> {n.name} <span className="muted small">{nodeTypeLabel(n.type)}{why(n, ab) ? `, ${why(n, ab)}` : ''}</span>
            </button>
            <IconButton icon={<span aria-hidden="true">↑</span>} title="Earlier in the Tab order" disabled={i === 0} onClick={() => reorder(i, i - 1)} />
            <IconButton icon={<span aria-hidden="true">↓</span>} title="Later in the Tab order" disabled={i === stops.length - 1} onClick={() => reorder(i, i + 1)} />
          </li>
        ))}
      </ol>
      {explicit && (
        <Row>
          <button className="btn" onClick={reset} title="Go back to following the layer order">
            Reset to layer order
          </button>
        </Row>
      )}
    </Section>
  );
}
