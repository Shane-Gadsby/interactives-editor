import { useEffect, useMemo, useRef, useState } from 'react';
import { store } from '../store/store';
import { closeInsertComponentPicker, componentChoices, filterChoices, insertComponent, useInsertComponentAsk, type PickerAsk } from '../lib/components';

/** Mounted once by the editor: the "Insert component" picker, shown while something has asked for it (lib/components.ts). */
export function ComponentPicker() {
  const ask = useInsertComponentAsk();
  return ask ? <Picker ask={ask} onClose={closeInsertComponentPicker} /> : null;
}

function Picker({ ask, onClose }: { ask: PickerAsk; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const project = store().get().project;
  const host = project.artboards.find((a) => a.id === ask.hostId);
  const all = useMemo(() => componentChoices(project, ask.hostId), [project, ask.hostId]);
  const rows = useMemo(() => filterChoices(all, q), [all, q]);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    list.current?.querySelector('li.active')?.scrollIntoView?.({ block: 'nearest' });
  }, [sel, rows]);
  const pick = (id: string | undefined) => {
    if (!id) return;
    onClose();
    insertComponent(id, ask.hostId, ask.at);
  };
  return (
    <div className="modal-backdrop quick-help-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="quick-help command-palette component-picker" role="dialog" aria-label="Insert component">
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="component-list"
          aria-activedescendant={rows.length ? `component-row-${sel}` : undefined}
          aria-label={`Insert a component into ${host?.name ?? 'this page'}: type to find one`}
          placeholder={`Insert a component into “${host?.name ?? 'this page'}”: type a page name`}
          title="A component is a page placed inside another page. Change the original and every place it is used changes too"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(rows.length - 1, s + 1)));
            else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
            else if (e.key === 'Enter') (e.preventDefault(), pick(rows[sel]?.id));
            else if (e.key === 'Escape') onClose();
          }}
        />
        <ul id="component-list" role="listbox" aria-label="Components" ref={list}>
          {rows.map((c, i) => (
            <li key={c.id} id={`component-row-${i}`} role="option" aria-selected={i === sel} className={`cmd${i === sel ? ' active' : ''}`} onPointerEnter={() => setSel(i)} onClick={() => pick(c.id)}>
              <span className="cmd-title">{c.name}</span>
              <span className="cmd-group">{[c.note, c.group, c.size].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
          {!rows.length && (
            <li className="muted cmd-empty">{all.length ? 'Nothing matches. Try another word.' : 'No other pages to place here yet. Add a page first, or find shared components in the Libraries tab.'}</li>
          )}
        </ul>
        <div className="quick-help-foot muted small">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> to choose · <kbd>Enter</kbd> to place it · <kbd>Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
