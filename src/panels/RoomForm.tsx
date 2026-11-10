import { useEffect, useState } from 'react';
import { cleanRoomSettings, type DataSource, type RoomNames, type RoomSettings } from 'interactives-player';
import { store } from '../store/store';
import { getRoomMessages, hideRoomMessage, type RoomCourse, type RoomSourceInfo } from '../lib/db';
import { NumberField, SelectField, TextField } from '../components/ui';
import { SectionBlurb } from '../components/SectionBlurb';

const NAMES: { value: RoomNames; label: string }[] = [
  { value: 'seat', label: 'A made-up name (Quiet Otter 41)' },
  { value: 'first', label: 'Their first name' },
];

const lines = (list: string[] | undefined) => (list ?? []).join('\n');
const fromLines = (text: string) =>
  text
    .split(/[\n,]+/)
    .map((w) => w.trim())
    .filter(Boolean);

/**
 * The settings of a Room data source (how people are shown, how many messages it holds, the blocklist) and, below them, what each
 * course has said so far, with Hide and Show for the project's owner and the people it is shared with. The messages are read from
 * the server, so that part needs the project to be shared (Share > Link for StudyDesk) and someone to have said something.
 */
export function RoomForm({ source, setSource }: { source: DataSource; setSource: (patch: Partial<DataSource>, coalesce?: string) => void }) {
  const s = cleanRoomSettings(source.room);
  const set = (patch: Partial<RoomSettings>, coalesce?: string) => setSource({ room: { ...source.room, ...patch } }, coalesce);
  return (
    <>
      <SelectField<RoomNames>
        label="People show as"
        value={s.names}
        options={NAMES}
        title="What everyone else sees next to a message. A made-up name stays the same for a person in this room and means nothing anywhere else. First names come from StudyDesk. Nobody ever sees a username or a full name"
        onChange={(v) => set({ names: v })}
      />
      <NumberField label="Messages in view" suffix="latest" title="How many of the latest messages the room holds at once (never more than 300). Older ones are kept, they just leave the list" value={s.show} min={1} max={300} onChange={(v) => set({ show: Math.round(v) }, `rm-show-${source.id}`)} />
      <TextField
        label="Blocked words"
        multiline
        rows={3}
        commitOnBlur
        value={lines(s.blocked)}
        placeholder="one word or phrase a line"
        title="Nobody can send a message with one of these words in it, whatever the capitals. Whole words only, so blocking ass leaves class alone. Share the project again for a change to reach the learner page"
        onChange={(v) => set({ blocked: fromLines(v) })}
      />
      <TextField
        label="Sample messages"
        multiline
        rows={3}
        commitOnBlur
        value={lines(s.sample)}
        placeholder="one a line, for the canvas"
        title="Messages the canvas and Preview show, each from a different person, so you can lay a page out with nobody in the room. Learners never see them"
        onChange={(v) => set({ sample: fromLines(v) })}
      />
      <SectionBlurb
        text={
          <>
            <code>{source.name}.messages</code> is the list, oldest first, and <code>{source.name}.here</code> is how many people are in the room.
          </>
        }
        name="rooms"
        help={['rooms', 'adding-a-room']}
      />
      <Moderation source={source} />
    </>
  );
}

const when = (ms: number) => (ms ? new Date(ms).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '');

/** What each course has said, for the owner and collaborators: who said it, and Hide or Show. Hiding takes it out of the room at once. */
function Moderation({ source }: { source: DataSource }) {
  const projectId = store().get().project.id;
  const [info, setInfo] = useState<RoomSourceInfo | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [course, setCourse] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => {
    setError('');
    getRoomMessages(projectId).then(
      (r) => setInfo(r.sources.find((x) => x.source === source.id) ?? null),
      (e) => {
        setInfo(null);
        setError(e instanceof Error ? e.message : String(e));
      },
    );
  };
  useEffect(load, [projectId, source.id]);
  const courses = info?.courses ?? [];
  const here: RoomCourse | undefined = courses.find((c) => c.course === course) ?? courses[0];
  const act = async (go: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await go();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const label = (c: string) => c || '(no course)';
  return (
    <section className="shared-mod" aria-label="What people have said">
      <div className="row">
        <strong>What people have said</strong>
        <button className="btn small-btn" onClick={load} title="Look at the server again">
          Refresh
        </button>
      </div>
      {error && <p className="error small">{error}</p>}
      {info === undefined && !error && <p className="muted small">Loading…</p>}
      {info === null && !error && <SectionBlurb text="Nothing to moderate yet. Messages arrive through the StudyDesk learner page, once the project is shared." name="moderating a room" help={['rooms', 'moderating-a-room']} />}
      {info && !courses.length && <p className="hint">Nobody has said anything yet.</p>}
      {here && (
        <>
          {courses.length > 1 && <SelectField label="Course" value={here.course} options={courses.map((c) => ({ value: c.course, label: `${label(c.course)} (${c.here} here)` }))} onChange={setCourse} />}
          <p className="muted small">
            {label(here.course)}: {here.here} here now, the latest {here.messages.length} {here.messages.length === 1 ? 'message' : 'messages'}, newest first. Only you and the people you share the project with see who sent each one.
          </p>
          <table className="data-table shared-answers">
            <thead>
              <tr>
                <th>Message</th>
                <th>Shows as</th>
                <th>Sent by</th>
                <th>When</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {here.messages.map((m) => (
                <tr key={m.id} className={m.hidden ? 'muted' : ''}>
                  <td>{m.text}</td>
                  <td>{m.seat}</td>
                  <td>{m.username}</td>
                  <td>{when(m.at)}</td>
                  <td className="shared-actions">
                    <button className="btn small-btn" disabled={busy} aria-label={`${m.hidden ? 'Show' : 'Hide'} the message from ${m.seat}: ${m.text.slice(0, 60)}`} title={m.hidden ? 'Put it back in the room' : 'Take it out of the room, for everybody, at once. It is kept, and you can show it again'} onClick={() => void act(() => hideRoomMessage(projectId, source.id, m.id, !m.hidden))}>
                      {m.hidden ? 'Show' : 'Hide'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
