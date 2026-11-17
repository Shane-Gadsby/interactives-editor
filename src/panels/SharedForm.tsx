import { useEffect, useState } from 'react';
import { cleanSharedSettings, type DataSource, type SharedSettings, type SharedWho, type Variable, variableLabelAndName } from 'interactives-player';
import { store } from '../store/store';
import { getSharedResponses, hideSharedAnswer, removeSharedAnswers, type SharedCourse, type SharedSourceInfo } from '../lib/db';
import { NumberField, SelectField, TextField } from '../components/ui';
import { confirmDialog } from '../components/dialogs';
import { SectionBlurb } from '../components/SectionBlurb';

const WHO: { value: SharedWho; label: string }[] = [
  { value: 'class', label: 'Everyone in this class' },
  { value: 'me', label: 'Only me' },
];

const lines = (list: string[] | undefined) => (list ?? []).join('\n');
const fromLines = (text: string) =>
  text
    .split(/[\n,]+/)
    .map((w) => w.trim())
    .filter(Boolean);

/**
 * The settings of a Shared responses data source (who sees the answers, the limits, the blocklist) and, below them, what the class has
 * said so far with the owner's tools to hide, remove or clear answers. The class is read from the server, so that part needs the
 * project to be shared (Share > Link for StudyDesk) and is for the owner or a power user.
 */
export function SharedForm({ source, variables, setSource }: { source: DataSource; variables: Variable[]; setSource: (patch: Partial<DataSource>, coalesce?: string) => void }) {
  const s = cleanSharedSettings(source.shared);
  const set = (patch: Partial<SharedSettings>, coalesce?: string) => setSource({ shared: { ...source.shared, ...patch } }, coalesce);
  const pickers = variables.filter((v) => v.type === 'string' || v.type === 'enum');
  return (
    <>
      <SelectField<SharedWho> label="Who sees it" value={s.who} options={WHO} title="Only me keeps each person's answers for themselves. Everyone in this class shows every answer, counted, to everyone in the same course (on the StudyDesk learner page: Share > Link for StudyDesk)" onChange={(v) => set({ who: v })} />
      <SelectField
        label="Switch with"
        value={s.whoVariable ?? ''}
        options={[{ value: '', label: 'Nothing (use the setting above)' }, ...pickers.map((v) => ({ value: v.id, label: variableLabelAndName(v) }))]}
        title="Take who sees it from a text variable instead, so the same project switches by one setting. A variable that says Only me keeps answers private; one that says everyone, class or shared shows them to the class"
        onChange={(v) => set({ whoVariable: v || undefined })}
      />
      <NumberField label="Longest answer" suffix="chars" title="Longer answers are cut to this many characters (never more than 120)" value={s.maxLength} min={1} max={120} onChange={(v) => set({ maxLength: Math.round(v) }, `sh-len-${source.id}`)} />
      <NumberField label="Answers each" title="How many different answers one person may have in (never more than 50)" value={s.perPerson} min={1} max={50} onChange={(v) => set({ perPerson: Math.round(v) }, `sh-per-${source.id}`)} />
      <NumberField label="Show at" suffix="people" title="An answer is held back until this many people have given it, so one person's odd answer does not show alone. Applies to the class, not to Only me" value={s.minCount} min={1} onChange={(v) => set({ minCount: Math.round(v) }, `sh-min-${source.id}`)} />
      <NumberField label="Look again" suffix="s" title="How often the page checks for what the class has added while it is open (at least 2 seconds). On the StudyDesk learner page new answers show at once, and this is the backup. 0 reads it once" value={s.refresh} min={0} onChange={(v) => set({ refresh: Math.round(v) }, `sh-ref-${source.id}`)} />
      <TextField label="Blocked words" multiline rows={3} commitOnBlur value={lines(s.blocked)} placeholder="one word or phrase a line" title="Nobody can add an answer with one of these words in it, whatever the capitals, and answers already in stop showing. Whole words only: blocking ass leaves class alone" onChange={(v) => set({ blocked: fromLines(v) })} />
      <TextField label="Poll options" multiline rows={3} commitOnBlur value={lines(s.options)} placeholder="one a line, for a poll" title="The answers a poll offers. Each is always in the list, in this order, with 0 until someone picks it, so a chart has a bar for every option from the start. Anything else people add comes after them" onChange={(v) => set({ options: fromLines(v) })} />
      <TextField label="Sample answers" multiline rows={3} commitOnBlur value={lines(s.sample)} placeholder="one a line, for the canvas" title="Answers the canvas and Preview show for this source so you can lay a page out without a class. Learners never see them" onChange={(v) => set({ sample: fromLines(v) })} />
      <SectionBlurb
        text={
          <>
            <code>{source.name}.answers</code> is the counted list. Answers are anonymous: counts come back, never names.
          </>
        }
        name="shared responses"
        help={['shared-responses', 'adding-one']}
      />
      <Moderation source={source} />
    </>
  );
}

/** What the class has said, for the owner: every answer with its count, and Hide, Show, Remove and Clear. */
function Moderation({ source }: { source: DataSource }) {
  const projectId = store().get().project.id;
  const [info, setInfo] = useState<SharedSourceInfo | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [course, setCourse] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => {
    setError('');
    getSharedResponses(projectId).then(
      (r) => setInfo(r.sources.find((x) => x.source === source.id) ?? null),
      (e) => {
        setInfo(null);
        setError(e instanceof Error ? e.message : String(e));
      },
    );
  };
  useEffect(load, [projectId, source.id]);
  const courses = info?.courses ?? [];
  const here: SharedCourse | undefined = courses.find((c) => c.course === course) ?? courses[0];
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
    <section className="shared-mod" aria-label="What the class has said">
      <div className="row">
        <strong>What the class has said</strong>
        <button className="btn small-btn" onClick={load} title="Look at the server again">
          Refresh
        </button>
      </div>
      {error && <p className="error small">{error}</p>}
      {info === undefined && !error && <p className="muted small">Loading…</p>}
      {info === null && !error && <SectionBlurb text="Nothing to moderate yet. Answers arrive through the StudyDesk learner page, once the project is shared." name="moderating" help={['shared-responses', 'moderating']} />}
      {info && !courses.length && <p className="hint">Nobody has added anything yet.</p>}
      {here && (
        <>
          {courses.length > 1 && (
            <SelectField label="Course" value={here.course} options={courses.map((c) => ({ value: c.course, label: `${label(c.course)} (${c.people})` }))} onChange={setCourse} />
          )}
          <p className="muted small">
            {label(here.course)}: {here.people} {here.people === 1 ? 'person' : 'people'}, {here.answers.length} different {here.answers.length === 1 ? 'answer' : 'answers'}. Counts are as of the last refresh.
          </p>
          <table className="data-table shared-answers">
            <thead>
              <tr>
                <th>Answer</th>
                <th>People</th>
                <th>Class sees it</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {here.answers.map((a) => (
                <tr key={a.text} className={a.shown ? '' : 'muted'}>
                  <td>{a.text}</td>
                  <td>{a.count}</td>
                  <td>{a.shown ? 'Yes' : a.hidden ? 'Hidden by you' : a.blocked ? 'Blocked word' : `Waiting for ${info?.declared.minCount} people`}</td>
                  <td className="shared-actions">
                    <button className="btn small-btn" disabled={busy} aria-label={`${a.hidden ? 'Show' : 'Hide'} ${a.text}`} onClick={() => void act(() => hideSharedAnswer(projectId, source.id, here.course, a.text, !a.hidden))}>
                      {a.hidden ? 'Show' : 'Hide'}
                    </button>{' '}
                    <button
                      className="btn small-btn danger"
                      disabled={busy}
                      aria-label={`Remove ${a.text}`}
                      onClick={() =>
                        void act(async () => {
                          if (await confirmDialog({ title: 'Remove this answer', message: `Take "${a.text}" out of everyone's list in ${label(here.course)}? They can add it again. To keep it but stop the class seeing it, use Hide.`, confirmLabel: 'Remove', danger: true })) await removeSharedAnswers(projectId, source.id, here.course, a.text);
                        })
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <button
              className="btn danger"
              disabled={busy || !here.answers.length}
              onClick={() =>
                void act(async () => {
                  if (await confirmDialog({ title: 'Clear this course', message: `Empty every answer the class gave in ${label(here.course)}? Nobody's own answers (Only me) are touched, and people can add again.`, confirmLabel: 'Clear', danger: true })) await removeSharedAnswers(projectId, source.id, here.course);
                })
              }
            >
              Clear this course
            </button>
          </div>
        </>
      )}
    </section>
  );
}
