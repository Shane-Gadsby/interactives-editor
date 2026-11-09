import { useEffect, useMemo, useRef, useState } from 'react';
import { closeShortcuts, useShortcutsOpen } from '../lib/shortcuts-sheet';
import { COMMANDS, GROUPS, PRESETS, allConflicts, bindingsOf, commandById, conflictsFor, eventCombo, formatCombo, isCharacterKey, normalCombo, suspendKeys, withBinding, withoutBinding, type CommandDef, type Context, type Preset } from '../lib/keymap';
import { setPrefs, usePrefs } from '../lib/prefs';
import { trapFocus } from '../lib/overlays';
import { IconButton } from './ui';
import { Icons } from './icons';
import { HelpLink } from '../help/Help';
import { confirmDialog } from './dialogs';

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
  ['Alt + drag', 'Drag a copy of the layers you are moving'],
  ['Shift + click', 'Add a layer to the ones you have picked'],
  ['Ctrl + click', 'Pick the layer inside a group, or add to the pick in the Layers list and the graph'],
  ['Space + drag', 'Pan the canvas (or the Hand tool)'],
  ['Alt + click a section', 'Open only that section of the Properties panel'],
  ['Shift while dragging a number', 'Change it ten times faster (Alt: ten times slower)'],
  ['Ctrl while dragging', 'Turn snapping off for that drag'],
];

/** Mounted once by the app: the keyboard shortcuts sheet, and where each person changes their own keys. */
export function ShortcutsHost() {
  const open = useShortcutsOpen();
  return open ? <ShortcutsModal onClose={closeShortcuts} /> : null;
}

type Pending = { id: string; combo: string; others: CommandDef[] };

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const p = usePrefs();
  const [q, setQ] = useState('');
  const [finding, setFinding] = useState(false);
  const [byCombo, setByCombo] = useState('');
  const [rec, setRec] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  //While the sheet is open the editor's own keys stand down, and the sheet's own listener handles Escape before anything else sees it
  useEffect(() => {
    suspendKeys(true);
    return () => suspendKeys(false);
  }, []);
  useEffect(() => (box.current ? trapFocus(box.current) : undefined), []);
  useEffect(() => {
    search.current?.focus();
  }, []);

  const recording = rec !== null || finding;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (recording) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') {
          setRec(null);
          setFinding(false);
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
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (pending) setPending(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const save = (id: string, keys: string[]) => setPrefs({ keymap: withBinding(p.keymap, id, keys) });

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
    setPrefs({ keymap: next });
    setPending(null);
  };

  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      COMMANDS.filter((c) => {
        if (byCombo) return bindingsOf(c.id).includes(byCombo);
        if (!needle) return true;
        const text = `${c.name} ${c.group} ${WHERE[c.context]} ${c.words ?? ''} ${bindingsOf(c.id).map((k) => formatCombo(k)).join(' ')}`.toLowerCase();
        return needle.split(/\s+/).every((w) => text.includes(w));
      }),
    // the keys are read from the person's preferences, so a change to them redoes the list
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [needle, byCombo, p.keymap, p.keymapPreset],
  );
  const clashes = allConflicts();
  const overrides = Object.keys(p.keymap ?? {}).length;

  const reset = async () => {
    if (await confirmDialog({ title: 'Reset all keyboard shortcuts?', message: 'Every key you changed goes back to the default, and the keys come from the Default set again. Your other preferences stay.', confirmLabel: 'Reset all' })) setPrefs({ keymap: {}, keymapPreset: 'default' });
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && !recording && onClose()}>
      <div className="modal keys-modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" tabIndex={-1} ref={box}>
        <header>
          <strong>Keyboard shortcuts</strong>
          <HelpLink topic="shortcuts" />
          <div className="spacer" />
          <IconButton icon={<Icons.close />} title="Close (Esc)" onClick={onClose} />
        </header>
        <div className="keys-controls">
          <div className="keys-search">
            <input
              ref={search}
              type="search"
              aria-label="Search the shortcuts by name"
              placeholder="Search by name, or by key"
              value={q}
              onChange={(e) => (setQ(e.target.value), setByCombo(''))}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <button type="button" className={`btn small-btn${finding ? ' on' : ''}`} title="Press a key or keys to see what they do. Esc stops" onClick={() => (setFinding(!finding), setByCombo(''))}>
              {finding ? 'Press the keys…' : 'Find a key'}
            </button>
            {byCombo && (
              <button type="button" className="btn small-btn on" title="Show every shortcut again" onClick={() => setByCombo('')}>
                {formatCombo(byCombo)} ×
              </button>
            )}
          </div>
          <label className="field select-field keys-preset">
            <span className="field-label">Start from</span>
            <select value={p.keymapPreset ?? 'default'} title={PRESETS.find((x) => x.id === (p.keymapPreset ?? 'default'))?.tip} onChange={(e) => setPrefs({ keymapPreset: e.target.value as Preset })}>
              {PRESETS.map((x) => (
                <option key={x.id} value={x.id} title={x.tip}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field check-field" title="Turn off the shortcuts that are a single letter, number or Space (V, H, P, S...). Ones with Ctrl, Alt or Cmd, and keys like Delete, the arrows and F2, still work. The tool bar and menus do the same jobs. For people who use speech input or can press keys by accident">
            <input type="checkbox" checked={p.singleKeys !== false} onChange={(e) => setPrefs({ singleKeys: e.target.checked })} />
            <span>One-key shortcuts (V, H, P...)</span>
          </label>
          <button type="button" className="btn small-btn" disabled={!overrides && (p.keymapPreset ?? 'default') === 'default'} onClick={() => void reset()} title="Put every key back to the default">
            Reset all
          </button>
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
                <h3>{g}</h3>
                <table>
                  <tbody>
                    {list.map((c) => (
                      <KeyRow key={c.id} c={c} recording={rec === c.id} onRecord={() => (setFinding(false), setRec(rec === c.id ? null : c.id))} onChange={(keys) => save(c.id, keys)} onReset={() => setPrefs({ keymap: withoutBinding(p.keymap, c.id) })} />
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}
          {!byCombo && !needle && (
            <section className="keys-group" aria-label="Mouse">
              <h3>With the mouse</h3>
              <table>
                <tbody>
                  {MOUSE.map(([k, what]) => (
                    <tr key={k}>
                      <td className="keys-name">{what}</td>
                      <td className="keys-where">Mouse</td>
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
        <footer className="keys-foot muted small">Your keys are saved with you (not in the project) and follow you between browsers. Ctrl is Cmd on a Mac.</footer>
      </div>
    </div>
  );
}

function KeyRow({ c, recording, onRecord, onChange, onReset }: { c: CommandDef; recording: boolean; onRecord: () => void; onChange: (keys: string[]) => void; onReset: () => void }) {
  const own = !!(usePrefs().keymap ?? {})[c.id];
  const keys = bindingsOf(c.id);
  return (
    <tr className={recording ? 'recording' : undefined}>
      <td className="keys-name">{c.name}</td>
      <td className="keys-where">{WHERE[c.context]}</td>
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
        {recording && <span className="keys-listen">Press the new keys (Esc cancels)</span>}
      </td>
      <td className="keys-act">
        {c.fixed ? (
          <span className="muted small" title="The browser or the page owns this key">
            Fixed
          </span>
        ) : (
          <>
            <button type="button" className={`btn small-btn${recording ? ' on' : ''}`} disabled={keys.length >= 4 && !recording} aria-label={`Add a key to ${c.name}`} title={keys.length >= 4 ? 'Four keys is the most; take one off first' : 'Press the keys you want to add'} onClick={onRecord}>
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
