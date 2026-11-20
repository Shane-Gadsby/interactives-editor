import { variableLabelAndName, type Project, type SceneNode, type SketchPad } from 'interactives-player';
import { store } from '../store/store';
import { CheckField, ColorField, IconButton, NumberField, Section, SelectField } from '../components/ui';
import { Icons } from '../components/icons';
import { addVariableOption, withQuickAdd } from '../lib/quick-add';

/** A rectangle people draw on as it plays: where the strokes are kept, and the pen, each part fixed or read from a variable. */
export function SketchSection({ node, project }: { node: Extract<SceneNode, { type: 'rect' }>; project: Project }) {
  const k = node.sketch;
  const on = !!k;
  const set = (patch: Partial<SketchPad>, coalesce?: string) => {
    const next: Record<string, unknown> = { ...(k ?? {}), ...patch };
    for (const key of Object.keys(next)) if (next[key] === undefined || next[key] === '') delete next[key];
    store().setProps([node.id], { sketch: next as SketchPad }, coalesce ?? `sketch-${Object.keys(patch).join(',')}-${node.id}`);
  };
  const vars = (type: string) => project.variables.filter((v) => v.type === type);
  const pick = (type: string) => [{ value: '', label: 'None' }, ...vars(type).map((v) => ({ value: v.id, label: variableLabelAndName(v) })), addVariableOption()];
  const base = node.name.replace(/\W+/g, '') || 'sketch';
  return (
    <Section
      help="sketch-pads"
      title="Sketch pad"
      defaultOpen={on}
      actions={
        on ? (
          <IconButton icon={<Icons.trash />} title="Stop people drawing on this rectangle" onClick={() => store().setProps([node.id], { sketch: undefined })} />
        ) : (
          <IconButton icon={<Icons.plus />} title="Let people draw on this rectangle as it plays" onClick={() => store().setProps([node.id], { sketch: {} })} />
        )
      }
    >
      {!on && <div className="muted small">Not a sketch pad. The + lets people draw on this rectangle as it plays.</div>}
      {on && (
        <>
          <SelectField
            label="Strokes kept in"
            title="A list variable that holds the drawing, so user data saves it and a reset clears it. Without one, the drawing lasts as long as the page"
            value={k!.variable ?? ''}
            options={pick('list')}
            onChange={withQuickAdd((v) => set({ variable: v || undefined }), { variableType: 'list', variableName: `${base}Strokes` })}
          />
          <ColorField label="Colour" value={k!.colour ?? '#1d2433'} onChange={(v) => set({ colour: v }, `sketch-colour-${node.id}`)} />
          <SelectField
            label="Colour from"
            title="A text variable holding the pen's colour, for a palette of buttons that set it. Wins over Colour while it holds one"
            value={k!.colourVariable ?? ''}
            options={pick('string')}
            onChange={withQuickAdd((v) => set({ colourVariable: v || undefined }), { variableType: 'string', variableName: 'penColour' })}
          />
          <NumberField label="Size" suffix="px" value={k!.size ?? 4} min={0.5} max={200} onChange={(v) => set({ size: Math.min(200, Math.max(0.5, v)) }, `sketch-size-${node.id}`)} />
          <SelectField
            label="Size from"
            title="A number variable holding the pen's width, for a slider. Wins over Size while it is above 0"
            value={k!.sizeVariable ?? ''}
            options={pick('number')}
            onChange={withQuickAdd((v) => set({ sizeVariable: v || undefined }), { variableType: 'number', variableName: 'penSize' })}
          />
          <SelectField
            label="Eraser when"
            title="A variable that turns the pen into an eraser while it is true, or holds the text eraser"
            value={k!.eraserVariable ?? ''}
            options={[{ value: '', label: 'None' }, ...[...vars('boolean'), ...vars('string'), ...vars('enum')].map((v) => ({ value: v.id, label: variableLabelAndName(v) })), addVariableOption()]}
            onChange={withQuickAdd((v) => set({ eraserVariable: v || undefined }), { variableType: 'boolean', variableName: 'erasing' })}
          />
          <CheckField label="Pressure" title="A stylus draws thinner or thicker with how hard it presses. A mouse or a finger always draws at the pen's size" value={k!.pressure !== false} onChange={(v) => set({ pressure: v ? undefined : false })} />
        </>
      )}
    </Section>
  );
}
