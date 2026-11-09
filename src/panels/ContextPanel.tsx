import { CONTEXT_FIELDS, courseMatches, sampleContextFor, uid, type ContextValues, type CourseValueRow, type Variable } from 'interactives-player';
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
    </div>
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
          options={[{ value: '', label: 'Set a variable…' }, ...unset.map((v) => ({ value: v.id, label: v.name }))]}
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
