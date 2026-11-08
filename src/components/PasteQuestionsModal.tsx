import { useMemo, useRef, useState } from 'react';
import { track } from '../lib/analytics';
import { Modal } from './ProjectModals';
import { HelpLink } from '../help/Help';
import { MAX_IMPORT, addParsed } from '../lib/gift-import';
import { giftReportLines } from '../lib/gift';
import { fileQuestionText } from '../lib/office-text';
import { parsePastedQuestions } from '../lib/paste-questions';

const KIND_LABEL = { single: 'Multiple choice', multiple: 'Multiple answer', truefalse: 'True/False', blank: 'Fill in the blank', matching: 'Matching' } as const;

/** The templates the dialog and the help link to (public/templates, written by scripts/question-templates.mjs). */
export const QUESTION_TEMPLATES = [
  { file: 'templates/question-template.docx', label: 'Word template (.docx)' },
  { file: 'templates/question-template.xlsx', label: 'Excel template (.xlsx)' },
  { file: 'templates/question-template.csv', label: 'CSV template (.csv)' },
];

/**
 * Paste questions from Word, a spreadsheet or plain lines (or open a .docx, .xlsx or .csv): a live preview of the questions it
 * understood and the lines it did not, then add them as kit questions, one artboard each.
 */
export function PasteQuestionsModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const parse = useMemo(() => parsePastedQuestions(text), [text]);
  const report = useMemo(() => giftReportLines(parse), [parse]);
  const n = parse.questions.length;
  const add = () => {
    const made = addParsed(parse, fileName || 'the pasted text', 'paste');
    track('feature', 'question-paste', { thing: String(made) });
    if (made) onClose();
  };
  const open = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      setText(await fileQuestionText(file));
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That file could not be read.');
    }
  };
  return (
    <Modal title="Paste questions" help="paste-questions" onClose={onClose} className="paste-modal">
      <div className="paste-body">
        <p className="muted">
          Paste questions from Word or a spreadsheet, or lines like <code>Closest planet?</code> then a choice per line with a <code>*</code> after the right one. Nothing is added until you press Add.
        </p>
        <div className="paste-grid">
          <div className="paste-in">
            <label className="field-label" htmlFor="paste-questions-text">
              Your questions
            </label>
            <textarea
              id="paste-questions-text"
              value={text}
              autoFocus
              spellCheck={false}
              placeholder={'1. Which planet is closest to the Sun?\na) Venus\nb) Mercury *\nc) Earth\n\n2. The sky is blue.\nAnswer: True'}
              onChange={(e) => {
                setText(e.target.value);
                setFileName('');
              }}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <div className="paste-files">
              <input ref={input} type="file" accept=".docx,.xlsx,.csv,.tsv,.txt,text/plain" hidden onChange={(e) => void open(e.target.files?.[0]).then(() => (e.target.value = ''))} />
              <button className="btn" onClick={() => input.current?.click()} title="Open a filled in Word (.docx), Excel (.xlsx) or .csv template, or a text file">
                Open a file…
              </button>
              <span className="muted small">{fileName ? `Read ${fileName}` : '.docx, .xlsx, .csv or .txt'}</span>
            </div>
            {error && (
              <p className="paste-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="paste-out" aria-live="polite">
            <div className="field-label">Preview</div>
            {!text.trim() && <p className="muted">What it understands shows here as you type.</p>}
            {!!text.trim() && (
              <p className="paste-count">
                {n} question{n === 1 ? '' : 's'} understood
                {parse.skipped.length ? `, ${parse.skipped.length} not understood` : ''}
              </p>
            )}
            <ol className="paste-list">
              {parse.questions.map((q, i) => (
                <li key={i}>
                  <span className="paste-kind">{KIND_LABEL[q.kind]}</span>
                  <span className="paste-prompt">{q.prompt}</span>
                  {q.kind === 'matching' ? (
                    <ul>
                      {q.pairs.map((p, j) => (
                        <li key={j}>
                          {p.term} <span className="muted">goes with</span> {p.match}
                        </li>
                      ))}
                    </ul>
                  ) : q.kind === 'blank' ? (
                    <ul>
                      <li>
                        <span className="muted">Accepted:</span> {q.answers.join(' | ')}
                      </li>
                    </ul>
                  ) : (
                    <ul>
                      {q.options.map((o, j) => (
                        <li key={j} className={o.correct ? 'right' : ''}>
                          <span aria-hidden="true">{o.correct ? '✓ ' : ''}</span>
                          {o.text}
                          {o.correct && <span className="sr-only"> (right answer)</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
            {!!parse.skipped.length && (
              <div className="paste-skipped">
                <strong>Not understood</strong>
                <ul>
                  {parse.skipped.map((s, i) => (
                    <li key={i}>
                      <span className="muted">{s.title ? s.title : `Line ${s.line}`}:</span> “{s.excerpt}” {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.length > parse.skipped.length && (
              <div className="paste-skipped">
                <strong>Changed on the way in</strong>
                <ul>
                  {report.slice(parse.skipped.length).map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
            {n > MAX_IMPORT && <p className="muted">Only the first {MAX_IMPORT} are added.</p>}
          </div>
        </div>
        <div className="paste-templates">
          <span className="muted">Not sure how to lay it out? Fill in a template with a worked example of each kind:</span>
          {QUESTION_TEMPLATES.map((t) => (
            <a key={t.file} href={t.file} download className="btn">
              {t.label}
            </a>
          ))}
          <HelpLink topic="paste-questions" />
        </div>
        <div className="paste-actions">
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!n} onClick={add} title={n ? 'Add each question on its own artboard' : 'Nothing understood yet'}>
            {n ? `Add ${Math.min(n, MAX_IMPORT)} question${n === 1 ? '' : 's'}` : 'Add questions'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export const openPasteQuestions = () => window.dispatchEvent(new CustomEvent('ix-paste-questions'));
