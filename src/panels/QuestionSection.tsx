import { useState } from 'react';
import {
  MAX_BLANKS,
  MAX_HINTS,
  MAX_HOTSPOTS,
  MAX_OPTIONS,
  MAX_PAIRS,
  QUESTION_KINDS,
  americanForms,
  isMultiple,
  newQuestion,
  questionProblems,
  questionVars,
  serverMarkingProblem,
  type Artboard,
  type FrameNode,
  type Project,
  type Question,
  type QuestionBlank,
  type QuestionKind,
  type QuestionOption,
  type QuestionPair,
  type SceneNode,
} from 'interactives-player';
import { store } from '../store/store';
import { CheckField, IconButton, NumberField, Row, Section, SelectField, TextField } from '../components/ui';
import { syncPractice } from '../lib/voice';
import { VoiceSection } from './VoiceSection';
import { growAreas, makeIndependent, partOf, partsOf, setAreaShape, setQuestionSettings, shapeOfArea, sharedPrefix, type AreaShape } from '../lib/question-kit';

const PART_LABELS: [string, string][] = [
  ['prompt', 'Prompt'],
  ['option', 'Option'],
  ['optionLabel', 'Option text'],
  ['marker', 'Marker'],
  ['matchTerm', 'Term'],
  ['matchDefinition', 'Definition'],
  ['matchZone', 'Slot'],
  ['matchState', 'Pair result'],
  ['picture', 'Picture'],
  ['spots', 'Picture area'],
  ['spot', 'Area'],
  ['spotPicks', 'Picks text'],
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
    store().update(
      (d) => {
        setQuestionSettings(d as Project, ab.id, frame.id, patch);
        //Practice mode has the word in a Read aloud node, which follows the word when it is edited
        syncPractice(d as Project, ab.id, frame.id);
      },
      { coalesce: key ? `question-${frame.id}-${key}` : undefined },
    );
  const problems = questionProblems(q);
  const serverProblem = serverMarkingProblem(q);
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
  const setPair = (i: number, patch: Partial<QuestionPair>, key?: string) => apply({ pairs: q.pairs.map((pr, j) => (j === i ? { ...pr, ...patch } : pr)) }, key ?? `pair-${i}`);
  const movePair = (i: number, by: number) => {
    const list = q.pairs.slice();
    const [moved] = list.splice(i, 1);
    list.splice(i + by, 0, moved);
    apply({ pairs: list });
  };
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
    const pairs = kind === 'matching' && q.pairs.length < 2 ? newQuestion('matching').pairs : q.pairs;
    if (kind === 'hotspot') {
      //The options become the areas: at least one, with one right
      if (!options.length || q.kind === 'blank' || q.kind === 'matching') options = newQuestion('hotspot').options;
      if (!options.some((o) => o.correct)) options = options.map((o, i) => ({ ...o, correct: i === 0 ? true : undefined }));
      options = options.slice(0, MAX_HOTSPOTS);
    }
    if (kind !== 'blank' && kind !== 'truefalse' && kind !== 'matching' && kind !== 'hotspot' && options.length < 2) options = [{ id: 'o1', text: 'First', correct: true }, { id: 'o2', text: 'Second' }, { id: 'o3', text: 'Third' }];
    apply({ kind, options, blanks, pairs, partial: kind === 'multiple' || kind === 'ordering' || kind === 'blank' || kind === 'matching', ...(kind === 'matching' || kind === 'hotspot' ? { bank: null } : {}) });
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
                label={b.spelling ? 'Accepted spellings' : 'Accepted answers'}
                title={
                  b.spelling
                    ? 'One per line. Every letter has to match. Put alternative spellings (judgement, judgment) on their own lines. Case and spaces round the word are ignored unless you tick Match case'
                    : 'One per line. Case and extra spaces are ignored. A number is compared as a number. /pattern/i is a pattern'
                }
                value={b.answers.join('\n')}
                multiline
                rows={2}
                onChange={(v) => setBlank(i, { answers: v.split('\n') }, `blank-answers-${i}`)}
              />
              <Row>
                <CheckField label="Match case" value={!!b.caseSensitive} onChange={(v) => setBlank(i, { caseSensitive: v || undefined })} />
                {!b.spelling && <NumberField label="± Tolerance" title="How far off a number answer may be" value={b.tolerance ?? 0} min={0} step={0.1} onChange={(v) => setBlank(i, { tolerance: v > 0 ? v : undefined }, `blank-tol-${i}`)} />}
              </Row>
              <CheckField
                label="Spelling: letters must match exactly"
                title="For a word to spell. No numbers, tolerance or guessing: every letter has to be there. A curly apostrophe typed on a phone counts as a plain one, and the browser's own spellcheck and autocorrect are switched off in the box"
                value={!!b.spelling}
                onChange={(v) => setBlank(i, { spelling: v || undefined, usSpelling: v ? b.usSpelling : undefined, tolerance: v ? undefined : b.tolerance })}
              />
              {b.spelling && (
                <>
                  <CheckField
                    label="Also accept American spellings"
                    title="Accepts the American spelling of each accepted spelling as well (colour, color; organise, organize). It knows the common differences, listed below, and leaves a word alone when it is not sure. Add anything else as its own line"
                    value={!!b.usSpelling}
                    onChange={(v) => setBlank(i, { usSpelling: v || undefined })}
                  />
                  {b.usSpelling && (
                    <div className="muted small">
                      {americanForms(b.answers).length ? `American forms accepted too: ${americanForms(b.answers).join(', ')}.` : 'No American form of these spellings differs, so nothing is added.'}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          <button className="btn" disabled={q.blanks.length >= MAX_BLANKS} onClick={() => apply({ blanks: [...q.blanks, { id: nextId(q.blanks, 'b'), label: `Answer ${q.blanks.length + 1}`, answers: [''] }] })}>
            + Add blank
          </button>
        </div>
      )}
      {q.kind === 'blank' && q.blanks.some((b) => b.spelling) && <VoiceSection frame={frame} ab={ab} project={project} />}

      {q.kind === 'matching' && (
        <div className="q-list" role="group" aria-label="Pairs">
          <div className="muted small">Each pair is a term the learner drags and the definition it belongs to. Learners see the terms {q.shuffle ? 'shuffled' : 'in this order'}.</div>
          {q.pairs.map((pr, i) => (
            <div key={pr.id} className="q-option">
              <Row>
                <span className="muted small q-num">{i + 1}.</span>
                <TextField value={pr.term} placeholder="Term" title="The layer the learner drags" onChange={(v) => setPair(i, { term: v }, `pair-term-${i}`)} />
                <IconButton icon={<span aria-hidden="true">↑</span>} title="Move this pair up" disabled={i === 0} onClick={() => movePair(i, -1)} />
                <IconButton icon={<span aria-hidden="true">↓</span>} title="Move this pair down" disabled={i === q.pairs.length - 1} onClick={() => movePair(i, 1)} />
                <IconButton icon={<span aria-hidden="true">×</span>} title="Remove this pair" disabled={q.pairs.length <= 2} onClick={() => apply({ pairs: q.pairs.filter((_, j) => j !== i) })} />
              </Row>
              <TextField value={pr.match} placeholder="What it matches" title="The text beside the slot the term goes into" onChange={(v) => setPair(i, { match: v }, `pair-match-${i}`)} />
            </div>
          ))}
          <button className="btn" disabled={q.pairs.length >= MAX_PAIRS} onClick={() => apply({ pairs: [...q.pairs, { id: nextId(q.pairs, 'p'), term: '', match: '' }] })}>
            + Add pair
          </button>
          <div className="muted small">Terms, definitions and slots are ordinary layers: restyle them, or move the slots onto a diagram to match labels to places.</div>
        </div>
      )}

      {q.kind === 'hotspot' && (
        <div className="q-list" role="group" aria-label="Areas">
          <div className="muted small">
            Put your picture in the Picture layer, then place each area over it (the layers named Area). {isMultiple(q) ? 'Tick every right area; the learner marks all of them.' : 'Mark the one right area.'}
          </div>
          {q.options.map((o, i) => {
            const area = (parts.spot ?? []).find((n) => n.questionPart === `spot:${o.id}`);
            return (
              <div key={o.id} className="q-option">
                <Row>
                  <input
                    type="checkbox"
                    checked={!!o.correct}
                    aria-label={`Area ${i + 1} is right`}
                    title="Right area"
                    onChange={(e) => setOption(i, { correct: e.target.checked ? true : undefined })}
                  />
                  <TextField value={o.text} placeholder={`Area ${i + 1} name`} title="Screen readers say this name for the area" onChange={(v) => setOption(i, { text: v }, `option-text-${i}`)} />
                  <IconButton icon={<span aria-hidden="true">↑</span>} title="Move up" disabled={i === 0} onClick={() => moveOption(i, -1)} />
                  <IconButton icon={<span aria-hidden="true">↓</span>} title="Move down" disabled={i === q.options.length - 1} onClick={() => moveOption(i, 1)} />
                  <IconButton icon={<span aria-hidden="true">×</span>} title="Remove this area" disabled={q.options.length <= 1} onClick={() => apply({ options: q.options.filter((_, j) => j !== i) })} />
                </Row>
                <Row>
                  <SelectField<AreaShape>
                    label="Shape"
                    title="The shape of the clickable area. Edit its outline on the canvas with the usual tools"
                    value={area ? shapeOfArea(area) : 'rect'}
                    options={[
                      { value: 'rect', label: 'Rectangle' },
                      { value: 'ellipse', label: 'Ellipse' },
                      { value: 'polygon', label: 'Polygon' },
                    ]}
                    onChange={(v) => store().update((d) => setAreaShape(d as Project, ab.id, frame.id, o.id, v))}
                  />
                  <button className="btn" disabled={!area} title="Select the area's layer so you can move, resize or reshape it on the canvas" onClick={() => area && select(area.id)}>
                    Edit on canvas
                  </button>
                </Row>
                <TextField value={o.feedback ?? ''} placeholder="Feedback if clicked (optional)" onChange={(v) => setOption(i, { feedback: v || undefined }, `option-fb-${i}`)} />
              </div>
            );
          })}
          <button
            className="btn"
            disabled={q.options.length >= MAX_HOTSPOTS}
            onClick={() => apply({ options: [...q.options, { id: nextId(q.options, 'o'), text: `Area ${q.options.length + 1}` }] })}
          >
            + Add area
          </button>
          <button className="btn" disabled={!(parts.spot ?? []).length} title="Select every area at once: the areas are invisible until a learner picks one, so this shows where they are" onClick={() => store().select((parts.spot ?? []).map((n) => n.id))}>
            Show all areas
          </button>
          <Row>
            <button className="btn" title="Every area gets 8 px bigger on each side, so a click a little off still counts" onClick={() => store().update((d) => growAreas(d as Project, ab.id, frame.id, 8))}>
              Grow areas 8 px
            </button>
            <button className="btn" title="Every area gets 8 px smaller on each side" onClick={() => store().update((d) => growAreas(d as Project, ab.id, frame.id, -8))}>
              Shrink areas 8 px
            </button>
          </Row>
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
      {(q.kind === 'multiple' || q.kind === 'ordering' || q.kind === 'blank' || q.kind === 'matching' || isMultiple(q)) && (
        <CheckField label="Part marks" title="Give a share of the points for the parts that are right" value={q.partial} onChange={(v) => apply({ partial: v })} />
      )}
      {q.kind !== 'truefalse' && q.kind !== 'blank' && q.kind !== 'hotspot' && <CheckField label="Shuffle" title="A different order each time the question starts" value={q.shuffle} onChange={(v) => apply({ shuffle: v })} />}
      <CheckField label="Show the right answer when finished wrong" value={q.reveal} onChange={(v) => apply({ reveal: v })} />
      <CheckField
        label="Mark answers on the server"
        title="On the share link and the Link for StudyDesk, the right answers are kept off the learner's page and the server marks each check and records the score. In the editor's Preview and in files you export, the question marks in the page as usual"
        value={!!q.serverMarked}
        disabled={!!serverProblem && !q.serverMarked}
        onChange={(v) => apply({ serverMarked: v || undefined })}
      />
      {q.serverMarked && !serverProblem && (
        <div className="muted small">
          Learners get this question without its right answers, patterns, hints or feedback, and the server marks it. Only the share link and the Link for StudyDesk do this (the answers go out when you update the link). Preview and exported files still carry the answers.
        </div>
      )}
      {q.serverMarked && !serverProblem && <Retakes q={q} apply={apply} />}
      {serverProblem && <div className={q.serverMarked ? 'q-problem' : 'muted small'}>{q.serverMarked ? 'Marked in the page for now. ' : ''}{serverProblem}</div>}

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

      <div className="q-sub">Listening and keys</div>
      <CheckField
        label="Listen button"
        title="Adds a Listen button beside Check. It reads the question and its options aloud, and the feedback once the answer has been checked, with a voice on the learner's own device. It hides itself when the device has no voice, and never starts by itself"
        value={!!q.listen}
        onChange={(v) => apply({ listen: v || undefined })}
      />
      <TextField
        label="Say the prompt like"
        title="What a voice says for the prompt instead of its text, for a formula, an abbreviation or a long scenario that reads badly aloud. The options are still read after it"
        value={q.spoken ?? ''}
        multiline
        rows={2}
        placeholder="Optional. Empty: the prompt"
        onChange={(v) => apply({ spoken: v || undefined }, 'spoken')}
      />
      <TextField
        label="Spoken explanation"
        title="Said after the feedback when the learner presses Listen once the answer has been checked: why the answer is what it is."
        value={q.explain ?? ''}
        multiline
        rows={2}
        placeholder="Optional. e.g. Because a whale breathes air"
        onChange={(v) => apply({ explain: v || undefined }, 'explain')}
      />
      {(q.kind === 'single' || q.kind === 'multiple' || q.kind === 'truefalse') && (
        <CheckField
          label="Number keys 1 to 9 choose"
          title="Pressing 1 to 9 chooses the option in that place (several choices toggle). It works anywhere on the page, so use it on one question at a time. Choosing still needs Check answer"
          value={!!q.numberKeys}
          onChange={(v) => apply({ numberKeys: v || undefined })}
        />
      )}

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

      {q.kind !== 'matching' && q.kind !== 'hotspot' && <QuestionBank q={q} project={project} apply={apply} />}

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

/**
 * Goes at the whole set, for questions marked on the server. Questions that have it are one test: the learner finishes all of
 * them, that is a round, and the score that counts is the best round or the latest. Set it the same on every question of the test.
 */
function Retakes({ q, apply }: { q: Question; apply: (patch: Partial<Question>, key?: string) => void }) {
  const mode = !q.retake ? 'off' : q.retake.limit < 0 ? 'unlimited' : 'limited';
  const set = (m: 'off' | 'limited' | 'unlimited') =>
    apply({ retake: m === 'off' ? undefined : { limit: m === 'unlimited' ? -1 : Math.max(1, q.retake && q.retake.limit > 0 ? q.retake.limit : 1), keep: q.retake?.keep ?? 'best' } });
  return (
    <>
      <SelectField<'off' | 'limited' | 'unlimited'>
        label="Retakes"
        title="Whether the learner can go through the whole set of questions again after finishing it. Off: the first go is the mark that counts, and Try again is practice. Otherwise the server keeps every round, a Reset question node with Retake on starts the next one, and the right answers stay hidden until the last go"
        value={mode}
        options={[
          { value: 'off', label: 'Off (first go counts, then practice)' },
          { value: 'limited', label: 'A set number of retakes' },
          { value: 'unlimited', label: 'Unlimited retakes' },
        ]}
        onChange={set}
      />
      {q.retake && q.retake.limit >= 0 && (
        <NumberField label="Retakes allowed" title="Goes at the whole set after the first. 1 means two goes in all" value={q.retake.limit} min={1} max={100} step={1} onChange={(v) => apply({ retake: { ...q.retake!, limit: Math.max(1, Math.round(v)) } }, 'retake-limit')} />
      )}
      {q.retake && (
        <>
          <SelectField<'best' | 'latest'>
            label="Score kept"
            title="Which round's score is the mark: the best one, or the most recent (which can be lower than an earlier go)"
            value={q.retake.keep}
            options={[
              { value: 'best', label: 'Best round' },
              { value: 'latest', label: 'Latest round' },
            ]}
            onChange={(v) => apply({ retake: { ...q.retake!, keep: v } })}
          />
          <div className="muted small">Set this the same on every question of the test. A round is every one of them finished once. Add a Reset question node with Retake on (for example on a Retake button) to start the next round; Try again on a single question is hidden.</div>
        </>
      )}
    </>
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
