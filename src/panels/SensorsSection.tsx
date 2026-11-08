import { consentText, declaresSensors, recordingCap, usesLine, type Project, type SensorSettings } from 'interactives-player';
import { store } from '../store/store';
import { CheckField, NumberField, Row, Section, TextField } from '../components/ui';

/** Edit the project's declared sensors, dropping a key when it goes back to its default so the document stays small. */
export function patchSensors(project: Project, patch: Partial<SensorSettings>): SensorSettings | undefined {
  const next: Record<string, unknown> = { ...project.settings.sensors };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === false || v === '' || v === 0) delete next[k];
    else next[k] = v;
  }
  return Object.keys(next).length ? (next as SensorSettings) : undefined;
}

/**
 * Project settings for the microphone, camera and photo picker: what the project uses, which is all the page around it will let
 * it ask for, and the one consent screen learners get, shown here as they will see it.
 */
export function SensorsSection({ project }: { project: Project }) {
  const s = project.settings.sensors ?? {};
  const used = declaresSensors(s);
  const set = (patch: Partial<SensorSettings>, coalesce?: string) =>
    store().update(
      (d) => {
        const next = patchSensors(d as Project, patch);
        if (next) (d as Project).settings.sensors = next;
        else delete (d as Project).settings.sensors;
      },
      { coalesce },
    );
  const text = used ? consentText(s) : null;
  return (
    <Section help="sensors" title="Microphone and camera" defaultOpen={used}>
      <p className="hint">Tick what this project uses. The page it plays in only lets it ask for these, and builds the screen that asks the learner from your choices. Update the share link after changing them.</p>
      <CheckField label="Microphone" title="Record sound, play it back, and read the level (Start recording, Play recording, micLevel)" value={!!s.microphone} onChange={(v) => set(v ? { microphone: true } : { microphone: false, listen: false, listenOnly: false })} />
      {s.microphone && (
        <>
          <CheckField label="Live listening" title="Let the microphone drive numbers while it listens: micLevel and micBands (Listen live). Nothing is recorded by it" value={!!s.listen || !!s.listenOnly} onChange={(v) => set(v ? { listen: true } : { listen: false, listenOnly: false })} />
          {(s.listen || s.listenOnly) && <CheckField label="Only ever listen, never record" title="This project never records with the microphone: the page refuses every Start recording, and the learner is told it only listens" value={!!s.listenOnly} onChange={(v) => set({ listenOnly: v })} />}
        </>
      )}
      <CheckField label="Camera" title="Show a live preview in a layer's place, take a still from it, or record video (Camera preview, Start recording)" value={!!s.camera} onChange={(v) => set({ camera: v })} />
      <CheckField label="Photos" title="Let the learner choose a photo, or take one with their device's camera app (Take or choose a photo)" value={!!s.photos} onChange={(v) => set({ photos: v })} />
      {used && (
        <>
          <TextField
            label="What it is used for"
            title="Finishes the sentence 'It is used to ...' on the screen that asks the learner. One plain sentence."
            value={s.purpose ?? ''}
            placeholder="record your answer to the speaking question"
            commitOnBlur
            onChange={(v) => set({ purpose: v }, 'sensors-purpose')}
          />
          {((s.microphone && !s.listenOnly) || s.camera) && (
            <NumberField
              label="Longest recording (seconds)"
              title="A recording stops by itself after this long. 0 uses the default: 120 seconds for sound and 60 for video. Never more than 600 for sound and 180 for video"
              value={s.maxSeconds ?? 0}
              min={0}
              max={600}
              suffix={s.maxSeconds ? undefined : `now ${recordingCap(s, false)} s`}
              onChange={(v) => set({ maxSeconds: v }, 'sensors-seconds')}
            />
          )}
          <TextField
            label="No equal way to finish"
            title="Only when there is no way to finish this without the microphone or camera (a speaking assessment, say). Say why, in a sentence. The learner is told, and the accessibility check stops asking for an alternative."
            value={s.noAlternative ?? ''}
            placeholder="leave empty if there is another way"
            multiline
            rows={2}
            commitOnBlur
            onChange={(v) => set({ noAlternative: v }, 'sensors-why')}
          />
          <p className="hint">
            <strong>{usesLine(s)}</strong> Learners can choose "Do not use my microphone or camera" once, and every activity then shows its plain version, so build that version: read <code>microphone</code> and <code>camera</code> (unavailable, denied, ready, off) in a condition or binding and show a typing or button way to finish.
          </p>
          <div className="consent-preview" aria-label="What learners are asked">
            <div className="field-label block">What learners are asked</div>
            <p>
              <strong>{text!.title}</strong>
            </p>
            {text!.purpose && <p>{text!.purpose}</p>}
            <ul>
              {text!.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p>{text!.alternative}</p>
            <p className="muted small">
              Buttons: {text!.continue} · {text!.later} · {text!.never}
            </p>
          </div>
        </>
      )}
      <Row k="Check accessibility" words={['accessibility checker', 'another way to finish', 'alternative']}>
        <button className="btn" onClick={() => store().set({ bottomTab: 'a11y' })} title="Open the Accessibility tab: a project that uses a sensor must have another way to finish, and the checker looks for it">
          Check accessibility
        </button>
      </Row>
    </Section>
  );
}
