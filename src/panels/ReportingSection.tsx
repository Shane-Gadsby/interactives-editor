import { useState } from 'react';
import { artboardChoices } from '../lib/variants-edit';
import type { Project, ReportingSettings } from 'interactives-player';
import { store } from '../store/store';
import { questionFrames, syncReportScores } from '../lib/question-kit';
import { CheckField, NumberField, Row, Section, SelectField } from '../components/ui';
import { ResultsModal } from '../components/ProjectModals';
import { SectionBlurb } from '../components/SectionBlurb';

type Completion = NonNullable<ReportingSettings['completion']>;

/** Edit the project's reporting settings, dropping the key when it goes back to nothing so the document stays small. */
export function patchReporting(project: Project, patch: Partial<ReportingSettings>): ReportingSettings | undefined {
  const next: Record<string, unknown> = { ...project.settings.reporting };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === '' || (k === 'completion' && v === 'manual')) delete next[k];
    else next[k] = v;
  }
  return Object.keys(next).length ? (next as ReportingSettings) : undefined;
}

/** The ways a project can count as complete. */
export const COMPLETION_OPTIONS: { value: Completion; label: string }[] = [
  { value: 'manual', label: 'Report result node only' },
  { value: 'artboard', label: 'Reaching an artboard' },
  { value: 'variable', label: 'A variable turns on' },
  { value: 'pass', label: 'Score meets the pass mark' },
  { value: 'steps', label: 'A step-through artboard reaches its last step' },
];

/** Project settings for results and resume: the score, the pass mark, when it counts as complete, and the results view. */
export function ReportingSection({ project }: { project: Project }) {
  const r = project.settings.reporting ?? {};
  const [resultsOpen, setResultsOpen] = useState(false);
  const set = (patch: Partial<ReportingSettings>, coalesce?: string) =>
    store().update(
      (d) => {
        const next = patchReporting(d as Project, patch);
        if (next) (d as Project).settings.reporting = next;
        else delete (d as Project).settings.reporting;
        //The kit's Report result nodes send the question's own score, or none when the score is the total of all the questions
        if ('scoreFrom' in patch) syncReportScores(d as Project);
      },
      { coalesce },
    );
  const numbers = project.variables.filter((v) => v.type === 'number');
  const booleans = project.variables.filter((v) => v.type === 'boolean');
  const completion: Completion = r.completion ?? 'manual';
  const remembered = project.variables.filter((v) => v.persist).length;
  const userData = project.variables.filter((v) => v.userData).length;
  const fromQuestions = r.scoreFrom === 'questions';
  const hasQuestions = project.artboards.some((a) => questionFrames(a).length > 0);
  return (
    <Section help="results" title="Results and progress" defaultOpen={false}>
      {(hasQuestions || fromQuestions) && (
        <SelectField<'variable' | 'questions'>
          label="Score from"
          title="A number variable you keep yourself, or the total of all the project's questions: their points added up, out of the most they can score. The total is also there in expressions as quiz.score, quiz.max and quiz.percent"
          value={fromQuestions ? 'questions' : 'variable'}
          options={[
            { value: 'variable', label: 'A score variable' },
            { value: 'questions', label: 'Total of all questions' },
          ]}
          onChange={(v) => set({ scoreFrom: v === 'questions' ? 'questions' : undefined, ...(v === 'questions' ? { scoreVariable: undefined, maxScore: undefined } : {}) })}
        />
      )}
      {!fromQuestions && <SelectField
        label="Score variable"
        title="The number variable that holds the learner's score. Report result sends its value"
        value={r.scoreVariable ?? ''}
        options={[{ value: '', label: 'No score' }, ...numbers.map((v) => ({ value: v.id, label: v.name }))]}
        onChange={(v) => set({ scoreVariable: v, ...(v ? {} : { passMark: undefined, maxScore: undefined }) })}
      />}
      {fromQuestions && (
        <>
          <CheckField label="Pass mark" title="Report pass or fail as well as the score" value={r.passMark !== undefined} onChange={(v) => set({ passMark: v ? 80 : undefined })} />
          {r.passMark !== undefined && <NumberField label="Pass at" title="The percentage of all the questions' points a learner needs to pass" value={r.passMark} min={0} max={100} suffix="%" onChange={(v) => set({ passMark: v }, 'reporting-pass')} />}
          <SectionBlurb text="The score is the total of all the questions' points, out of the most they can score." name="Results and progress" help={['results', 'set-it-up']} />
        </>
      )}
      {r.scoreVariable && (
        <>
          <NumberField label="Top score" title="The score that counts as 100%. A score above it is reported as 100%" value={r.maxScore ?? 100} min={1} onChange={(v) => set({ maxScore: v === 100 ? undefined : v }, 'reporting-max')} />
          <CheckField label="Pass mark" title="Report pass or fail as well as the score" value={r.passMark !== undefined} onChange={(v) => set({ passMark: v ? 80 : undefined })} />
          {r.passMark !== undefined && <NumberField label="Pass at" title="The percentage of the top score a learner needs to pass" value={r.passMark} min={0} max={100} suffix="%" onChange={(v) => set({ passMark: v }, 'reporting-pass')} />}
        </>
      )}
      <SelectField label="Complete when" title="When the project counts as completed for a learner. Completing reports the result once" value={completion} options={COMPLETION_OPTIONS} onChange={(v) => set({ completion: v, ...(v === 'artboard' ? {} : { completionArtboard: undefined }), ...(v === 'variable' ? {} : { completionVariable: undefined }) })} />
      {completion === 'artboard' && (
        <SelectField
          label="Artboard"
          title="Reaching this artboard completes the project"
          value={r.completionArtboard ?? ''}
          options={[{ value: '', label: 'Choose an artboard' }, ...artboardChoices(project, r.completionArtboard)]}
          onChange={(v) => set({ completionArtboard: v })}
        />
      )}
      {completion === 'variable' && (
        <SelectField
          label="Variable"
          title="Turning this true/false variable on completes the project"
          value={r.completionVariable ?? ''}
          options={[{ value: '', label: 'Choose a variable' }, ...booleans.map((v) => ({ value: v.id, label: v.name }))]}
          onChange={(v) => set({ completionVariable: v })}
        />
      )}
      {completion === 'steps' && !project.artboards.some((a) => a.steps) && <p className="hint">No artboard has Steps turned on yet (select an artboard, Steps section), or this never completes.</p>}
      {completion === 'pass' && !((r.scoreVariable || fromQuestions) && r.passMark !== undefined) && <p className="hint">Pick a score variable and set a pass mark above, or this never completes.</p>}
      <CheckField label="Resume on the same artboard" title="A learner who comes back opens on the artboard they left, not the start artboard" value={!!r.resumeArtboard} onChange={(v) => set({ resumeArtboard: v ? true : undefined })} />
      <SectionBlurb
        text={[
          remembered ? `${remembered} variable${remembered === 1 ? ' is' : 's are'} remembered between visits.` : '',
          userData ? `${userData} variable${userData === 1 ? ' is' : 's are'} saved as user data.` : '',
          remembered || userData ? '' : 'To keep a value between visits, open a variable in the Variables tab, then Options. Remember keeps it in their results record or their browser. Save as user data keeps it on the server, so it follows them to another device.',
        ]
          .filter(Boolean)
          .join(' ')}
        name="Results and progress"
        help={['results', 'where-it-goes']}
      />
      <Row k="View results" words={['scores', 'who has played', 'analytics', 'learners']}>
        <button className="btn" onClick={() => setResultsOpen(true)} title="Who has played, and how they did">
          View results…
        </button>
      </Row>
      {resultsOpen && <ResultsModal onClose={() => setResultsOpen(false)} />}
    </Section>
  );
}
