import { NodeResizer, type Node, type NodeProps } from '@xyflow/react';
import { labelOfKind } from '../lib/plain-words';
import { NOTE_COLOURS, NOTE_MIN_H, NOTE_MIN_W, type LogicGraph, type Note, type NoteColour } from 'interactives-player';
import { NoteText } from '../canvas/NotesLayer';
import { SelectField, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { store, useEditor } from '../store/store';
import { attachGraphNote, leaveGraphNote, patchGraphNote, removeGraphNote } from '../lib/graph-notes';
import { plainNoteText } from '../lib/note-text';
import { SectionBlurb } from '../components/SectionBlurb';

export type GraphNoteData = { note: Note; detached: boolean; hostName: string | null };

const COLOUR_NAMES: Record<NoteColour, string> = { gold: 'Yellow', orange: 'Orange', green: 'Green', sky: 'Blue', purple: 'Purple', rose: 'Pink' };

//Set while a note's resize handles are held: its position changes then are the frame growing to the left or up, not the note being
//dragged (the same trick as the groups' frames)
export const resizing: { note: string | null } = { note: null };

/** A sticky note on the interaction graph: paper like the canvas ones, drawn as a graph node so it moves, resizes and selects like one. */
export function GraphNoteNode({ data, selected }: NodeProps<Node<GraphNoteData>>) {
  const { note, detached, hostName } = data;
  const editing = useEditor((s) => s.editingNote === note.id);
  const colour = note.colour ?? 'gold';
  const label = `Graph note${note.author ? ` by ${note.author}` : ''}: ${plainNoteText(note.text) || 'empty'}`;
  return (
    <div
      className={`note note-${colour} graph-note${selected ? ' picked' : ''}${editing ? ' editing' : ''}${detached ? ' detached' : ''}`}
      style={{ width: '100%', height: '100%', position: 'relative' }}
      role="group"
      aria-label={label}
      aria-roledescription="sticky note"
      onDoubleClick={(e) => {
        e.stopPropagation();
        store().set({ editingNote: note.id });
      }}
    >
      <NodeResizer
        isVisible={selected && !editing}
        minWidth={NOTE_MIN_W}
        minHeight={NOTE_MIN_H}
        onResizeStart={() => (resizing.note = note.id)}
        onResizeEnd={() => {
          resizing.note = null;
          store().commit();
        }}
      />
      <div className="note-head">
        <span className="note-grip" aria-hidden="true" />
        <span className="note-by">{note.anchor ? (hostName ?? 'Node removed') : note.author || 'Note'}</span>
      </div>
      <div className="note-body nowheel">
        {editing ? (
          <textarea
            autoFocus
            className="nodrag nowheel"
            aria-label="Note text"
            placeholder="Write a note. **bold**, *italic*, - list, [ ] task"
            value={note.text}
            onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
            onChange={(e) => patchGraphNote(note.id, { text: e.target.value }, `gnote-text:${note.id}`)}
            onBlur={() => leaveGraphNote(note.id)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') {
                e.preventDefault();
                (e.currentTarget as HTMLTextAreaElement).blur();
              }
            }}
          />
        ) : (
          <NoteText note={note} />
        )}
      </div>
      <span className="note-fold" aria-hidden="true" />
    </div>
  );
}

/** What the settings column shows for a selected graph note: colour, what it follows, its words, delete. */
export function GraphNoteForm({ note, logic }: { note: Note; logic: Pick<LogicGraph, 'nodes' | 'groups'> }) {
  const colour = note.colour ?? 'gold';
  const hosts = [
    { value: '', label: 'Nothing (stays where it is)' },
    ...(logic.groups ?? []).map((g) => ({ value: g.id, label: `Group: ${g.label || 'Group'}` })),
    ...logic.nodes.map((n) => ({ value: n.id, label: labelOfKind(n.kind) })),
  ];
  return (
    <div className="param-form graph-note-form">
      <div className="param-title">Note</div>
      <SectionBlurb text="A note for the people editing this graph. Players never see it." name="notes on the graph" help={['interactions', 'notes-on-the-graph']} />
      <TextField label="Text" multiline rows={6} value={note.text} commitOnBlur onChange={(v) => patchGraphNote(note.id, { text: v }, `gnote-text:${note.id}`)} />
      <div className="field">
        <span className="field-label">Colour</span>
        <span className="note-swatches" role="group" aria-label="Note colour">
          {NOTE_COLOURS.map((c) => (
            <button key={c} type="button" className={`note-swatch note-${c}${colour === c ? ' on' : ''}`} title={`${COLOUR_NAMES[c]} note`} aria-label={`${COLOUR_NAMES[c]} note`} aria-pressed={colour === c} onClick={() => patchGraphNote(note.id, { colour: c })} />
          ))}
        </span>
      </div>
      <SelectField label="Follows" title="The node or group the note moves with" value={note.anchor?.layerId && hosts.some((h) => h.value === note.anchor!.layerId) ? note.anchor.layerId : ''} options={hosts} onChange={(v) => attachGraphNote(note.id, v || null)} />
      <button type="button" className="btn danger" onClick={() => removeGraphNote(note.id)}>
        <Icons.trash width={13} /> Delete note
      </button>
    </div>
  );
}
