import { useState } from 'react';
import {
  MAX_BLANKS,
  MAX_HINTS,
  MAX_OPTIONS,
  QUESTION_KINDS,
  questionProblems,
  questionVars,
  type Artboard,
  type FrameNode,
  type Project,
  type Question,
  type QuestionBlank,
  type QuestionKind,
  type QuestionOption,
  type SceneNode,
} from 'interactives-player';
import { store } from '../store/store';
import { CheckField, IconButton, NumberField, Row, Section, SelectField, TextField } from '../components/ui';
import { makeIndependent, partOf, partsOf, setQuestionSettings, sharedPrefix } from '../lib/question-kit';

const PART_LABELS: [string, string][] = [
  ['prompt', 'Prompt'],
  ['option', 'Option'],
  ['optionLabel', 'Option text'],
  ['marker', 'Marker'],
  ['blankInput', 'Blank input'],
  ['check', 'Check button'],
  ['hint', 'Hint button'],
  ['reset', 'Try again button'],
  ['hintText', 'Hint text'],
  ['feedback', 'Feedback'],
  ['score', 'Score'],
  ['buttons', 'Button row'],
];

const nextId = (list: { id: string }[], prefix: string): string => {
  let n = list.length + 1;
  while (list.some((x) => x.id === `${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

/**
 * The question's settings. Every change goes through setQuestionSettings, which keeps the variables, the answer area and
 * the graph in line and leaves the look of the layers alone.
 */
export function QuestionSection({ frame, ab, project }: { frame: FrameNode; ab: Artboard; project: Project }) {
  const q = frame.question!;
  const apply = (patch: Partial<Question>, key?: string) =>
    store().update((d) => setQuestionSettings(d as Project, ab.id, frame.id, patch), { coalesce: key ? `question-${frame.id}-${key}` : undefined });
  const problems = questionProblems(q);
  const shared = sharedPrefix(project, frame);
  const choice = q.kind === 'single' || q.kind === 'multiple';
  const parts = partsOf(frame);
  const setOption = (i: number, patch: Partial<QuestionOption>, key?: string) => apply({ options: q.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) }, key ?? `option-${i}`);
  const moveOption = (i: number, by: number) => {
    const list = q.options.slice();
    const [moved] = list.splice(i, 1);
    list.splice(i + by, 0, moved);
    apply({ options: list });
  };
  const setBlank = (i: number, patch: Partial<QuestionBlank>, key?: string) => apply({ blanks: q.blanks.map((b, j) => (j === i ? { ...b, ...patch } : b)) }, key ?? `blank-${i}`);
  const changeKind = (kind: QuestionKind) => {
    if (kind === q.kind) return;
    //Each kind keeps what it can: the options carry over between the choice kinds and ordering, true/false has its two
    let options = q.options;
    let blanks = q.blanks;
    if (kind === 'truefalse') options = [{ id: 'o1', text: 'True', correct: true }, { id: 'o2', text: 'False' }];
    else if (q.kind === 'truefalse') options = [{ id: 'o1', text: 'Option 1', correct: true }, { id: 'o2', text: 'Option 2' }, { id: 'o3', text: 'Option 3' }];
    if (kind === 'single' && q.kind === 'multiple') {
      const first = options.findIndex((o) => o.correct);
      options = options.map((o, i) => ({ ...o, correct: i === first ? true : undefined }));
    }
    if (kind === 'blank' && !blanks.length) blanks = [{ id: 'b1', label: 'Answer', answers: [''] }];
    if (kind !== 'blank' && kind !== 'truefalse' && options.length < 2) options = [{ id: 'o1', text: 'First', correct: true }, { id: 'o2', text: 'Second' }, { id: 'o3', text: 'Third' }];
    apply({ kind, options, blanks, partial: kind === 'multiple' || kind === 'ordering' || kind === 'blank' });
  };
  const select = (id: string) => store().select([id]);
  return (
    <Section help="question-kit" title="Question" defaultOpen>
      {problems.map((p) => (
        <div key={p} className="q-problem" role="alert">
          {p}
        </div>
      ))}
      {shared.length > 0 && (
        <div className="q-problem" role="alert">
          <div>
            “{shared[0].name}” keeps its variables under the same name ({q.prefix}_…), so the two share one answer.
          </div>
          <button className="btn" onClick={() => store().update((d) => makeIndependent(d as Project, ab.id, frame.id))} title="Gives this question its own variables and interaction nodes, and leaves the other alone">
            Make this one independent
          </button>
        </div>
      )}
      <SelectField<QuestionKind>
        label="Type"
        title="What kind of question. Changing it rebuilds the answer area; the prompt, buttons and feedback keep their look"
        value={q.kind}
        options={QUESTION_KINDS.map((k) => ({ value: k.value, label: k.label }))}
        onChange={changeKind}
      />
      <TextField label="Prompt" title="The question itself" value={q.prompt} multiline rows={3} onChange={(v) => apply({ prompt: v }, 'prompt')} />

      {choice && (
        <div className="q-list" role="group" aria-label="Options">
          <div className="muted small">{q.kind === 'single' ? 'Mark the one right option.' : 'Tick every right option.'}</div>
          {q.options.map((o, i) => (
            <div key={o.id} className="q-option">
              <Row>
                <input
                  type={q.kind === 'single' ? 'radio' : 'checkbox'}
                  name={`q-${frame.id}`}
                  checked={!!o.correct}
                  aria-label={`Option ${i + 1} is right`}
                  title="Right answer"
                  onChange={(e) => {
                    if (q.kind === 'single') apply({ options: q.options.map((x, j) => ({ ...x, correct: j === i ? true : undefined })) });
                    else setOption(i, { correct: e.target.checked ? true : undefined });
                  }}
                />
                <TextField value={o.text} placeholder={`Option ${i + 1}`} onChange={(v) => setOption(i, { text: v }, `option-text-${i}`)} />
                <IconButton icon={<span aria-hidden="true">↑</span>} title="Move up" disabled={i === 0} onClick={() => moveOption(i, -1)} />
                <IconButton icon={<span aria-hidden="true">↓</span>} title="Move down" disabled={i === q.options.length - 1} onClick={() => moveOption(i, 1)} />
                <IconButton icon={<span aria-hidden="true">×</span>} title="Remove this option" disabled={q.options.length <= 2} onClick={() => apply({ options: q.options.filter((_, j) => j !== i) })} />
              </Row>
              <TextField value={o.feedback ?? ''} placeholder="Feedback if chosen (optional)" onChange={(v) => setOption(i, { feedback: v || undefined }, `option-fb-${i}`)} />
              {q.shuffle && <CheckField label="Stays in place when shuffled" title="For options like “None of these”" value={!!o.fixed} onChange={(v) => setOption(i, { fixed: v || undefined })} />}
            </div>
          ))}
          <button className="btn" disabled={q.options.length >= MAX_OPTIONS} onClick={() => apply({ options: [...q.options, { id: nextId(q.options, 'o'), text: '' }] })}>
            + Add option
          </button>
        </div>
      )}

      {q.kind === 'truefalse' && (
        <>
          <SelectField<'true' | 'false'>
            label="Statement is"
            title="Whether the statement in the prompt is true"
            value={q.options[0]?.correct ? 'true' : 'false'}
            options={[
              { value: 'true', label: 'True' },
              { value: 'false', label: 'False' },
            ]}
            onChange={(v) => apply({ options: q.options.map((o, i) => ({ ...o, correct: (i === 0) === (v === 'true') ? true : undefined })) })}
          />
          <Row>
            <TextField label="Choices" title="The wording of the two choices" value={q.options[0]?.text ?? 'True'} onChange={(v) => setOption(0, { text: v }, 'tf-0')} />
            <TextField value={q.options[1]?.text ?? 'False'} onChange={(v) => setOption(1, { text: v }, 'tf-1')} />
          </Row>
        </>
      )}

      {q.kind === 'ordering' && (
        <div className="q-list" role="group" aria-label="Items">
          <div className="muted small">List the items in the right order. Learners see them {q.shuffle ? 'shuffled' : 'in this order'}.</div>
          {q.options.map((o, i) => (
            <Row key={o.id}>
              <span className="muted small q-num">{i + 1}.</span>
              <TextField value={o.text} placeholder={`Item ${i + 1}`} onChange={(v) => setOption(i, { text: v }, `option-text-${i}`)} />
              <IconButton icon={<span aria-hidden="true">↑</span>} title="Earlier" disabled={i === 0} onClick={() => moveOption(i, -1)} />
              <IconButton icon={<span aria-hidden="true">↓</span>} title="Later" disabled={i === q.options.length - 1} onClick={() => moveOption(i, 1)} />
              <IconButton icon={<span aria-hidden="true">×</span>} title="Remove this item" disabled={q.options.length <= 2} onClick={() => apply({ options: q.options.filter((_, j) => j !== i) })} />
            </Row>
          ))}
          <button className="btn" disabled={q.options.length >= MAX_OPTIONS} onClick={() => apply({ options: [...q.options, { id: nextId(q.options, 'o'), text: '' }] })}>
            + Add item
          </button>
        </div>
      )}

      {q.kind === 'blank' && (
        <div className="q-list" role="group" aria-label="Blanks">
          {q.blanks.map((b, i) => (
            <div key={b.id} className="q-option">
              <Row>
                <TextField label={`Blank ${i + 1}`} title="Shown above the input" value={b.label} placeholder="Label" onChange={(v) => setBlank(i, { label: v }, `blank-label-${i}`)} />
                <IconButton icon={<span aria-hidden="true">×</span>} title="Remove this blank" disabled={q.blanks.length <= 1} onClick={() => apply({ blanks: q.blanks.filter((_, j) => j !== i) })} />
              </Row>
              <TextField
                label="Accepted answers"
                title="One per line. Case and extra spaces are ignored. A number is compared as a number. /pattern/i is a pattern"
                value={b.answers.join('\n')}
                multiline
                rows={2}
                onChange={(v) => setBlank(i, { answers: v.split('\n') }, `blank-answers-${i}`)}
              />
              <Row>
                <CheckField label="Match case" value={!!b.caseSensitive} onChange={(v) => setBlank(i, { caseSensitive: v || undefined })} />
                <NumberField label="± Tolerance" title="How far off a number answer may be" value={b.tolerance ?? 0} min={0} step={0.1} onChange={(v) => setBlank(i, { tolerance: v > 0 ? v : undefined }, `blank-tol-${i}`)} />
              </Row>
            </div>
          ))}
          <button className="btn" disabled={q.blanks.length >= MAX_BLANKS} onClick={() => apply({ blanks: [...q.blanks, { id: nextId(q.blanks, 'b'), label: `Answer ${q.blanks.length + 1}`, answers: [''] }] })}>
            + Add blank
          </button>
        </div>
      )}

      <div className="q-sub">Marking</div>
      <Row>
        <NumberField label="Points" title="Points a right answer is worth" value={q.points} min={0} step={0.5} onChange={(v) => apply({ points: v }, 'points')} />
        <NumberField label="Tries" title="How many times the answer can be checked before it locks. 0 is no limit" value={q.attempts} min={0} step={1} onChange={(v) => apply({ attempts: Math.round(v) }, 'attempts')} />
      </Row>
      <Row>
        <NumberField label="Retry −%" title="Points taken off for each check after the first, as a percentage" value={Math.round(q.attemptPenalty * 100)} min={0} max={100} onChange={(v) => apply({ attemptPenalty: Math.min(1, Math.max(0, v / 100)) }, 'attemptPenalty')} />
        <NumberField label="Hint −%" title="Points taken off for each hint shown, as a percentage" value={Math.round(q.hintPenalty * 100)} min={0} max={100} onChange={(v) => apply({ hintPenalty: Math.min(1, Math.max(0, v / 100)) }, 'hintPenalty')} />
      </Row>
      {(q.kind === 'multiple' || q.kind === 'ordering' || q.kind === 'blank') && (
        <CheckField label="Part marks" title="Give a share of the points for the parts that are right" value={q.partial} onChange={(v) => apply({ partial: v })} />
      )}
      {q.kind !== 'truefalse' && q.kind !== 'blank' && <CheckField label="Shuffle" title="A different order each time the question starts" value={q.shuffle} onChange={(v) => apply({ shuffle: v })} />}
      <CheckField label="Show the right answer when finished wrong" value={q.reveal} onChange={(v) => apply({ reveal: v })} />

      <div className="q-sub">Hints and feedback</div>
      <TextField
        label="Hints"
        title="One per line. Each press of the Hint button shows the next one"
        value={q.hints.join('\n')}
        multiline
        rows={2}
        placeholder="Optional"
        onChange={(v) => apply({ hints: v.split('\n').slice(0, MAX_HINTS) }, 'hints')}
      />
      <TextField label="Right" title="Said when the answer is right" value={q.feedbackCorrect} onChange={(v) => apply({ feedbackCorrect: v }, 'fb-ok')} />
      <TextField label="Wrong" title="Said when the answer is wrong" value={q.feedbackIncorrect} onChange={(v) => apply({ feedbackIncorrect: v }, 'fb-no')} />
      <TextField label="Partly right" title="Said instead of Wrong when part marks are on and some of it is right" value={q.feedbackPartial} placeholder="Same as Wrong" onChange={(v) => apply({ feedbackPartial: v }, 'fb-part')} />
      <TextField label="Out of tries" title="Said when the last try is used up without a right answer" value={q.feedbackOutOfTries} placeholder="Same as Wrong" onChange={(v) => apply({ feedbackOutOfTries: v }, 'fb-out')} />

      <SelectField<'' | 'progress' | 'complete'>
        label="Report result"
        title="When the question finishes, send its score to the project's Results (a Report result node after Check answer). Set the top score and pass mark in Project > Results and progress"
        value={q.report ?? ''}
        options={[
          { value: '', label: 'No' },
          { value: 'progress', label: 'Score so far' },
          { value: 'complete', label: 'Complete, with the score' },
        ]}
        onChange={(v) => apply({ report: v || null })}
      />

      <QuestionBank q={q} project={project} apply={apply} />

      <div className="q-sub">Variables</div>
      <TextField
        label="Name prefix"
        title="The question keeps its state in variables named prefix_answered, prefix_correct and so on. Renaming it renames them everywhere they are used"
        value={q.prefix}
        commitOnBlur
        onChange={(v) => {
          const clean = v.trim();
          if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(clean) && clean !== q.prefix) apply({ prefix: clean });
        }}
      />
      <details className="q-vars">
        <summary>
          {questionVars(q).length} variables (answered, correct, attempts, score, ...)
        </summary>
        <ul>
          {questionVars(q).map((v) => (
            <li key={v.suffix}>
              <code>
                {q.prefix}_{v.suffix}
              </code>
              <span className="muted small"> {v.about}</span>
            </li>
          ))}
        </ul>
      </details>

      <div className="q-sub">Restyle a part</div>
      <div className="q-parts">
        {PART_LABELS.filter(([part]) => parts[part]?.length).map(([part, label]) => (
          <button key={part} className="chip" title={`Select the ${label.toLowerCase()} layer to restyle it`} onClick={() => select((parts[part][0] as SceneNode).id)}>
            {label}
          </button>
        ))}
      </div>
    </Section>
  );
}

function QuestionBank({ q, project, apply }: { q: Question; project: Project; apply: (patch: Partial<Question>, key?: string) => void }) {
  const [open, setOpen] = useState(!!q.bank);
  const on = !!q.bank;
  return (
    <>
      <div className="q-sub">Question bank</div>
      <CheckField
        label="Take the question from data"
        title="Each row of a data source is a question. The prompt, options and answers above are the default for anything a row leaves out"
        value={on}
        onChange={(v) => {
          setOpen(v);
          apply({ bank: v ? { items: project.dataSources[0]?.name ?? 'quiz', order: 'random' } : null });
        }}
      />
      {on && open && (
        <>
          <TextField
            label="Rows"
            title="An expression giving the rows: the name of a data source, or part of one such as quiz.questions"
            value={q.bank!.items}
            commitOnBlur
            mono
            placeholder="quiz"
            onChange={(v) => apply({ bank: { ...q.bank!, items: v.trim() } })}
          />
          {project.dataSources.length > 0 && (
            <div className="muted small">
              Data sources: {project.dataSources.map((d) => d.name).join(', ')}
            </div>
          )}
          <SelectField<'random' | 'sequence'>
            label="Order"
            title="Random does not repeat a row until every row has been shown"
            value={q.bank!.order}
            options={[
              { value: 'random', label: 'Random' },
              { value: 'sequence', label: 'In order' },
            ]}
            onChange={(v) => apply({ bank: { ...q.bank!, order: v } })}
          />
          <div className="muted small">Columns: prompt, options and correct (or answer, items), hint, feedback, points. The Try again button becomes Next question.</div>
        </>
      )}
    </>
  );
}

/** Shown on a layer that is a piece of a question, so it is clear where its behaviour comes from. */
export function QuestionPartNote({ node, ab }: { node: SceneNode; ab: Artboard }) {
  if (!node.questionPart) return null;
  let owner: FrameNode | null = null;
  const find = (list: SceneNode[], stack: FrameNode[]) => {
    for (const n of list) {
      if (n.id === node.id) owner = stack.filter((f) => f.question).pop() ?? null;
      if (n.type === 'frame' || n.type === 'group') find(n.children, n.type === 'frame' ? [...stack, n] : stack);
    }
  };
  find(ab.children as SceneNode[], []);
  const frame = owner as FrameNode | null;
  if (!frame) return null;
  const label = PART_LABELS.find(([p]) => p === partOf(node))?.[1] ?? partOf(node);
  return (
    <div className="q-part-note">
      <span>
        The {label.toLowerCase()} of “{frame.name}”. Style it freely; what it does comes from the question’s settings.
      </span>
      <button className="btn" onClick={() => store().select([frame.id])}>
        Question settings
      </button>
    </div>
  );
}
