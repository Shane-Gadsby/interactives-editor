import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { LOCAL_SCOPE_HINTS, PLAYER_SCOPE_HINTS, type Variable } from 'interactives-player';
import { maybeStore } from '../store/store';
import { conditionToExpr, OP_LABELS, OP_ORDER, opTakesValue, parseCondition, rowComplete, type CondOp, type CondRow, type Condition, type Operand } from '../lib/condition';
import { ExprField, ExprLocals, FormulaStatusLine, useFormulaStatus } from './ExprField';
import { SearchPicker, type PickerOption } from './SearchPicker';
import { IconButton, tipFor, unbroken } from './ui';
import { Icons } from './icons';
import { useRowSearch } from '../lib/prop-search';

/**
 * A condition asked for with pickers: [a value] [is / is at least / contains...] [a number, text or another value], and "and" / "or"
 * to add rows. "Edit as formula" shows the text it writes, and a formula the pickers cannot show in full opens as text, untouched.
 * Whatever the pickers write is an ordinary formula, so the same field works wherever a condition was typed before.
 */

type Kind = 'number' | 'text' | 'bool' | 'name';

const KIND_LABEL: Record<Kind, string> = { number: 'a number', text: 'a piece of text', bool: 'on or off', name: 'another value' };

const kindOf = (o: Operand | undefined): Kind => (!o ? 'number' : o.t === 'num' ? 'number' : o.t === 'str' ? 'text' : o.t === 'bool' ? 'bool' : 'name');

const blank = (k: Kind): Operand => (k === 'number' ? { t: 'num', value: 0 } : k === 'text' ? { t: 'str', value: '' } : k === 'bool' ? { t: 'bool', value: true } : { t: 'name', name: '' });

/** A sensible first row for a value: a number is compared to a number, a yes/no is asked if it is on, a list if it has anything in it. */
function startRow(v: Variable | undefined): CondRow {
  if (!v) return { left: '', op: 'is', right: { t: 'num', value: 0 } };
  if (v.type === 'number') return { left: v.name, op: 'atleast', right: { t: 'num', value: 1 } };
  if (v.type === 'boolean') return { left: v.name, op: 'true' };
  if (v.type === 'list') return { left: v.name, op: 'notempty' };
  if (v.type === 'enum') return { left: v.name, op: 'is', right: { t: 'str', value: v.options?.[0] ?? '' } };
  return { left: v.name, op: 'is', right: { t: 'str', value: '' } };
}

export function ConditionField({
  label,
  title,
  value,
  onChange,
  locals,
  placeholder,
}: {
  label: string;
  title?: string;
  value: string;
  onChange: (v: string) => void;
  /** Names this field sees besides the project's (event...). */
  locals?: string[];
  placeholder?: string;
}) {
  const ctx = useContext(ExprLocals);
  const ps = useRowSearch(label, tipFor(label, title));
  const project = maybeStore()?.get().project;
  const variables = project?.variables ?? [];
  const names = useMemo(() => [...new Set([...(ctx.locals ?? []), ...(ctx.self ? ['self'] : []), ...(locals ?? [])])], [ctx.locals, ctx.self, locals]);

  const fits = parseCondition(value);
  const [mode, setMode] = useState<'pick' | 'text'>(fits ? 'pick' : 'text');
  const [draft, setDraft] = useState<Condition>(fits ?? { join: 'and', rows: [] });
  // The formula this component last wrote, so a change from somewhere else (undo, a paste) can be told from its own
  const written = useRef(value);
  useEffect(() => {
    if (value === written.current) return;
    written.current = value;
    const c = parseCondition(value);
    if (c) setDraft(c);
    else setMode('text');
  }, [value]);

  const commit = (c: Condition) => {
    setDraft(c);
    // a row with a gap in it stays in the picker until it is filled in; nothing half-written goes into the formula
    if (c.rows.every(rowComplete)) {
      const text = conditionToExpr(c);
      written.current = text;
      onChange(text);
    }
  };
  const setRow = (i: number, r: CondRow) => commit({ ...draft, rows: draft.rows.map((x, j) => (j === i ? r : x)) });
  const addRow = (join: 'and' | 'or') => {
    const used = new Set(draft.rows.map((r) => r.left));
    const next = startRow(variables.find((v) => !used.has(v.name)) ?? variables[0]);
    commit({ join: draft.rows.length > 1 ? draft.join : join, rows: [...draft.rows, next] });
  };

  const options = useMemo<PickerOption[]>(() => {
    const out: PickerOption[] = variables.filter((v) => /^[A-Za-z_$][\w$]*$/.test(v.name)).map((v) => ({ value: v.name, label: v.name, hint: v.type === 'boolean' ? 'on/off' : v.type }));
    for (const d of project?.dataSources ?? []) out.push({ value: d.name, label: d.name, hint: 'data' });
    for (const l of names) out.push({ value: l, label: l, hint: LOCAL_SCOPE_HINTS[l]?.type });
    for (const [n, h] of Object.entries(PLAYER_SCOPE_HINTS)) if (h.type !== 'function' && h.type !== 'object') out.push({ value: n, label: n, hint: h.type });
    return out;
  }, [variables, project?.dataSources, names]);
  const withCurrent = (current: string): PickerOption[] => (current && !options.some((o) => o.value === current) ? [{ value: current, label: current }, ...options] : options);

  const status = useFormulaStatus(value, names, ctx.self, false, ctx.values);

  if (mode === 'text') {
    return (
      <div className="cond cond-text">
        <ExprField label={label} title={title} value={value} locals={locals} commitOnBlur placeholder={placeholder} onChange={onChange} />
        {fits ? (
          <button type="button" className="link-btn" onClick={() => {
              setDraft(fits);
              setMode('pick');
            }}>
            Use the pickers
          </button>
        ) : (
          <p className="hint">This condition is more than the pickers can show, so it stays a formula.</p>
        )}
      </div>
    );
  }

  return (
    <div className={`cond${ps.hide ? ' ps-hide' : ''}`} role="group" aria-label={label} data-prop={ps.prop} title={tipFor(label, title)}>
      <div className="field-label block">{unbroken(label)}</div>
      {draft.rows.length === 0 && <p className="hint cond-none">No condition: it always runs.</p>}
      {draft.rows.map((r, i) => (
        <div key={i} className="cond-block">
          {i > 0 && (
            <select className="cond-join" aria-label="Join the conditions with" value={draft.join} onChange={(e) => commit({ ...draft, join: e.target.value === 'or' ? 'or' : 'and' })}>
              <option value="and">and</option>
              <option value="or">or</option>
            </select>
          )}
          <CondRowEditor row={r} n={i + 1} variables={variables} withCurrent={withCurrent} onChange={(x) => setRow(i, x)} onRemove={() => commit({ ...draft, rows: draft.rows.filter((_, j) => j !== i) })} />
        </div>
      ))}
      <div className="cond-actions">
        {draft.rows.length === 0 ? (
          <button type="button" className="btn small" onClick={() => addRow('and')}>
            + Add a condition
          </button>
        ) : (
          <>
            <button type="button" className="btn small" title="Add another row that must also be true" onClick={() => addRow('and')}>
              + and
            </button>
            <button type="button" className="btn small" title="Add another row where either can be true" onClick={() => addRow('or')}>
              + or
            </button>
          </>
        )}
        <button type="button" className="link-btn cond-formula" title="See the formula these pickers write, and change it by typing" onClick={() => setMode('text')}>
          Edit as formula
        </button>
      </div>
      {draft.rows.some((r) => !rowComplete(r)) ? <p className="hint">Fill in each row to use it.</p> : <FormulaStatusLine status={status} />}
    </div>
  );
}

function CondRowEditor({
  row,
  n,
  variables,
  withCurrent,
  onChange,
  onRemove,
}: {
  row: CondRow;
  n: number;
  variables: Variable[];
  withCurrent: (current: string) => PickerOption[];
  onChange: (r: CondRow) => void;
  onRemove: () => void;
}) {
  const v = variables.find((x) => x.name === row.left);
  // what each kind of value can be asked: text cannot be "more than", only a number can; on/off has its own two
  const ops = OP_ORDER.filter((op) => {
    if (!v) return true;
    if (v.type === 'boolean') return op === 'true' || op === 'false' || op === 'is' || op === 'isnot';
    if (v.type === 'number') return !['contains', 'empty', 'notempty', 'true', 'false'].includes(op);
    if (v.type === 'list') return op === 'contains' || op === 'empty' || op === 'notempty';
    return !['atleast', 'atmost', 'more', 'less', 'true', 'false'].includes(op);
  });
  if (!ops.includes(row.op)) ops.push(row.op);

  const pickLeft = (name: string) => {
    const nv = variables.find((x) => x.name === name);
    // a different kind of value starts the row again in a way that suits it; the same kind keeps the question
    const same = v && nv && v.type === nv.type;
    onChange(same ? { ...row, left: name } : startRow(nv ?? { id: '', name, type: 'string', initial: '' }));
  };
  const setOp = (op: CondOp) => {
    const right = opTakesValue(op) ? (row.right ?? (op === 'contains' ? blank('text') : v?.type === 'number' ? blank('number') : blank(v?.type === 'boolean' ? 'bool' : 'text'))) : undefined;
    onChange({ left: row.left, op, ...(right ? { right } : {}) });
  };

  return (
    <div className="cond-row" role="group" aria-label={`Condition ${n}`}>
      <SearchPicker className="cond-left" value={row.left} options={withCurrent(row.left)} onChange={pickLeft} placeholder="Choose a value…" searchPlaceholder="Search values" ariaLabel={`Condition ${n}: the value to look at`} title="The value to look at: a variable, or something the page knows" />
      <select className="cond-op" aria-label={`Condition ${n}: how to compare`} value={row.op} onChange={(e) => setOp(e.target.value as CondOp)}>
        {ops.map((op) => (
          <option key={op} value={op}>
            {OP_LABELS[op]}
          </option>
        ))}
      </select>
      {opTakesValue(row.op) && <ValueEditor n={n} right={row.right} variable={v} withCurrent={withCurrent} onChange={(right) => onChange({ ...row, right })} />}
      <IconButton icon={<Icons.trash />} title={`Remove condition ${n}`} onClick={onRemove} />
    </div>
  );
}

function ValueEditor({ n, right, variable, withCurrent, onChange }: { n: number; right: Operand | undefined; variable: Variable | undefined; withCurrent: (c: string) => PickerOption[]; onChange: (o: Operand) => void }) {
  const kind = kindOf(right);
  // a choice variable is compared with one of its own options
  const choices = variable?.type === 'enum' && kind === 'text' ? (variable.options ?? []) : null;
  return (
    <>
      {choices ? (
        <select className="cond-val" aria-label={`Condition ${n}: the choice`} value={right?.t === 'str' ? right.value : ''} onChange={(e) => onChange({ t: 'str', value: e.target.value })}>
          {right?.t === 'str' && right.value && !choices.includes(right.value) && <option value={right.value}>{right.value}</option>}
          {choices.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ) : (
        <>
          <select className="cond-kind" aria-label={`Condition ${n}: compare with`} value={kind} onChange={(e) => onChange(blank(e.target.value as Kind))}>
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          {right?.t === 'num' && (
            <input
              className="cond-val"
              type="number"
              step="any"
              aria-label={`Condition ${n}: the number`}
              value={Number.isFinite(right.value) ? right.value : ''}
              onKeyDown={(e) => e.stopPropagation()}
              onChange={(e) => onChange({ t: 'num', value: e.target.value === '' ? NaN : Number(e.target.value) })}
            />
          )}
          {right?.t === 'str' && <input className="cond-val" type="text" aria-label={`Condition ${n}: the text`} value={right.value} spellCheck={false} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => onChange({ t: 'str', value: e.target.value })} />}
          {right?.t === 'bool' && (
            <select className="cond-val" aria-label={`Condition ${n}: on or off`} value={right.value ? 'true' : 'false'} onChange={(e) => onChange({ t: 'bool', value: e.target.value === 'true' })}>
              <option value="true">on (true)</option>
              <option value="false">off (false)</option>
            </select>
          )}
          {right?.t === 'name' && <SearchPicker value={right.name} options={withCurrent(right.name)} onChange={(name) => onChange({ t: 'name', name })} placeholder="Choose a value…" searchPlaceholder="Search values" ariaLabel={`Condition ${n}: the other value`} />}
        </>
      )}
    </>
  );
}
