import { uid, variableLabelAndName, type Check, type Project, type Variable } from 'interactives-player';
import { store } from '../store/store';
import { IconButton, Section, SelectField, TextField } from '../components/ui';
import { ExprField } from '../components/ExprField';
import { Icons } from '../components/icons';
import { SectionBlurb } from '../components/SectionBlurb';
import { addVariableOption, withQuickAdd } from '../lib/quick-add';

/** Change the project's checks, leaving the setting out when there are none. */
const setChecks = (change: (list: Check[]) => void) =>
  store().update((d) => {
    const list = d.settings.checks ?? [];
    change(list);
    if (list.length) d.settings.checks = list;
    else delete d.settings.checks;
  });

/** Write the results to a variable (list, count, passed), or stop. */
const setResult = (key: 'list' | 'count' | 'passed', id: string) =>
  store().update((d) => {
    const r = { ...(d.settings.checkResults ?? {}) };
    if (id) r[key] = id;
    else delete r[key];
    if (Object.keys(r).length) d.settings.checkResults = r;
    else delete d.settings.checkResults;
  });

/**
 * The project's checks: rules it's checked against as it runs (a plan, a form, a build), each a formula that's true when all is
 * well and the words for when it isn't. What fails is `checks` in any formula, and can go to variables too.
 */
export function ChecksSection({ project }: { project: Project }) {
  const list = project.settings.checks ?? [];
  const out = project.settings.checkResults ?? {};
  const of = (type: Variable['type']) => project.variables.filter((v) => v.type === type && !v.live);
  const pick = (key: 'list' | 'count' | 'passed', label: string, type: Variable['type'], title: string, name: string) => (
    <SelectField
      label={label}
      title={title}
      value={out[key] ?? ''}
      options={[{ value: '', label: 'None' }, ...of(type).map((v) => ({ value: v.id, label: variableLabelAndName(v) })), addVariableOption()]}
      onChange={withQuickAdd((v) => setResult(key, v), { variableType: type, variableName: name })}
    />
  );
  const edit = (id: string, patch: Partial<Check>, coalesce?: string) =>
    store().update(
      (d) => {
        const c = d.settings.checks?.find((x) => x.id === id);
        if (!c) return;
        Object.assign(c, patch);
        if (!c.forEach) delete c.forEach;
      },
      { coalesce },
    );
  return (
    <Section
      help="checks"
      title="Checks"
      defaultOpen={list.length > 0}
      actions={<IconButton icon={<Icons.plus />} title="Add a check: a formula that's true when all is well, and the words for when it isn't" onClick={() => setChecks((l) => void l.push({ id: uid('ck'), name: `Check ${l.length + 1}`, passWhen: '', message: '' }))} />}
    >
      <SectionBlurb text="Rules the project is checked against as it runs, and the words when one fails." name="checks" help={['checks']} />
      {list.map((c, i) => (
        <div key={c.id} className="check-row">
          <div className="check-row-head">
            <TextField value={c.name} placeholder={`Check ${i + 1}`} commitOnBlur title="What you call it. Each failure carries it as check" onChange={(v) => edit(c.id, { name: v.trim() })} />
            <IconButton icon={<Icons.trash />} title={`Delete ${c.name || 'this check'}`} onClick={() => setChecks((l) => void l.splice(l.findIndex((x) => x.id === c.id), 1))} />
          </div>
          <ExprField
            label="Passes when"
            title="A formula that's true when all is well: sum('Year 1', 'units') <= 8. Give a text instead of false and that text is the message"
            value={c.passWhen}
            placeholder="sum('Year 1', 'units') <= 8"
            locals={c.forEach ? ['item', 'index'] : []}
            commitOnBlur
            onChange={(v) => edit(c.id, { passWhen: v })}
          />
          <TextField
            label="Otherwise say"
            title="The words when it fails, with {slots}: Year 1 has {sum('Year 1', 'units')} units, 8 at most. Per item, {item.name} names it"
            value={c.message}
            placeholder="Year 1 has more than 8 units."
            commitOnBlur
            onChange={(v) => edit(c.id, { message: v })}
          />
          <ExprField
            label="For each"
            title="Optional: a formula giving a list (items('Year 1'), courses). The check runs once per item, with item and index, and a failure names the item, so a layer of that name can show it (its A check fails for it state)"
            value={c.forEach ?? ''}
            placeholder="Every time, once"
            commitOnBlur
            onChange={(v) => edit(c.id, { forEach: v.trim() || undefined })}
          />
        </div>
      ))}
      {!list.length && <div className="muted small">No checks yet. The + adds one.</div>}
      {list.length > 0 && (
        <>
          <div className="muted small">Read them in any formula as checks.list, checks.count and checks.passed, or have them written to variables:</div>
          {pick('list', 'Failures', 'list', 'A list variable that holds each failure (check, message, item): show it with a repeater', 'issues')}
          {pick('count', 'How many', 'number', 'A number variable that holds how many checks fail', 'issueCount')}
          {pick('passed', 'All pass', 'boolean', 'A true or false variable that is true when every check passes', 'allChecksPass')}
        </>
      )}
    </Section>
  );
}
