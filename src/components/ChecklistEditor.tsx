import { useState } from 'react';
import { findLayer } from '../lib/templates';
import { Icons } from './icons';
import type { Project, SceneNode } from 'interactives-player';

export interface DraftItem {
  id?: string;
  text: string;
  /** The longer how and why kept with an item (a starter's); the editor keeps it, it does not write it. */
  detail?: string;
  artboardId?: string;
  nodeId?: string;
}

/**
 * The checklist an author writes for a template: one line for each thing the person using it should change, optionally pointing
 * at a layer. With a project (and a selection) it can link an item to the selected layer; without one (editing from the
 * Templates tab) the links stay as they are and can be removed.
 */
export function ChecklistEditor({ items, onChange, project, selection }: { items: DraftItem[]; onChange: (next: DraftItem[]) => void; project?: Project; selection?: { ids: string[]; artboardId: string } }) {
  const [draft, setDraft] = useState('');
  const set = (i: number, patch: Partial<DraftItem>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const nameOf = (it: DraftItem) => (project && it.nodeId ? findLayer(project, it.nodeId, it.artboardId)?.node.name : undefined);
  const add = (text: string, node?: SceneNode) => {
    const t = text.trim();
    if (!t) return;
    onChange([...items, { text: t, ...(node ? { nodeId: node.id, artboardId: selection?.artboardId } : {}) }]);
  };
  const selected = (project && selection ? selection.ids.map((id) => findLayer(project, id, selection.artboardId)?.node).filter((n): n is SceneNode => !!n) : []).slice(0, 12);
  return (
    <div className="checklist-editor">
      {items.length === 0 && <p className="muted small">Nothing yet. List what whoever uses this template should change: "Replace the question text", "Add your course's logo".</p>}
      <ol>
        {items.map((it, i) => (
          <li key={it.id ?? `new${i}`}>
            <input value={it.text} maxLength={200} aria-label={`Checklist item ${i + 1}`} onChange={(e) => set(i, { text: e.target.value })} />
            {it.nodeId ? (
              <span className="cl-link" title={project ? 'Using the template selects this layer' : 'Using the template selects the layer this item points at'}>
                {nameOf(it) ?? (project ? 'layer is gone' : 'a layer')}
                <button className="icon-btn" title="Stop pointing at a layer" aria-label="Remove the layer link" onClick={() => set(i, { nodeId: undefined, artboardId: undefined })}>
                  <Icons.close width={11} height={11} />
                </button>
              </span>
            ) : (
              selected[0] && (
                <button className="btn small" title={`Point this item at the selected layer "${selected[0].name}": ticking it off later is one click to find it`} onClick={() => set(i, { nodeId: selected[0].id, artboardId: selection?.artboardId })}>
                  Link "{selected[0].name}"
                </button>
              )
            )}
            <button className="icon-btn" title="Move up" aria-label="Move up" disabled={i === 0} onClick={() => onChange(items.map((_, j) => items[j === i - 1 ? i : j === i ? i - 1 : j]))}>
              <Icons.chevronDown width={12} height={12} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <button className="icon-btn" title="Remove this item" aria-label="Remove this item" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Icons.trash width={13} />
            </button>
          </li>
        ))}
      </ol>
      <form
        className="cl-add"
        onSubmit={(e) => {
          e.preventDefault();
          add(draft);
          setDraft('');
        }}
      >
        <input value={draft} maxLength={200} placeholder="Add an item, e.g. Replace the question text" onChange={(e) => setDraft(e.target.value)} />
        <button className="btn" type="submit" disabled={!draft.trim() || items.length >= 40}>
          Add
        </button>
        {selected.length > 0 && (
          <button
            className="btn"
            type="button"
            disabled={items.length >= 40}
            title="One item for each selected layer, pointing at it. Reword them after"
            onClick={() => onChange([...items, ...selected.map((n) => ({ text: `Change "${n.name}"`, nodeId: n.id, artboardId: selection?.artboardId }))].slice(0, 40))}
          >
            Add for the {selected.length} selected layer{selected.length === 1 ? '' : 's'}
          </button>
        )}
      </form>
    </div>
  );
}
