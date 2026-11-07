import { useEffect, useState } from 'react';
import { LIGHT_LOOK, uid, type Script, type Variable, type VariableType } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { isIdentifier, uniqueIdentifier, uniqueName } from '../store/doc';
import { confirmDialog } from '../components/dialogs';
import { CheckField, ColorField, IconButton, NumberField, SelectField, TextField } from '../components/ui';
import { ExprField } from '../components/ExprField';
import { CodeEditor } from '../components/CodeEditor';
import { Icons } from '../components/icons';
import { SplitColumns } from '../components/SplitColumns';

const SCRIPT_TEMPLATE = `// Runs with \`ix\` (the player API), \`event\` (what triggered it) and \`vars\`.
// Tick "Run on start" to register handlers when the player starts.

ix.on('hello', (payload) => {
  ix.log('got hello', payload);
});
`;

export function ScriptsPanel() {
  const s = useEditor((st) => ({ scripts: st.project.scripts, sandbox: !!st.project.settings.scriptSandbox }));
  const [activeId, setActiveId] = useState<string | null>(s.scripts[0]?.id ?? null);
  const active = s.scripts.find((x) => x.id === activeId) ?? s.scripts[0];
  const setScript = (id: string, patch: Partial<Script>, coalesce?: string) =>
    store().update(
      (d) => {
        const sc = d.scripts.find((x) => x.id === id);
        if (sc) Object.assign(sc, patch);
      },
      { coalesce },
    );
  const add = () => {
    const sc: Script = { id: uid('sc'), name: uniqueName(s.scripts.map((x) => x.name), 'Script'), code: SCRIPT_TEMPLATE, runOnStart: true };
    store().update((d) => {
      d.scripts.push(sc);
    });
    setActiveId(sc.id);
  };
  return (
    <SplitColumns id="scripts" columns={[{ width: 180, min: 120, max: 420 }, 'flex', { width: 260, min: 180, max: 520 }]} className="scripts">
      <div className="script-list">
        {s.scripts.map((sc) => (
          <button key={sc.id} className={`list-item${sc.id === active?.id ? ' active' : ''}`} onClick={() => setActiveId(sc.id)}>
            <Icons.code width={14} /> {sc.name}
            {sc.runOnStart && <span className="badge">start</span>}
          </button>
        ))}
        <button className="link-btn" onClick={add}>
          + New script
        </button>
      </div>
      {active ? (
        <div className="script-main">
          <div className="script-bar">
            <TextField value={active.name} commitOnBlur onChange={(v) => setScript(active.id, { name: v || active.name })} />
            <CheckField label="Run on start" value={active.runOnStart} onChange={(v) => setScript(active.id, { runOnStart: v })} />
            <IconButton
              icon={<Icons.trash />}
              title="Delete script"
              onClick={async () => {
                if (!(await confirmDialog({ title: 'Delete script', message: `Delete script "${active.name}"?`, confirmLabel: 'Delete script', danger: true }))) return;
                store().update((d) => {
                  d.scripts = d.scripts.filter((x) => x.id !== active.id);
                });
              }}
            />
          </div>
          <CodeEditor key={active.id} value={active.code} onChange={(v) => setScript(active.id, { code: v }, `script-${active.id}`)} height="100%" />
        </div>
      ) : (
        <div className="panel-empty">
          <p>Scripts are custom JavaScript with the <code>ix</code> API: read and set variables, move layers, play timelines, react to messages and run code every frame.</p>
          <button className="btn primary" onClick={add}>
            + New script
          </button>
        </div>
      )}
      <div className="script-help">
        <div className={`sandbox-note${s.sandbox ? '' : ' off'}`}>
          {s.sandbox
            ? 'Sandboxed: scripts run in a WASM VM with only ix, setTimeout/setInterval and console. No DOM, cookies or network (use data sources).'
            : 'In-page: scripts run with full page access (node.element, fetch, DOM). Turn the sandbox on in Project settings for untrusted code.'}
        </div>
        <div className="field-label block">ix API</div>
        <pre className="api-ref">{`ix.vars.score += 1
ix.get('name') / ix.set('name', v)
ix.node('Ball')        // by name or id
  .get('x') .set('x', 10)
  .show() .hide() .toggle()
  await .animate('x', 200,
    { duration: 400, ease: 'easeOut' })
  .element             // DOM element (in-page only)
ix.timeline('Intro')
  .play() .pause() .stop()
  .restart() .reverse() .seek(ms)
ix.goTo('Page 2', 'fade')
ix.report({ completed: true })  // send the result
ix.result   // {completed, score, percent, passed}
ix.startOver()
ix.record('chose B', 'route') // count it in Insights
ix.emit('done', data)  // to host page
ix.setInstanceInput('Badge', 'level', 3)
ix.fireInstanceTrigger('Badge', 'ping')
ix.on('reset', fn)     // messages
ix.onFrame((dt, t) => {})
ix.pointer  // {x, y, down}
ix.artboard // {name, width, height}
ix.data.products     // data sources
ix.context.firstName   // the course and learner (read only)
await ix.loadData('products')
ix.setCursor('grab')
ix.log(...)`}</pre>
      </div>
    </SplitColumns>
  );
}

/** Whether text is a JSON array (what a list variable's starting value has to be). */
function validList(text: string): boolean {
  try {
    return Array.isArray(JSON.parse(text));
  } catch {
    return false;
  }
}

/**
 * A variable's name. Only a valid name is saved into the project: an empty or invalid one stays in the field as a draft,
 * with the warning, until it is fixed (or the field is reverted by undo or someone else's edit).
 */
function VariableNameField({ name, onValid }: { name: string; onValid: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const bad = !isIdentifier(draft.trim());
  return (
    <>
      <TextField
        value={name}
        mono
        commitOnBlur
        title="Letters, digits and _ only, not starting with a digit. A name that is not valid is not saved until you fix it."
        onInput={setDraft}
        onChange={(text) => {
          const t = text.trim();
          if (isIdentifier(t)) onValid(t);
        }}
      />
      {bad && (
        <div className="error small">
          {draft.trim() === '' ? 'A variable needs a name.' : 'Use letters, digits and _ only, not starting with a digit.'}
          {draft.trim() !== name && ' Not saved yet, the project still uses ' + name + '.'}
        </div>
      )}
    </>
  );
}

export function VariablesPanel() {
  const vars = useEditor((st) => st.project.variables);
  const setVar = (id: string, patch: Partial<Variable>, coalesce?: string) =>
    store().update(
      (d) => {
        const v = d.variables.find((x) => x.id === id);
        if (v) Object.assign(v, patch);
      },
      { coalesce },
    );
  const add = () => {
    const name = uniqueIdentifier(vars.map((v) => v.name), 'value');
    store().update((d) => {
      d.variables.push({ id: uid('v'), name, type: 'number', initial: 0 });
    });
  };
  const defaultFor = (t: VariableType) => (t === 'number' ? 0 : t === 'boolean' ? false : t === 'color' ? LIGHT_LOOK.button : t === 'enum' ? 'first' : t === 'list' ? '[]' : '');
  return (
    <div className="variables">
      <table className="var-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Initial value</th>
            <th title="Remember progress: keep the value between visits (in the learner's record when results are kept, otherwise in their browser)">Remember</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {vars.map((v) => (
            <tr key={v.id}>
              <td>
                <VariableNameField name={v.name} onValid={(name) => setVar(v.id, { name })} />
              </td>
              <td>
                <SelectField<VariableType>
                  value={v.type}
                  title="Number, text, true/false, colour, a choice from a list you define, or a list of items (for repeaters)"
                  options={[
                    { value: 'number', label: 'Number' },
                    { value: 'string', label: 'Text' },
                    { value: 'boolean', label: 'True/false' },
                    { value: 'color', label: 'Colour' },
                    { value: 'enum', label: 'Choice' },
                    { value: 'list', label: 'List' },
                  ]}
                  onChange={(t) => setVar(v.id, t === 'enum' ? { type: t, options: v.options?.length ? v.options : ['first', 'second'], initial: v.options?.[0] ?? 'first' } : { type: t, initial: defaultFor(t) })}
                />
              </td>
              <td>
                {v.type === 'number' && <NumberField value={Number(v.initial)} onChange={(x) => setVar(v.id, { initial: x }, `var-${v.id}`)} />}
                {v.type === 'string' && <TextField value={String(v.initial)} onChange={(x) => setVar(v.id, { initial: x }, `var-${v.id}`)} />}
                {v.type === 'boolean' && <CheckField label={v.initial ? 'true' : 'false'} value={!!v.initial} onChange={(x) => setVar(v.id, { initial: x })} />}
                {v.type === 'color' && <ColorField value={String(v.initial)} onChange={(x) => setVar(v.id, { initial: x }, `var-${v.id}`)} />}
                {v.type === 'list' && (
                  <div className="enum-edit">
                    <TextField
                      value={String(v.initial)}
                      multiline
                      mono
                      rows={3}
                      commitOnBlur
                      title="The starting items as JSON: an array, usually of objects"
                      placeholder={'[{"name": "Ann"}, {"name": "Bo"}]'}
                      onChange={(x) => setVar(v.id, { initial: x }, `var-${v.id}`)}
                    />
                    {!validList(String(v.initial)) && <div className="error small">Not a JSON array, so the list starts empty.</div>}
                  </div>
                )}
                {v.type === 'enum' && (
                  <div className="enum-edit">
                    <SelectField value={String(v.initial)} title="Starting choice" options={(v.options ?? []).map((o) => ({ value: o, label: o }))} onChange={(x) => setVar(v.id, { initial: x })} />
                    <TextField
                      value={(v.options ?? []).join(', ')}
                      title="The choices, separated by commas"
                      placeholder="easy, medium, hard"
                      commitOnBlur
                      onChange={(x) => {
                        const options = [...new Set(x.split(',').map((o) => o.trim()).filter(Boolean))];
                        setVar(v.id, { options, initial: options.includes(String(v.initial)) ? v.initial : (options[0] ?? '') });
                      }}
                    />
                  </div>
                )}
                <ExprField
                  value={v.formula ?? ''}
                  commitOnBlur
                  title="Optional. A formula that works this variable out from the ones above it each time the project starts, instead of using the value above, for example crossword(words, 10) or wordSearch(words, 12). The value above is what it falls back to if the formula fails. The preview on the canvas follows it too."
                  placeholder="Or work it out: e.g. crossword(words, 10)"
                  onChange={(x) => setVar(v.id, { formula: x.trim() ? x : undefined }, `var-formula-${v.id}`)}
                />
              </td>
              <td>
                <CheckField label="" value={!!v.persist} onChange={(x) => setVar(v.id, { persist: x })} />
              </td>
              <td>
                <IconButton
                  icon={<Icons.trash />}
                  title="Delete variable"
                  onClick={() =>
                    store().update((d) => {
                      d.variables = d.variables.filter((x) => x.id !== v.id);
                    })
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn" onClick={add}>
        + Add variable
      </button>
      <p className="hint">
        Use variables in text as <code>{'{name}'}</code>, in expressions and bindings by name, bind inputs to them, and change them with the Set variable action or <code>ix.vars</code>.
      </p>
    </div>
  );
}
