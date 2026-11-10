import { useEffect, useMemo, useState } from 'react';
import { LOCAL_SCOPE_HINTS, PLAYER_SCOPE_HINTS, type SceneNode } from 'interactives-player';
import { maybeStore } from '../store/store';
import { previewScope } from '../lib/data';
import { CALC_KINDS, CMP_LABELS, CMP_ORDER, MAX_PARTS, MAX_PLACES, calcComplete, calcToExpr, kindOf, parseCalc, type Calc, type Cmp, type JoinPart } from '../lib/calculation';
import type { Operand } from '../lib/condition';
import { ConditionField } from './ConditionField';
import { FormulaStatusLine, useFormulaStatus } from './ExprField';
import { SearchPicker, type PickerOption } from './SearchPicker';
import { IconButton } from './ui';
import { Icons } from './icons';

/**
 * "Pick a calculation" for a value formula: a menu of plain templates (add, a percentage, how many items match, a total, round, this if
 * that otherwise the other, join text), each filled in with pickers, writing ordinary formula text when "Use this calculation" is
 * pressed. A formula it can't read is left alone (and says so): nothing is written until the button is pressed. The model and the
 * text it writes are in lib/calculation.ts.
 */

type Kind = 'num' | 'str' | 'bool' | 'name';
const KIND_LABEL: Record<Kind, string> = { num: 'a number', str: 'a piece of text', bool: 'on or off', name: 'another value' };

const NAME = /^[A-Za-z_$][\w$]*$/;

const blank = (k: Kind): Operand => (k === 'num' ? { t: 'num', value: 0 } : k === 'str' ? { t: 'str', value: '' } : k === 'bool' ? { t: 'bool', value: true } : { t: 'name', name: '' });

export function CalculationPicker({ value, names, self, values, onUse }: { value: string; names: string[]; self?: SceneNode; values?: Record<string, unknown>; onUse: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [calc, setCalc] = useState<Calc | null>(null);
  //the formula that was there when the picker opened and could not be read, so it can say what choosing will do
  const [unread, setUnread] = useState(false);
  const project = maybeStore()?.get().project;
  const variables = project?.variables ?? [];

  const options = useMemo<PickerOption[]>(() => {
    const out: PickerOption[] = variables.filter((v) => NAME.test(v.name)).map((v) => ({ value: v.name, label: v.name, hint: v.type === 'boolean' ? 'on/off' : v.type }));
    for (const d of project?.dataSources ?? []) out.push({ value: d.name, label: d.name, hint: 'data' });
    for (const l of names) out.push({ value: l, label: l, hint: LOCAL_SCOPE_HINTS[l]?.type });
    for (const [n, h] of Object.entries(PLAYER_SCOPE_HINTS)) if (h.type !== 'function' && h.type !== 'object') out.push({ value: n, label: n, hint: h.type });
    return out;
  }, [variables, project?.dataSources, names]);
  const listOptions = useMemo<PickerOption[]>(
    () => [
      ...variables.filter((v) => v.type === 'list' && NAME.test(v.name)).map((v) => ({ value: v.name, label: v.name, hint: 'list' })),
      ...(project?.dataSources ?? []).map((d) => ({ value: d.name, label: d.name, hint: 'data' })),
    ],
    [variables, project?.dataSources],
  );
  const withCurrent = (list: PickerOption[], current: string): PickerOption[] => (current && !list.some((o) => o.value === current) ? [{ value: current, label: current }, ...list] : list);

  const listName = calc && (calc.t === 'count' || calc.t === 'sum') ? calc.list : '';
  //worked out once per list, not on every keystroke: it builds the whole preview scope
  const listFields = useMemo(() => (open && listName ? fieldNames(listName) : []), [open, listName]);
  const formula = calc && calcComplete(calc) ? calcToExpr(calc) : '';
  const status = useFormulaStatus(formula, names, self, false, values);

  useEffect(() => {
    if (!open) return;
    const c = parseCalc(value);
    setCalc(c);
    setUnread(!c && value.trim() !== '');
    // only when it opens: later typing in the field does not move the picker under your hands
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open)
    return (
      <div className="calc-open">
        <button type="button" className="link-btn" title="Build a sum, a percentage, a count or a rounded number from pickers. It writes the formula for you" aria-expanded={false} onClick={() => setOpen(true)}>
          Pick a calculation
        </button>
      </div>
    );

  const firstNumber = variables.find((v) => v.type === 'number' && NAME.test(v.name))?.name ?? '';
  const firstList = listOptions[0]?.value ?? '';
  const kind = calc ? kindOf(calc) : '';
  const choose = (key: string) => {
    const k = CALC_KINDS.find((x) => x.key === key);
    if (k) setCalc(k.start(firstNumber, firstList));
  };

  return (
    <div className="calc" role="group" aria-label="Pick a calculation">
      <label className="calc-kind">
        <span className="field-label">Calculation</span>
        <select value={kind} onChange={(e) => choose(e.target.value)} aria-label="Which calculation">
          {!calc && <option value="">Choose a calculation…</option>}
          {CALC_KINDS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      {unread && !calc && <p className="hint">This formula is more than the pickers can show, so it stays as it is. Choosing a calculation here replaces it, and only when you press Use this calculation.</p>}
      {calc && <Editor calc={calc} onChange={setCalc} options={options} listOptions={listOptions} withCurrent={withCurrent} listFields={listFields} names={names} />}
      {calc && (formula ? (
        <>
          <p className="calc-formula">
            It writes <code>{formula}</code>
          </p>
          <FormulaStatusLine status={status} />
        </>
      ) : (
        <p className="hint">Fill in each box to use it.</p>
      ))}
      <div className="cond-actions">
        <button
          type="button"
          className="btn small"
          disabled={!formula}
          onClick={() => {
            onUse(formula);
            setOpen(false);
          }}
        >
          Use this calculation
        </button>
        <button type="button" className="link-btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );

  //the fields the first item of a list has, for the Field box to offer
  function fieldNames(list: string): string[] {
    try {
      const st = maybeStore()?.get();
      const board = st?.project.artboards.find((a) => a.id === st.activeArtboardId) ?? st?.project.artboards[0];
      const v = st && board ? previewScope(st.project, board)[list] : undefined;
      const first = Array.isArray(v) ? v[0] : undefined;
      return first && typeof first === 'object' && !Array.isArray(first) ? Object.keys(first as object).filter((k) => NAME.test(k)) : [];
    } catch {
      return [];
    }
  }
}

interface EditorProps {
  calc: Calc;
  onChange: (c: Calc) => void;
  options: PickerOption[];
  listOptions: PickerOption[];
  withCurrent: (list: PickerOption[], current: string) => PickerOption[];
  listFields: string[];
  names: string[];
}

function Editor({ calc, onChange, options, listOptions, withCurrent, listFields, names }: EditorProps) {
  const val = (label: string, o: Operand, set: (o: Operand) => void, kinds: Kind[]) => <OperandField label={label} operand={o} kinds={kinds} options={options} withCurrent={withCurrent} onChange={set} />;
  const NUMBERISH: Kind[] = ['num', 'name'];
  switch (calc.t) {
    case 'arith': {
      const word = calc.op === '+' ? 'plus' : calc.op === '-' ? 'minus' : calc.op === '*' ? 'times' : 'divided by';
      return (
        <>
          {val('First value', calc.a, (a) => onChange({ ...calc, a }), NUMBERISH)}
          <p className="calc-word">{word}</p>
          {val('Second value', calc.b, (b) => onChange({ ...calc, b }), NUMBERISH)}
        </>
      );
    }
    case 'percent':
      return (
        <>
          {val('The part', calc.part, (part) => onChange({ ...calc, part }), NUMBERISH)}
          <p className="calc-word">as a percentage of</p>
          {val('The whole', calc.whole, (whole) => onChange({ ...calc, whole }), NUMBERISH)}
          <p className="hint">A whole of 0 gives 0.</p>
        </>
      );
    case 'extreme':
      return (
        <>
          {val('First value', calc.a, (a) => onChange({ ...calc, a }), NUMBERISH)}
          <p className="calc-word">and</p>
          {val('Second value', calc.b, (b) => onChange({ ...calc, b }), NUMBERISH)}
        </>
      );
    case 'round':
      return (
        <>
          {val('The number to round', calc.value, (v) => onChange({ ...calc, value: v }), NUMBERISH)}
          <label className="calc-kind">
            <span className="field-label">Decimal places</span>
            <input
              type="number"
              min={0}
              max={MAX_PLACES}
              step={1}
              aria-label="Decimal places to round to"
              value={Number.isFinite(calc.places) ? calc.places : ''}
              onKeyDown={(e) => e.stopPropagation()}
              onChange={(e) => onChange({ ...calc, places: e.target.value === '' ? NaN : Math.round(Number(e.target.value)) })}
            />
          </label>
          <p className="hint">0 rounds to a whole number. A number keeps no trailing zeros: to show 3.50, use fmt(n, 2) in the text.</p>
        </>
      );
    case 'count':
      return (
        <>
          <ListPicker label="In the list" list={calc.list} options={withCurrent(listOptions, calc.list)} onChange={(list) => onChange({ ...calc, list })} />
          <label className="calc-kind">
            <span className="field-label">Count</span>
            <select
              aria-label="Which items to count"
              value={calc.test ? 'some' : 'all'}
              onChange={(e) => onChange({ ...calc, test: e.target.value === 'all' ? null : { field: '', op: '==', value: { t: 'str', value: '' } } })}
            >
              <option value="all">Every item</option>
              <option value="some">Only the items that match</option>
            </select>
          </label>
          {calc.test && (
            <>
              <FieldInput label="Where the field" field={calc.test.field} fields={listFields} onChange={(field) => onChange({ ...calc, test: { ...calc.test!, field } })} help="The name of one thing each item has, like state. Leave it empty for a list of plain words or numbers." />
              <label className="calc-kind">
                <span className="field-label">How to compare</span>
                <select aria-label="How to compare the field" value={calc.test.op} onChange={(e) => onChange({ ...calc, test: { ...calc.test!, op: e.target.value as Cmp } })}>
                  {CMP_ORDER.map((op) => (
                    <option key={op} value={op}>
                      {CMP_LABELS[op]}
                    </option>
                  ))}
                </select>
              </label>
              {val('Compared with', calc.test.value, (v) => onChange({ ...calc, test: { ...calc.test!, value: v } }), ['str', 'num', 'bool', 'name'])}
            </>
          )}
        </>
      );
    case 'sum':
      return (
        <>
          <ListPicker label="In the list" list={calc.list} options={withCurrent(listOptions, calc.list)} onChange={(list) => onChange({ ...calc, list })} />
          <FieldInput label="Add up the field" field={calc.field} fields={listFields} onChange={(field) => onChange({ ...calc, field })} help="The name of the number each item has, like price. Leave it empty for a list of plain numbers." />
        </>
      );
    case 'ifelse':
      return (
        <>
          <ConditionField label="If" value={calc.cond} locals={names} noneText="Pick the condition this depends on." onChange={(cond) => onChange({ ...calc, cond })} />
          {val('Then it is', calc.then, (then) => onChange({ ...calc, then }), ['str', 'num', 'bool', 'name'])}
          {val('Otherwise it is', calc.otherwise, (otherwise) => onChange({ ...calc, otherwise }), ['str', 'num', 'bool', 'name'])}
        </>
      );
    case 'join':
      return <JoinEditor parts={calc.parts} options={options} withCurrent={withCurrent} onChange={(parts) => onChange({ ...calc, parts })} />;
  }
}

function OperandField({ label, operand, kinds, options, withCurrent, onChange }: { label: string; operand: Operand; kinds: Kind[]; options: PickerOption[]; withCurrent: (l: PickerOption[], c: string) => PickerOption[]; onChange: (o: Operand) => void }) {
  return (
    <div className="cond-row calc-operand" role="group" aria-label={label}>
      {kinds.length > 1 && (
        <select className="cond-kind" aria-label={`${label}: it is`} value={operand.t} onChange={(e) => onChange(blank(e.target.value as Kind))}>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      )}
      {operand.t === 'num' && (
        <input
          className="cond-val"
          type="number"
          step="any"
          aria-label={`${label}: the number`}
          value={Number.isFinite(operand.value) ? operand.value : ''}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => onChange({ t: 'num', value: e.target.value === '' ? NaN : Number(e.target.value) })}
        />
      )}
      {operand.t === 'str' && <input className="cond-val" type="text" aria-label={`${label}: the text`} value={operand.value} spellCheck={false} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => onChange({ t: 'str', value: e.target.value })} />}
      {operand.t === 'bool' && (
        <select className="cond-val" aria-label={`${label}: on or off`} value={operand.value ? 'true' : 'false'} onChange={(e) => onChange({ t: 'bool', value: e.target.value === 'true' })}>
          <option value="true">on (true)</option>
          <option value="false">off (false)</option>
        </select>
      )}
      {operand.t === 'name' && (
        <SearchPicker className="cond-left" value={operand.name} options={withCurrent(options, operand.name)} onChange={(name) => onChange({ t: 'name', name })} placeholder="Choose a value…" searchPlaceholder="Search values" ariaLabel={`${label}: the value`} title="A variable, a data source or another value" />
      )}
    </div>
  );
}

function ListPicker({ label, list, options, onChange }: { label: string; list: string; options: PickerOption[]; onChange: (l: string) => void }) {
  return (
    <div className="cond-row calc-operand" role="group" aria-label={label}>
      <span className="field-label">{label}</span>
      <SearchPicker className="cond-left" value={list} options={options} onChange={onChange} placeholder="Choose a list…" searchPlaceholder="Search lists" ariaLabel={`${label}: the list`} title="A list variable or a data source" />
    </div>
  );
}

function FieldInput({ label, field, fields, onChange, help }: { label: string; field: string; fields: string[]; onChange: (f: string) => void; help: string }) {
  const id = `calc-fields-${label.replace(/\W/g, '')}`;
  return (
    <label className="calc-kind" title={help}>
      <span className="field-label">{label}</span>
      <input type="text" list={fields.length ? id : undefined} value={field} spellCheck={false} aria-label={label} placeholder="state" onKeyDown={(e) => e.stopPropagation()} onChange={(e) => onChange(e.target.value)} />
      {fields.length > 0 && (
        <datalist id={id}>
          {fields.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      )}
    </label>
  );
}

function JoinEditor({ parts, options, withCurrent, onChange }: { parts: JoinPart[]; options: PickerOption[]; withCurrent: (l: PickerOption[], c: string) => PickerOption[]; onChange: (p: JoinPart[]) => void }) {
  const set = (i: number, p: JoinPart) => onChange(parts.map((x, j) => (j === i ? p : x)));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= parts.length) return;
    const next = parts.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <>
      {parts.map((p, i) => (
        <div key={i} className="cond-row calc-operand" role="group" aria-label={`Piece ${i + 1}`}>
          <select className="cond-kind" aria-label={`Piece ${i + 1}: it is`} value={p.t} onChange={(e) => set(i, e.target.value === 'text' ? { t: 'text', value: '' } : { t: 'value', value: blank('name') })}>
            <option value="text">some text</option>
            <option value="value">a value</option>
          </select>
          {p.t === 'text' ? (
            <input className="cond-val" type="text" aria-label={`Piece ${i + 1}: the text`} value={p.value} spellCheck={false} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set(i, { t: 'text', value: e.target.value })} />
          ) : p.value.t === 'name' ? (
            <SearchPicker className="cond-left" value={p.value.name} options={withCurrent(options, p.value.name)} onChange={(name) => set(i, { t: 'value', value: { t: 'name', name } })} placeholder="Choose a value…" searchPlaceholder="Search values" ariaLabel={`Piece ${i + 1}: the value`} title="A variable, a data source or another value" />
          ) : (
            <input className="cond-val" type="number" step="any" aria-label={`Piece ${i + 1}: the number`} value={p.value.t === 'num' && Number.isFinite(p.value.value) ? p.value.value : ''} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set(i, { t: 'value', value: { t: 'num', value: e.target.value === '' ? NaN : Number(e.target.value) } })} />
          )}
          <IconButton icon={<Icons.chevronDown />} title={`Move piece ${i + 1} down`} disabled={i === parts.length - 1} onClick={() => move(i, 1)} />
          <IconButton icon={<Icons.trash />} title={`Remove piece ${i + 1}`} disabled={parts.length < 2} onClick={() => onChange(parts.filter((_, j) => j !== i))} />
        </div>
      ))}
      <div className="cond-actions">
        <button type="button" className="btn small" disabled={parts.length >= MAX_PARTS} onClick={() => onChange([...parts, { t: 'text', value: '' }])}>
          + Text
        </button>
        <button type="button" className="btn small" disabled={parts.length >= MAX_PARTS} onClick={() => onChange([...parts, { t: 'value', value: blank('name') }])}>
          + Value
        </button>
      </div>
    </>
  );
}
