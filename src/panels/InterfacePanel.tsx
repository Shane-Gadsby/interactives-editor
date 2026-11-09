import { track } from '../lib/analytics';
import { useMemo, useState } from 'react';
import { checkInterface, referencePage, typeDefinitions, typeStem, type InterfaceIssue, type PayloadField, type PayloadShape, type PayloadType, type Project, type PublicDirection, type PublicMessage, type PublicVariable } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { CheckField, IconButton, SelectField, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { Modal } from '../components/ProjectModals';
import { download, fileSafe } from '../lib/export';
import { acceptRename, addMessage, addUsed, addVariable, removeMessage, removeMissing, removeVariable, setMessageEntry, setRestrict, setVariableEntry, suggestions } from '../lib/public-interface';
import { SectionBlurb } from '../components/SectionBlurb';

const DIRECTIONS: { value: PublicDirection; label: string }[] = [
  { value: 'input', label: 'Input' },
  { value: 'output', label: 'Output' },
  { value: 'both', label: 'Both' },
];

const PAYLOADS: { value: PayloadType; label: string }[] = [
  { value: 'none', label: 'Nothing' },
  { value: 'string', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'True or false' },
  { value: 'object', label: 'Object' },
  { value: 'any', label: 'Anything' },
];

const FIELD_TYPES = [
  { value: 'string' as const, label: 'Text' },
  { value: 'number' as const, label: 'Number' },
  { value: 'boolean' as const, label: 'True or false' },
  { value: 'any' as const, label: 'Anything' },
];

const edit = (recipe: (p: Project) => void, coalesce?: string) => store().update((d) => recipe(d as Project), coalesce ? { coalesce } : {});

function download_(name: string, text: string, type: string): void {
  download(new Blob([text], { type }), name);
}

/** The reference page as it will ship, shown in a frame (it cannot reach the editor). */
export function ReferenceModal({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const html = useMemo(() => referencePage(project, { src: `${fileSafe(project.name)}.ixp` }), [project]);
  return (
    <Modal title="Reference page" help="public-interface" onClose={onClose} className="pi-reference-modal">
      <iframe className="pi-reference-frame" title="Generated reference page" sandbox="" srcDoc={html} />
      <div className="pi-reference-actions">
        <button className="btn" title="Download this page as a file" onClick={() => download_(`${fileSafe(project.name)}-reference.html`, html, 'text/html')}>
          <Icons.download width={14} /> Download HTML
        </button>
      </div>
    </Modal>
  );
}

function IssueNote({ issue, children }: { issue?: InterfaceIssue; children?: React.ReactNode }) {
  if (!issue) return null;
  return (
    <div className={`pi-issue ${issue.level}`} role="note">
      <span>{issue.message}</span>
      {children}
    </div>
  );
}

function VariableRow({ pv, project, issues }: { pv: PublicVariable; project: Project; issues: InterfaceIssue[] }) {
  const v = project.variables.find((x) => x.id === pv.variable) ?? project.variables.find((x) => !!pv.name && x.name === pv.name);
  const missing = issues.find((i) => i.kind === 'missing-variable' && i.name === (pv.name || pv.variable));
  const renamed = issues.find((i) => i.kind === 'renamed' && i.name === pv.name);
  const shown = v?.name ?? pv.name;
  return (
    <div className="pi-row" data-kind="variable">
      <div className="pi-line">
        <code className="pi-name" title={missing ? 'This variable no longer exists' : `A ${v?.type ?? ''} variable`}>
          {shown}
        </code>
        {v && <span className="badge">{v.type === 'enum' ? `choice: ${(v.options ?? []).join(' / ')}` : v.type}</span>}
        <SelectField
          value={pv.direction}
          options={DIRECTIONS}
          title="Input: the page sets it. Output: the page reads it (ix-variable events, getVariable). Both: either"
          onChange={(direction) => edit((p) => setVariableEntry(p, pv.variable, { direction }))}
        />
        <TextField value={pv.description ?? ''} commitOnBlur placeholder="What it is, for the developer" title="Shown in the reference page and the TypeScript definitions" onChange={(description) => edit((p) => setVariableEntry(p, pv.variable, { description }), `pi-d-${pv.variable}`)} />
        <IconButton icon={<Icons.trash />} title="Take it off the public interface (the variable stays in the project)" onClick={() => edit((p) => removeVariable(p, pv.variable))} />
      </div>
      <IssueNote issue={missing}>
        <button className="btn small-btn" onClick={() => edit((p) => removeMissing(p))} title="Take every entry whose variable is gone off the list">
          Remove it
        </button>
      </IssueNote>
      <IssueNote issue={renamed}>
        <button className="btn small-btn" onClick={() => edit((p) => acceptRename(p, pv.variable))} title={`Hosts will need to use "${v?.name ?? ''}" from now on`}>
          Use the new name
        </button>
      </IssueNote>
    </div>
  );
}

function PayloadEditor({ m }: { m: PublicMessage }) {
  const payload: PayloadShape = m.payload ?? { type: 'any' };
  const set = (next: PayloadShape) => edit((p) => setMessageEntry(p, m.name, m.direction, { payload: next }));
  const fields = payload.fields ?? [];
  const setField = (i: number, patch: Partial<PayloadField>) => set({ ...payload, fields: fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  return (
    <div className="pi-payload">
      <SelectField label="Carries" value={payload.type} options={PAYLOADS} title="What the message carries, for the reference page and the TypeScript definitions" onChange={(type) => set({ type, ...(type === 'object' && payload.fields ? { fields: payload.fields } : {}) })} />
      {payload.type === 'object' && (
        <div className="pi-fields">
          {fields.map((f, i) => (
            <div className="pi-field" key={i}>
              <TextField value={f.name} commitOnBlur placeholder="field" onChange={(name) => setField(i, { name })} />
              <SelectField value={f.type} options={FIELD_TYPES} onChange={(type) => setField(i, { type })} />
              <CheckField label="Optional" value={!!f.optional} onChange={(optional) => setField(i, { optional: optional || undefined })} />
              <IconButton icon={<Icons.trash />} title="Remove this field" onClick={() => set({ ...payload, fields: fields.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <button className="btn small-btn" title="Add a field to the object" onClick={() => set({ ...payload, fields: [...fields, { name: `field${fields.length + 1}`, type: 'string' }] })}>
            Add field
          </button>
        </div>
      )}
    </div>
  );
}

function MessageRow({ m, issues }: { m: PublicMessage; issues: InterfaceIssue[] }) {
  const issue = issues.find((i) => (i.kind === 'nothing-listens' || i.kind === 'nothing-sends') && i.name === m.name);
  return (
    <div className="pi-row" data-kind="message">
      <div className="pi-line">
        <TextField value={m.name} commitOnBlur mono title="The message's name" onChange={(name) => edit((p) => setMessageEntry(p, m.name, m.direction, { name }))} />
        <span className={`badge pi-dir ${m.direction}`} title={m.direction === 'receive' ? 'The page sends this in (player.send, host messages)' : 'The project sends this out (ix-message events)'}>
          {m.direction === 'receive' ? 'Received' : 'Sent'}
        </span>
        <TextField value={m.description ?? ''} commitOnBlur placeholder="What it means, for the developer" title="Shown in the reference page and the TypeScript definitions" onChange={(description) => edit((p) => setMessageEntry(p, m.name, m.direction, { description }), `pi-m-${m.direction}-${m.name}`)} />
        <IconButton icon={<Icons.trash />} title="Take it off the public interface" onClick={() => edit((p) => removeMessage(p, m.name, m.direction))} />
      </div>
      <PayloadEditor m={m} />
      <IssueNote issue={issue} />
    </div>
  );
}

/** Public interface: the variables and messages meant for whoever embeds the project. */
export function InterfacePanel() {
  const project = useEditor((s) => s.project);
  const pi = project.settings.publicInterface;
  const issues = useMemo(() => checkInterface(project), [project]);
  const found = useMemo(() => suggestions(project), [project]);
  const [pickVar, setPickVar] = useState('');
  const [newMsg, setNewMsg] = useState('');
  const [newDir, setNewDir] = useState<PublicMessage['direction']>('receive');
  const [showRef, setShowRef] = useState(false);
  const problems = issues.filter((i) => i.level !== 'info');
  const hints = issues.filter((i) => i.level === 'info');
  const nothing = !pi?.variables.length && !pi?.messages.length;

  const addFound = () => {
    let r = { messages: 0, variables: 0 };
    edit((p) => void (r = addUsed(p)));
    store().toast(r.messages + r.variables ? `Added ${r.variables} variable${r.variables === 1 ? '' : 's'} and ${r.messages} message${r.messages === 1 ? '' : 's'}` : 'Nothing new found: everything the project sends, hears or works with is on the list');
  };
  const addMsg = () => {
    if (!newMsg.trim()) return;
    track('feature', 'interface-add-message', { thing: newDir });
    edit((p) => void addMessage(p, newMsg, newDir));
    setNewMsg('');
  };

  return (
    <div className="pi-panel">
      <div className="pi-toolbar">
        <button className="btn" data-track="interface-add-found" onClick={addFound} title="Add the messages the project sends and listens for, and the variables its flows and controls work with. Pick any others from the list beside it">
          <Icons.plus width={14} /> Add from what the project uses
        </button>
        <SelectField
          value={pickVar}
          options={[{ value: '', label: found.variables.length ? 'Add a variable…' : 'Every variable is on the list' }, ...found.variables.map((x) => ({ value: x.variable.id, label: `${x.variable.name} (${x.direction})` }))]}
          title="Make one more variable public. It starts as an input unless the project changes it itself"
          onChange={(id) => {
            if (id) (track('feature', 'interface-add-variable'), edit((p) => void addVariable(p, id)));
            setPickVar('');
          }}
        />
        <TextField value={newMsg} placeholder="New message name" title="A message to add by hand: one the project sends out, or one the page can send in" onChange={setNewMsg} />
        <SelectField
          value={newDir}
          options={[
            { value: 'receive', label: 'Received' },
            { value: 'send', label: 'Sent' },
          ]}
          title="Received: the page sends it into the project. Sent: the project sends it out to the page"
          onChange={setNewDir}
        />
        <button className="btn" disabled={!newMsg.trim()} onClick={addMsg} title="Add this message to the list">
          Add message
        </button>
        <div className="spacer" />
        <CheckField
          label="Only public inputs can be set from outside"
          title="Attributes on the element and messages from the page around an exported file can only set the inputs listed here and send the received messages listed here. Off by default so embeds that exist keep working. Code holding the player object is not held to it"
          value={!!pi?.restrictInputs}
          onChange={(on) => edit((p) => setRestrict(p, on))}
        />
        <button className="btn" disabled={nothing} onClick={() => setShowRef(true)} title="See the reference page that goes in the .ixp package: inputs, outputs, messages and a worked embed example">
          Reference page
        </button>
        <button className="btn" disabled={nothing} onClick={() => download_(`${fileSafe(project.name)}.d.ts`, typeDefinitions(project), 'text/plain')} title={`Download TypeScript definitions (${typeStem(project)}Inputs, ${typeStem(project)}Player and the rest)`}>
          <Icons.download width={14} /> .d.ts
        </button>
      </div>
      <div className="pi-body">
        {problems.length > 0 && (
          <div className="pi-summary" role="alert">
            {problems.length === 1 ? '1 thing on this list no longer matches' : `${problems.length} things on this list no longer match`} the project. Exporting will ask about them.
          </div>
        )}
        {nothing ? (
          <SectionBlurb
            className="pi-empty"
            text={
              <>
                Nothing is public yet. List what embedding developers can use, starting with <strong>Add from what the project uses</strong>.
              </>
            }
            name="the public interface"
            help={['public-interface', 'the-list']}
          />
        ) : (
          <div className="pi-columns">
            <section aria-label="Variables">
              <h4>Variables</h4>
              {pi?.variables.length ? pi.variables.map((pv) => <VariableRow key={pv.variable} pv={pv} project={project} issues={issues} />) : <p className="hint">No variables are public.</p>}
            </section>
            <section aria-label="Messages">
              <h4>Messages</h4>
              {pi?.messages.length ? pi.messages.map((m) => <MessageRow key={`${m.direction}:${m.name}`} m={m} issues={issues} />) : <p className="hint">No messages are public.</p>}
              {found.messages.length > 0 && (
                <div className="pi-found">
                  <span className="muted">In the project, not on the list:</span>
                  {found.messages.map((m) => (
                    <button key={`${m.direction}:${m.name}`} className="btn small-btn" title={`${m.direction === 'receive' ? 'Heard' : 'Sent'} by ${m.where.join(', ')}. Add it to the list`} onClick={() => edit((p) => void addMessage(p, m.name, m.direction))}>
                      + {m.name} <span className="muted">{m.direction === 'receive' ? 'heard' : 'sent'}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
        {hints.length > 0 && !nothing && <p className="hint pi-hints">{hints.length} message{hints.length === 1 ? ' is' : 's are'} used in the project and not listed. Use the + buttons to add them.</p>}
        <SectionBlurb
          text={
            <>
              Developers see this list as <code>player.describe()</code> and in the reference page.
            </>
          }
          name="the public interface"
          help={['public-interface', 'what-you-get']}
        />
      </div>
      {showRef && <ReferenceModal onClose={() => setShowRef(false)} />}
    </div>
  );
}
