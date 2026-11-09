import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { matches } from '../lib/keymap';
import { closePalette, registerPaletteHost, usePaletteOpen } from '../lib/command-palette';
import { buildCommands, noteCommandUsed, searchCommands, suggestedCommands, type Command } from '../lib/commands';
import type { HelpHit } from '../help/search';
import { helpSearch } from '../help/lazy';
import { openHelp, openHelpSearch } from '../help/Help';
import { track } from '../lib/analytics';

type Row = { kind: 'command'; c: Command } | { kind: 'help'; h: HelpHit };

/** Mounted once by the editor: it owns the Ctrl/Cmd+K shortcut's target (help/Help.tsx opens it) and renders it while open. */
export function CommandPalette() {
  const open = usePaletteOpen();
  useEffect(() => registerPaletteHost(), []);
  return open ? <Palette onClose={closePalette} /> : null;
}

function Palette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  //Built once per opening: it reads the project and the selection as they are now
  const all = useMemo(() => buildCommands(), []);
  const list = useRef<HTMLUListElement>(null);
  //help results come once the search's chunk is in (a moment after the palette opens, the first time)
  const helpSearcher = helpSearch.use();
  const rows = useMemo<Row[]>(() => {
    const cmds = q.trim() ? searchCommands(all, q, 24) : suggestedCommands(all);
    const help = q.trim() && helpSearcher ? helpSearcher.searchHelp(q, 4) : [];
    return [...cmds.map((c): Row => ({ kind: 'command', c })), ...help.map((h): Row => ({ kind: 'help', h }))];
  }, [all, q, helpSearcher]);
  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    list.current?.querySelector('li.active')?.scrollIntoView?.({ block: 'nearest' });
  }, [sel, rows]);
  const firstHelp = rows.findIndex((r) => r.kind === 'help');
  const pick = (r: Row | undefined) => {
    if (!r) return;
    if (r.kind === 'help') {
      onClose();
      track('help', 'search-pick', { thing: r.h.topic.id, detail: { in: 'palette' } });
      openHelp(r.h.topic.id, r.h.anchor);
      return;
    }
    if (r.c.disabled) return;
    onClose();
    noteCommandUsed(r.c.id);
    track('feature', 'palette-run', { thing: r.c.id.split(':')[0] });
    //Let the palette unmount (and give focus back) before the command opens a dialog of its own
    setTimeout(r.c.run, 0);
  };
  return (
    <div className="modal-backdrop quick-help-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="quick-help command-palette" role="dialog" aria-label="Command palette">
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={rows.length ? `palette-row-${sel}` : undefined}
          aria-label="Type what you want to do"
          placeholder="What do you want to do? (e.g. “add a button”, “grid”, “go to page 3”, “share”)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(rows.length - 1, s + 1)));
            else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
            else if (e.key === 'Enter') (e.preventDefault(), pick(rows[sel]));
            else if (e.key === 'Escape') onClose();
            else if (e.key === 'F1') (e.preventDefault(), onClose(), openHelpSearch());
            else if (matches(e, 'palette')) (e.preventDefault(), onClose());
          }}
        />
        <ul id="palette-list" role="listbox" aria-label="Commands" ref={list}>
          {!q.trim() && rows.length > 0 && (
            <li className="cmd-head" role="presentation">
              Suggestions
            </li>
          )}
          {rows.map((r, i) => (
            <Fragment key={r.kind === 'command' ? r.c.id : `help:${r.h.topic.id}:${r.h.anchor ?? ''}`}>
            {i === firstHelp && (
              <li className="cmd-head" role="presentation">
                Help
              </li>
            )}
            <li id={`palette-row-${i}`} role="option" aria-selected={i === sel} aria-disabled={r.kind === 'command' && !!r.c.disabled} className={`cmd${i === sel ? ' active' : ''}${r.kind === 'command' && r.c.disabled ? ' off' : ''}`} onPointerEnter={() => setSel(i)} onClick={() => pick(r)}>
              {r.kind === 'command' ? (
                <>
                  <span className="cmd-title">{r.c.title}</span>
                  {r.c.on !== undefined && <span className="cmd-state">{r.c.on ? 'On' : 'Off'}</span>}
                  {r.c.disabled ? <span className="cmd-why">{r.c.disabled}</span> : r.c.hint ? <kbd>{r.c.hint}</kbd> : <span className="cmd-group">{r.c.group}</span>}
                </>
              ) : (
                <>
                  <span className="cmd-title">
                    Help: {r.h.topic.title}
                    {r.h.heading ? ` › ${r.h.heading}` : ''}
                  </span>
                  <span className="cmd-group">{r.h.snippet.slice(0, 70)}</span>
                </>
              )}
            </li>
            </Fragment>
          ))}
          {!rows.length && <li className="muted cmd-empty">Nothing matches. Try other words, like “button”, “page”, “grid” or “share”.</li>}
        </ul>
        <div className="quick-help-foot muted small">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> to choose · <kbd>Enter</kbd> to do it · <kbd>Esc</kbd> to close · <kbd>F1</kbd> searches the help only
          </span>
        </div>
      </div>
    </div>
  );
}

