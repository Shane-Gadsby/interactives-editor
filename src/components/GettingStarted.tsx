import { useEffect, useRef, useState } from 'react';
import { HelpLink, openHelp } from '../help/Help';
import { GETTING_STARTED_HELP } from '../help/context';
import { JOBS, dismissStrip, jobDone, jobsDone, stripShown } from '../lib/onboarding';
import { usePrefs } from '../lib/prefs';
import { store } from '../store/store';
import { Icons } from './icons';

/**
 * The small strip under the top bar for someone starting out: five jobs that tick themselves as they are done (lib/onboarding.ts
 * watches for them), each opening its two-minute tutorial. Put away with the x or in Preferences, and gone for good once all
 * five are ticked.
 */
export function GettingStarted() {
  const p = usePrefs();
  const done = jobsDone();
  const seen = useRef(new Set(JOBS.filter((j) => jobDone(j.id)).map((j) => j.id)));
  const [said, setSaid] = useState('');
  // The last job ticked is the strip's goodbye: it does not come back, so say so once
  useEffect(() => {
    const now = new Set(JOBS.filter((j) => jobDone(j.id)).map((j) => j.id));
    const added = JOBS.filter((j) => now.has(j.id) && !seen.current.has(j.id));
    seen.current = now;
    if (!added.length) return;
    setSaid(`${added[added.length - 1].label}: done. ${done} of ${JOBS.length}.`);
    if (done === JOBS.length) store().toast('All five jobs done. The Getting started strip will not come back (Preferences can bring it back).');
  }, [done, p.onboarding]);
  if (!stripShown(p)) return null;
  return (
    <section className="getting-started" aria-label="Getting started">
      <strong className="gs-title">Getting started</strong>
      <span className="muted small gs-count">
        {done} of {JOBS.length}
      </span>
      <ol className="gs-jobs">
        {JOBS.map((j) => {
          const ticked = jobDone(j.id);
          return (
            <li key={j.id} className={ticked ? 'done' : ''}>
              <button type="button" className="gs-job" title={`${j.hint}. Opens its two-minute tutorial`} aria-label={`${j.label}${ticked ? ', done' : ''}. Opens its tutorial`} onClick={() => openHelp(j.tutorial)}>
                <span className="gs-tick" aria-hidden="true">
                  {ticked && <Icons.check width={11} height={11} />}
                </span>
                {j.label}
              </button>
            </li>
          );
        })}
      </ol>
      <span className="spacer" />
      <HelpLink topic="welcome" anchor={GETTING_STARTED_HELP.to.split('#')[1]} />
      <button type="button" className="icon-btn" aria-label="Put the Getting started strip away" title="Put this away. Preferences brings it back" onClick={dismissStrip}>
        <Icons.close width={14} height={14} />
      </button>
      <span className="sr-only" role="status">
        {said}
      </span>
    </section>
  );
}
