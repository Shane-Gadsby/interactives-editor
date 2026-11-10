import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { isLive, liveWriters, LIGHT_LOOK, planLive, uid, type Project, type Script, type Variable, type VariableType } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { isIdentifier, uniqueName } from '../store/doc';
import { choiceDialog, confirmDialog } from '../components/dialogs';
import { renameVariable } from '../lib/rename-variable';
import { planRename } from '../lib/rename-plan';
import { CheckField, ColorField, IconButton, NumberField, SelectField, TextField } from '../components/ui';
import { ExprField } from '../components/ExprField';
import { CodeEditor } from '../components/CodeEditor';
import { CodeThemeSwitch } from '../components/CodeThemeSwitch';
import { Icons } from '../components/icons';
import { SplitColumns } from '../components/SplitColumns';
import { analyzeUsage, type Usage } from '../lib/dependencies';
import { VARIABLE_KINDS, TYPE_LABELS, variableFor, type VariableKind } from '../lib/variable-kinds';
import { go, sourceLabel } from './UsagePanel';
import { SectionBlurb } from '../components/SectionBlurb';
import { ListTable } from '../components/ListTable';

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
    <SplitColumns id="scripts" columns={[{ width: 180, min: 120, max: 420 }, 'flex', { width: 260, min: 180, max: 520, hideBelow: 700 }]} className="scripts">
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
            <div className="spacer" />
            <CodeThemeSwitch />
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
          <SectionBlurb text="Scripts are custom JavaScript with the ix API: read and set variables, move layers and react to messages." name="Scripts" help={['scripts']} />
          <button className="btn primary" onClick={add}>
            + New script
          </button>
        </div>
      )}
      <div className="script-help">
        <div className={`sandbox-note${s.sandbox ? '' : ' off'}`}>
          {s.sandbox
            ? 'Sandboxed: scripts only get ix, timers and console. No page, cookies or network (use data sources).'
            : 'In-page: scripts have full page access (DOM, fetch). Turn the sandbox on in Project settings for untrusted code.'}
        </div>
        <div className="field-label block">ix API</div>
        <pre className="api-ref">{`ix.vars.score += 1
ix.get('name') / ix.set('name', v)
ix.reset('score', 'tags') // back to the start
ix.toggleItem('picked', v) / ix.removeValue('picked', v)
ix.setItem('cards', 2, 'down', 'state')
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
await ix.moveView('Panel 2')  // pan and zoom to a layer
await ix.resetView()           // the whole page again
ix.report({ completed: true })  // send the result
ix.result   // {completed, score, percent, passed}
ix.startOver()
ix.record('chose B', 'route') // count it in Insights
ix.emit('done', data)  // to host page
ix.setInstanceInput('Badge', 'level', 3)
ix.fireInstanceTrigger('Badge', 'ping')
ix.soundPlaying('Ding')  // a Play sound sound is going
ix.soundsPlaying()   // the names of the ones going
ix.on('reset', fn)     // messages
ix.onFrame((dt, t) => {})
ix.pointer  // {x, y, down}
ix.artboard // {name, width, height}
ix.data.products     // data sources
ix.context.firstName   // the course and learner (read only)
await ix.loadData('products')
await ix.course.stamp('passport', 'Gold star') // shared by every piece in the course
await ix.course.count('passport', 'quizzes', 3)
const c = await ix.course.read('passport') // {stamps, counts, course}
ix.setCursor('grab')
ix.log(...)`}</pre>
      </div>
    </SplitColumns>
  );
}

/**
 * A variable's name. Only a valid name is saved into the project: an empty or invalid one stays in the field as a draft,
 * with the warning, until it is fixed (or the field is reverted by undo or someone else's edit).
 */
/**
 * Rename a variable and everything that names it. Goes straight through with an undo message, unless scripts name it (they are
 * guesswork, so they get a look first) or learners have saved values under the old name (they are carried over, and it says so).
 */
async function renameFromPanel(id: string, to: string): Promise<void> {
  const plan = planRename(store().get().project as Project, id, to);
  if (plan.error) {
    store().toast(plan.error, 'error');
    return;
  }
  if (plan.from === to) return;
  const { from } = plan;
  if (plan.kitPrefix) {
    const ok = await confirmDialog({
      title: `Rename ${from}?`,
      message: `${from} belongs to the question whose name prefix is ${plan.kitPrefix}. The question finds its variables by that prefix, so renaming one of them by hand stops the question using it. To rename them all, change the question's Name prefix instead.`,
      confirmLabel: 'Rename it anyway',
      danger: true,
    });
    if (!ok) return;
  }
  let scripts = true;
  if (plan.scripts.length || (plan.saved && plan.used.length)) {
    const parts = [`It is used in ${plan.used.length} ${plan.used.length === 1 ? 'place' : 'places'}, and they will all read ${to} from now on.`];
    if (plan.saved) parts.push(`Learners' saved values for ${from} are kept: the player looks under the old name when it finds nothing under the new one.`);
    if (plan.scripts.length) {
      const lines = plan.scripts.slice(0, 6).flatMap((sc) => [`${sc.where}:`, ...sc.lines.slice(0, 4).map((l) => `    ${l}`)]);
      if (plan.scripts.length > 6) lines.push(`and ${plan.scripts.length - 6} more`);
      parts.push(`These scripts mention ${from}. Check they mean this variable, not a name of their own:\n${lines.join('\n')}`);
    }
    if (plan.scripts.length) {
      const r = await choiceDialog({ title: `Rename ${from} to ${to}?`, message: parts.join('\n\n'), confirmLabel: 'Rename, scripts too', altLabel: 'Rename, leave scripts' });
      if (r === null) return;
      scripts = r === 'confirm';
    } else if (!(await confirmDialog({ title: `Rename ${from} to ${to}?`, message: parts.join('\n\n'), confirmLabel: 'Rename' }))) return;
  }
  const mark = store().historyMark();
  let changed = 0;
  store().update((d) => {
    changed = renameVariable(d as Project, id, to, { scripts });
  });
  store().toastUndo(changed ? `Renamed ${from} to ${to}, and ${changed} ${changed === 1 ? 'place' : 'places'} that named it.` : `Renamed ${from} to ${to}.`, mark);
}

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
  const project = useEditor((st) => st.project);
  // who uses each one (read on a deferred copy, so typing in a box is not held up by it)
  const deferred = useDeferredValue(project);
  const report = useMemo(() => analyzeUsage(deferred), [deferred]);
  //live variables that read each other in a circle, and the nodes that try to write one
  const circle = useMemo(() => new Set(planLive(project).cyclic.map((v) => v.id)), [project.variables, project.dataSources]); // eslint-disable-line react-hooks/exhaustive-deps
  const writers = useMemo(() => liveWriters(project), [project.artboards, project.variables]); // eslint-disable-line react-hooks/exhaustive-deps
  const [menu, setMenu] = useState(false);
  const setVar = (id: string, patch: Partial<Variable>, coalesce?: string) =>
    store().update(
      (d) => {
        const v = d.variables.find((x) => x.id === id);
        if (v) Object.assign(v, patch);
      },
      { coalesce },
    );
  const add = (kind: VariableKind) => {
    const v = variableFor(kind, vars.map((x) => x.name));
    store().update((d) => {
      d.variables.push(v);
    });
    setMenu(false);
  };
  return (
    <div className="variables">
      <table className="var-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Value</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {vars.map((v) => (
            <VariableRow
              key={v.id}
              v={v}
              used={report.variables.find((u) => u.id === v.id)?.usedBy ?? []}
              circular={circle.has(v.id)}
              writers={writers.filter((w) => w.variable.id === v.id).length}
              setVar={setVar}
            />
          ))}
        </tbody>
      </table>
      <div className="var-add">
        <button className="btn" data-tour="add-variable" aria-expanded={menu} aria-haspopup="true" onClick={() => setMenu(!menu)}>
          + Add variable
        </button>
        {menu && (
          <div className="var-add-menu" role="menu" aria-label="What kind of variable" onKeyDown={(e) => e.key === 'Escape' && setMenu(false)}>
            {VARIABLE_KINDS.map((k, i) => (
              <button key={k.id} type="button" role="menuitem" className="var-add-item" autoFocus={i === 0} onClick={() => add(k)}>
                <strong>{k.label}</strong>
                <span>{k.note}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <SectionBlurb text="A variable is something the activity remembers while it runs: a count, a score, whether something is on." name="Variables" help={['variables', 'using-variables']} />
    </div>
  );
}

const defaultFor = (t: VariableType) => (t === 'number' ? 0 : t === 'boolean' ? false : t === 'color' ? LIGHT_LOOK.button : t === 'enum' ? 'first' : t === 'list' ? '[]' : '');

/** One variable: its name and where it is used, its type and value, and the settings most people leave alone folded under Options. */
function VariableRow({ v, used, circular, writers, setVar }: { v: Variable; used: Usage[]; circular: boolean; writers: number; setVar: (id: string, patch: Partial<Variable>, coalesce?: string) => void }) {
  const [places, setPlaces] = useState(false);
  // the formula box only shows for "Worked out": a variable that has one, or one the person just switched to it
  const [worked, setWorked] = useState(!!v.formula?.trim());
  useEffect(() => {
    if (v.formula?.trim()) setWorked(true);
  }, [v.formula]);
  const remove = async () => {
    if (used.length) {
      const lines = used.slice(0, 8).map((u) => {
        const l = sourceLabel(u.by, true);
        return `${l.kind} "${l.name}"${l.where ? ` on ${l.where}` : ''}: ${u.how}`;
      });
      if (used.length > 8) lines.push(`and ${used.length - 8} more`);
      const ok = await confirmDialog({
        title: `Delete "${v.name}"?`,
        message: `It is used in ${used.length} ${used.length === 1 ? 'place' : 'places'}. They will stop working, because the name they read is gone.\n\n${lines.join('\n')}`,
        confirmLabel: 'Delete it anyway',
        danger: true,
      });
      if (!ok) return;
    }
    const mark = store().historyMark();
    store().update((d) => {
      d.variables = d.variables.filter((x) => x.id !== v.id);
    });
    store().toastUndo(`Deleted the variable "${v.name}".`, mark);
  };
  const optionsOpen = !!(v.persist || v.userData || v.live || v.shared);
  return (
    <tr>
      <td>
        <VariableNameField name={v.name} onValid={(name) => void renameFromPanel(v.id, name)} />
        <div className="var-used">
          {used.length ? (
            <button type="button" className="link-btn" aria-expanded={places} onClick={() => setPlaces(!places)} title="Where this variable is read or changed. Click to list the places">
              used in {used.length} {used.length === 1 ? 'place' : 'places'}
            </button>
          ) : (
            <span className="muted small" title="Nothing reads or changes it yet, so deleting it breaks nothing">
              not used yet
            </span>
          )}
        </div>
        {places && used.length > 0 && (
          <ul className="var-places">
            {used.map((u, i) => {
              const l = sourceLabel(u.by, true);
              return (
                <li key={i}>
                  <button type="button" className="link-btn" onClick={() => go(u.by)} title="Go there">
                    {l.kind} “{l.name}”{l.where ? ` on ${l.where}` : ''}
                  </button>
                  <span className="muted small"> {u.how}{u.loose ? ' (found in code, so it may not really use it)' : ''}</span>
                </li>
              );
            })}
          </ul>
        )}
      </td>
      <td>
        <SelectField<VariableType>
          value={v.type}
          title="Number (a counter or a score), text, true/false (a switch), colour, a choice from a list you define, or a list of items (for repeaters)"
          options={(['number', 'string', 'boolean', 'color', 'enum', 'list'] as VariableType[]).map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
          onChange={(t) => setVar(v.id, t === 'enum' ? { type: t, options: v.options?.length ? v.options : ['first', 'second'], initial: v.options?.[0] ?? 'first' } : { type: t, initial: defaultFor(t) })}
        />
      </td>
      <td>
        <SelectField<'fixed' | 'worked'>
          value={worked ? 'worked' : 'fixed'}
          title="Starts as a value you type, or is worked out from other variables with a formula each time the project starts (the value is then what it falls back to if the formula fails)"
          options={[
            { value: 'fixed', label: 'Starts as a value' },
            { value: 'worked', label: 'Worked out' },
          ]}
          onChange={(m) => {
            if (m === 'worked') setWorked(true);
            else {
              setWorked(false);
              if (v.formula !== undefined) setVar(v.id, { formula: undefined, live: undefined });
            }
          }}
        />
        {v.type === 'number' && <NumberField value={Number(v.initial)} onChange={(x) => setVar(v.id, { initial: x }, `var-${v.id}`)} />}
        {v.type === 'string' && <TextField value={String(v.initial)} onChange={(x) => setVar(v.id, { initial: x }, `var-${v.id}`)} />}
        {v.type === 'boolean' && <CheckField label={v.initial ? 'true' : 'false'} value={!!v.initial} onChange={(x) => setVar(v.id, { initial: x })} />}
        {v.type === 'color' && <ColorField value={String(v.initial)} onChange={(x) => setVar(v.id, { initial: x }, `var-${v.id}`)} />}
        {v.type === 'list' && (
          <div>
            <ListTable label={`${v.name} starting items`} value={String(v.initial)} onChange={(x) => setVar(v.id, { initial: x }, `var-${v.id}`)} jsonTitle="The starting items as JSON: an array, usually of objects" />
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
        {worked && (
          <ExprField
            value={v.formula ?? ''}
            commitOnBlur
            calc
            title="A formula that works this variable out from the ones above it each time the project starts, instead of using the value above, for example crossword(words, 10) or wordSearch(words, 12). The value above is what it falls back to if the formula fails. The preview on the canvas follows it too."
            placeholder="Or work it out: e.g. crossword(words, 10)"
            onChange={(x) => setVar(v.id, x.trim() ? { formula: x } : { formula: undefined, live: undefined }, `var-formula-${v.id}`)}
          />
        )}
        {worked && v.formula?.trim() && (
          <CheckField
            label="Keep up to date"
            title="Work the formula out again whenever a variable (or a layer, or data) it reads changes, not just when the project starts. A live variable is read only: Set variable, scripts and inputs cannot change it."
            value={!!v.live}
            onChange={(x) => setVar(v.id, x ? { live: true, userData: undefined } : { live: undefined })}
          />
        )}
        {isLive(v) && circular && <div className="error small">This reads itself, or reads live variables that read it, so it stays at its starting value.</div>}
        {isLive(v) && writers > 0 && <div className="error small">{writers} interaction node(s) try to set this; they do nothing to it.</div>}
        <details className="var-options" open={optionsOpen}>
          <summary title="Settings most variables never need">Options</summary>
          <CheckField
            label="Remember"
            title="Keep the value between visits: in the learner's record when results are kept, otherwise in their browser. For a score or a place they got to, so they pick up where they left off."
            value={!!v.persist}
            onChange={(x) => setVar(v.id, { persist: x })}
          />
          <SectionBlurb text="Keeps the value when the learner comes back." name="remembering variables" help={['variables', 'putting-variables-back']} />
          <CheckField
            label="Save as user data"
            title="Keep this value for the person playing: it is loaded before the project starts, saved a moment after it changes and when they leave the page or move to another artboard (the same place Save user data and Load user data use). userData.loaded is true in expressions once it has been looked for. Not for live variables."
            value={!!v.userData}
            disabled={isLive(v)}
            onChange={(x) => setVar(v.id, { userData: x ? true : undefined })}
          />
          <SectionBlurb text="Saves the value for each person on the server, so it follows them to another device." name="user data" help={['variables', 'save-as-user-data']} />
          <CheckField
            label="Shared with instances"
            title="One value for this page and every instance of a component inside it, so changing it in one copy changes it in all of them. Off: each instance has its own. Imported Rive view models come in shared."
            value={!!v.shared}
            onChange={(x) => setVar(v.id, { shared: x ? true : undefined })}
          />
        </details>
      </td>
      <td>
        <IconButton icon={<Icons.trash />} title={used.length ? `Delete variable (used in ${used.length} ${used.length === 1 ? 'place' : 'places'}, you will be asked first)` : 'Delete variable'} onClick={() => void remove()} />
      </td>
    </tr>
  );
}
