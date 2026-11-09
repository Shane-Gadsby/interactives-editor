import { a11yContext, isTabStop, walk, type Artboard, type Dialog, type FrameNode, type KeyNav, type Project, type SceneNode } from 'interactives-player';
import { store } from '../store/store';
import { CheckField, ColorField, NumberField, Row, Section, SelectField } from '../components/ui';
import { addVariableOption, withQuickAdd } from '../lib/quick-add';
import { SectionBlurb } from '../components/SectionBlurb';

type Container = (SceneNode & { type: 'frame' | 'group'; children: SceneNode[] }) | FrameNode;

const NONE = '';

/** The layers inside a frame a keyboard can reach: what Initial focus can pick. */
function tabStopsIn(frame: FrameNode, ab: Artboard): SceneNode[] {
  const cx = a11yContext(ab);
  const out: SceneNode[] = [];
  walk(frame.children, (n) => {
    if (isTabStop(n, cx)) out.push(n);
  });
  return out;
}

/**
 * A frame set up as a dialog: announced as one, Tab stays inside it, Escape closes it, focus goes in and comes back. Saved on
 * the frame as `dialog`; unticking Dialog removes it.
 */
export function DialogSection({ node, ab, project }: { node: FrameNode; ab: Artboard; project: Project }) {
  const d = node.dialog;
  const ids = [node.id];
  const write = (next: Dialog | null) => store().setProps(ids, { dialog: next }, `dialog-${node.id}`);
  const update = (patch: Partial<Dialog>) => {
    const merged = { ...(d ?? {}), ...patch } as Record<string, unknown>;
    for (const k of Object.keys(merged)) if (merged[k] === undefined || merged[k] === null || merged[k] === '') delete merged[k];
    write(merged as Dialog);
  };
  const stops = d ? tabStopsIn(node, ab) : [];
  const scrim = d?.scrim && d.scrim.type === 'solid' ? d.scrim : null;
  const vars = project.variables.filter((v) => v.type === 'boolean' || v.type === 'number' || v.type === 'string');
  return (
    <Section help="accessibility#dialogs" title="Dialog" defaultOpen={!!d}>
      <CheckField
        label="This frame is a dialog"
        title="Announced as a dialog (aria-modal when modal). Focus goes in when it shows and back to what opened it when it hides, Tab stays inside it, and Escape closes it. It is open while the frame is visible"
        value={!!d}
        onChange={(on) => write(on ? {} : null)}
      />
      {d && (
        <>
          <CheckField
            label="Modal"
            title="Everything behind it is out of reach while it is open: Tab stays inside, and clicks on the rest of the artboard are ignored"
            value={d.modal !== false}
            onChange={(v) => update({ modal: v ? undefined : false })}
          />
          <CheckField label="Close on Escape" title="Escape closes the dialog" value={d.closeOnEscape !== false} onChange={(v) => update({ closeOnEscape: v ? undefined : false })} />
          {d.modal !== false && (
            <CheckField
              label="Close on click outside"
              title="A click on the artboard behind the dialog closes it, instead of being ignored"
              value={!!d.closeOnOutsideClick}
              onChange={(v) => update({ closeOnOutsideClick: v ? true : undefined })}
            />
          )}
          <CheckField label="Return focus" title="When it closes, focus goes back to the layer that had it when the dialog opened" value={d.returnFocus !== false} onChange={(v) => update({ returnFocus: v ? undefined : false })} />
          <SelectField
            label="Initial focus"
            title="The layer that takes focus when the dialog opens. Automatic: the first tab stop inside it, or the dialog itself when it has none"
            value={d.initialFocus ?? NONE}
            options={[{ value: NONE, label: 'Automatic (first tab stop)' }, ...stops.map((s) => ({ value: s.id, label: s.name }))]}
            onChange={(v) => update({ initialFocus: v || undefined })}
          />
          <SelectField
            label="Open variable"
            title="A variable that holds whether the dialog is open. While the frame's Visible is not bound, the dialog shows when the variable is on (true, not 0, not empty), and Escape turns it off. With none, Escape hides the frame"
            value={d.openVariable ?? NONE}
            options={[{ value: NONE, label: 'None' }, ...vars.map((v) => ({ value: v.id, label: `${v.name} (${v.type})` })), addVariableOption()]}
            onChange={withQuickAdd((v) => update({ openVariable: v || undefined }), { variableType: 'boolean', variableName: `${node.name.replace(/\W+/g, '')}Open` || 'dialogOpen' })}
          />
          <Row>
            <CheckField
              label="Scrim"
              title="A colour painted over the rest of the artboard behind the dialog while it is open"
              value={!!d.scrim}
              onChange={(on) => update({ scrim: on ? { type: 'solid', color: '#000000', opacity: 0.5 } : undefined })}
            />
          </Row>
          {d.scrim && scrim && (
            <Row>
              <ColorField tokens label="Colour" value={scrim.color} onChange={(c) => update({ scrim: { ...scrim, color: c } })} onCommit={() => store().commit()} />
              <NumberField
                label="Opacity"
                title="How strong the scrim is, as a percent"
                value={scrim.opacity ?? 1}
                scale={100}
                suffix="%"
                step={5}
                min={0}
                max={100}
                onChange={(v) => update({ scrim: { ...scrim, opacity: Math.min(1, Math.max(0, v)) } })}
              />
            </Row>
          )}
          {d.scrim && !scrim && <div className="muted small">The scrim is not a plain colour; it will use its first colour.</div>}
          {!node.ariaLabel && <div className="error small">Give the dialog a Text alternative (Accessibility section): it is what a screen reader calls the dialog.</div>}
          {!node.bindings?.visible && !d.openVariable && node.visible && <div className="muted small">It shows from the start. Hide it, or bind Visible or an Open variable, then show it from an interaction.</div>}
        </>
      )}
    </Section>
  );
}

/**
 * Arrow-key navigation for a repeater or container: one item is the Tab stop and the arrows move between the rest. Saved on the
 * layer as `keyNav`.
 */
export function KeyNavSection({ node, project }: { node: Container; project: Project }) {
  const k = node.keyNav;
  const ids = [node.id];
  const write = (next: KeyNav | null) => store().setProps(ids, { keyNav: next }, `keynav-${node.id}`);
  const update = (patch: Partial<KeyNav>) => {
    const merged = { ...(k ?? { mode: 'list' }), ...patch } as Record<string, unknown>;
    for (const key of Object.keys(merged)) if (merged[key] === undefined || merged[key] === null || merged[key] === '') delete merged[key];
    write(merged as unknown as KeyNav);
  };
  const rep = node.repeat?.items?.trim() ? node.repeat : null;
  const numberVars = project.variables.filter((v) => v.type === 'number');
  const gridRepeater = !!rep && rep.layout === 'grid';
  return (
    <Section help="accessibility#keyboard-navigation" title="Keyboard navigation" defaultOpen={!!k}>
      <CheckField
        label="Arrow keys move between the items"
        title="One item is the Tab stop and the arrow keys, Home and End move between the copies of a repeater, or the layers inside a container. Keys typed into a text box are left alone, and an On key event you wired for an arrow still wins"
        value={!!k}
        onChange={(on) => write(on ? { mode: rep?.layout === 'grid' ? 'grid' : 'list' } : null)}
      />
      {k && (
        <>
          <SelectField<KeyNav['mode']>
            label="Mode"
            title="List: one axis. Grid: rows and columns. Radio buttons: a group where moving also selects (the item's click runs and aria-checked follows)"
            value={k.mode}
            options={[
              { value: 'list', label: 'List (one direction)' },
              { value: 'grid', label: 'Grid (rows and columns)' },
              { value: 'radio', label: 'Radio buttons (moving selects)' },
            ]}
            onChange={(v) => update({ mode: v })}
          />
          {k.mode !== 'grid' && (
            <SelectField<NonNullable<KeyNav['orientation']> | ''>
              label="Arrows"
              title="Which arrow keys move. Automatic: Up and Down, or Left and Right for a repeater laid out as a row (radio buttons take all four)"
              value={k.orientation ?? ''}
              options={[
                { value: '', label: 'Automatic' },
                { value: 'vertical', label: 'Up and Down' },
                { value: 'horizontal', label: 'Left and Right' },
                { value: 'both', label: 'All four' },
              ]}
              onChange={(v) => update({ orientation: v || undefined })}
            />
          )}
          {k.mode === 'grid' && !gridRepeater && (
            <NumberField label="Columns" title="How many items are in a row. A repeater laid out as a grid uses its own column count" value={k.columns ?? 1} min={1} onChange={(v) => update({ columns: Math.max(1, Math.round(v)) })} />
          )}
          {k.mode === 'grid' && gridRepeater && <div className="muted small">Uses the repeater's {rep!.columns} columns{rep!.direction === 'columns' ? ', filled down each column' : ''}.</div>}
          {k.mode !== 'radio' && (
            <CheckField label="Wrap round" title="Past the last item goes to the first (in a grid, round the row or column)" value={!!k.wrap} onChange={(v) => update({ wrap: v ? true : undefined })} />
          )}
          <SelectField
            label="Focused item"
            title="A number variable that holds the focused item's place, from 0. Events on the items (On focus, On pointer click, On key) also get it as event.index. Setting it moves the Tab stop"
            value={k.indexVariable ?? NONE}
            options={[{ value: NONE, label: 'None' }, ...numberVars.map((v) => ({ value: v.id, label: v.name })), addVariableOption()]}
            onChange={withQuickAdd((v) => update({ indexVariable: v || undefined }), { variableType: 'number', variableName: `${node.name.replace(/\W+/g, '')}Focus` || 'focusedItem' })}
          />
          <CheckField
            label="Count hidden items"
            title="Every copy keeps its number even when it is hidden (a square whose Visible is bound to false), so the numbers do not shift. A hidden item is never focused, and in a grid the arrows step over it to the next shown item in the row or column"
            value={!!k.countHidden}
            onChange={(v) => update({ countHidden: v ? true : undefined })}
          />
          {k.mode === 'radio' && <SectionBlurb text="Moving to an item clicks it, so the flows that choose an option run." name="Keyboard navigation" help={['accessibility', 'keyboard-navigation']} />}
          {!rep && <div className="muted small">The items are this {node.type}'s layers that a keyboard can reach.</div>}
        </>
      )}
    </Section>
  );
}
