import { type Setup, CONTEXT_FIELDS, courseMatches, linkNameOk, LINK_MAX_LENGTH, LINK_MAX_VALUES, sampleContextFor, uid, type ContextValues, type CourseValueRow, type Variable, variableLabelAndName } from 'interactives-player';
import { useEffect, useState } from 'react';
import { getShare, learnerUrl } from '../lib/db';
import { store, useEditor } from '../store/store';
import { Icons } from '../components/icons';
import { CheckField, ColorField, IconButton, NumberField, SelectField, TextField } from '../components/ui';
import { SectionBlurb } from '../components/SectionBlurb';

/** The built-in data source's entry in the Data panel's list. */
export const CONTEXT_ID = '__context';

/**
 * The built-in `context` data source: the course and the learner, read only. The page around the finished project supplies the
 * values (the Link for StudyDesk page does), so here they are made up, to design with and to preview. Below them, the table of
 * per-course variable values.
 */
export function ContextPanel() {
  const s = useEditor((st) => ({ rows: st.project.courseValues, sample: st.project.sampleContext, variables: st.project.variables, hasSources: st.project.dataSources.length > 0 }));
  const shown = sampleContextFor({ sampleContext: s.sample });
  const setSample = (name: keyof ContextValues, value: string | boolean, coalesce?: string) =>
    store().update(
      (d) => {
        d.sampleContext = { ...(d.sampleContext ?? {}), [name]: value };
      },
      { coalesce },
    );
  const setRows = (change: (rows: CourseValueRow[]) => void) =>
    store().update((d) => {
      const rows = d.courseValues ?? [];
      change(rows);
      if (rows.length) d.courseValues = rows;
      else delete d.courseValues;
    });
  const clash = s.variables.some((v) => v.name === 'context');

  return (
    <div className="context-panel">
      <div className="context-block">
        <h3>
          <code>context</code> <span className="badge">built in, read only</span>
        </h3>
        <SectionBlurb text="The course and the person playing, to use by name in text, bindings and scripts. Only filled in on the StudyDesk link." name="context" help={['course-context', 'where-the-values-come-from']} />
        {clash && <p className="error small">A variable named context hides this one in expressions.</p>}
        <table className="var-table context-table">
          <thead>
            <tr>
              <th>Field</th>
              <th title="Made up, for the canvas and Preview only. Never saved into an export or seen by a learner">Sample value</th>
              <th>What it is</th>
            </tr>
          </thead>
          <tbody>
            {CONTEXT_FIELDS.map((f) => (
              <tr key={f.name}>
                <td className="mono">context.{f.name}</td>
                <td>
                  {f.derived ? (
                    <span className="muted mono" title="Worked out from the other samples">
                      {String(shown[f.name]) || '(empty)'}
                    </span>
                  ) : f.kind === 'flag' ? (
                    <CheckField label={shown[f.name] ? 'true' : 'false'} value={!!shown[f.name]} onChange={(v) => setSample(f.name, v)} />
                  ) : (
                    <TextField value={String(shown[f.name])} commitOnBlur title={`A made-up value for ${f.name}. Clear it to see the project with it blank`} onChange={(v) => setSample(f.name, v)} />
                  )}
                </td>
                <td className="muted small">{f.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <SectionBlurb text="Sample values are for designing: the canvas and Preview use them. Learners never see them." name="sample values" help={['course-context', 'where-the-values-come-from']} />
      </div>

      <SampleLink />

      <div className="context-block">
        <h3>Per-course values</h3>
        <SectionBlurb text="One project for several courses: a row whose course label matches sets its variables' starting values." name="per-course values" help={['course-context', 'per-course-values']} />
        {(s.rows ?? []).map((r) => (
          <CourseRow key={r.id} row={r} variables={s.variables} matches={courseMatches(r.match, shown.courseLabel)} setRows={setRows} />
        ))}
        <button className="btn" onClick={() => setRows((rows) => void rows.push({ id: uid('cv'), match: '', values: {} }))}>
          + Add a course
        </button>
        {!s.variables.length && <p className="hint">Variables are made in the Variables panel. A course row sets the ones you pick.</p>}
      </div>

      <Setups />
    </div>
  );
}

/**
 * One app, many setups: each a name, its own starting values and its own contents for the data sources, played from a link that
 * names it. A card sort is made once and run on a second set of cards by pasting them into a setup.
 */
function Setups() {
  const s = useEditor((st) => ({ setups: st.project.setups ?? [], variables: st.project.variables, sources: st.project.dataSources.filter((d) => d.source === 'url' || d.source === 'asset'), id: st.project.id }));
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    getShare(s.id).then((sh) => setToken(sh?.token ?? null), () => setToken(null));
  }, [s.id]);
  const setAll = (change: (list: Setup[]) => void) =>
    store().update((d) => {
      const list = d.setups ?? [];
      change(list);
      if (list.length) d.setups = list;
      else delete d.setups;
    });
  const edit = (id: string, change: (x: Setup) => void, coalesce?: string) =>
    store().update(
      (d) => {
        const x = d.setups?.find((y) => y.id === id);
        if (x) change(x);
      },
      coalesce ? { coalesce } : undefined,
    );
  const byId = new Map(s.variables.map((v) => [v.id, v]));
  return (
    <div className="context-block">
      <h3>Setups</h3>
      <SectionBlurb text="One app, many setups: each its own values, its own data and its own link. Responses say which setup they came from." name="setups" help={['course-context', 'setups']} />
      {s.setups.map((x) => {
        const link = token ? `${learnerUrl(token)}?setup=${encodeURIComponent(x.id)}` : '';
        const unset = s.variables.filter((v) => !(v.id in x.values));
        return (
          <div className="course-row" key={x.id}>
            <div className="course-row-head">
              <TextField value={x.name} commitOnBlur placeholder="Week 2 cards" title="What to call this setup. setup.name in formulas" onChange={(v) => edit(x.id, (y) => void (y.name = v.trim() || y.name))} />
              <IconButton icon={<Icons.trash />} title="Delete this setup" onClick={() => setAll((list) => void list.splice(list.findIndex((y) => y.id === x.id), 1))} />
            </div>
            <table className="var-table">
              <tbody>
                {Object.entries(x.values).map(([id, value]) => {
                  const v = byId.get(id);
                  return (
                    <tr key={id}>
                      <td className="mono">{v ? v.name : <span className="muted">(deleted variable)</span>}</td>
                      <td>{v ? <ValueEditor variable={v} value={value} onChange={(nv) => edit(x.id, (y) => void (y.values[id] = nv), `setup-${x.id}-${id}`)} /> : <span className="muted">{String(value)}</span>}</td>
                      <td>
                        <IconButton icon={<Icons.trash />} title="Stop setting this variable in the setup" onClick={() => edit(x.id, (y) => void delete y.values[id])} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {unset.length > 0 && (
              <SelectField<string>
                value=""
                title="Pick a variable to give its own starting value in this setup"
                options={[{ value: '', label: 'Set a variable…' }, ...unset.map((v) => ({ value: v.id, label: variableLabelAndName(v) }))]}
                onChange={(id) => {
                  const v = byId.get(id);
                  if (v) edit(x.id, (y) => void (y.values[id] = v.initial));
                }}
              />
            )}
            {s.sources.map((ds) => (
              <div key={ds.id} className="setup-data">
                <CheckField
                  label={`Its own ${ds.name}`}
                  title={`This setup's own contents for the ${ds.name} data source, instead of its file or address`}
                  value={typeof x.data?.[ds.id] === 'string'}
                  onChange={(on) => edit(x.id, (y) => {
                    y.data ??= {};
                    if (on) y.data[ds.id] = ds.kind === 'json' ? '[]' : '';
                    else delete y.data[ds.id];
                    if (!Object.keys(y.data).length) delete y.data;
                  })}
                />
                {typeof x.data?.[ds.id] === 'string' && (
                  <TextField value={x.data![ds.id]} multiline mono rows={5} commitOnBlur title={`Paste the ${ds.kind.toUpperCase()} this setup uses for ${ds.name}`} onChange={(v) => edit(x.id, (y) => void ((y.data ??= {})[ds.id] = v))} />
                )}
              </div>
            ))}
            <div className="setup-link">
              {link ? (
                <>
                  <code className="small">{link}</code>
                  <button className="btn" onClick={() => void navigator.clipboard?.writeText(link)} title="Copy the Link for StudyDesk that plays this setup">
                    Copy link
                  </button>
                </>
              ) : (
                <span className="muted small">Share the project and each setup gets its own link here (?setup={x.id}).</span>
              )}
            </div>
          </div>
        );
      })}
      <button className="btn" onClick={() => setAll((list) => void list.push({ id: uid('st'), name: `Setup ${list.length + 1}`, values: {} }))}>
        + Add a setup
      </button>
    </div>
  );
}

/** Made-up `link` values: as if the project were opened with `?program=GCSC` on its address. The canvas and Preview use them. */
function SampleLink() {
  const sample = useEditor((st) => st.project.sampleLink);
  const entries = Object.entries(sample ?? {});
  const clash = useEditor((st) => st.project.variables.some((v) => v.name === 'link'));
  //Rebuilt in order each time, so renaming a value keeps its place in the list
  const write = (next: [string, string][]) =>
    store().update((d) => {
      if (next.length) d.sampleLink = Object.fromEntries(next);
      else delete d.sampleLink;
    });
  const add = () => {
    let name = 'program';
    for (let i = 2; name in (sample ?? {}); i++) name = `value${i}`;
    write([...entries, [name, '']]);
  };
  return (
    <div className="context-block">
      <h3>
        <code>link</code> <span className="badge">built in, read only</span>
      </h3>
      <SectionBlurb text="Values on the address it was opened with (&program=GCSC is link.program). Samples here are for the canvas and Preview." name="link" help={['course-context', 'values-on-the-link']} />
      {clash && <p className="error small">A variable named link hides this one in expressions.</p>}
      {entries.length > 0 && (
        <table className="var-table context-table link-table">
          <thead>
            <tr>
              <th>Name</th>
              <th title="Made up, for the canvas and Preview only. Never saved into an export or seen by a learner">Sample value</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map(([name, value], i) => (
              <LinkRow
                key={i}
                name={name}
                value={value}
                taken={(n) => entries.some(([other], j) => j !== i && other === n)}
                rename={(n) => write(entries.map((e, j) => (j === i ? [n, e[1]] : e)))}
                setValue={(v) => write(entries.map((e, j) => (j === i ? [e[0], v.slice(0, LINK_MAX_LENGTH)] : e)))}
                remove={() => write(entries.filter((_, j) => j !== i))}
              />
            ))}
          </tbody>
        </table>
      )}
      <button className="btn" disabled={entries.length >= LINK_MAX_VALUES} onClick={add} title={entries.length >= LINK_MAX_VALUES ? `A link carries ${LINK_MAX_VALUES} values at most` : 'Add a made-up value, as if it were on the address'}>
        + Add a link value
      </button>
    </div>
  );
}

function LinkRow({ name, value, taken, rename, setValue, remove }: { name: string; value: string; taken: (name: string) => boolean; rename: (name: string) => void; setValue: (v: string) => void; remove: () => void }) {
  const [problem, setProblem] = useState<string | null>(null);
  const tryName = (raw: string) => {
    const n = raw.trim();
    if (n === name) return setProblem(null);
    if (!linkNameOk(n)) return setProblem('Letters, digits, . _ and - only, starting with a letter (and not title, cdtID, sessionID, ixm or lti)');
    if (taken(n)) return setProblem(`There is already a ${n}`);
    setProblem(null);
    rename(n);
  };
  return (
    <tr>
      <td>
        <TextField value={name} mono commitOnBlur title="The name on the address: program for &program=GCSC" onChange={tryName} />
        {problem && <p className="error small">{problem}</p>}
      </td>
      <td>
        <TextField value={value} commitOnBlur title={`A made-up value for link.${name}`} onChange={setValue} />
      </td>
      <td>
        <IconButton icon={<Icons.trash />} title={`Delete link.${name}`} onClick={remove} />
      </td>
    </tr>
  );
}

function CourseRow({ row, variables, matches, setRows }: { row: CourseValueRow; variables: Variable[]; matches: boolean; setRows: (change: (rows: CourseValueRow[]) => void) => void }) {
  const edit = (change: (r: CourseValueRow) => void) =>
    setRows((rows) => {
      const r = rows.find((x) => x.id === row.id);
      if (r) change(r);
    });
  const byId = new Map(variables.map((v) => [v.id, v]));
  const unset = variables.filter((v) => !(v.id in row.values));
  return (
    <div className="course-row">
      <div className="course-row-head">
        <TextField value={row.match} mono commitOnBlur placeholder="MAT1000_*" title="The course label this row is for, with * and ? wildcards. Commas separate several" onChange={(v) => edit((r) => void (r.match = v.trim()))} />
        {row.match.trim() ? (
          <span className={`badge${matches ? ' ok' : ''}`} title={matches ? 'The sample course matches this row, so Preview uses these values' : 'The sample course does not match this row'}>
            {matches ? 'matches the sample course' : 'no match'}
          </span>
        ) : (
          <span className="badge" title="A row with no label is dropped when the project is saved">
            needs a label
          </span>
        )}
        <IconButton icon={<Icons.trash />} title="Delete this course row" onClick={() => setRows((rows) => void rows.splice(rows.findIndex((x) => x.id === row.id), 1))} />
      </div>
      <table className="var-table">
        <tbody>
          {Object.entries(row.values).map(([id, value]) => {
            const v = byId.get(id);
            return (
              <tr key={id}>
                <td className="mono">{v ? v.name : <span className="muted">(deleted variable)</span>}</td>
                <td>{v ? <ValueEditor variable={v} value={value} onChange={(x) => edit((r) => void (r.values[id] = x))} /> : <span className="muted">{String(value)}</span>}</td>
                <td>
                  <IconButton icon={<Icons.trash />} title="Stop setting this variable for the course" onClick={() => edit((r) => void delete r.values[id])} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {unset.length > 0 && (
        <SelectField<string>
          value=""
          title="Pick a variable to give a different starting value for this course"
          options={[{ value: '', label: 'Set a variable…' }, ...unset.map((v) => ({ value: v.id, label: variableLabelAndName(v) }))]}
          onChange={(id) => {
            const v = byId.get(id);
            if (v) edit((r) => void (r.values[id] = v.initial));
          }}
        />
      )}
    </div>
  );
}

function ValueEditor({ variable: v, value, onChange }: { variable: Variable; value: number | string | boolean; onChange: (v: number | string | boolean) => void }) {
  if (v.type === 'number') return <NumberField value={Number(value)} onChange={onChange} />;
  if (v.type === 'boolean') return <CheckField label={value ? 'true' : 'false'} value={!!value} onChange={onChange} />;
  if (v.type === 'color') return <ColorField value={String(value)} onChange={onChange} />;
  if (v.type === 'enum') {
    const options = v.options ?? [];
    return <SelectField value={String(value)} options={[...(options.includes(String(value)) ? [] : [{ value: String(value), label: `${String(value)} (not a choice)` }]), ...options.map((o) => ({ value: o, label: o }))]} onChange={onChange} />;
  }
  if (v.type === 'list') return <TextField value={String(value)} multiline mono rows={3} commitOnBlur title="The starting items as JSON: an array, usually of objects" onChange={onChange} />;
  return <TextField value={String(value)} commitOnBlur onChange={onChange} />;
}
