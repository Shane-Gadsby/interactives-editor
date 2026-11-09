import { uid, type VideoChapter, type VideoCue, type VideoNode } from 'interactives-player';
import { CheckField, NumberField, Row, TextField } from '../components/ui';
import { SectionBlurb } from '../components/SectionBlurb';

/**
 * A video layer's cue points and chapters. Cues fire the On video cue event while the video plays across them (and can
 * pause it there); chapters go to the video's own controls where the browser lists them. Times are seconds from the start.
 */
export function VideoCues({ node, set }: { node: VideoNode; set: (patch: Partial<VideoNode>) => void }) {
  const cues = node.cues ?? [];
  const chapters = node.chapters ?? [];
  const next = (list: { time: number }[]) => Math.round((list.reduce((m, c) => Math.max(m, c.time), -5) + 5) * 10) / 10;
  const addCue = () => set({ cues: [...cues, { id: uid('vc'), time: next(cues), name: `cue${cues.length + 1}` } as VideoCue] });
  const editCue = (id: string, patch: Partial<VideoCue>) => set({ cues: cues.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const addChapter = () => set({ chapters: [...chapters, { id: uid('vh'), time: chapters.length ? next(chapters) : 0, title: `Chapter ${chapters.length + 1}` } as VideoChapter] });
  const editChapter = (id: string, patch: Partial<VideoChapter>) => set({ chapters: chapters.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  return (
    <>
      <div className="field-label block">Cue points</div>
      <SectionBlurb text="Named points that fire the On video cue event as the video plays across them. Mark one to pause there." name="cue points" help={['images-media', 'cue-points-and-chapters']} />
      <Row k="Add a cue" words={['cue point', 'marker', 'pause', 'event']}>
        <button className="btn small-btn" onClick={addCue}>
          Add a cue
        </button>
        <button className="btn small-btn" disabled={!cues.length} onClick={() => set({ cues: undefined })}>
          Clear
        </button>
      </Row>
      {cues.map((c) => (
        <div key={c.id} className="video-cue">
          <Row>
            <NumberField label="At" title="Seconds from the start of the video" value={c.time} min={0} step={0.5} suffix="s" onChange={(v) => editCue(c.id, { time: Math.max(0, v) })} />
            <TextField label="Name" title="What event.name says when this cue fires" value={c.name} commitOnBlur onChange={(v) => editCue(c.id, { name: v })} />
          </Row>
          <CheckField label="Pause the video here" title="Pause as soon as playback gets to this cue, before the event fires" value={!!c.pause} onChange={(v) => editCue(c.id, { pause: v || undefined })} />
          <button className="btn small-btn" aria-label={`Delete the cue ${c.name}`} onClick={() => set({ cues: cues.filter((x) => x.id !== c.id) })}>
            Delete this one
          </button>
        </div>
      ))}
      <div className="field-label block">Chapters</div>
      <SectionBlurb text="Named sections of the video. Browsers that list chapters show them, and formulas can read them." name="chapters" help={['images-media', 'cue-points-and-chapters']} />
      <Row k="Add a chapter" words={['section', 'chapters', 'navigation']}>
        <button className="btn small-btn" onClick={addChapter}>
          Add a chapter
        </button>
        <button className="btn small-btn" disabled={!chapters.length} onClick={() => set({ chapters: undefined })}>
          Clear
        </button>
      </Row>
      {chapters.map((c) => (
        <div key={c.id} className="video-cue">
          <Row>
            <NumberField label="From" title="Seconds from the start of the video" value={c.time} min={0} step={0.5} suffix="s" onChange={(v) => editChapter(c.id, { time: Math.max(0, v) })} />
            <TextField label="Title" value={c.title} commitOnBlur onChange={(v) => editChapter(c.id, { title: v })} />
          </Row>
          <button className="btn small-btn" aria-label={`Delete the chapter ${c.title}`} onClick={() => set({ chapters: chapters.filter((x) => x.id !== c.id) })}>
            Delete this one
          </button>
        </div>
      ))}
    </>
  );
}
