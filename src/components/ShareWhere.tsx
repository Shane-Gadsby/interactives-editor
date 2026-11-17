import { useState } from 'react';
import type { ShareInfo } from '../lib/db';
import { learnerUrl, shareUrl } from '../lib/db';
import { embedAspect, embedCode } from '../lib/embed';
import { requestAppAction } from '../lib/app-actions';
import { store } from '../store/store';
import { track } from '../lib/analytics';

export type Where = 'studydesk' | 'studydesk-plain' | 'gradebook' | 'link' | 'file';

export const WHERES: { id: Where; label: string; hint: string }[] = [
  { id: 'studydesk', label: 'In a StudyDesk page, and keep learners’ results', hint: 'Scores and progress are kept for each signed-in learner' },
  { id: 'studydesk-plain', label: 'In a StudyDesk page, no results needed', hint: 'Plays in the page, and nothing is kept' },
  { id: 'gradebook', label: 'In the StudyDesk gradebook, with a mark', hint: 'Added to a course as an activity that sends a grade' },
  { id: 'link', label: 'Anyone with a link', hint: 'For an email, a message or a website' },
  { id: 'file', label: 'As a file to download', hint: 'To send on, keep, or put on another site' },
];

/**
 * The first line of the Export menu: Export only makes files, so someone who wanted a link or something to paste into a
 * StudyDesk page is sent to Share, whose first question is "Where will people use it?".
 */
export function ExportShareHint({ onShare }: { onShare: () => void }) {
  return (
    <button type="button" className="menu-share-hint" onClick={onShare} title="Share asks where people will use it, then gives you the link or code to copy">
      Want a link instead of a file?
      <span className="muted small">Share… asks where people will use it and gives you the link or code to copy</span>
    </button>
  );
}

const KEY = (projectId: string) => `ix-share-where:${projectId}`;

export function rememberedWhere(projectId: string): Where {
  try {
    const v = localStorage.getItem(KEY(projectId));
    if (WHERES.some((w) => w.id === v)) return v as Where;
  } catch {
    /* storage unavailable: the first choice */
  }
  return 'studydesk';
}

const when = (iso: string) => new Date(iso).toLocaleString();

/** Does the project use the learner's microphone, camera or photos? Those only work through the results link. */
export const usesDevice = (share: ShareInfo | null | undefined): boolean => !!share?.sensors && !!(share.sensors.microphone || share.sensors.camera || share.sensors.photos);

function CopyBox({ text, label, rows, onCopied }: { text: string; label: string; rows?: number; onCopied?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="share-copy">
      {rows ? <textarea className="embed-text" readOnly rows={rows} value={text} aria-label={label} onFocus={(e) => e.target.select()} /> : <input readOnly value={text} aria-label={label} onFocus={(e) => e.target.select()} />}
      <button
        className="btn primary"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
            onCopied?.();
          });
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

/**
 * The front door of Share: "Where will people use it?", then the one thing to copy for that and what to do with it. The links
 * themselves are unchanged (the share link, the Link for StudyDesk, the embed code); this only says which one to use.
 */
export function ShareWhere({ projectId, share, busy, publish, embedId, marked }: { projectId: string; share: ShareInfo | null | undefined; busy: string | null; publish: () => void; embedId: number; marked: number }) {
  const [where, setWhere] = useState<Where>(() => rememberedWhere(projectId));
  const choose = (w: Where) => {
    setWhere(w);
    track('feature', 'share-where', { thing: w });
    try {
      localStorage.setItem(KEY(projectId), w);
    } catch {
      /* storage unavailable: it lasts until the dialog closes */
    }
  };
  const project = store().get().project;
  const device = usesDevice(share);
  const needsLink = where !== 'file';
  const iframe = (url: string) => embedCode({ url, title: project.name, sensors: share?.sensors, aspect: embedAspect(project), cdtID: embedId });
  const deviceNames = share?.sensors ? [share.sensors.microphone && 'microphone', share.sensors.camera && 'camera', share.sensors.photos && 'photos'].filter(Boolean).join(', ') : '';
  const ready = !!share && needsLink;
  return (
    <section className="share-where" aria-labelledby="share-where-title">
      <h3 id="share-where-title">Where will people use it?</h3>
      <div className="share-choices" role="radiogroup" aria-labelledby="share-where-title">
        {WHERES.map((w) => (
          <label key={w.id} className={`share-choice${where === w.id ? ' on' : ''}`}>
            <input type="radio" name="share-where" value={w.id} checked={where === w.id} onChange={() => choose(w.id)} />
            <span>
              <strong>{w.label}</strong>
              <span className="muted small block">{w.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="share-thing" aria-live="polite">
        {needsLink && share === undefined && <p className="muted">Checking…</p>}
        {needsLink && share === null && (
          <>
            <p>To use it here, make the link first. It is a snapshot of the project as it is now, and you can update it whenever you like. Anyone with the link can play it, and you can turn it off at any time.</p>
            <button className="btn primary" disabled={!!busy} onClick={publish}>
              {busy ?? 'Create the link'}
            </button>
          </>
        )}
        {ready && where === 'studydesk' && (
          <>
            <p>
              <strong>Copy this code.</strong> Then in StudyDesk:
            </p>
            <ol className="share-steps">
              <li>Edit the page and open its <strong>Source code</strong> (the <code>&lt;&gt;</code> button).</li>
              <li>Paste the code where the activity should go, and save the page.</li>
            </ol>
            <CopyBox text={iframe(learnerUrl(share.token))} label="Embed code" rows={4} onCopied={() => track('feature', 'share-embed-copy')} />
            {device && <p className="small muted">This project uses the {deviceNames}. The code already lets the page use it, so there is nothing to add.</p>}
          </>
        )}
        {ready && where === 'studydesk-plain' && (
          <>
            {device ? (
              <p className="share-warn" role="alert">
                This project uses the {deviceNames}, and that only works with results kept. Choose <strong>In a StudyDesk page, and keep learners’ results</strong> above instead.
              </p>
            ) : (
              <>
                <p>
                  <strong>Copy this code.</strong> Then in StudyDesk:
                </p>
                <ol className="share-steps">
                  <li>Edit the page and open its <strong>Source code</strong> (the <code>&lt;&gt;</code> button).</li>
                  <li>Paste the code where the activity should go, and save the page.</li>
                </ol>
                <CopyBox text={iframe(shareUrl(share.token))} label="Embed code" rows={4} onCopied={() => track('feature', 'share-embed-copy', { detail: { results: false } })} />
                <p className="small muted">Nothing is kept for learners with this one. Choose the first option above if you later want scores or progress.</p>
              </>
            )}
          </>
        )}
        {ready && where === 'gradebook' && (
          <>
            <p>
              <strong>Add it to the course as an activity with a grade.</strong> In StudyDesk:
            </p>
            <ol className="share-steps">
              <li>In the course, add an activity from <strong>Select content</strong> (or an external tool) and pick the project below.</li>
              <li>Give the activity a grade, so there is a place in the gradebook for the mark.</li>
            </ol>
            <CopyBox text={project.name} label="Project name to pick" />
            {marked === 0 ? (
              <p className="share-warn" role="alert">
                None of the questions is set to <strong>Mark answers on the server</strong>, so no mark will be sent. Turn it on for the questions that count, then press Update below.
              </p>
            ) : (
              <p className="small muted">
                {marked === 1 ? '1 question marks' : `${marked} questions mark`} its answers on the server, and the score is sent to the gradebook when a learner finishes.
              </p>
            )}
          </>
        )}
        {ready && where === 'link' && (
          <>
            <p>
              <strong>Copy this link</strong> and send it, or put it on a page. Anyone with it can play the project (not change it).
            </p>
            <div className="share-copy">
              <CopyBox text={shareUrl(share.token)} label="Share link" />
              <a className="btn" href={shareUrl(share.token)} target="_blank" rel="noreferrer">
                Open
              </a>
            </div>
          </>
        )}
        {where === 'file' && (
          <>
            <p>Download the whole project as one file that plays in any browser, with the player and every picture and sound inside it.</p>
            <div className="row">
              <button className="btn primary" onClick={() => requestAppAction('export-html-now')}>
                Download the single HTML file
              </button>
              <button className="btn" onClick={() => requestAppAction('export-package-now')} title="The whole project, so it can be opened and edited again">
                Download a project package
              </button>
            </div>
            <p className="small muted">A downloaded file does not keep learners’ results. Video, GIF, picture and the other formats are in the Export menu.</p>
          </>
        )}
        {ready && (
          <p className="small muted share-fresh">
            Last updated {share ? when(share.updated) : ''}.{' '}
            <button className="link-btn inline" disabled={!!busy} onClick={publish} title="Publish the project as it is now to the same link. Pages that use it show the new version without changing anything">
              {busy ?? 'Update to the latest version'}
            </button>
          </p>
        )}
      </div>
    </section>
  );
}
