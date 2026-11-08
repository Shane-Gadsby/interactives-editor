/**
 * Sticky notes over the editor's canvas: the authors' own annotations, drawn as small paper cards at their spot (following the
 * layer they are attached to). They are not layers and not part of any artboard's drawing, so nothing here reaches Preview, the
 * player, an export or a share link. Every change goes through lib/notes.ts (EditorStore.update), so notes undo and collaborators
 * see them live. Which note is picked or being typed into is interface state in the store.
 */
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { NOTE_COLOURS, type Note, type NoteColour, type Project } from 'interactives-player';
import { getArtboard, locate } from '../store/doc';
import { store, useEditor } from '../store/store';
import { usePrefs } from '../lib/prefs';
import { allNotes, attachNote, leaveNote, moveNote, noteScale, notePlace, patchNote, removeNote, type NoteOwner } from '../lib/notes';
import { parseNoteText, plainNoteText, toggleCheck } from '../lib/note-text';
import { Icons } from '../components/icons';

const COLOUR_NAMES: Record<NoteColour, string> = { gold: 'Yellow', orange: 'Orange', green: 'Green', sky: 'Blue', purple: 'Purple', rose: 'Pink' };

export function NotesLayer({ project, zoom, panX, panY, hidden, passive }: { project: Project; zoom: number; panX: number; panY: number; hidden?: boolean; passive?: boolean }) {
  const { showNotes } = usePrefs();
  const selected = useEditor((s) => s.selectedNote);
  const editing = useEditor((s) => s.editingNote);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1600, h: 1000 });
  useEffect(() => {
    const el = box.current?.parentElement;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Scrolling inside a note being typed in must not zoom the canvas under it (the canvas listens for the wheel on its own element)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const stop = (e: WheelEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('textarea')) e.stopPropagation();
    };
    el.addEventListener('wheel', stop);
    return () => el.removeEventListener('wheel', stop);
  }, []);

  if (hidden || !showNotes) return null;
  const s = noteScale(zoom);
  const cards = allNotes(project).flatMap(({ note, owner }) => {
    const ab = owner === null ? null : getArtboard(project, owner);
    if (owner !== null && (!ab || ab.canvasHidden)) return [];
    const at = notePlace(project, owner, note);
    const sx = panX + ((ab?.canvasX ?? 0) + at.x) * zoom;
    const sy = panY + ((ab?.canvasY ?? 0) + at.y) * zoom;
    // Off screen and not being worked on: not drawn
    const live = note.id === selected || note.id === editing;
    if (!live && (sx > size.w + 40 || sy > size.h + 40 || sx + note.w * s < -40 || sy + note.h * s < -40)) return [];
    return [<NoteCard key={note.id} project={project} note={note} owner={owner} x={sx} y={sy} scale={s} zoom={zoom} detached={at.detached} picked={note.id === selected} editing={note.id === editing} />];
  });
  return (
    <div className={`notes-layer${passive ? ' passive' : ''}`} ref={box} aria-label="Sticky notes">
      {cards}
    </div>
  );
}

function NoteCard({ project, note, owner, x, y, scale, zoom, detached, picked, editing }: { project: Project; note: Note; owner: NoteOwner; x: number; y: number; scale: number; zoom: number; detached: boolean; picked: boolean; editing: boolean }) {
  const colour = note.colour ?? 'gold';
  const card = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: 'move' | 'size'; sx: number; sy: number; x0: number; y0: number; w0: number; h0: number; moved: boolean } | null>(null);
  const wasEditing = useRef(false);

  // Leaving the text box puts the card back in focus so the keys keep working; an emptied note goes away
  useEffect(() => {
    if (editing) {
      wasEditing.current = true;
      return;
    }
    if (wasEditing.current) {
      wasEditing.current = false;
      // (a click elsewhere has already put the note away: it doesn't get the focus back, or it would be picked again)
      if (store().get().selectedNote === note.id) card.current?.focus({ preventScroll: true });
    }
  }, [editing, note.id]);

  const pick = () => store().set({ selectedNote: note.id });
  const startEdit = () => store().set({ selectedNote: note.id, editingNote: note.id });
  const stopEdit = () => leaveNote();

  const down = (e: ReactPointerEvent, kind: 'move' | 'size') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const t = e.target as HTMLElement;
    if (t.closest('button, textarea, [data-nodrag]') && kind === 'move') return;
    pick();
    if (editing && kind === 'move') return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // synthetic or already released pointer
    }
    drag.current = { kind, sx: e.clientX, sy: e.clientY, x0: notePlace(project, owner, note).x, y0: notePlace(project, owner, note).y, w0: note.w, h0: note.h, moved: false };
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    d.moved = true;
    e.stopPropagation();
    if (d.kind === 'move') moveNote(note.id, d.x0 + dx / zoom, d.y0 + dy / zoom, `note-move:${note.id}`);
    else patchNote(note.id, { w: d.w0 + dx / scale, h: d.h0 + dy / scale }, `note-size:${note.id}`);
  };
  const up = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    e.stopPropagation();
    store().commit();
  };

  const key = (e: ReactKeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    const k = e.key;
    const step = e.shiftKey ? 10 : 1;
    if (k === 'Enter' || k === 'F2') {
      e.preventDefault();
      startEdit();
    } else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault();
      removeNote(note.id);
      store().set({ selectedNote: null });
    } else if (k === 'Escape') {
      store().set({ selectedNote: null });
      card.current?.blur();
    } else if (k.startsWith('Arrow')) {
      e.preventDefault();
      const dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0;
      const dy = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0;
      const at = notePlace(project, owner, note);
      // Alt resizes, plain arrows move
      if (e.altKey) patchNote(note.id, { w: note.w + dx * 10, h: note.h + dy * 10 }, `note-size:${note.id}`);
      else moveNote(note.id, at.x + dx, at.y + dy, `note-move:${note.id}`);
    } else return;
    e.stopPropagation();
  };

  const style: CSSProperties = { left: x, top: y, width: note.w, height: note.h, transform: `scale(${scale})` };
  const label = `Note${note.author ? ` by ${note.author}` : ''}: ${plainNoteText(note.text) || 'empty'}`;
  const anchorLayer = note.anchor && owner !== null ? locate(getArtboard(project, owner)!, note.anchor.layerId)?.node : undefined;
  return (
    <div
      ref={card}
      className={`note note-${colour}${picked ? ' picked' : ''}${editing ? ' editing' : ''}${detached ? ' detached' : ''}`}
      style={style}
      data-note={note.id}
      role="group"
      aria-label={label}
      aria-roledescription="sticky note"
      tabIndex={0}
      onPointerDown={(e) => down(e, 'move')}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        startEdit();
      }}
      onContextMenu={(e) => e.stopPropagation()}
      onFocus={(e) => {
        if (e.target === e.currentTarget && !picked) pick();
      }}
      onKeyDown={key}
    >
      <div className="note-head">
        <span className="note-grip" aria-hidden="true" />
        <span className="note-by">{note.anchor ? (anchorLayer ? `On ${anchorLayer.name}` : 'Layer removed') : note.author || 'Note'}</span>
      </div>
      {picked && !editing && <NoteTools note={note} owner={owner} project={project} />}
      <div className="note-body">
        {editing ? (
          <textarea
            autoFocus
            aria-label="Note text"
            placeholder="Write a note. **bold**, *italic*, - list, [ ] task"
            value={note.text}
            onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
            onChange={(e) => patchNote(note.id, { text: e.target.value }, `note-text:${note.id}`)}
            onBlur={stopEdit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') {
                e.preventDefault();
                (e.currentTarget as HTMLTextAreaElement).blur();
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <NoteText note={note} />
        )}
      </div>
      <span className="note-fold" aria-hidden="true" />
      <span className="note-resize" data-nodrag="" aria-hidden="true" onPointerDown={(e) => down(e, 'size')} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
    </div>
  );
}

/** What a note says, with its light markdown drawn as elements (a ticked box rewrites the note's text). */
export function NoteText({ note }: { note: Note }) {
  const lines = parseNoteText(note.text);
  if (!note.text.trim()) return <p className="note-empty">Double-click to write</p>;
  return (
    <>
      {lines.map((l) => {
        if (l.kind === 'blank') return <div key={l.line} className="note-gap" />;
        const spans = l.spans.map((sp, i) => (sp.kind === 'bold' ? <strong key={i}>{sp.text}</strong> : sp.kind === 'italic' ? <em key={i}>{sp.text}</em> : sp.kind === 'code' ? <code key={i}>{sp.text}</code> : <span key={i}>{sp.text}</span>));
        if (l.kind === 'check')
          return (
            <div key={l.line} className="note-line check">
              <button
                type="button"
                className="note-box"
                data-nodrag=""
                role="checkbox"
                aria-checked={!!l.checked}
                aria-label={l.checked ? 'Done, mark not done' : 'Not done, mark done'}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  patchNote(note.id, { text: toggleCheck(note.text, l.line) });
                }}
              >
                {l.checked ? <Icons.check width={11} /> : null}
              </button>
              <span className={l.checked ? 'done' : undefined}>{spans}</span>
            </div>
          );
        return (
          <div key={l.line} className={`note-line ${l.kind}`}>
            {spans}
          </div>
        );
      })}
    </>
  );
}

/** The small bar over a picked note: colours, attach to the picked layer, delete. */
function NoteTools({ note, owner, project }: { note: Note; owner: NoteOwner; project: Project }) {
  const layer = useEditor((s) => (s.activeArtboardId === owner && s.selection.length ? s.selection[0] : null));
  const canAttach = owner !== null && !!layer && !!getArtboard(project, owner) && !!locate(getArtboard(project, owner)!, layer);
  const stop = { onPointerDown: (e: ReactPointerEvent) => e.stopPropagation() };
  return (
    <div className="note-tools" role="toolbar" aria-label="Note" data-nodrag="" {...stop}>
      {NOTE_COLOURS.map((c) => (
        <button key={c} type="button" className={`note-swatch note-${c}${(note.colour ?? 'gold') === c ? ' on' : ''}`} title={`${COLOUR_NAMES[c]} note`} aria-label={`${COLOUR_NAMES[c]} note`} aria-pressed={(note.colour ?? 'gold') === c} onClick={() => patchNote(note.id, { colour: c })} />
      ))}
      {owner !== null && (
        <button
          type="button"
          className="note-act"
          title={note.anchor ? 'Stop following the layer' : canAttach ? 'Follow the selected layer' : 'Select a layer on this artboard first, then attach the note to it'}
          aria-label={note.anchor ? 'Detach from layer' : 'Attach to the selected layer'}
          disabled={!note.anchor && !canAttach}
          onClick={() => attachNote(note.id, note.anchor ? null : layer)}
        >
          <Icons.link width={13} />
        </button>
      )}
      <button
        type="button"
        className="note-act"
        title="Delete note"
        aria-label="Delete note"
        onClick={() => {
          removeNote(note.id);
          store().set({ selectedNote: null });
        }}
      >
        <Icons.trash width={13} />
      </button>
    </div>
  );
}
