import { Fragment, useContext, useState } from 'react';
import { PropRow } from '../lib/prop-search';
import { ANIMATABLE_PROPS, MEDIA_ATTRIBUTES, animatableProp, layerOwnProps, layerScope, applyConverters, evaluate, instanceInputProps, nodeUniformProps, parseList, type BindingMode, type Converter, type Project, type SceneNode, type Variable } from 'interactives-player';
import { findArtboardOf, isIdentifier } from '../store/doc';
import { previewScope } from '../lib/data';
import { IconButton, Section } from '../components/ui';
import { ConditionField } from '../components/ConditionField';
import { ExprField, ExprLocals } from '../components/ExprField';
import { Icons } from '../components/icons';
import { SearchPicker, type PickerOption } from '../components/SearchPicker';
import { ConvertersEditor } from '../components/Converters';
import { createVariable } from '../lib/quick-add';
import { store } from '../store/store';
import { SectionBlurb } from '../components/SectionBlurb';

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

const CONVERTER_NAME: Record<string, string> = { format: 'Number to text', round: 'Round', invert: 'Invert', range: 'Remap', map: 'Look up', toNumber: 'To number', toText: 'To text', toBoolean: 'To true/false', duration: 'Seconds to m:ss', expr: 'Formula' };

/**
 * What the binding does with the starting values: the variable's value, what each converter turns it into, and what the
 * property ends up as. So "value2 is 1 → Look up: no line for 1, kept 1 → Opacity 1" is visible instead of a surprise.
 */
function trace(expr: string, list: Converter[], variables: Variable[], base: Record<string, unknown>): { steps: string[]; error?: string } {
  if (!expr.trim()) return { steps: [], error: 'Pick a variable (or write a formula) to set this from.' };
  const vars = { ...base, ...Object.fromEntries(variables.map((v) => [v.name, startValue(v)])) };
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

/** Settings that are the layer's bookkeeping rather than something to bind. */
const NOT_BINDABLE = new Set(['id', 'type', 'name', 'locked', 'lockRatio', 'lockScale', 'kit', 'bindings', 'bindingModes', 'converters', 'children', 'paths', 'runs', 'tabOrder', 'className']);
const humanize = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/**
 * Everything on a layer a binding can reach: the animatable properties, a shader's uniforms, an instance's inputs, every
 * other plain setting the layer has (text, true/false or a number: its URL, autoplay, a polygon's sides...), and for a
 * video what it is doing (media.time, media.playing...).
 */
export function bindableProps(node: SceneNode, project: Project): { prop: string; label: string; kind?: string; readOnly?: boolean }[] {
  const out: { prop: string; label: string; kind?: string; readOnly?: boolean }[] = [...ANIMATABLE_PROPS, ...layerOwnProps(node), ...nodeUniformProps(node), ...instanceInputProps(node, project.variables)];
  const have = new Set(out.map((p) => p.prop));
  for (const [k, v] of Object.entries(node)) {
    if (have.has(k) || NOT_BINDABLE.has(k)) continue;
    const kind = typeof v === 'string' ? 'string' : typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : null;
    if (kind) out.push({ prop: k, label: humanize(k), kind });
  }
  for (const m of MEDIA_ATTRIBUTES) if (m.types.includes(node.type)) out.push(m);
  //an input's value is text in the document, but a checkbox holds true/false and a number or slider a number: a new variable for it is made that type
  if (node.type === 'input') {
    const at = out.findIndex((p) => p.prop === 'value');
    const kind = node.inputType === 'checkbox' ? 'boolean' : node.inputType === 'number' || node.inputType === 'range' ? 'number' : 'string';
    if (at >= 0) out[at] = { ...out[at], kind };
  }
  return out;
}

/**
 * Data bindings: each ties one of the layer's properties to a variable. In (the default): the variable (or a formula of
 * variables) sets the property every frame. Out: the property's value goes into the variable as it changes. Both: they're
 * kept equal, whichever changed.
 */
export function BindingsSection({ node, project, set }: { node: SceneNode; project: Project; set: (patch: Record<string, unknown>, coalesce?: string) => void }) {
  //item and index from the Inspector when the layer is in a repeater, with self on top
  const outer = useContext(ExprLocals);
  const bindings = node.bindings ?? {};
  const converters = node.converters ?? {};
  const modes = node.bindingModes ?? {};
  // data, enums, artboard, layer() and self, so a formula that reads them works out in the grey line the way it will play
  const base = { ...previewScope(project, findArtboardOf(project, node.id)), ...outer.values, self: layerScope(node) };
  const entries = Object.entries(bindings);
  const update = (next: Record<string, string>, conv: Record<string, Converter[]> = converters, m: Record<string, BindingMode> = modes) => {
    const keep = Object.fromEntries(Object.entries(conv).filter(([k, list]) => k in next && list.length && (m[k] ?? 'in') === 'in'));
    const keepModes = Object.fromEntries(Object.entries(m).filter(([k, v]) => k in next && v !== 'in'));
    set(
      {
        bindings: Object.keys(next).length ? next : undefined,
        converters: Object.keys(keep).length ? keep : undefined,
        bindingModes: Object.keys(keepModes).length ? keepModes : undefined,
      },
      `bind-${node.id}`,
    );
  };
  const props = bindableProps(node, project);
  const labelOf = (p: string) => props.find((a) => a.prop === p)?.label ?? p;
  const free: PickerOption[] = props.filter((a) => !(a.prop in bindings)).map((a) => ({ value: a.prop, label: a.label, hint: a.prop === a.label.toLowerCase() ? undefined : a.prop }));
  // a read-only attribute (a video's length) can only be written out
  const add = (p: string) => update({ ...bindings, [p]: '' }, converters, props.find((x) => x.prop === p)?.readOnly ? { ...modes, [p]: 'out' } : modes);

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
      {entries.length === 0 && (
        <SectionBlurb text="Nothing is bound yet. A binding ties a property to a variable: in, out or both ways." name="Data bindings" help={['bindings', 'which-way-in-out-or-both']} />
      )}
      <ExprLocals.Provider value={{ ...outer, self: node }}>
      {entries.map(([p, expr], i) => (
        <Fragment key={p}>
          {i > 0 && <hr className="item-sep" />}
          <BindingItem
            prop={p}
            label={labelOf(p)}
            kind={animatableProp(p, node)?.kind ?? props.find((x) => x.prop === p)?.kind}
            readOnly={!!props.find((x) => x.prop === p)?.readOnly}
            mode={modes[p] ?? 'in'}
            dragged={!!node.draggable && node.draggable.enabled !== false && (p === 'x' || p === 'y')}
            onMode={(m) => {
              // out and both name a variable: a formula can't be written into
              const keepExpr = m === 'in' || project.variables.some((v) => v.name === expr.trim());
              update({ ...bindings, [p]: keepExpr ? expr : '' }, converters, { ...modes, [p]: m });
            }}
            expr={expr}
            list={converters[p] ?? []}
            variables={project.variables}
            base={base}
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
      </ExprLocals.Provider>
      {entries.length > 0 && <hr className="item-sep" />}
      <PropRow k="Add binding" words={['bind', 'variable', 'data', 'connect']}>{addPicker(false)}</PropRow>
      {project.variables.some((v) => !isIdentifier(v.name)) && <p className="hint">Some variable names are not valid identifiers and can't be used in formulas.</p>}
    </Section>
  );
}

function BindingItem({
  prop,
  label,
  kind,
  readOnly,
  mode,
  dragged,
  onMode,
  expr,
  list,
  variables,
  base,
  onExpr,
  onConverters,
  onRemove,
}: {
  prop: string;
  label: string;
  kind?: string;
  readOnly: boolean;
  mode: BindingMode;
  /** X or Y of a layer the learner can drag: an In binding then never hears about the drag */
  dragged?: boolean;
  onMode: (m: BindingMode) => void;
  expr: string;
  list: Converter[];
  variables: Variable[];
  base: Record<string, unknown>;
  onExpr: (v: string) => void;
  onConverters: (list: Converter[]) => void;
  onRemove: () => void;
}) {
  const plain = !expr.trim() || variables.some((v) => v.name === expr.trim());
  const [formula, setFormula] = useState(!plain);
  const t = trace(expr, list, variables, base);
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
      <div className="seg binding-dir" role="radiogroup" aria-label={`${label}: which way`}>
        {(
          [
            ['in', '← In', `The variable (or a formula) sets ${label}`],
            ['out', 'Out →', `${label} is written into the variable as it changes`],
            ['both', '⇄ Both', `${label} and the variable are kept equal: change either and the other follows`],
          ] as const
        ).map(([m, text, tip]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            disabled={readOnly && m !== 'out'}
            className={`seg-btn${mode === m ? ' on' : ''}`}
            title={readOnly && m !== 'out' ? `${label} can only be read, so it can only go out to a variable` : tip}
            onClick={() => onMode(m)}
          >
            {text}
          </button>
        ))}
      </div>
      {dragged && mode === 'in' && variables.some((v) => v.name === expr.trim()) && (
        <p className="hint">
          With <b>← In</b> a drag doesn't change <code>{expr.trim()}</code>. Choose{' '}
          <button type="button" className="link-btn" onClick={() => onMode('both')}>
            ⇄ Both
          </button>{' '}
          to keep {label} and it equal.
        </p>
      )}
      {mode !== 'in' ? (
        <SyncedSource label={label} prop={prop} kind={kind} mode={mode} expr={expr} variables={variables} varOptions={varOptions} onExpr={onExpr} />
      ) : (
      <>
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
        {formula && kind === 'boolean' ? (
          // a yes/no property (visible, disabled...) is set by a condition, so it gets the pickers
          <ConditionField label="Condition" value={expr} title="A condition: when it is true the property is on" placeholder="e.g. lives > 0" onChange={onExpr} />
        ) : formula ? (
          <ExprField value={expr} commitOnBlur calc placeholder="e.g. lives > 0" title="A formula of variables; its result sets the property" onChange={onExpr} />
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
            At the start: {t.steps.join(' → ')} → <strong>{label}</strong> is set to {show(lastValue(expr, list, variables, base))}
          </>
        )}
      </div>
      </>
      )}
    </div>
  );
}

/** An out or both-ways binding: the variable it's tied to, and what will happen, in words. */
function SyncedSource({ label, prop, kind, mode, expr, variables, varOptions, onExpr }: { label: string; prop: string; kind?: string; mode: BindingMode; expr: string; variables: Variable[]; varOptions: PickerOption[]; onExpr: (v: string) => void }) {
  const name = expr.trim();
  const v = variables.find((x) => x.name === name);
  return (
    <>
      <div className="binding-source">
        <SearchPicker
          value={name}
          options={varOptions}
          onChange={onExpr}
          placeholder="Choose a variable…"
          searchPlaceholder="Search variables"
          title={mode === 'out' ? `The variable ${label} is written into` : `The variable kept equal to ${label}`}
          actions={[{ label: '+ New variable…', onSelect: () => void createVariable(kind === 'boolean' ? 'boolean' : kind === 'string' ? 'string' : kind === 'color' ? 'color' : 'number', prop.split('.').pop()).then((id) => {
            const nv = id && store().get().project.variables.find((x) => x.id === id);
            if (nv) onExpr(nv.name);
          }) }]}
        />
      </div>
      <div className={`binding-trace${v ? '' : ' err'}`}>
        {!v
          ? 'Pick the variable to tie it to.'
          : mode === 'out'
            ? <>Whenever <strong>{label}</strong> changes, <strong>{v.name}</strong> is set to it. Setting {v.name} doesn't change {label}.</>
            : <>At the start <strong>{label}</strong> takes <strong>{v.name}</strong> ({show(startValue(v))}). After that, change either and the other follows.</>}
      </div>
    </>
  );
}

function lastValue(expr: string, list: Converter[], variables: Variable[], base: Record<string, unknown>): unknown {
  const vars = { ...base, ...Object.fromEntries(variables.map((v) => [v.name, startValue(v)])) };
  try {
    return applyConverters(list, evaluate(expr, { vars }), { vars });
  } catch {
    return undefined;
  }
}
