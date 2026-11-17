import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { store, useEditor } from '../store/store';
import { getArtboard } from '../store/doc';
import { confirmDialog } from '../components/dialogs';
import { IconButton } from '../components/ui';
import { ContextMenu, type MenuItem } from '../components/ContextMenu';
import { Icons } from '../components/icons';
import { analyzeUsage } from '../lib/dependencies';
import { LOOP_LABEL, lengthLabel, missingStates, timelineRows, type TimelineRow } from '../lib/timeline-list';
import { prefs, setPrefs } from '../lib/prefs';

/** The tooltip for a clash: what both animate, and who wins if they play together (the one further down the list). */
function clashText(r: TimelineRow, at: number, names: string[]): string {
  return r.clashes
    .map((c) => {
      const winner = names.indexOf(c.other) > at ? c.other : r.name;
      return `${c.other} also animates ${c.props.join(', ')}. If both play at once, ${winner} wins (the one further down the list is applied last).`;
    })
    .join(' ');
}

/** Show a timeline on the canvas (or the design view, with none). Same as the Timeline bar's dropdown. */
export function openTimeline(id: string | null): void {
  store().set({ activeTimelineId: id, playhead: 0, selectedKeys: [], ...(id ? {} : { recording: false }) });
}

export const hideTimelineList = () => setPrefs({ timelineList: false });
/** Show or hide the list beside the Timeline (the List button does this; a key can be wired to it). */
export const toggleTimelineList = () => setPrefs({ timelineList: !prefs().timelineList });

/**
 * The column beside the Timeline: every timeline of the open artboard (or component) with its length, loop, what plays it and
 * which layers it animates. Click to open one, double-click to rename, drag (or the arrows) to reorder, and duplicate or delete
 * from the row. Selecting a layer marks the timelines that animate it. A component also gets a hint for its usual states.
 */
export function TimelineList() {
  const s = useEditor((st) => ({ project: st.project, abId: st.activeArtboardId, tlId: st.activeTimelineId, selection: st.selection }));
  const ab = getArtboard(s.project, s.abId);
  // The usage scan reads every artboard and script, so it trails behind typing
  const slow = useDeferredValue(s.project);
  const usage = useMemo(() => analyzeUsage(slow), [slow]);
  const rows = useMemo(() => (ab ? timelineRows(ab, usage) : []), [ab, usage]);
  const states = useMemo(() => (ab ? missingStates(s.project, ab) : null), [ab, s.project]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const selected = new Set(s.selection);
  // after a rename the focus goes back to the row so a keyboard user is not dropped
  const back = useRef<string | null>(null);
  useEffect(() => {
    if (renaming || !back.current) return;
    const id = back.current;
    back.current = null;
    document.querySelector<HTMLElement>(`[data-tl-pick="${id}"]`)?.focus();
  }, [renaming]);
  if (!ab) return null;

  // Enter or leaving the box keeps a new name; a name another timeline has stays in the box with a reason (Enter only: leaving puts the old one back)
  const finish = (id: string, text: string | null, leaving = false) => {
    const cur = ab.timelines.find((t) => t.id === id)?.name ?? '';
    const next = text?.trim() ?? '';
    if (next && next !== cur && !store().renameTimeline(id, next) && !leaving) return setProblem('Another timeline on this artboard has that name');
    setProblem('');
    back.current = id;
    setRenaming(null);
  };

  const remove = async (r: TimelineRow) => {
    const used = r.playedBy.length
      ? ` ${r.playedBy.length === 1 ? 'This plays it' : 'These play it'}: ${r.playedBy.slice(0, 4).join(', ')}${r.playedBy.length > 4 ? `, and ${r.playedBy.length - 4} more` : ''}. They will stop working until you point them at another timeline.`
      : '';
    if (!(await confirmDialog({ title: 'Delete timeline', message: `Delete timeline "${r.name}"? Its ${r.keyCount} key${r.keyCount === 1 ? '' : 's'} go with it.${used}`, confirmLabel: 'Delete timeline', danger: true }))) return;
    store().deleteTimeline(r.id);
  };

  const drop = (to: string) => {
    const at = ab.timelines.findIndex((t) => t.id === to);
    if (dragId && at >= 0 && dragId !== to) store().moveTimeline(dragId, at);
    setDragId(null);
    setOverId(null);
  };

  return (
    <aside className="tl-list" aria-label={`Timelines of ${ab.name}`}>
      <div className="tl-list-head">
        <strong>Timelines</strong>
        <span className="muted small">{rows.length}</span>
        <span className="tl-list-head-btns">
          <IconButton tour="timeline-new" icon={<Icons.plus />} title="New timeline" onClick={() => store().addTimeline()} />
          <IconButton icon={<Icons.close />} title="Hide the list of timelines (the View button on the Timeline bar brings it back)" onClick={hideTimelineList} />
        </span>
      </div>
      <div className="tl-list-scroll">
      <ul className="tl-list-rows">
        <li className={`tl-row design${s.tlId ? '' : ' active'}`}>
          <button type="button" className="tl-row-pick" data-tl-pick="__design" aria-current={s.tlId ? undefined : 'true'} title="Design view: the canvas shows the layers as they are, with no timeline applied" onClick={() => openTimeline(null)}>
            <span className="tl-row-name">Design view</span>
            <span className="tl-row-sub small">no timeline</span>
          </button>
        </li>
        {rows.map((r, i) => {
          const active = r.id === s.tlId;
          const hits = r.layers.filter((l) => selected.has(l.id));
          const layerText = r.layers.length ? `${r.layers.length} layer${r.layers.length === 1 ? '' : 's'}: ${r.layers.map((l) => l.name).join(', ')}` : 'No layers animated yet';
          return (
            <li
              key={r.id}
              className={`tl-row${active ? ' active' : ''}${hits.length ? ' animates' : ''}${dragId === r.id ? ' dragging' : ''}${overId === r.id && dragId !== r.id ? ' over' : ''}`}
              draggable={renaming !== r.id}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({
                  x: e.clientX,
                  y: e.clientY,
                  items: [
                    { label: 'Open', onClick: () => openTimeline(r.id) },
                    { label: 'Rename', onClick: () => setRenaming(r.id) },
                    { label: 'Duplicate', onClick: () => void store().duplicateTimeline(r.id) },
                    { label: 'Move up', disabled: i === 0, onClick: () => store().moveTimeline(r.id, i - 1) },
                    { label: 'Move down', disabled: i === rows.length - 1, onClick: () => store().moveTimeline(r.id, i + 1) },
                    { separator: true },
                    { label: 'Delete…', danger: true, onClick: () => void remove(r) },
                  ],
                });
              }}
              onDragStart={(e) => {
                setDragId(r.id);
                e.dataTransfer?.setData('text/plain', r.id);
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setOverId(r.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(r.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
            >
              <div className="tl-row-top">
                {renaming === r.id ? (
                  <input
                    className="tl-row-edit"
                    aria-label={`Name of timeline ${r.name}`}
                    defaultValue={r.name}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => finish(r.id, e.currentTarget.value, true)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') finish(r.id, e.currentTarget.value);
                      else if (e.key === 'Escape') finish(r.id, null);
                    }}
                  />
                ) : (
                  <button type="button" className="tl-row-pick" data-tl-pick={r.id} aria-current={active ? 'true' : undefined} title={`Open ${r.name}. Double-click to rename it`} onClick={() => openTimeline(r.id)} onDoubleClick={() => setRenaming(r.id)}>
                    <span className="tl-row-name">{r.name}</span>
                  </button>
                )}
              </div>
                <span className="tl-row-btns">
                  <IconButton icon={<Icons.arrowLeft />} className="tl-up" title={`Move ${r.name} up the list`} disabled={i === 0} onClick={() => store().moveTimeline(r.id, i - 1)} />
                  <IconButton icon={<Icons.arrowRight />} className="tl-down" title={`Move ${r.name} down the list`} disabled={i === rows.length - 1} onClick={() => store().moveTimeline(r.id, i + 1)} />
                  <IconButton icon={<Icons.pencil />} title={`Rename ${r.name}`} onClick={() => setRenaming(r.id)} />
                  <IconButton icon={<Icons.copy />} title={`Duplicate ${r.name}`} onClick={() => store().duplicateTimeline(r.id)} />
                  <IconButton icon={<Icons.trash />} title={`Delete ${r.name}`} onClick={() => void remove(r)} />
                </span>
              {renaming === r.id && problem && (
                <div className="tl-row-problem small" role="alert">
                  {problem}
                </div>
              )}
              <div className="tl-row-meta small">
                <span>{lengthLabel(r.duration)}</span>
                <span>{LOOP_LABEL[r.loop] ?? r.loop}</span>
                <span title={layerText}>{r.layers.length ? `${r.layers.length} layer${r.layers.length === 1 ? '' : 's'}` : 'empty'}</span>
              </div>
              <div className={`tl-row-use small${r.idle ? ' idle' : ''}`} title={r.playedBy.length ? `Started by: ${r.playedBy.join(', ')}` : r.idle ? 'Nothing starts this timeline: no interaction, joystick, blend or autoplay' : undefined}>
                {r.idle ? 'Nothing plays it' : r.playedBy.length ? `Started by ${r.playedBy.length === 1 ? r.playedBy[0] : `${r.playedBy.length} things`}` : ''}
              </div>
              {r.clashes.length > 0 && (
                <div className="tl-row-clash small" role="note" title={clashText(r, ab.timelines.findIndex((t) => t.id === r.id), ab.timelines.map((t) => t.name))}>
                  <span aria-hidden="true">⚠ </span>Also animated by {r.clashes.length === 1 ? r.clashes[0].other : `${r.clashes.length} other timelines`}: {r.clashes[0].props.slice(0, 2).join(', ')}
                  {r.clashes[0].props.length > 2 ? '…' : ''}
                </div>
              )}
              {hits.length > 0 && <div className="tl-row-hit small">Animates {hits.length === 1 ? hits[0].name : `${hits.length} selected layers`}</div>}
            </li>
          );
        })}
      </ul>
      {states && (
        <div className="tl-states small">
          {states.length ? (
            <>
              <p>Components usually have a timeline for each state. Missing:</p>
              <div className="tl-states-btns">
                {states.map((label) => (
                  <button key={label} type="button" className="btn" title={`Add an empty timeline named ${label}`} onClick={() => store().addTimeline(label)}>
                    + {label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p>Idle, Hover and Pressed timelines are all here.</p>
          )}
        </div>
      )}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </aside>
  );
}
