import { Fragment, useState } from 'react';
import { ANIMATABLE_PROPS, animatableProp, applyConverters, evaluate, instanceInputProps, nodeUniformProps, parseList, type Converter, type Project, type SceneNode, type Variable } from 'interactives-player';
import { isIdentifier } from '../store/doc';
import { IconButton, Section, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { SearchPicker, type PickerOption } from '../components/SearchPicker';
import { ConvertersEditor } from '../components/Converters';
import { createVariable } from '../lib/quick-add';
import { store } from '../store/store';

/** What a variable holds at the start, as a binding would see it (list variables are arrays). */
function startValue(v: Variable): unknown {
  return v.type === 'list' ? parseList(v.initial) : v.initial;
}

const show = (v: unknown): string => {
  if (v === undefined) return 'nothing';
  if (typeof v === 'string') return `“${v}”`;
  if (Array.isArray(v)) return `a list of ${v.length}`;
  if (v !== null && typeof v === 'object') return 'an object';
  return String(v);
};

const CONVERTER_NAME: Record<string, string> = { format: 'Number to text', round: 'Round', invert: 'Invert', range: 'Remap', map: 'Look up', toNumber: 'To number', toText: 'To text', toBoolean: 'To true/false', expr: 'Formula' };

/**
 * What the binding does with the starting values: the variable's value, what each converter turns it into, and what the
 * property ends up as. So "value2 is 1 → Look up: no line for 1, kept 1 → Opacity 1" is visible instead of a surprise.
 */
function trace(expr: string, list: Converter[], variables: Variable[]): { steps: string[]; error?: string } {
  if (!expr.trim()) return { steps: [], error: 'Pick a variable (or write a formula) to set this from.' };
  const vars = Object.fromEntries(variables.map((v) => [v.name, startValue(v)]));
  let value: unknown;
  try {
    value = evaluate(expr, { vars });
  } catch (err) {
    return { steps: [], error: err instanceof Error ? err.message : String(err) };
  }
  const steps = [`${isIdentifier(expr.trim()) ? expr.trim() : 'the formula'} is ${show(value)}`];
  list.forEach((c) => {
    const next = applyConverters([c], value, { vars });
    const name = CONVERTER_NAME[c.type] ?? c.type;
    steps.push(c.type === 'map' && next === value ? `${name}: no line for ${show(value)}, so it stays ${show(next)}` : `${name} → ${show(next)}`);
    value = next;
  });
  return { steps };
}

/** Data bindings: each one sets a property from a variable (or a formula of variables) every frame. */
export function BindingsSection({ node, project, set }: { node: SceneNode; project: Project; set: (patch: Record<string, unknown>, coalesce?: string) => void }) {
  const bindings = node.bindings ?? {};
  const converters = node.converters ?? {};
  const entries = Object.entries(bindings);
  const update = (next: Record<string, string>, conv: Record<string, Converter[]> = converters) => {
    const keep = Object.fromEntries(Object.entries(conv).filter(([k, list]) => k in next && list.length));
    set({ bindings: Object.keys(next).length ? next : undefined, converters: Object.keys(keep).length ? keep : undefined }, `bind-${node.id}`);
  };
  const props = [...ANIMATABLE_PROPS, ...nodeUniformProps(node), ...instanceInputProps(node, project.variables)];
  const labelOf = (p: string) => props.find((a) => a.prop === p)?.label ?? p;
  const free: PickerOption[] = props.filter((a) => !(a.prop in bindings)).map((a) => ({ value: a.prop, label: a.label, hint: a.prop === a.label.toLowerCase() ? undefined : a.prop }));
  const add = (p: string) => update({ ...bindings, [p]: '' });

  const addPicker = (compact: boolean) => (
    <SearchPicker
      value=""
      options={free}
      onChange={add}
      buttonLabel={compact ? <Icons.plus /> : '+ Add binding'}
      className={compact ? 'icon-picker' : 'add-binding'}
      title="Add a binding: pick the property a variable should set"
      searchPlaceholder="Search properties (opacity, text, x…)"
    />
  );

  return (
    <Section help="bindings" title="Data bindings" defaultOpen={entries.length > 0} actions={addPicker(true)}>
      {entries.length === 0 && <p className="hint">Nothing is bound yet. A binding sets a property from a variable every frame, e.g. visible ← lives &gt; 0, or the text ← score.</p>}
      {entries.map(([p, expr], i) => (
        <Fragment key={p}>
          {i > 0 && <hr className="item-sep" />}
          <BindingItem
            prop={p}
            label={labelOf(p)}
            kind={animatableProp(p, node)?.kind}
            expr={expr}
            list={converters[p] ?? []}
            variables={project.variables}
            onExpr={(v) => update({ ...bindings, [p]: v })}
            onConverters={(list) => update(bindings, { ...converters, [p]: list })}
            onRemove={() => {
              const next = { ...bindings };
              delete next[p];
              update(next);
            }}
          />
        </Fragment>
      ))}
      {entries.length > 0 && <hr className="item-sep" />}
      {addPicker(false)}
      {project.variables.some((v) => !isIdentifier(v.name)) && <p className="hint">Some variable names are not valid identifiers and can't be used in formulas.</p>}
    </Section>
  );
}

function BindingItem({
  prop,
  label,
  kind,
  expr,
  list,
  variables,
  onExpr,
  onConverters,
  onRemove,
}: {
  prop: string;
  label: string;
  kind?: string;
  expr: string;
  list: Converter[];
  variables: Variable[];
  onExpr: (v: string) => void;
  onConverters: (list: Converter[]) => void;
  onRemove: () => void;
}) {
  const plain = !expr.trim() || variables.some((v) => v.name === expr.trim());
  const [formula, setFormula] = useState(!plain);
  const t = trace(expr, list, variables);
  const varOptions: PickerOption[] = variables.filter((v) => isIdentifier(v.name)).map((v) => ({ value: v.name, label: v.name, hint: v.type }));
  return (
    <div className="binding">
      <div className="binding-head">
        <strong>{label}</strong>
        <span className="mono small muted" title={`Property path${kind ? ` (${kind})` : ''}`}>
          {prop}
        </span>
        <span className="spacer" />
        <IconButton icon={<Icons.trash />} title={`Remove the ${label} binding`} onClick={onRemove} />
      </div>
      <div className="binding-source">
        <div className="seg" role="radiogroup" aria-label={`${label}: set from`}>
          <button type="button" role="radio" aria-checked={!formula} className={`seg-btn${!formula ? ' on' : ''}`} title="Set it straight from one variable" onClick={() => {
            setFormula(false);
            if (!variables.some((v) => v.name === expr.trim())) onExpr('');
          }}>
            Variable
          </button>
          <button type="button" role="radio" aria-checked={formula} className={`seg-btn${formula ? ' on' : ''}`} title="Work it out from variables, e.g. lives > 0, or progress * 3" onClick={() => setFormula(true)}>
            Formula
          </button>
        </div>
        {formula ? (
          <TextField value={expr} mono commitOnBlur placeholder="e.g. lives > 0" title="A formula of variables; its result sets the property" onChange={onExpr} />
        ) : (
          <SearchPicker
            value={expr.trim()}
            options={varOptions}
            onChange={onExpr}
            placeholder="Choose a variable…"
            searchPlaceholder="Search variables"
            title="The variable that sets this property"
            actions={[{ label: '+ New variable…', onSelect: () => void createVariable(kind === 'boolean' ? 'boolean' : kind === 'string' ? 'string' : kind === 'color' ? 'color' : 'number', prop.split('.').pop()).then((id) => {
              const v = id && store().get().project.variables.find((x) => x.id === id);
              if (v) onExpr(v.name);
            }) }]}
          />
        )}
      </div>
      <ConvertersEditor list={list} expr={expr} variables={variables} onChange={onConverters} />
      <div className={`binding-trace${t.error ? ' err' : ''}`} title="Worked out with every variable at its starting value">
        {t.error ? t.error : (
          <>
            At the start: {t.steps.join(' → ')} → <strong>{label}</strong> is set to {show(lastValue(expr, list, variables))}
          </>
        )}
      </div>
    </div>
  );
}

function lastValue(expr: string, list: Converter[], variables: Variable[]): unknown {
  const vars = Object.fromEntries(variables.map((v) => [v.name, startValue(v)]));
  try {
    return applyConverters(list, evaluate(expr, { vars }), { vars });
  } catch {
    return undefined;
  }
}
