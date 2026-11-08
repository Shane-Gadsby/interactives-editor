import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formFields, type FormAssetKind, type FormColumn, type FormField, type Project } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { CheckField, IconButton, NumberField, SelectField, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { assetKind } from '../lib/assets';
import { addAssetOption, withQuickAdd } from '../lib/quick-add';
import { FILL_IN_FOCUS, addRow, bindExists, canAdd, columnOptions, canRemove, fieldBinds, fieldTarget, moveRow, readField, readRows, removeRow, setCell, writeField, type RowView } from '../lib/content-form';
import { revealLayer } from './ChecklistPanel';

const elId = (id: string) => `cf-${id}`;

/** Scroll the form's own body to an element (not scrollIntoView, which would move the editor's panels round it too). */
function scrollBodyTo(body: HTMLElement | null, el: HTMLElement | null, at: 'start' | 'center') {
  if (!body || !el) return;
  const b = body.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const top = body.scrollTop + (r.top - b.top) - (at === 'center' ? Math.max(0, (b.height - r.height) / 2) : 4);
  body.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

/** A field's values change in the document (undoable, sent to everyone editing live), one undo step for a burst of typing. */
const edit = (id: string, recipe: (d: Project) => void) => store().update((d) => recipe(d as Project), { coalesce: `fill-in-${id}` });

const NOUN = { image: 'picture', video: 'video', audio: 'sound' } as const;

function useAssetOptions(project: Project, kind: FormAssetKind) {
  const files = project.assets.filter((a) => assetKind(a.mime, a.name) === kind);
  return [{ value: '', label: files.length ? `No ${NOUN[kind]} yet. Choose…` : `No ${NOUN[kind]}s yet` }, ...files.map((a) => ({ value: a.id, label: a.name })), addAssetOption(kind)];
}

function PictureSelect({ label, value, onChange, project, kind = 'image' }: { label: ReactNode; value: string; onChange: (v: string) => void; project: Project; kind?: FormAssetKind }) {
  const options = useAssetOptions(project, kind);
  const known = options.some((o) => o.value === value);
  return <SelectField label={label} value={value} options={known || !value ? options : [...options, { value, label: `${NOUN[kind][0].toUpperCase()}${NOUN[kind].slice(1)} ${value.slice(0, 8)}` }]} onChange={withQuickAdd(onChange, { asset: kind })} />;
}

/** One value: a text box, a switch, a number, a choice, a picture, lines or tags. */
function Value({ type, label, value, onChange, project, options, min, max, step, unit, placeholder, commitOnBlur, kind }: { type: FormField['type'] | FormColumn['type']; kind?: FormAssetKind; label: ReactNode; value: unknown; onChange: (v: unknown) => void; project: Project; options?: { value: string | number; label: string }[]; min?: number; max?: number; step?: number; unit?: string; placeholder?: string; commitOnBlur?: boolean }) {
  switch (type) {
    case 'toggle':
      return <CheckField label={label} value={value === true} onChange={onChange} />;
    case 'number':
      return <NumberField label={label} value={typeof value === 'number' ? value : 0} min={min} max={max} step={step ?? 1} suffix={unit} onChange={onChange} />;
    case 'choice':
    case 'pick':
      return <SelectField label={label} value={String(value ?? '')} options={(options ?? []).map((o) => ({ value: String(o.value), label: o.label }))} onChange={(v) => onChange(type === 'pick' || typeof options?.[0]?.value === 'number' ? Number(v) : v)} />;
    case 'asset':
      return <PictureSelect label={label} value={String(value ?? '')} onChange={onChange} project={project} kind={kind} />;
    case 'lines':
      return <Lines label={label} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} placeholder={placeholder} />;
    case 'tags':
      return <Lines label={label} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} commas placeholder={placeholder ?? 'tag, tag, tag'} />;
    case 'numbers':
      return <Lines label={label} value={Array.isArray(value) ? (value as number[]).map(String) : []} onChange={(v) => onChange(v.map(Number).filter((x) => Number.isFinite(x)))} commas placeholder={placeholder ?? '0, 2'} />;
    case 'long':
      return <TextField label={label} value={String(value ?? '')} multiline rows={3} commitOnBlur={commitOnBlur} placeholder={placeholder} onChange={onChange} />;
    default:
      return <TextField label={label} value={String(value ?? '')} commitOnBlur={commitOnBlur} placeholder={placeholder} onChange={onChange} />;
  }
}

/** One entry per line (or separated by commas): kept as typed until you click away, so Enter makes a new line instead of losing it. */
function Lines({ label, value, onChange, commas, placeholder }: { label: ReactNode; value: string[]; onChange: (v: string[]) => void; commas?: boolean; placeholder?: string }) {
  const joined = value.join(commas ? ', ' : '\n');
  const [text, setText] = useState(joined);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(joined);
  }, [joined]);
  const split = (t: string) =>
    t
      .split(commas ? /,/ : /\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
  return (
    <label className="field text-field multiline">
      <span className="field-label">{label}</span>
      <textarea
        rows={commas ? 1 : Math.min(8, Math.max(2, value.length + 1))}
        value={text}
        placeholder={placeholder}
        onFocus={() => (focused.current = true)}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          focused.current = false;
          const next = split(text);
          if (next.join('\n') !== value.join('\n')) onChange(next);
          else setText(joined);
        }}
      />
    </label>
  );
}

function ShowButton({ field, project }: { field: FormField; project: Project }) {
  const target = fieldTarget(project, field);
  if (!target) return null;
  return (
    <button className="icon-btn fillin-show" title="Show this on the page" aria-label={`Show ${field.label} on the page`} onClick={() => revealLayer(target.id, target.artboard.id)}>
      <Icons.select width={13} />
    </button>
  );
}

//Columns in the order they are declared, with neighbours that sit on one line (a tick, a number, a picture) grouped
const segments = (cols: FormColumn[]): FormColumn[][] => {
  const out: FormColumn[][] = [];
  for (const c of cols) {
    const last = out[out.length - 1];
    if (inline(c) && last && inline(last[0])) last.push(c);
    else out.push([c]);
  }
  return out;
};

const inline = (c: FormColumn) => c.type === 'toggle' || c.type === 'number' || c.type === 'pick' || c.type === 'choice' || c.type === 'asset';

function rowTitle(f: FormField, row: RowView, i: number): string {
  if (row.label) return row.label;
  const first = (f.columns ?? []).find((c) => c.type === 'text' || c.type === 'long');
  const text = first ? String(row.values[first.key] ?? '').trim() : '';
  return `${f.noun ? f.noun[0].toUpperCase() + f.noun.slice(1) : 'Row'} ${i + 1}${text ? `: ${text.length > 36 ? text.slice(0, 35) + '…' : text}` : ''}`;
}

function ListField({ field: f, project }: { field: FormField; project: Project }) {
  const rows = readRows(project, f);
  const cols = f.columns ?? [];
  const many = rows.length > 6;
  const fixed = f.fixed || f.rows?.source === 'fixed';
  //A row with one line of words and some ticks or numbers (an answer and whether it is right) is one line, not a card
  const words = cols.filter((c) => !inline(c));
  const compact = f.rows?.source !== 'fixed' && words.length === 1 && words[0].type === 'text';
  return (
    <div className="fillin-list">
      {rows.length === 0 && <p className="muted small">Nothing here yet.</p>}
      {compact &&
        rows.map((row, i) => (
          <div key={i} className="fillin-line">
            <span className="fillin-num" aria-hidden="true">
              {i + 1}.
            </span>
            <Value type="text" label={<span className="sr-only">{`${rowTitle(f, { values: {} }, i)} ${words[0].label}`}</span>} placeholder={words[0].placeholder ?? words[0].label} value={row.values[words[0].key]} project={project} commitOnBlur={f.rows?.source === 'q'} onChange={(v) => edit(f.id, (d) => setCell(d, f, i, words[0].key, v))} />
            {cols
              .filter(inline)
              .map((c) => (
                <Value key={c.key} type={c.type} kind={c.kind} label={c.label} value={c.type === 'pick' ? pickValue(row, c) : row.values[c.key]} options={c.type === 'pick' ? pickOptions(row, c) : columnOptions(project, f, c)} project={project} onChange={(v) => edit(f.id, (d) => setCell(d, f, i, c.key, v))} />
              ))}
            {!fixed && (
              <span className="fillin-row-actions">
                <IconButton icon={<span aria-hidden="true">↑</span>} title={`Move ${rowTitle(f, row, i)} up`} disabled={i === 0} onClick={() => edit(f.id, (d) => moveRow(d, f, i, -1))} />
                <IconButton icon={<span aria-hidden="true">↓</span>} title={`Move ${rowTitle(f, row, i)} down`} disabled={i === rows.length - 1} onClick={() => edit(f.id, (d) => moveRow(d, f, i, 1))} />
                <IconButton icon={<span aria-hidden="true">×</span>} title={`Remove ${rowTitle(f, row, i)}`} disabled={!canRemove(project, f)} onClick={() => edit(f.id, (d) => removeRow(d, f, i))} />
              </span>
            )}
          </div>
        ))}
      {!compact && rows.map((row, i) => (
        <details key={i} className="fillin-row" open={!many}>
          <summary>
            <span className="fillin-row-title">{rowTitle(f, row, i)}</span>
            {!fixed && (
              <span className="fillin-row-actions" onClick={(e) => e.preventDefault()}>
                <IconButton icon={<span aria-hidden="true">↑</span>} title={`Move ${rowTitle(f, row, i)} up`} disabled={i === 0} onClick={() => edit(f.id, (d) => moveRow(d, f, i, -1))} />
                <IconButton icon={<span aria-hidden="true">↓</span>} title={`Move ${rowTitle(f, row, i)} down`} disabled={i === rows.length - 1} onClick={() => edit(f.id, (d) => moveRow(d, f, i, 1))} />
                <IconButton icon={<span aria-hidden="true">×</span>} title={`Remove ${rowTitle(f, row, i)}`} disabled={!canRemove(project, f)} onClick={() => edit(f.id, (d) => removeRow(d, f, i))} />
              </span>
            )}
          </summary>
          <div className="fillin-cells">
            {segments(cols.filter((c) => hasCell(f, i, c))).map((seg, k) =>
              seg.length === 1 && !inline(seg[0]) ? (
                <Value key={k} type={seg[0].type} label={seg[0].label} placeholder={seg[0].placeholder} value={row.values[seg[0].key]} project={project} commitOnBlur={f.rows?.source === 'q'} onChange={(v) => edit(f.id, (d) => setCell(d, f, i, seg[0].key, v))} />
              ) : (
                <div key={k} className="fillin-inline">
                  {seg.map((c) => (
                    <Value key={c.key} type={c.type} kind={c.kind} label={c.label} value={c.type === 'pick' ? pickValue(row, c) : row.values[c.key]} options={c.type === 'pick' ? pickOptions(row, c) : columnOptions(project, f, c)} project={project} onChange={(v) => edit(f.id, (d) => setCell(d, f, i, c.key, v))} />
                  ))}
                </div>
              ),
            )}
          </div>
        </details>
      ))}
      {!fixed && (
        <button className="btn" disabled={!canAdd(project, f)} onClick={() => edit(f.id, (d) => addRow(d, f))}>
          + Add {f.noun ? `a ${f.noun}` : 'a row'}
        </button>
      )}
    </div>
  );
}

//A fixed row only has the cells it has a binding for (the third option of a two option stage page is not there)
const hasCell = (f: FormField, i: number, c: FormColumn) => f.rows?.source !== 'fixed' || !!f.rows.rows[i]?.cells[c.key];

const pickOptions = (row: RowView, c: FormColumn) => {
  const lines = (row.values[c.of ?? ''] as string[] | undefined) ?? [];
  const base = c.base ?? 1;
  return lines.map((l, i) => ({ value: i + base, label: `${i + base}. ${l.length > 40 ? l.slice(0, 39) + '…' : l}` }));
};
const pickValue = (row: RowView, c: FormColumn) => {
  const v = row.values[c.key];
  return typeof v === 'number' ? v : (c.base ?? 1);
};

function Field({ field: f, project }: { field: FormField; project: Project }) {
  const missing = fieldBinds(f).some((b) => !bindExists(project, b));
  const value = readField(project, f);
  return (
    <div className={`fillin-field${missing ? ' missing' : ''}`} id={elId(f.id)} data-field={f.id}>
      {f.type === 'list' ? (
        <>
          <div className="fillin-head">
            <h4>{f.label}</h4>
            <ShowButton field={f} project={project} />
          </div>
          {f.hint && <p className="fillin-hint">{f.hint}</p>}
          {missing ? <p className="fillin-missing">What this edits has been deleted from the project.</p> : <ListField field={f} project={project} />}
        </>
      ) : (
        <>
          {missing ? (
            <p className="fillin-missing">{f.label}: what this edits has been deleted from the project.</p>
          ) : (
            <div className="fillin-single">
              <Value type={f.type} kind={f.kind} label={f.label} value={value} project={project} min={f.min} max={f.max} step={f.step} unit={f.unit} commitOnBlur={f.bind?.k === 'q'} options={f.options} onChange={(v) => edit(f.id, (d) => writeField(d, f, v))} />
              <ShowButton field={f} project={project} />
            </div>
          )}
          {f.hint && <p className="fillin-hint">{f.hint}</p>}
        </>
      )}
    </div>
  );
}

/** "Fill in this starter": the content of a project made from a starter, as a plain form. Every field edits ordinary document data (variables, layer text, question settings, pictures), so the other panels show what you type here. */
export function ContentFormPanel() {
  const form = useEditor((s) => s.project.contentForm);
  const project = useEditor((s) => s.project);
  const name = useEditor((s) => s.project.template?.name);
  const body = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const go = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      //the panel may only just have opened: wait a frame for the field to be on the page
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const el = document.getElementById(elId(id));
          if (!el) return;
          scrollBodyTo(body.current, el, 'center');
          el.classList.add('flash');
          window.setTimeout(() => el.classList.remove('flash'), 1400);
          (el.querySelector('input:not([type=checkbox]), textarea, select, button') as HTMLElement | null)?.focus({ preventScroll: true });
        }),
      );
    };
    window.addEventListener(FILL_IN_FOCUS, go);
    return () => window.removeEventListener(FILL_IN_FOCUS, go);
  }, []);
  if (!form?.sections.length) return <div className="panel-empty muted">This project has no fill-in form. Its content is in the pages, the Variables tab and the Question section.</div>;
  const count = formFields(form).length;
  const go = (id: string) => {
    setActive(id);
    scrollBodyTo(body.current, document.getElementById(`cfs-${id}`), 'start');
  };
  return (
    <div className="fillin" role="form" aria-label="Fill in this starter">
      <div className="fillin-side">
        <strong>Fill in this starter</strong>
        <span className="muted small">
          {name ? `${name}: ` : ''}
          {count} things to write. What you type goes straight into the project.
        </span>
        <nav className="fillin-nav" aria-label="Sections of the form">
          {form.sections.map((s) => (
            <button key={s.id} className={`chip${active === s.id ? ' on' : ''}`} aria-current={active === s.id ? 'true' : undefined} onClick={() => go(s.id)}>
              {s.title}
            </button>
          ))}
        </nav>
      </div>
      <div className="fillin-body" ref={body}>
        {form.sections.map((s) => (
          <section key={s.id} id={`cfs-${s.id}`} aria-labelledby={`cfh-${s.id}`}>
            <h3 id={`cfh-${s.id}`}>{s.title}</h3>
            {s.hint && <p className="fillin-hint">{s.hint}</p>}
            {s.fields.map((f) => (
              <Field key={f.id} field={f} project={project} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
