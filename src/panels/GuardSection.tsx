import { useState } from 'react';
import type { Artboard, FrameNode, Project, QuestionGuard } from 'interactives-player';
import { exemptionHash } from 'interactives-player';
import { store } from '../store/store';
import { CheckField, Row, SelectField } from '../components/ui';
import { setQuestionSettings } from '../lib/question-kit';

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
      <div className="muted small">
        Keeps a browser&apos;s spell check, Grammarly and other writing tools from helping with the word. It switches off what a page is able to switch off, and looks for what it cannot. It does not stop everything: the keyboard on a phone or tablet, or your computer&apos;s own autocorrect and text suggestions, are outside the page and cannot be seen or turned off from it (on an iPhone or iPad the autocorrect setting is only a hint). A second device cannot be seen at all. A tool that puts nothing in the page cannot be seen either. Pair it with the word being marked on the server and only in the audio.
      </div>
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
          <div className="muted small">
            <strong>Exemption for assistive technology.</strong> Screen readers, magnifiers and switch devices are never looked for. If something a learner relies on looks like a writing tool, give them a code: they type it in the panel and are let through for the rest of their visit. Their result then says an exemption was used. The page holds only a scrambled form of the code, so share the code itself with that learner only. {g?.exempt ? 'A code is set.' : 'No code is set, so the panel has no code box.'}
          </div>
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
