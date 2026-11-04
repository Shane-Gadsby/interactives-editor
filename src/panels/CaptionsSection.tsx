import { createNode, cuesToSrt, cuesToVtt, parseCaptions, type CaptionSettings, type CaptionCue, type Project, type VideoNode } from 'interactives-player';
import { store } from '../store/store';
import { getArtboard } from '../store/doc';
import { CheckField, ColorField, NumberField, Row, Section, SelectField, TextField } from '../components/ui';
import { alertDialog } from '../components/dialogs';
import { ensureCaptionVariable } from '../lib/captions-edit';
import { download, fileSafe } from '../lib/export';
import { pickFiles } from '../lib/insert';

/** Edit the project's caption settings, dropping a key when it goes back to its default so the document stays small. */
export function patchCaptions(project: Project, patch: Partial<CaptionSettings>): CaptionSettings | undefined {
  const next: Record<string, unknown> = { ...project.settings.captions };
  const defaults: Record<string, unknown> = { defaultOn: true, display: 'region', position: 'bottom', controls: 'auto', controlsAt: 'top', transcript: true, fontSize: 22 };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === '' || defaults[k] === v) delete next[k];
    else next[k] = v;
  }
  return Object.keys(next).length ? (next as CaptionSettings) : undefined;
}

/**
 * Project settings for captions and narration: how the caption box looks, whether the project draws its own caption text
 * layer instead, and which buttons the viewer gets. The cues themselves are edited on the timeline.
 */
export function CaptionsSection({ project }: { project: Project }) {
  const c = project.settings.captions ?? {};
  const set = (patch: Partial<CaptionSettings>, coalesce?: string) =>
    store().update(
      (d) => {
        const next = patchCaptions(d as Project, patch);
        if (next) (d as Project).settings.captions = next;
        else delete (d as Project).settings.captions;
      },
      { coalesce },
    );
  const layerMode = c.display === 'layer';
  const hasMedia = project.artboards.some((a) => a.timelines.some((t) => t.audio?.length || t.captions?.length));
  /** A text layer that shows the caption text, on the artboard being edited (the variable is made when needed). */
  const makeLayer = () => {
    const st = store();
    const ab = getArtboard(st.get().project, st.get().activeArtboardId);
    if (!ab) return;
    let varName = '';
    st.update((d) => {
      varName = ensureCaptionVariable(d as Project).name;
      const s = (d as Project).settings.captions!;
      (d as Project).settings.captions = { ...s, display: 'layer' };
    });
    const w = Math.round(ab.width * 0.8);
    const node = createNode('text', { name: 'Caption', text: `{${varName}}`, width: w, x: Math.round((ab.width - w) / 2), y: Math.max(0, ab.height - 120), fontSize: 24, color: '#ffffff', align: 'center', autoSize: 'height' });
    st.addNodes([node], { artboardId: ab.id });
    st.toast(`Caption layer added. It shows {${varName}}, which the player keeps up to date; style it and move it as you like.`);
  };
  return (
    <Section help="captions" title="Captions and narration" defaultOpen={hasMedia}>
      <p className="hint">Sound and captions are put on a timeline (Timeline tab: Sound and Captions rows). These settings are for how they show.</p>
      <CheckField label="Captions on to start" title="Captions show until the viewer turns them off. Their choice is remembered in their browser" value={c.defaultOn !== false} onChange={(v) => set({ defaultOn: v })} />
      <SelectField<NonNullable<CaptionSettings['display']>>
        label="Shown in"
        title="The caption box the player draws, or a text layer of your own that the player keeps filled with the words"
        value={c.display ?? 'region'}
        options={[
          { value: 'region', label: 'The caption box' },
          { value: 'layer', label: 'A text layer of my own' },
        ]}
        onChange={(v) => set({ display: v })}
      />
      {layerMode ? (
        <>
          <SelectField
            label="Text variable"
            title="The variable that holds the words showing now (empty between captions). Put {name} in a text layer to show it"
            value={c.textVar ?? ''}
            options={[{ value: '', label: 'Choose a variable' }, ...project.variables.filter((v) => v.type === 'string').map((v) => ({ value: v.id, label: v.name }))]}
            onChange={(v) => set({ textVar: v })}
          />
          <button className="btn small-btn" title="Add a text layer to this artboard that shows the caption text" onClick={makeLayer}>
            Add a caption layer
          </button>
        </>
      ) : (
        <>
          <SelectField<'bottom' | 'top'> label="Position" value={c.position ?? 'bottom'} options={[{ value: 'bottom', label: 'Bottom' }, { value: 'top', label: 'Top' }]} onChange={(v) => set({ position: v })} />
          <NumberField label="Text size" title="In artboard pixels at the viewer's normal size; it scales with the player, and viewers can make it larger or smaller" value={c.fontSize ?? 22} min={8} max={120} suffix="px" onChange={(v) => set({ fontSize: Math.round(v) }, 'captions-size')} />
          <ColorField label="Text" value={c.color ?? '#ffffff'} onChange={(v) => set({ color: v === '#ffffff' ? undefined : v }, 'captions-color')} onCommit={() => store().commit()} />
          <ColorField label="Behind the text" title="A solid or translucent colour; pick one dark enough for the text, since captions sit over whatever is behind them" value={c.background ?? '#000000'} onChange={(v) => set({ background: v === '#000000' ? undefined : v }, 'captions-bg')} onCommit={() => store().commit()} />
          <TextField label="Font" title="A font family name; empty uses the page's default" value={c.fontFamily ?? ''} placeholder="system default" commitOnBlur onChange={(v) => set({ fontFamily: v.trim() || undefined })} />
        </>
      )}
      <SelectField<NonNullable<CaptionSettings['controls']>>
        label="Viewer buttons"
        title="Captions, text size, transcript, sound and play buttons the player adds when there is something to control. Hide them to build your own with the Captions and sound node"
        value={c.controls ?? 'auto'}
        options={[
          { value: 'auto', label: 'Shown' },
          { value: 'hidden', label: 'Hidden (I will build my own)' },
        ]}
        onChange={(v) => set({ controls: v })}
      />
      {c.controls !== 'hidden' && (
        <Row>
          <SelectField<'top' | 'bottom'> label="Buttons at" value={c.controlsAt ?? 'top'} options={[{ value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }]} onChange={(v) => set({ controlsAt: v })} />
          <CheckField label="Transcript" title="Offer a transcript panel that lists the captions and jumps the timeline when one is pressed" value={c.transcript !== false} onChange={(v) => set({ transcript: v })} />
        </Row>
      )}
    </Section>
  );
}

/** A video layer's own captions: import, export or clear them. They show through the video's caption display. */
export function VideoCaptions({ node, set }: { node: VideoNode; set: (patch: Partial<VideoNode>) => void }) {
  const cues = node.captions ?? [];
  const importFile = async () => {
    const files = await pickFiles('.vtt,.srt,text/vtt,application/x-subrip,text/plain', false);
    if (!files.length) return;
    const parsed = parseCaptions(await files[0].text());
    if (!parsed.cues.length) {
      await alertDialog({ title: 'No captions found', message: parsed.warnings.join(' ') || 'That file has no captions in it.' });
      return;
    }
    set({ captions: parsed.cues as CaptionCue[] });
    store().toast(`${parsed.cues.length} captions imported.${parsed.warnings.length ? ` ${parsed.warnings.join(' ')}` : ''}`);
  };
  return (
    <>
      <div className="field-label block">Captions</div>
      <p className="hint">{cues.length ? `${cues.length} caption${cues.length === 1 ? '' : 's'}, timed from the start of the video. The viewer's captions button turns them on and off.` : 'Import a WebVTT or SRT file made for this video. Without captions, the accessibility check asks you to confirm the video has them.'}</p>
      <Row>
        <button className="btn small-btn" onClick={importFile}>
          Import…
        </button>
        <button
          className="btn small-btn"
          disabled={!cues.length}
          onClick={() => download(new Blob([cuesToVtt(cues)], { type: 'text/vtt' }), `${fileSafe(node.name)}.vtt`)}
        >
          Export WebVTT
        </button>
        <button className="btn small-btn" disabled={!cues.length} onClick={() => download(new Blob([cuesToSrt(cues)], { type: 'application/x-subrip' }), `${fileSafe(node.name)}.srt`)}>
          Export SRT
        </button>
        <button className="btn small-btn" disabled={!cues.length} onClick={() => set({ captions: undefined })}>
          Clear
        </button>
      </Row>
      {cues.length > 0 && <TextField label="Language" title="A language tag such as en or fr" value={node.captionLang ?? ''} placeholder="en" commitOnBlur onChange={(v) => set({ captionLang: v.trim() || undefined })} />}
    </>
  );
}
