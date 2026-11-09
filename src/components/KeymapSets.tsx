import { useEffect, useRef, useState } from 'react';
import { usePrefs } from '../lib/prefs';
import { PRESETS, formatCombo, type Preset } from '../lib/keymap';
import { MAX_NAME, MAX_SETS, activeLabel, activeSet, addImported, currentAsFile, customSets, deleteSet, duplicateSet, exportFileName, exportText, renameSet, reviewImport, saveCurrentAs, shareCode, shareLink, uniqueName, useBuiltIn, useSaved, type ImportReview } from '../lib/keymap-sets';
import { takeImport, usePrefsWindow } from '../lib/prefs-window';
import { announce } from '../lib/announce';
import { alertDialog, choiceDialog, confirmDialog, promptDialog } from './dialogs';

const baseName = (b: Preset) => PRESETS.find((x) => x.id === b)?.label ?? 'Default';

/** The keys in use belong to a built-in set with changes on top that nothing has saved yet: ask what to do before they would be lost. True to carry on. */
async function keepChanges(): Promise<boolean> {
  const a = activeSet();
  if (a.kind !== 'built-in' || !a.modified) return true;
  const r = await choiceDialog({
    title: 'Keep your changed keys?',
    message: `You have changed some keys on top of ${a.name}, and they are not saved under a name. Save them as a set first, or carry on without them.`,
    confirmLabel: 'Save them first…',
    altLabel: 'Carry on without them',
    altDanger: true,
  });
  if (r === null) return false;
  if (r === 'alt') return true;
  return (await askSave()) !== null;
}

async function askSave(initial = ''): Promise<string | null> {
  const name = await promptDialog({
    title: 'Save these keys as a set',
    label: 'Name',
    initial: initial || uniqueName('My keys', [...PRESETS.map((x) => x.label), ...customSets().map((s) => s.name)]),
    confirmLabel: 'Save',
    validate: (v) => (v.trim() ? (v.length > MAX_NAME ? `Keep it under ${MAX_NAME} letters` : null) : 'Give it a name'),
  });
  if (name === null) return null;
  const set = saveCurrentAs(name);
  if (!set) {
    await alertDialog({ title: 'No room for another set', message: `You can keep ${MAX_SETS} sets. Delete one you no longer use first.` });
    return null;
  }
  announce(`Saved as ${set.name}`);
  return set.name;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The set picker at the top of the Keyboard shortcuts page, with the menu of what can be done with sets. */
export function KeymapSetBar() {
  const p = usePrefs();
  const a = activeSet(p);
  const saved = customSets(p);
  const [panel, setPanel] = useState<null | 'share' | 'import'>(null);
  const [note, setNote] = useState('');
  //Someone opened the editor from a share link: the import box comes up with it filled in
  const w = usePrefsWindow();
  const [seed, setSeed] = useState<{ text: string; n: number }>({ text: '', n: 0 });
  useEffect(() => {
    const t = w.pendingImport ? takeImport() : null;
    if (t) (setSeed({ text: t, n: Date.now() }), setPanel('import'));
  }, [w.pendingImport]);
  const say = (t: string) => (setNote(t), announce(t));
  const value = a.kind === 'saved' ? a.set.id : a.id;

  const choose = async (v: string) => {
    if (v === value) return;
    if (!(await keepChanges())) return;
    //(saving under a name moved the person onto the new set, so the switch is still wanted)
    if (PRESETS.some((x) => x.id === v)) useBuiltIn(v as Preset);
    else if (!useSaved(v)) return;
    const now = activeSet();
    say(`Using ${activeLabel(now)}`);
  };

  const onSaveAs = async () => {
    const n = await askSave();
    if (n) say(`Saved as ${n}`);
  };
  const onRename = async () => {
    if (a.kind !== 'saved') return;
    const name = await promptDialog({ title: 'Rename this set', label: 'Name', initial: a.set.name, confirmLabel: 'Rename', validate: (v) => (v.trim() ? null : 'Give it a name') });
    if (name === null) return;
    renameSet(a.set.id, name);
    say('Renamed');
  };
  const onDuplicate = () => {
    if (a.kind !== 'saved') return;
    const d = duplicateSet(a.set.id);
    if (!d) return void alertDialog({ title: 'No room for another set', message: `You can keep ${MAX_SETS} sets. Delete one you no longer use first.` });
    say(`Made ${d.name} and switched to it`);
  };
  const onDelete = async () => {
    if (a.kind !== 'saved') return;
    if (!(await confirmDialog({ title: 'Delete this set', message: `Delete “${a.set.name}”? Your keys go back to the Default set. Anyone you shared it with keeps their copy.`, confirmLabel: 'Delete', danger: true }))) return;
    deleteSet(a.set.id);
    say('Deleted. Using Default');
  };
  const onExport = async () => {
    const f = currentAsFile();
    const { download } = await import('../lib/export');
    download(new Blob([exportText(f)], { type: 'application/json' }), exportFileName(f));
    say(`Saved ${exportFileName(f)} to your downloads`);
  };

  return (
    <div className="keys-sets">
      <div className="keys-setrow">
        <label className="field select-field keys-setpick" title="The keys in use. Built-in sets cannot be changed: change a key and it is kept on top of the set until you save it under a name of your own">
          <span className="field-label">Keyboard set</span>
          <select value={value} onChange={(e) => void choose(e.target.value)}>
            <optgroup label="Built in">
              {PRESETS.map((x) => (
                <option key={x.id} value={x.id} title={x.tip}>
                  {a.kind === 'built-in' && a.id === x.id ? activeLabel(a) : x.label}
                </option>
              ))}
            </optgroup>
            {saved.length > 0 && (
              <optgroup label="Mine">
                {saved.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <button type="button" className="btn" title="Keep the keys in use under a name of your own, and carry on with that set" onClick={() => void onSaveAs()}>
          Save as…
        </button>
        <SetMenu
          items={[
            { label: 'Rename…', disabled: a.kind !== 'saved', title: a.kind === 'saved' ? 'Give this set another name' : 'Built-in sets keep their names. Save your keys as a set to name them', run: () => void onRename() },
            { label: 'Duplicate', disabled: a.kind !== 'saved', title: a.kind === 'saved' ? 'Make a copy of this set to change without touching it' : 'Use Save as… to keep a copy of a built-in set', run: onDuplicate },
            { label: 'Delete…', disabled: a.kind !== 'saved', title: a.kind === 'saved' ? 'Take this set away' : 'Built-in sets cannot be deleted', run: () => void onDelete() },
            { divider: true },
            { label: 'Export to a file', title: 'Save the keys in use as a small file you can keep or send', run: () => void onExport() },
            { label: 'Share…', title: 'A code, or a link, someone else can use to add these keys', run: () => setPanel(panel === 'share' ? null : 'share') },
            { label: 'Import…', title: 'Add a set from a share code, a link or an exported file', run: () => setPanel(panel === 'import' ? null : 'import') },
          ]}
        />
      </div>
      <p className="muted small keys-setnote" title={a.kind === 'built-in' ? PRESETS.find((x) => x.id === a.id)?.tip : undefined}>
        {a.kind === 'saved' ? `Your set, starting from ${baseName(a.set.base)}. Every key you change is kept in it.` : a.modified ? `${a.name} with your changes on top. Save as… keeps them under a name.` : (PRESETS.find((x) => x.id === a.id)?.tip ?? '')}
      </p>
      <p className="sr-only" role="status">
        {note}
      </p>
      {panel === 'share' && <SharePanel onClose={() => setPanel(null)} />}
      {panel === 'import' && <ImportPanel key={seed.n} initial={seed.text} onClose={() => setPanel(null)} onDone={say} />}
    </div>
  );
}

type MenuItem = { label: string; run: () => void; disabled?: boolean; title?: string; divider?: false } | { divider: true };

/** A small pop-up menu on a button: arrow keys move, Enter picks, Esc closes it (and only it). */
function SetMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', off);
    wrap.current?.querySelector<HTMLElement>('[role=menuitem]:not(:disabled)')?.focus();
    return () => document.removeEventListener('pointerdown', off);
  }, [open]);
  const move = (e: React.KeyboardEvent) => {
    const list = [...(wrap.current?.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)') ?? [])];
    const at = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (e.key === 'ArrowDown') (e.preventDefault(), list[(at + 1) % list.length]?.focus());
    else if (e.key === 'ArrowUp') (e.preventDefault(), list[(at - 1 + list.length) % list.length]?.focus());
    else if (e.key === 'Home') (e.preventDefault(), list[0]?.focus());
    else if (e.key === 'End') (e.preventDefault(), list[list.length - 1]?.focus());
    else if (e.key === 'Tab') setOpen(false);
  };
  return (
    <div className="keys-menu" ref={wrap}>
      <button ref={trigger} type="button" className={`btn${open ? ' on' : ''}`} aria-haspopup="menu" aria-expanded={open} title="Rename, copy, delete, export, share and import sets" onClick={() => setOpen(!open)}>
        More ▾
      </button>
      {open && (
        <div className="keys-menu-list" role="menu" aria-label="Keyboard set actions" onKeyDown={move}>
          {items.map((it, i) =>
            'divider' in it && it.divider ? (
              <div key={i} className="keys-menu-sep" role="separator" />
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                className="keys-menu-item"
                disabled={(it as { disabled?: boolean }).disabled}
                title={(it as { title?: string }).title}
                onClick={() => {
                  setOpen(false);
                  (it as { run: () => void }).run();
                }}
              >
                {(it as { label: string }).label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function SharePanel({ onClose }: { onClose: () => void }) {
  const f = currentAsFile();
  const code = shareCode(f);
  const link = shareLink(f);
  const [said, setSaid] = useState('');
  const ta = useRef<HTMLTextAreaElement>(null);
  const doCopy = async (what: string, text: string) => {
    if (!(await copy(text))) {
      ta.current?.select();
      setSaid('Copying is blocked here. The code is selected: copy it yourself');
      return;
    }
    setSaid(`Copied the ${what}`);
    announce(`Copied the ${what}`);
  };
  return (
    <section className="keys-panel" aria-label="Share these keys">
      <h4>Share “{f.name}”</h4>
      <p className="muted small">
        Anyone signed in to the editor can paste the code into Import, or open the link, and look at the keys before they add them. The set travels inside the code and the link: nothing is kept on a server, and what you share is a copy, so changing your set later changes nothing for them.
      </p>
      <textarea ref={ta} readOnly rows={3} aria-label="Share code" value={code} onFocus={(e) => e.currentTarget.select()} />
      <div className="keys-panel-actions">
        <button type="button" className="btn small-btn primary" onClick={() => void doCopy('code', code)}>
          Copy code
        </button>
        <button type="button" className="btn small-btn" onClick={() => void doCopy('link', link)}>
          Copy link
        </button>
        <button type="button" className="btn small-btn" onClick={onClose}>
          Done
        </button>
        <span className="muted small" role="status">
          {said}
        </span>
      </div>
    </section>
  );
}

function ImportPanel({ initial, onClose, onDone }: { initial: string; onClose: () => void; onDone: (t: string) => void }) {
  const [text, setText] = useState(initial);
  const [review, setReview] = useState<ImportReview | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const look = (t: string) => {
    const r = reviewImport(t);
    if (!r.ok) {
      setReview(null);
      setError(r.error);
      return;
    }
    setError('');
    setReview(r.review);
    setName(r.review.name);
  };
  useEffect(() => {
    if (text) look(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async (use: boolean) => {
    if (!review) return;
    if (use && !(await keepChanges())) return;
    const clean = name.trim() || review.name;
    const set = addImported(review, clean, use);
    if (!set) return void alertDialog({ title: 'No room for another set', message: `You can keep ${MAX_SETS} sets. Delete one you no longer use first.` });
    onDone(use ? `Added ${set.name} and switched to it` : `Added ${set.name} to your sets`);
    onClose();
  };

  return (
    <section className="keys-panel" aria-label="Import keys">
      <h4>Import keys</h4>
      <p className="muted small">Paste a share code or a link, or choose a file someone exported. You see what it would do before anything is added, and it is added as a new set: none of yours is changed.</p>
      <textarea
        rows={3}
        aria-label="Share code, link or file text"
        placeholder="Paste a share code or link here"
        value={text}
        onChange={(e) => (setText(e.target.value), setReview(null), setError(''))}
      />
      <div className="keys-panel-actions">
        <button type="button" className="btn small-btn primary" disabled={!text.trim()} onClick={() => look(text)}>
          Look at it
        </button>
        <button type="button" className="btn small-btn" onClick={() => file.current?.click()}>
          Choose a file…
        </button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json,text/plain"
          hidden
          aria-label="Choose an exported keys file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const t = f.size > 200_000 ? '' : await f.text();
            setText(t);
            look(t || ' ');
          }}
        />
        <button type="button" className="btn small-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
      {error && (
        <p className="keys-clash" role="alert">
          {error}
        </p>
      )}
      {review && <ReviewBox review={review} name={name} setName={setName} finish={finish} />}
    </section>
  );
}

function ReviewBox({ review, name, setName, finish }: { review: ImportReview; name: string; setName: (n: string) => void; finish: (use: boolean) => void }) {
  const n = review.entries.length;
  const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;
  return (
    <div className="keys-review" role="group" aria-label="What this set would do">
      <p>
        <strong>{plural(n, 'command')}</strong> with keys of their own, starting from {baseName(review.base)}. {review.differs ? `${plural(review.differs, 'command')} would have different keys from the ones you use now.` : 'It matches the keys you use now.'}
      </p>
      {review.unknown.length > 0 && (
        <p className="keys-note">
          {plural(review.unknown.length, 'command')} this editor does not have, left out: {review.unknown.slice(0, 5).join(', ')}
          {review.unknown.length > 5 ? '…' : ''}.
        </p>
      )}
      {review.fixed.length > 0 && <p className="keys-note">{plural(review.fixed.length, 'key')} that the browser or the page owns, left out.</p>}
      {review.badKeys > 0 && <p className="keys-note">{plural(review.badKeys, 'entry')} that were not keys, left out.</p>}
      {review.clashes.length > 0 && (
        <div className="keys-clash" role="status">
          <strong>{review.clashes.length === 1 ? 'One key is' : `${review.clashes.length} keys are`} used twice in the same place in this set:</strong>
          <ul>
            {review.clashes.slice(0, 6).map((c) => (
              <li key={c.combo}>
                <kbd>{formatCombo(c.combo)}</kbd> {c.names.join(' and ')}
              </li>
            ))}
          </ul>
          {review.clashes.length > 6 && <span>and {review.clashes.length - 6} more. </span>}
          You can still add it. Only the first command in the list gets a key used twice, until you change one.
        </div>
      )}
      {n > 0 && (
        <table className="keys-review-list">
          <tbody>
            {review.entries.slice(0, 10).map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td>{e.keys.length ? e.keys.map((k) => <kbd key={k}>{formatCombo(k)}</kbd>) : <span className="muted small">No key</span>}</td>
              </tr>
            ))}
            {n > 10 && (
              <tr>
                <td colSpan={2} className="muted small">
                  and {n - 10} more
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      <label className="field text-field keys-review-name">
        <span className="field-label">Name</span>
        <input type="text" value={name} maxLength={MAX_NAME} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="keys-panel-actions">
        <button type="button" className="btn small-btn primary" onClick={() => void finish(true)}>
          Add and use it
        </button>
        <button type="button" className="btn small-btn" onClick={() => void finish(false)}>
          Add, keep my keys
        </button>
      </div>
    </div>
  );
}
