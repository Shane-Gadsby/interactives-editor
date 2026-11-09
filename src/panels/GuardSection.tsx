import { useState } from 'react';
import type { Artboard, FrameNode, Project, QuestionGuard } from 'interactives-player';
import { exemptionHash } from 'interactives-player';
import { store } from '../store/store';
import { CheckField, Row, SelectField } from '../components/ui';
import { setQuestionSettings } from '../lib/question-kit';
import { SectionBlurb } from '../components/SectionBlurb';

/** The guard settings after a change: an empty record is dropped (the question then does what it always did). */
export function guardWith(g: QuestionGuard | undefined, patch: Partial<QuestionGuard>): QuestionGuard | undefined {
  const next: Record<string, unknown> = { ...(g ?? {}), ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  return Object.keys(next).length ? (next as QuestionGuard) : undefined;
}

/**
 * The Spelling test's guard: switch off what the page can (spell check, autocorrect, writing tools that honour an opt-out, paste),
 * look for what it cannot, and hold the learner until it is gone. The help topic and the text here say what it cannot do.
 */
export function GuardSection({ frame, ab }: { frame: FrameNode; ab: Artboard }) {
  const q = frame.question!;
  const g = q.guard;
  const mode = g?.mode ?? 'off';
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const set = (patch: Partial<QuestionGuard>) =>
    store().update((d) => {
      const f = ab && (d as Project).artboards.find((a) => a.id === ab.id);
      if (!f) return;
      setQuestionSettings(d as Project, ab.id, frame.id, { guard: guardWith(frame.question!.guard, patch) });
    });
  return (
    <>
      <div className="q-sub">Spell checkers and writing tools</div>
      <SectionBlurb text="Keeps spell check, Grammarly and other writing tools from helping with the word. A phone or tablet keyboard is only a hint (on iPhone), and a second device cannot be seen." name="spell checkers and writing tools" help={['question-kit', 'spelling-tests']} />
      <SelectField
        label="When a writing tool is found"
        title="Block: the learner sees a panel saying what was found and how to turn it off, and cannot carry on until it is gone. Warn only: the panel is a notice they can dismiss. Off: nothing is looked for (the options below still apply). What is found is kept with the learner's result either way, and shown in Results"
        value={mode}
        options={[
          { value: 'block', label: 'Block until it is turned off' },
          { value: 'warn', label: 'Warn only' },
          { value: 'off', label: 'Off' },
        ]}
        onChange={(v) => set({ mode: v as 'block' | 'warn' | 'off' })}
      />
      <CheckField
        label="Switch off browser spell check and writing helpers in the box"
        title="No spellcheck underline, autocorrect, automatic capitals or autofill in the answer box, and the opt-out attributes Grammarly and LanguageTool honour. Some tools ignore them, which is what the panel above is for"
        value={g?.spellcheck !== false}
        onChange={(on) => set({ spellcheck: on ? undefined : false })}
      />
      <CheckField
        label="Block paste and drop into the box"
        title="The answer has to be typed. Dragging text in and pasting are both refused"
        value={g ? g.paste !== false : false}
        onChange={(on) => set(on ? { paste: undefined, mode: g?.mode ?? 'off' } : { paste: false })}
      />
      {mode !== 'off' && (
        <div className="q-option">
          <SectionBlurb
            text={
              <>
                <strong>Exemption for assistive technology.</strong> A learner who is wrongly stopped types a code to carry on. {g?.exempt ? 'A code is set.' : 'No code is set.'}
              </>
            }
            name="the exemption code"
            help={['question-kit', 'spelling-tests']}
          />
          <Row>
            <label className="field">
              <span>Exemption code</span>
              <input type="text" value={code} placeholder={g?.exempt ? 'Type a new code to replace it' : 'A word or number you will give out'} autoComplete="off" spellCheck={false} onChange={(e) => setCode(e.target.value)} />
            </label>
            <button
              className="btn"
              disabled={code.trim().length < 4}
              title="Codes are at least 4 characters"
              onClick={() => {
                set({ exempt: exemptionHash(code) });
                setNote(`The code is set. Give it to learners who need it. It is not shown again here.`);
                setCode('');
              }}
            >
              Set code
            </button>
            {g?.exempt && (
              <button
                className="btn"
                onClick={() => {
                  set({ exempt: undefined });
                  setNote('The code is removed.');
                }}
              >
                Remove code
              </button>
            )}
          </Row>
          {note && (
            <div className="muted small" role="status">
              {note}
            </div>
          )}
        </div>
      )}
    </>
  );
}
