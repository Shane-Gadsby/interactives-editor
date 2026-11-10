import { useContext, useState } from 'react';
import type { Converter, Variable } from 'interactives-player';
import { ColorField, IconButton, NumberField, SelectField, TextField } from './ui';
import { ExprField, ExprLocals } from './ExprField';
import { SearchPicker, type PickerOption } from './SearchPicker';
import { Icons } from './icons';
import { readMapValue } from './Converters';
import {
  addRow,
  defaultResult,
  freeKey,
  isPlainWhen,
  nextOption,
  removeRow,
  renameRow,
  rowsOf,
  setOtherwise,
  setRow,
  whenChoices,
  whenKind,
  type MapConverter,
  type MapValue,
  type WhenKind,
} from '../lib/by-value';

const sr = (text: string) => <span className="sr-only">{text}</span>;

/** The property's own kind of box for what a row gives: a colour picker for a colour, a number box for a number, and so on. */
function ResultField({ kind, label, value, onChange }: { kind?: string; label: string; value: MapValue | undefined | null; onChange: (v: MapValue) => void }) {
  if (kind === 'color') return <ColorField label={sr(label)} tokens value={String(value ?? '')} onChange={onChange} />;
  if (kind === 'number') return <NumberField label={sr(label)} value={Number(value ?? 0)} step={0.05} onChange={onChange} />;
  if (kind === 'boolean')
    return <SelectField<'true' | 'false'> label={sr(label)} value={value === true || value === 'true' ? 'true' : 'false'} options={[{ value: 'true', label: 'On (true)' }, { value: 'false', label: 'Off (false)' }]} onChange={(v) => onChange(v === 'true')} />;
  if (kind === 'string') return <TextField label={sr(label)} value={value === undefined || value === null ? '' : String(value)} commitOnBlur onChange={onChange} />;
  return <TextField label={sr(label)} value={value === undefined || value === null ? '' : String(value)} commitOnBlur placeholder="value" onChange={(t) => onChange(readMapValue(t))} />;
}

/** The "when ..." side of a row: a pick from the choices when there are some, otherwise a box to type the value in. */
function WhenField({ when, used, value, onChange }: { when: WhenKind; used: string[]; value: string; onChange: (v: string) => void }) {
  const choices = when.kind === 'options' ? when.options : when.kind === 'boolean' ? ['true', 'false'] : null;
  if (choices) {
    const free = choices.filter((c) => c === value || !used.includes(c));
    const opts = [...(choices.includes(value) ? [] : [value]), ...free].map((c) => ({ value: c, label: c === '' ? '(empty)' : c }));
    return <SelectField label={sr('When it is')} value={value} options={opts} onChange={onChange} />;
  }
  return <TextField label={sr('When it is')} value={value} commitOnBlur placeholder="(empty)" onChange={onChange} />;
}

/**
 * The By value source: pick what the table is about (a variable, an item field inside a repeater, or a formula), then give
 * what the property should be for each value it can have, with an otherwise row for the rest. It is the Look up converter
 * underneath, so nothing here is hidden from the Formula or Converters views.
 */
export function ByValueTable({
  label,
  kind,
  expr,
  list,
  variables,
  base,
  current,
  onBoth,
}: {
  label: string;
  kind?: string;
  expr: string;
  list: Converter[];
  variables: Variable[];
  base: Record<string, unknown>;
  /** What the layer has for this property now, for the colour or number a new row starts as */
  current: unknown;
  /** The formula and the table in one change, so neither overwrites the other */
  onBoth: (expr: string, list: Converter[]) => void;
}) {
  const repeat = useContext(ExprLocals);
  const choices = whenChoices(variables, repeat);
  const [formula, setFormula] = useState(!isPlainWhen(expr, choices));
  const c = (list[0] as MapConverter | undefined)?.type === 'map' ? (list[0] as MapConverter) : { type: 'map', map: {} } as MapConverter;
  const when = whenKind(expr, variables, { ...base });
  const rows = rowsOf(c);
  const put = (next: MapConverter) => onBoth(expr, [next]);
  const onExpr = (v: string) => onBoth(v, list);
  const options: PickerOption[] = choices.map((x) => ({ value: x.value, label: x.label, hint: x.hint }));
  const startKey = when.kind === 'options' ? nextOption(c, when.options) : when.kind === 'boolean' ? ['true', 'false'].find((k) => !(k in c.map)) : undefined;
  const canAdd = when.kind === 'text' || startKey !== undefined;
  const other = c.fallback;

  return (
    <div className="by-value">
      <div className="by-value-when">
        {formula ? (
          <>
            <ExprField value={expr} commitOnBlur placeholder="e.g. score > 5" title={`A formula; ${label} is set by what it works out to`} onChange={onExpr} />
            {!!choices.length && (
              <button type="button" className="link-btn" onClick={() => (setFormula(false), choices.some((x) => x.value === expr.trim()) || onExpr(''))}>
                Pick a variable instead
              </button>
            )}
          </>
        ) : (
          <SearchPicker
            value={expr.trim()}
            options={options}
            onChange={(v) => {
              const w = whenKind(v, variables, { ...base });
              // a choice or true/false gets its rows straight away, as long as nothing is written yet
              const keys = w.kind === 'options' ? w.options : w.kind === 'boolean' ? ['true', 'false'] : [];
              onBoth(v, [rows.length || !keys.length ? c : { ...c, map: Object.fromEntries(keys.map((k) => [k, defaultResult(kind, current)])) }]);
            }}
            placeholder="Choose what it depends on…"
            searchPlaceholder="Search variables and item fields"
            title={`What ${label} depends on: a variable, or a field of this item`}
            actions={[{ label: 'Write a formula…', onSelect: () => setFormula(true) }]}
          />
        )}
      </div>
      {rows.map(([key, value]) => (
        <div className="by-value-row" key={key === '' ? '\u0000' : key}>
          <div className="by-value-if">
            <span className="by-value-word">when it is</span>
            <WhenField when={when} used={rows.map(([k]) => k)} value={key} onChange={(to) => put(renameRow(c, key, to))} />
            <IconButton icon={<Icons.trash />} title={`Remove the line for ${key === '' ? 'empty' : key}`} onClick={() => put(removeRow(c, key))} />
          </div>
          <div className="by-value-then">
            <span className="by-value-word">{label} is</span>
            <ResultField kind={kind} label={`${label} when it is ${key === '' ? 'empty' : key}`} value={value} onChange={(v) => put(setRow(c, key, v))} />
          </div>
        </div>
      ))}
      <div className="by-value-row otherwise">
        <div className="by-value-then">
          <span className="by-value-word">otherwise</span>
          {other === undefined ? (
            <>
              <span className="muted small">{label} keeps the value as it is</span>
              <button type="button" className="link-btn" onClick={() => put(setOtherwise(c, defaultResult(kind, current)))}>
                Choose one
              </button>
            </>
          ) : (
            <>
              <ResultField kind={kind} label={`${label} otherwise`} value={other} onChange={(v) => put(setOtherwise(c, v))} />
              <IconButton icon={<Icons.close />} title="Keep the value as it is for anything else" onClick={() => put(setOtherwise(c, undefined))} />
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        className="btn by-value-add"
        disabled={!canAdd}
        title={canAdd ? 'Add a line for another value' : 'Every value it can have already has a line'}
        onClick={() => put(addRow(c, startKey ?? freeKey(c, 'new value'), defaultResult(kind, current)))}
      >
        + Add a value
      </button>
    </div>
  );
}
