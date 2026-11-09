import { useEffect, useMemo, useRef, useState } from 'react';
import { COMMANDS, GROUPS, allConflicts, bindingsOf, commandById, conflictsFor, eventCombo, formatCombo, heldCombo, isCharacterKey, normalCombo, withBinding, withoutBinding, type CommandDef, type Context } from '../lib/keymap';
import { usePrefs } from '../lib/prefs';
import { setKeymap } from '../lib/keymap-sets';
import { ensureCommandKeys } from '../lib/command-keys';
import { takeKeysSearch } from '../lib/prefs-window';

const WHERE: Record<Context, string> = {
  everywhere: 'Everywhere',
  canvas: 'Canvas and Layers',
  layers: 'Layers',
  timeline: 'Timeline',
  graph: 'Interactions graph',
  inspector: 'Properties',
};

//What the mouse does with a key held (these are gestures, so they are listed but not rebindable)
const MOUSE: [string, string][] = [
  ['Alt + drag', 'Drag a copy: layers on the canvas, pages, page groups, and rows in the Layers list'],
  ['Shift + click', 'In the Layers list, pick everything from the last one you clicked to this one; on the canvas, add to the pick'],
  ['Shift + \u2191 / \u2193', 'In the Layers list, extend the pick one layer at a time'],
  ['Ctrl + click', 'Pick the layer inside a group, or add one layer to (or take one off) the pick in the Layers list and the graph'],
  ['Menu key or Shift + F10', 'Open the right-click menu of a key in the Timeline (a text key has Swap text)'],
  ['Space + drag', 'Pan the canvas (or use the Hand tool)'],
  ['Alt + click a section', 'Open only that section of the Properties panel'],
  ['Shift while dragging a number', 'Change it ten times faster (Alt: ten times slower)'],
  ['Ctrl while dragging', 'Turn snapping off for that drag'],
];

type Pending = { id: string; combo: string; others: CommandDef[] };

/** Every command with its keys: search, find what a key does, and give any of them keys of your own. The one list the Keyboard shortcuts page is made of. */
export function KeymapList() {
  const p = usePrefs();
  const [q, setQ] = useState(() => takeKeysSearch() ?? '');
  const [finding, setFinding] = useState(false);
  const [byCombo, setByCombo] = useState('');
  const [rec, setRec] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [onlyKeyed, setOnlyKeyed] = useState(false);
  //Every panel, window, tool and action can be given a key, so they are all in the list
  ensureCommandKeys();

  const recording = rec !== null || finding;
  //The most modifiers held at once while a hold-while binding is being recorded: it is taken when they are all let go
  const heldMost = useRef('');
  useEffect(() => {
    //Capture phase, ahead of everything: while a key is being recorded every press is the new key, and Escape only cancels that
    const onKey = (e: KeyboardEvent) => {
      if (recording) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.key === 'Escape') {
          heldMost.current = '';
          setRec(null);
          setFinding(false);
          return;
        }
        //A hold-while binding (Round a guide...) is modifiers held down, not a key press: keep the most that were down together
        if (rec && commandById(rec)?.hold) {
          const now = heldCombo(e);
          if (now.split('+').length > heldMost.current.split('+').filter(Boolean).length) heldMost.current = now;
          return;
        }
        const combo = eventCombo(e);
        if (!combo) return;
        if (finding) {
          setByCombo(combo);
          setFinding(false);
          return;
        }
        if (rec) take(rec, combo);
        return;
      }
      if (e.key === 'Escape' && pending) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setPending(null);
      }
    };
    //Letting go of every modifier finishes a hold-while recording
    const onUp = (e: KeyboardEvent) => {
      if (!rec || !commandById(rec)?.hold) return;
      e.preventDefault();
      e.stopPropagation();
      if (heldCombo(e) !== '') return;
      const got = heldMost.current;
      heldMost.current = '';
      if (got) take(rec, got);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onUp, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onUp, true);
    };
  });

  const save = (id: string, keys: string[]) => setKeymap(withBinding(p.keymap, id, keys));

  /** Give `combo` to command `id`, asking first when another command in the same place already has it. */
  const take = (id: string, combo: string) => {
    setRec(null);
    const n = normalCombo(combo);
    const have = bindingsOf(id);
    if (have.includes(n)) return;
    const others = conflictsFor(id, n);
    if (others.length) return setPending({ id, combo: n, others });
    save(id, [...have, n].slice(0, 4));
  };
  const takeFromOthers = (pd: Pending) => {
    let next = p.keymap;
    for (const o of pd.others) next = withBinding(next, o.id, bindingsOf(o.id).filter((k) => k !== pd.combo));
    next = withBinding(next, pd.id, [...bindingsOf(pd.id), pd.combo].slice(0, 4));
    setKeymap(next);
    setPending(null);
  };

  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      COMMANDS.filter((c) => {
        if (byCombo) return bindingsOf(c.id).includes(byCombo);
        if (onlyKeyed && !bindingsOf(c.id).length) return false;
        if (!needle) return true;
        const text = `${c.name} ${c.group} ${c.hold ?? WHERE[c.context]} ${c.words ?? ''} ${bindingsOf(c.id).map((k) => formatCombo(k)).join(' ')}`.toLowerCase();
        return needle.split(/\s+/).every((w) => text.includes(w));
      }),
    // the keys are read from the person's preferences, so a change to them redoes the list
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [needle, byCombo, onlyKeyed, p.keymap, p.keymapPreset],
  );
  const clashes = allConflicts();
  const box = useRef<HTMLDivElement>(null);

  return (
    <div className="keys-list" ref={box}>
      <div className="keys-controls">
        <div className="keys-search">
          <input type="search" aria-label="Search the shortcuts by name" placeholder="Search by name, or by key" value={q} onChange={(e) => (setQ(e.target.value), setByCombo(''))} onKeyDown={(e) => e.stopPropagation()} />
          <button type="button" className={`btn small-btn${finding ? ' on' : ''}`} title="Press a key or keys to see what they do. Esc stops" onClick={() => (setFinding(!finding), setByCombo(''))}>
            {finding ? 'Press the keys…' : 'Find a key'}
          </button>
          {byCombo && (
            <button type="button" className="btn small-btn on" title="Show every shortcut again" onClick={() => setByCombo('')}>
              {formatCombo(byCombo)} ×
            </button>
          )}
        </div>
        <label className="field check-field" title="Hide the commands that have no key yet. Every panel, tool and action is in the list so any of them can be given one: search for it, then Set key">
          <input type="checkbox" checked={onlyKeyed} onChange={(e) => setOnlyKeyed(e.target.checked)} />
          <span>Only ones with a key</span>
        </label>
      </div>
      {clashes.length > 0 && (
        <p className="keys-clash" role="status">
          {clashes.length === 1 ? 'One key is' : `${clashes.length} keys are`} used twice in the same place: {clashes.slice(0, 3).map((c) => `${formatCombo(c.combo)} (${c.commands.map((x) => x.name).join(' and ')})`).join('; ')}
          {clashes.length > 3 ? '…' : ''}. Only the first one works.
        </p>
      )}
      {pending && (
        <div className="keys-pending" role="alertdialog" aria-label="This key is already in use">
          <span>
            <kbd>{formatCombo(pending.combo)}</kbd> is already {pending.others.map((o) => o.name).join(' and ')}. Use it for {commandById(pending.id)?.name} instead?
          </span>
          <button type="button" className="btn small-btn primary" onClick={() => takeFromOthers(pending)}>
            Use it here
          </button>
          <button type="button" className="btn small-btn" onClick={() => setPending(null)}>
            Keep it as it was
          </button>
        </div>
      )}
      <div className="keys-body" aria-live="polite">
        {GROUPS.map((g) => {
          const list = shown.filter((c) => c.group === g);
          if (!list.length) return null;
          return (
            <section key={g} className="keys-group" aria-label={g}>
              <h4>{g}</h4>
              <table>
                <tbody>
                  {list.map((c) => (
                    <KeyRow key={c.id} c={c} recording={rec === c.id} onRecord={() => (setFinding(false), setRec(rec === c.id ? null : c.id))} onChange={(keys) => save(c.id, keys)} onReset={() => setKeymap(withoutBinding(p.keymap, c.id))} />
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
        {!byCombo && !needle && (
          <section className="keys-group" aria-label="Mouse gestures">
            <h4>Mouse gestures</h4>
            <table>
              <tbody>
                {MOUSE.map(([k, what]) => (
                  <tr key={k}>
                    <td className="keys-name">{what}</td>
                    <td className="keys-where">Gesture</td>
                    <td className="keys-keys">
                      <kbd>{k}</kbd>
                    </td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {!shown.length && <p className="muted">{byCombo ? `Nothing uses ${formatCombo(byCombo)}.` : `No shortcut matches “${q.trim()}”.`}</p>}
      </div>
      <p className="keys-foot muted small">Your keys are saved with you (not in the project) and follow you between browsers. Ctrl is Cmd on a Mac.</p>
    </div>
  );
}

function KeyRow({ c, recording, onRecord, onChange, onReset }: { c: CommandDef; recording: boolean; onRecord: () => void; onChange: (keys: string[]) => void; onReset: () => void }) {
  const own = !!(usePrefs().keymap ?? {})[c.id];
  const keys = bindingsOf(c.id);
  return (
    <tr className={recording ? 'recording' : undefined}>
      <td className="keys-name">{c.name}</td>
      <td className="keys-where">{c.hold ?? WHERE[c.context]}</td>
      <td className="keys-keys">
        {keys.map((k) => (
          <span key={k} className="keys-chip">
            <kbd title={isCharacterKey(k) ? 'A one-key shortcut: the switch above turns these off' : undefined}>{formatCombo(k)}</kbd>
            {!c.fixed && (
              <button type="button" className="keys-x" aria-label={`Take ${formatCombo(k)} off ${c.name}`} title={`Take ${formatCombo(k)} off ${c.name}`} onClick={() => onChange(keys.filter((x) => x !== k))}>
                ×
              </button>
            )}
          </span>
        ))}
        {!keys.length && <span className="muted small">No key</span>}
        {recording && <span className="keys-listen">{c.hold ? 'Hold the keys you want, then let go (Esc cancels)' : 'Press the new keys (Esc cancels)'}</span>}
      </td>
      <td className="keys-act">
        {c.fixed ? (
          <span className="muted small" title="The browser or the page owns this key">
            Fixed
          </span>
        ) : (
          <>
            <button type="button" className={`btn small-btn${recording ? ' on' : ''}`} disabled={keys.length >= 4 && !recording} aria-label={`Add a key to ${c.name}`} title={keys.length >= 4 ? 'Four keys is the most; take one off first' : c.hold ? 'Hold the keys you want to add (Ctrl, Shift, Alt), then let go' : 'Press the keys you want to add'} onClick={onRecord}>
              {recording ? 'Listening…' : keys.length ? 'Add key' : 'Set key'}
            </button>
            {own && (
              <button type="button" className="btn small-btn" aria-label={`Put ${c.name} back to its default`} title="Back to the default keys" onClick={onReset}>
                Reset
              </button>
            )}
          </>
        )}
      </td>
    </tr>
  );
}
