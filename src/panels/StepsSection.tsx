import { stepList, walk, type Artboard, type Project, type StepsConfig, type TimelineMarker } from 'interactives-player';
import { store } from '../store/store';
import { getArtboard } from '../store/doc';
import { CheckField, IconButton, Row, Section, SelectField, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { addScrollColumn, addStepBar, addStepsExample, enableSteps } from '../lib/steps';

/** Edit a step-through setting, dropping the key when it goes back to its default so the document stays small. */
export function patchSteps(cfg: StepsConfig, patch: Partial<StepsConfig>): StepsConfig {
  const next: Record<string, unknown> = { ...cfg };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === '' || (k === 'jump' && v === 'pose') || ((k === 'keys' || k === 'announce') && v === true)) delete next[k];
    else next[k] = v;
  }
  return next as unknown as StepsConfig;
}

/** Change one marker of a timeline (by artboard, timeline and marker id). `step: true` is the default, so it is stored only when false. */
export function setMarker(abId: string, tlId: string, markerId: string, patch: Partial<Pick<TimelineMarker, 'title' | 'caption' | 'step'>>, coalesce?: string): void {
  store().update(
    (d) => {
      const m = getArtboard(d as Project, abId)?.timelines.find((t) => t.id === tlId)?.markers?.find((x) => x.id === markerId);
      if (!m) return;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '' || (k === 'step' && v === true)) delete (m as unknown as Record<string, unknown>)[k];
        else (m as unknown as Record<string, unknown>)[k] = v;
      }
    },
    { coalesce },
  );
}

/** A marker's step fields: its title (the name when empty), its caption, and whether it is a step at all. */
export function MarkerStepFields({ abId, tlId, marker }: { abId: string; tlId: string; marker: TimelineMarker }) {
  const set = (patch: Parameters<typeof setMarker>[3], coalesce?: string) => setMarker(abId, tlId, marker.id, patch, coalesce);
  return (
    <>
      <CheckField label="Is a step" title="Untick to keep this marker out of the steps (it still runs On timeline marker)" value={marker.step !== false} onChange={(v) => set({ step: v })} />
      {marker.step !== false && (
        <>
          <TextField label="Title" title="The step's title, shown in the step bar and read out when the step comes up. Empty uses the marker's name" value={marker.title ?? ''} placeholder={marker.name} commitOnBlur onChange={(v) => set({ title: v })} />
          <TextField label="Caption" title="A sentence or two about this step, shown in the step bar and read out after the title" value={marker.caption ?? ''} multiline rows={3} commitOnBlur onChange={(v) => set({ caption: v })} />
        </>
      )}
    </>
  );
}

/**
 * The artboard's Steps: the markers of a timeline as the steps of a "watch, then click Next" explainer. Off until it is turned on;
 * then the timeline, how jumping treats changes interactions made, the keys, announcements, scroll to scrub, and the step bar.
 */
export function StepsSection({ ab, project }: { ab: Artboard; project: Project }) {
  const cfg = ab.steps;
  const setAb = (fn: (a: Artboard, p: Project) => void, coalesce?: string) =>
    store().update(
      (d) => {
        const a = getArtboard(d as Project, ab.id);
        if (a) fn(a as Artboard, d as Project);
      },
      { coalesce },
    );
  const patch = (p: Partial<StepsConfig>) => setAb((a) => void (a.steps && (a.steps = patchSteps(a.steps, p))));
  const tl = cfg ? ab.timelines.find((t) => t.id === cfg.timeline) : undefined;
  const list = stepList(tl);
  const scrollers: { value: string; label: string }[] = [{ value: '', label: 'No: the steps play' }];
  walk(ab.children, (n) => void (n.type === 'frame' && n.scroll && n.scroll !== 'none' && scrollers.push({ value: n.id, label: n.name })));
  const barHere = !!cfg?.bar && ab.children.some((n) => n.id === cfg.bar);
  const varName = (id?: string) => project.variables.find((v) => v.id === id)?.name ?? '?';

  if (!cfg) {
    return (
      <Section help="steps" title="Steps" defaultOpen={false}>
        <p className="hint">Turn the markers of a timeline into the steps of an explainer: Next plays to the next marker, Back plays back, and a step bar does the clicking.</p>
        <Row k="Turn on Steps" words={['explainer', 'markers', 'build an example', 'slides', 'next previous']}>
          <button className="btn" data-track="steps-enable" title="Use a timeline's markers as steps. Adds a marker at the start and the step variables" onClick={() => setAb((a, p) => void enableSteps(p, a, store().get().activeTimelineId ?? undefined))}>
            Turn on Steps
          </button>
          <button className="btn" data-track="steps-example" title="Add a small working explainer to this artboard: a ball, a timeline with four markers and a step bar. Preview it and click Next" onClick={() => setAb((a, p) => addStepsExample(p, a))}>
            Build an example to try
          </button>
        </Row>
      </Section>
    );
  }
  return (
    <Section
      help="steps"
      title="Steps"
      actions={<IconButton icon={<Icons.trash />} title="Turn off Steps. The timeline, markers, step variables and any step bar stay" onClick={() => setAb((a) => void delete a.steps)} />}
    >
      <SelectField
        label="Timeline"
        title="The timeline whose markers are the steps. It does not autoplay: the steps play it"
        value={cfg.timeline}
        options={ab.timelines.length ? ab.timelines.map((t) => ({ value: t.id, label: t.name })) : [{ value: cfg.timeline, label: 'No timeline' }]}
        onChange={(v) => setAb((a, p) => void enableSteps(p, a, v))}
      />
      {!list.length && <p className="hint">{tl ? 'This timeline has no markers. Add markers at the playhead with + Marker in the timeline: each one is a step.' : 'The timeline is gone. Pick another.'}</p>}
      {list.length > 0 && (
        <ol className="steps-list" aria-label="Steps">
          {list.map((st) => (
            <li key={st.id}>
              <span className="steps-n">{st.n}</span>
              <TextField
                title={`Step ${st.n} at ${Math.round(st.time)} ms. Its title; empty uses the marker's name. Captions are in the timeline, on the marker`}
                value={tl!.markers!.find((m) => m.id === st.id)?.title ?? ''}
                placeholder={tl!.markers!.find((m) => m.id === st.id)?.name || st.title}
                commitOnBlur
                onChange={(v) => setMarker(ab.id, tl!.id, st.id, { title: v })}
              />
              <span className="muted small mono">{(st.time / 1000).toFixed(1)}s</span>
            </li>
          ))}
        </ol>
      )}
      <SelectField
        label="Back and jumps"
        title="What going back or jumping to a step does about changes your interactions made. Pose only: just the timeline's pose is shown and everything else stays as it is. Reset, then pose: every layer first goes back to how you authored it. Next never resets"
        value={cfg.jump ?? 'pose'}
        options={[
          { value: 'pose', label: 'Pose only' },
          { value: 'reset', label: 'Reset, then pose' },
        ]}
        onChange={(v) => patch({ jump: v })}
      />
      <CheckField label="Arrow keys step" title="Left and Right arrow keys go back and forward while focus is in the player (or the player is alone in its frame)" value={cfg.keys !== false} onChange={(v) => patch({ keys: v })} />
      <CheckField label="Announce each step" title="Say “Step 3 of 7: title. caption” to screen readers when a step comes up. Needs the accessibility preference on" value={cfg.announce !== false} onChange={(v) => patch({ announce: v })} />
      <SelectField
        label="Scroll to scrub"
        title="A frame with scrolling content: its scroll position moves the timeline between the steps, and Next and Back scroll it. Make a frame scroll in its Frame section"
        value={cfg.scrub && scrollers.some((s) => s.value === cfg.scrub) ? cfg.scrub : ''}
        options={scrollers}
        onChange={(v) => patch({ scrub: v })}
      />
      <Row k="Add a scroll column" words={['scroll', 'scrolling', 'tall frame']}>
        <button className="btn" data-track="steps-scroll-column" title="Add a tall frame at the right to scroll. It becomes the scrub frame; restyle it, and put your own words in it" onClick={() => setAb((a, p) => void addScrollColumn(a, p))}>
          Add a scroll column
        </button>
      </Row>
      <p className="hint">
        Variables kept up to date: <span className="mono">{varName(cfg.stepVar)}</span> (the step number, from 1), <span className="mono">{varName(cfg.countVar)}</span>, <span className="mono">{varName(cfg.titleVar)}</span>, <span className="mono">{varName(cfg.captionVar)}</span>. Tick Remember on the step variable to bring learners back to where they were. A frame repeating <span className="mono">steps</span> draws a dot per step.
      </p>
      <Row k="Add a step bar" words={['progress', 'select the bar', 'dots']}>
        <button className="btn" data-track="steps-bar" title="Add a step bar to this artboard: Back, Next, a dot per step, the counter, title and caption. It is made once as ordinary layers and nodes, so restyle it freely" onClick={() => setAb((a, p) => void addStepBar(p, a))}>
          {barHere ? 'Add another step bar' : 'Add a step bar'}
        </button>
        {barHere && (
          <button className="btn" title="Select the step bar's layer" onClick={() => store().select([cfg.bar!])}>
            Select the bar
          </button>
        )}
      </Row>
    </Section>
  );
}
