import type { Project, ReadAloudSettings } from 'interactives-player';
import { PropRow } from '../lib/prop-search';
import { store } from '../store/store';
import { CheckField, Row, Section, SelectField, TextField } from '../components/ui';
import { addListenButton } from '../lib/listen-button';

/** Edit the project's read-aloud settings, dropping a key when it goes back to its default so the document stays small. */
export function patchReadAloud(project: Project, patch: Partial<ReadAloudSettings>): ReadAloudSettings | undefined {
  const next: Record<string, unknown> = { ...project.settings.readAloud };
  const defaults: Record<string, unknown> = { offer: false, at: 'bottom' };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === '' || defaults[k] === v) delete next[k];
    else next[k] = v;
  }
  return Object.keys(next).length ? (next as ReadAloudSettings) : undefined;
}

/**
 * Project settings for read-aloud: the standard Listen button on every artboard, and the language it reads in. The Read aloud
 * node and the Listen button layer are the do-it-yourself way; this is the one that needs no wiring.
 */
export function ReadAloudSection({ project }: { project: Project }) {
  const r = project.settings.readAloud ?? {};
  const set = (patch: Partial<ReadAloudSettings>, coalesce?: string) =>
    store().update(
      (d) => {
        const next = patchReadAloud(d as Project, patch);
        if (next) (d as Project).settings.readAloud = next;
        else delete (d as Project).settings.readAloud;
      },
      { coalesce },
    );
  const addLayer = () => {
    const st = store();
    const ab = st.artboard();
    if (!ab) return;
    let id: string | null = null;
    st.update((d) => void (id = addListenButton(d as Project, ab.id)));
    if (id) {
      st.select([id], { artboardId: ab.id });
      st.toast('Listen button added. Move and style it like any layer; its click runs a Read aloud node you can see in the Interactions tab.');
    }
  };
  return (
    <Section help="read-aloud" title="Read aloud" defaultOpen={!!r.offer}>
      <CheckField
        label="Offer read-aloud"
        title="Puts one Listen button, a pause and a speed choice in the same place on every artboard. It reads the artboard's text with a voice installed on the learner's own device (nothing is recorded or sent anywhere), and never starts by itself. With no voice for the language it is left out and a line says why"
        value={!!r.offer}
        onChange={(v) => set({ offer: v })}
      />
      {r.offer && (
        <>
          <Row>
            <TextField
              label="Language"
              title="The language of the project's text, as a code such as en or fr-CA. Only a voice for this language is used, because another language's voice reads the words with the wrong sounds. Empty: the device's own voice"
              value={r.lang ?? ''}
              placeholder="Device language"
              commitOnBlur
              onChange={(v) => set({ lang: v.trim() || undefined })}
            />
            <SelectField<'top' | 'bottom'> label="Button at" value={r.at ?? 'bottom'} options={[{ value: 'bottom', label: 'Bottom left' }, { value: 'top', label: 'Top left' }]} onChange={(v) => set({ at: v })} />
          </Row>
          <p className="hint">It reads the text layers that show, in layer order. Give a layer “Say it like” text (Accessibility section) for a word a voice gets wrong.</p>
        </>
      )}
      <p className="hint">Prefer your own button? Add a Listen button layer to this artboard, or use the Read aloud node in the Interactions tab.</p>
      <PropRow k="Add a Listen button" words={['read aloud', 'speech', 'text to speech', 'audio']}>
      <button className="btn" onClick={addLayer} title="Adds a Listen button layer to the open artboard, wired to read the artboard aloud">
        Add a Listen button to this artboard
      </button>
      </PropRow>
    </Section>
  );
}
