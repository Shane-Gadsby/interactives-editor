import { useEffect, useRef, useState } from 'react';
import { track } from '../lib/analytics';
import { COLOURWAYS } from '../lib/branded';
import { leaveWelcome, markWelcomed } from '../lib/onboarding';
import { FIRST_RUN, goalInfo, type Goal } from '../lib/starter-goals';
import { pickForKey, type StarterPick } from '../lib/starter-pick';
import { noteIfStale } from '../lib/stale-build';
import { BrandedPicture } from './BrandedPacks';
import { PlayModal, StarterPicture, makeFromPick } from './TemplatesTab';

/** The goals the first screen offers, in the author's words (Media is a goal of the Templates tab's chips, not of this screen). */
const OFFERED: Goal[] = ['quiz', 'explain', 'practise', 'story'];

const Picture = ({ pick }: { pick: StarterPick }) => (pick.kind === 'branded' ? <BrandedPicture starter={pick.s} way={pick.way} /> : <StarterPicture starter={pick.s} />);

/**
 * What a new person sees on an empty projects page: what they want to make, in a few plain goals, each leading to one suggested
 * starter (with a couple of others and Play to look first) or to a blank project. Nothing is made until they say so. Leaving it
 * (Start from nothing, I'll look around, or making something) means the ordinary empty page from then on.
 */
export function FirstRun({ folder, onBlank, onMade, onBrowse }: { folder: string | null; onBlank: () => Promise<void>; onMade: (id: string) => void; onBrowse: () => void }) {
  const [goal, setGoal] = useState<Goal | null>(null);
  // the suggestion on show: the goal's first starter, or one of its other two
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => markWelcomed(), []);
  // a new stage starts at its heading, for a screen reader and for the keyboard
  useEffect(() => heading.current?.focus(), [goal]);

  const picks = goal ? FIRST_RUN[goal].map((k) => pickForKey(k, COLOURWAYS[0])).filter((p): p is StarterPick => !!p) : [];
  const pick = picks[at] ?? null;

  const guard = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (!noteIfStale(e)) setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  const blank = () =>
    guard(async () => {
      track('feature', 'first-run', { thing: 'blank' });
      leaveWelcome();
      await onBlank();
    });
  const use = () =>
    guard(async () => {
      if (!pick) return;
      track('feature', 'first-run', { thing: goal ?? 'goal' });
      leaveWelcome();
      onMade(await makeFromPick(pick, { name: pick.s.name, folder }));
    });

  if (!goal || !pick) {
    return (
      <section className="first-run" aria-labelledby="fr-title">
        <h2 id="fr-title" ref={heading} tabIndex={-1}>
          What do you want to make?
        </h2>
        <p className="muted">Pick the closest one. You get a project to change rather than an empty page, and you can always start somewhere else.</p>
        <div className="fr-goals">
          {OFFERED.map((g) => {
            const info = goalInfo(g);
            return (
              <button key={g} type="button" className="fr-goal" onClick={() => (setAt(0), setGoal(g))}>
                <strong>{info.want}</strong>
                <span>{info.about}</span>
              </button>
            );
          })}
          <button type="button" className="fr-goal fr-blank" disabled={busy} onClick={() => void blank()}>
            <strong>Start from nothing</strong>
            <span>One empty page to draw on.</span>
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p>
          <button type="button" className="link-btn" onClick={leaveWelcome}>
            I'll look around by myself
          </button>
        </p>
      </section>
    );
  }
  const others = picks.map((p, i) => ({ p, i })).filter(({ i }) => i !== at);
  return (
    <section className="first-run suggest" aria-labelledby="fr-title">
      <p className="muted small fr-back">
        <button type="button" className="link-btn" onClick={() => setGoal(null)}>
          Back
        </button>{' '}
        · {goalInfo(goal).want}
      </p>
      <h2 id="fr-title" ref={heading} tabIndex={-1}>
        {at === 0 ? 'A good place to start: ' : 'Or try: '}
        {pick.s.name}
      </h2>
      <div className="fr-suggest">
        <div className="fr-picture" aria-hidden="true">
          <Picture pick={pick} />
        </div>
        <div className="fr-about">
          <p>{pick.s.description}</p>
          <p className="muted small">It opens with a checklist of the parts to change, so none of its sample wording reaches your learners. Everything in it is yours to edit.</p>
          <div className="fr-actions">
            <button type="button" className="btn primary" disabled={busy} onClick={() => void use()}>
              {busy ? 'Making your project…' : `Start with ${pick.s.name}`}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setPlaying(true)} title="Play it to see how it works. Nothing is saved">
              Try it first
            </button>
          </div>
          {others.length > 0 && (
            <p className="small">
              Other ways to start:{' '}
              {others.map(({ p, i }, n) => (
                <span key={p.s.key}>
                  {n > 0 && ', '}
                  <button type="button" className="link-btn" onClick={() => setAt(i)}>
                    {p.s.name}
                  </button>
                </span>
              ))}
              .
            </p>
          )}
          <p className="small">
            <button type="button" className="link-btn" onClick={() => (leaveWelcome(), onBrowse())}>
              See all the starters
            </button>{' '}
            ·{' '}
            <button type="button" className="link-btn" disabled={busy} onClick={() => void blank()}>
              Start from nothing
            </button>
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
      {playing && <PlayModal playing={{ kind: 'starter', pick }} onClose={() => setPlaying(false)} onUse={() => (setPlaying(false), void use())} />}
    </section>
  );
}
