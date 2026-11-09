import type { Project, RecordSettings } from 'interactives-player';
import { store } from '../store/store';
import { CheckField, Row, Section } from '../components/ui';
import { SectionBlurb } from '../components/SectionBlurb';

type Auto = 'views' | 'clicks' | 'steps' | 'answers';

/** Edit the project's record settings, dropping a key when it goes back to the default (on) so the document stays small. */
export function patchRecords(project: Project, patch: Partial<RecordSettings>): RecordSettings | undefined {
  const next: Record<string, unknown> = { ...project.settings.records };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || (k === 'off' ? v === false : v === true)) delete next[k];
    else next[k] = v;
  }
  return Object.keys(next).length ? (next as RecordSettings) : undefined;
}

const KINDS: { key: Auto; label: string; title: string }[] = [
  { key: 'views', label: 'Artboard views', title: 'Which artboards learners get to (the funnel in Insights)' },
  { key: 'clicks', label: 'Clicks', title: 'Where learners click, and which button or link (the click heat in Insights). At most 300 a visit' },
  { key: 'steps', label: 'Steps', title: 'Which step of a step-through artboard learners reach' },
  { key: 'answers', label: 'Question answers', title: 'Whether each check was right, and which options were chosen. What a learner types into a blank is never kept' },
];

/** Project settings for learner activity records: the master switch and the automatic kinds. */
export function RecordsSection({ project }: { project: Project }) {
  const r = project.settings.records ?? {};
  const on = !r.off;
  const set = (patch: Partial<RecordSettings>) =>
    store().update((d) => {
      const next = patchRecords(d as Project, patch);
      if (next) (d as Project).settings.records = next;
      else delete (d as Project).settings.records;
    });
  return (
    <Section help="insights" title="Learner records" defaultOpen={false}>
      <CheckField label="Record learner activity" title="Count what learners do, for the Insights tab. Off: nothing is recorded, Record nodes included" value={on} onChange={(v) => set({ off: v ? undefined : true })} />
      {on &&
        KINDS.map((k) => (
          <CheckField key={k.key} label={k.label} title={k.title} value={r[k.key] !== false} onChange={(v) => set({ [k.key]: v ? undefined : false })} />
        ))}
      <SectionBlurb
        text={on ? 'Records reach Insights only from the Link for StudyDesk. It shows counts, never a learner by name.' : 'Nothing is recorded about what learners do. Results and progress still work.'}
        name="Learner records"
        help={['insights', 'what-is-and-is-not-recorded']}
      />
      <Row k="Open Insights" words={['records', 'learner records', 'responses', 'results']}>
        <button className="btn" onClick={() => store().set({ bottomTab: 'insights' })} title="Open the Insights tab">
          Open Insights
        </button>
      </Row>
    </Section>
  );
}
