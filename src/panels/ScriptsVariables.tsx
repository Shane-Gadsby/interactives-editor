import { useState } from 'react';
import { uid, type Script, type Variable, type VariableType } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { isIdentifier, uniqueName } from '../store/doc';
import { confirmDialog } from '../components/dialogs';
import { CheckField, ColorField, IconButton, NumberField, SelectField, TextField } from '../components/ui';
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
ix.emit('done', data)  // to host page
ix.on('reset', fn)     // messages
ix.onFrame((dt, t) => {})
ix.pointer  // {x, y, down}
ix.artboard // {name, width, height}
ix.data.products     // data sources
await ix.loadData('products')
ix.setCursor('grab')
ix.log(...)`}</pre>
      </div>
    </SplitColumns>
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
    const name = uniqueName(vars.map((v) => v.name), 'value').replace(/\s+/g, '');
    store().update((d) => {
      d.variables.push({ id: uid('v'), name, type: 'number', initial: 0 });
    });
  };
  const defaultFor = (t: VariableType) => (t === 'number' ? 0 : t === 'boolean' ? false : t === 'color' ? '#3b5bfd' : t === 'enum' ? 'first' : '');
  return (
    <div className="variables">
      <table className="var-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Initial value</th>
            <th title="Remember the value in the visitor's browser">Persist</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {vars.map((v) => (
            <tr key={v.id}>
              <td>
                <TextField value={v.name} mono commitOnBlur onChange={(name) => setVar(v.id, { name: name.trim() })} />
                {!isIdentifier(v.name) && <div className="error small">Use letters, digits and _ only, not starting with a digit.</div>}
              </td>
              <td>
                <SelectField<VariableType>
                  value={v.type}
                  title="Number, text, true/false, colour, or a choice from a list you define"
                  options={[
                    { value: 'number', label: 'Number' },
                    { value: 'string', label: 'Text' },
                    { value: 'boolean', label: 'True/false' },
                    { value: 'color', label: 'Colour' },
                    { value: 'enum', label: 'Choice' },
                  ]}
                  onChange={(t) => setVar(v.id, t === 'enum' ? { type: t, options: v.options?.length ? v.options : ['first', 'second'], initial: v.options?.[0] ?? 'first' } : { type: t, initial: defaultFor(t) })}
                />
              </td>
              <td>
                {v.type === 'number' && <NumberField value={Number(v.initial)} onChange={(x) => setVar(v.id, { initial: x }, `var-${v.id}`)} />}
                {v.type === 'string' && <TextField value={String(v.initial)} onChange={(x) => setVar(v.id, { initial: x }, `var-${v.id}`)} />}
                {v.type === 'boolean' && <CheckField label={v.initial ? 'true' : 'false'} value={!!v.initial} onChange={(x) => setVar(v.id, { initial: x })} />}
                {v.type === 'color' && <ColorField value={String(v.initial)} onChange={(x) => setVar(v.id, { initial: x }, `var-${v.id}`)} />}
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
