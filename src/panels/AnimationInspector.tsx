import { useEffect, useRef, useState } from 'react';
import { advanceAnimation, cellFor, clipRange, peekFrameling, releaseFrameling, retainFrameling, spriteBox, type AnimationNode, type Artboard, type FramelingManifest, type Project } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { CheckField, NumberField, Row, Section, SelectField, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { assetKind, assetUrls } from '../lib/assets';
import { addAssetOption, withQuickAdd } from '../lib/quick-add';
import { clipLength, downloadForFrameling, framelingFileName, manifestOf, startSize, updateAnimationFile } from '../lib/frameling-import';
import { pickFiles } from '../lib/insert';
import { inRepeaterTemplate } from '../canvas/connect';
import { KeyButton, Num, useSetter } from './Inspector';
import { SectionBlurb } from '../components/SectionBlurb';

const LOOPS = [
  { value: 'clip' as const, label: 'As set in Frameling' },
  { value: 'loop' as const, label: 'Loop' },
  { value: 'once' as const, label: 'Play once' },
];
const FITS = [
  { value: 'contain' as const, label: 'Fit inside' },
  { value: 'cover' as const, label: 'Fill and crop' },
  { value: 'fill' as const, label: 'Stretch' },
];
const SMOOTHING = [
  { value: 'auto' as const, label: 'Automatic' },
  { value: 'crisp' as const, label: 'Crisp (pixel art)' },
  { value: 'smooth' as const, label: 'Smooth' },
];

const lessMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A small moving preview of the layer's clip, played here rather than on the canvas so looking at it never changes the
 * project. Starts still for people who ask their system for less motion.
 */
function ClipPreview({ m, url, node }: { m: FramelingManifest; url: string; node: AnimationNode }) {
  const cell = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(() => !lessMotion());
  const W = 200;
  const H = Math.max(40, Math.min(160, Math.round((W * m.height) / m.width)));
  //Holds the package while the preview shows it, like a layer on the canvas does
  useEffect(() => {
    retainFrameling(url);
    return () => releaseFrameling(url);
  }, [url]);
  useEffect(() => {
    const atlas = peekFrameling(url)?.atlasUrl;
    const el = cell.current;
    if (!atlas || !el) return;
    const st = { clipName: node.clipName, frame: on ? 0 : node.frame, speed: node.speed || 1, loop: 'loop' as const, playing: on };
    const crisp = node.smoothing === 'crisp' || (node.smoothing === 'auto' && m.pixelArt);
    const draw = () => {
      const b = spriteBox(m, cellFor(m, st.clipName, st.frame), W, H, 'contain');
      Object.assign(el.style, {
        left: `${b.left}px`,
        top: `${b.top}px`,
        width: `${b.width}px`,
        height: `${b.height}px`,
        backgroundImage: `url("${atlas}")`,
        backgroundSize: `${b.bgWidth}px ${b.bgHeight}px`,
        backgroundPosition: `${b.bgX}px ${b.bgY}px`,
        imageRendering: crisp ? 'pixelated' : 'auto',
      });
    };
    draw();
    if (!on) return;
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(t) {
      st.frame = advanceAnimation(m, st, Math.min(100, t - last)).frame;
      last = t;
      draw();
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [m, url, node.clipName, node.speed, node.smoothing, on, on ? 0 : node.frame]);
  return (
    <div className="anim-preview" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px' }}>
      <div style={{ position: 'relative', width: W, height: H, overflow: 'hidden', borderRadius: 6, background: 'repeating-conic-gradient(rgba(128,128,128,.18) 0 25%, transparent 0 50%) 0 0 / 12px 12px' }} aria-hidden>
        <div ref={cell} style={{ position: 'absolute', backgroundRepeat: 'no-repeat' }} />
      </div>
      <button className="icon-btn" title={on ? 'Stop the preview' : 'Play the clip here (the canvas shows the frame set below)'} aria-label={on ? 'Stop the preview' : 'Play the preview'} onClick={() => setOn(!on)}>
        {on ? <Icons.pause width={14} /> : <Icons.play width={14} />}
      </button>
    </div>
  );
}

/**
 * Editing the drawing in Frameling, from a browser: it can't open a file in another app or watch one on disk, so it
 * downloads the .flplay (with its drawing inside) and says how to bring the saved one back. Replace file... is always
 * here, for a new export too.
 */
function FramelingRoundTrip({ n, m }: { n: AnimationNode; m: FramelingManifest | null }) {
  const [shown, setShown] = useState(false);
  const asset = useEditor((st) => (n.assetId ? st.project.assets.find((a) => a.id === n.assetId) : undefined));
  if (!asset) return null;
  const name = framelingFileName(asset);
  const replace = async () => {
    const [file] = await pickFiles('.flplay', false);
    if (file) await updateAnimationFile(n, file);
  };
  return (
    <>
      <Row>
        {m?.source && (
          <button className="btn small" title="Download the .flplay with its drawing inside, to open and change in Frameling" onClick={async () => setShown(await downloadForFrameling(asset.id))}>
            Edit in Frameling
          </button>
        )}
        <button className="link-btn" title={`Pick a new version of ${asset.name}. Every layer that plays it keeps its settings`} onClick={() => void replace()}>
          Replace file…
        </button>
      </Row>
      {m && !m.source && <p className="hint">Exported without its drawing, so it can't open in Frameling. Export it with the drawing included.</p>}
      {shown && (
        <div className="hint frameling-howto" role="status">
          <p>
            <strong>{name}</strong> is in your downloads.
          </p>
          <ol>
            <li>Open it in Frameling: double-click it (once Frameling is installed it opens .flplay files), or use File &gt; Open Interactives file… there.</li>
            <li>Make your changes and save. Frameling writes them back into the same .flplay.</li>
            <li>Drag the saved file onto this layer on the canvas, or press Replace file… and choose it. Every layer that plays it keeps its settings.</li>
          </ol>
          <button className="link-btn" onClick={() => setShown(false)}>
            Done
          </button>
        </div>
      )}
    </>
  );
}

/** A Frameling animation layer: which package, which clip, how it plays, and a preview. */
export function AnimationSection({ nodes, project, ab }: { nodes: AnimationNode[]; project: Project; ab?: Artboard | null }) {
  const n = nodes[0];
  const ids = nodes.map((x) => x.id);
  const set = useSetter(ids);
  const [, bump] = useState(0);
  const m = manifestOf(n.assetId, () => bump((x) => x + 1));
  const url = n.assetId ? assetUrls.resolve(n.assetId) : undefined;
  const files = project.assets.filter((a) => assetKind(a.mime, a.name) === 'animation');
  const len = clipLength(m, n.clipName);
  const range = m ? clipRange(m, n.clipName) : null;
  const marks = m && range ? m.markers.filter((k) => k.frame >= range.start && k.frame <= range.end) : [];
  const failed = !!url && peekFrameling(url) === null;
  const repeated = !!ab && nodes.some((x) => inRepeaterTemplate(ab, x.id));
  return (
    <Section help="frameling-animations" title="Frameling animation">
      <SelectField
        label="Animation"
        title="The .flplay file it plays. Make one in Frameling with File > Export for Interactives"
        value={n.assetId ?? ''}
        onChange={withQuickAdd((v) => set({ assetId: v || null }), { asset: 'animation' })}
        options={[{ value: '', label: 'None' }, ...files.map((a) => ({ value: a.id, label: a.name })), addAssetOption('animation')]}
      />
      {!n.assetId ? (
        <p className="hint">Choose a .flplay file. In Frameling: File &gt; Export for Interactives. Or drop the file on the canvas.</p>
      ) : failed ? (
        <p className="hint error">This file can't be played. Export it from Frameling again and use Replace file… below.</p>
      ) : !m || !url ? (
        <p className="hint">Loading the animation…</p>
      ) : (
        <>
          <ClipPreview m={m} url={url} node={n} />
          <p className="hint">
            {m.frameCount} frames at {m.fps} a second{m.pixelArt ? ', pixel art' : ''}. Drawn {m.width} × {m.height}.
          </p>
        </>
      )}
      {n.assetId && <FramelingRoundTrip n={n} m={m} />}
      <Row>
        {m ? (
          <SelectField
            label="Clip"
            title="Which of the animation's clips it shows. The clips were named in Frameling's timeline"
            value={n.clipName}
            options={[{ value: '', label: 'Whole animation' }, ...m.clips.map((c) => ({ value: c.name, label: `${c.name} (${c.end - c.start + 1} frames${c.loop ? ', loops' : ''})` })), ...(n.clipName && !m.clips.some((c) => c.name === n.clipName) ? [{ value: n.clipName, label: `${n.clipName} (not in this file)` }] : [])]}
            onChange={(v) => set({ clipName: v, frame: 0 })}
          />
        ) : (
          <TextField label="Clip" title="The clip's name, as named in Frameling. Empty is the whole animation" value={n.clipName} commitOnBlur onChange={(v) => set({ clipName: v.trim(), frame: 0 })} />
        )}
        <KeyButton node={n} prop="clipName" ids={ids} />
      </Row>
      <Row>
        <CheckField label="Playing" title="On, it plays as the page starts. Off, it shows the frame below until a Play a Frameling clip node or a script plays it" value={n.playing} onChange={(v) => set({ playing: v })} />
        <KeyButton node={n} prop="playing" ids={ids} />
      </Row>
      <SelectField label="Loop" title="Loop or play once. As set in Frameling uses each clip's own Loop setting" value={n.loop} options={LOOPS} onChange={(v) => set({ loop: v })} />
      <Num node={n} ids={ids} prop="speed" label="Speed" step={0.25} min={-10} max={10} suffix="x" title="1 is the speed it was drawn at, 2 twice as fast, 0.5 half. Below 0 plays backwards" />
      <Num node={n} ids={ids} prop="frame" label="Frame" step={1} min={0} max={len ? len - 1 : undefined} title={`The frame it shows before it plays (and while stopped), counted from 0, the clip's first${len ? `. This clip has ${len}` : ''}. Key it on a timeline to scrub the animation`} />
      <SelectField label="Fit" title="How the animation fits the layer's box" value={n.fit} options={FITS} onChange={(v) => set({ fit: v })} />
      <SelectField label="Pixels" title="Crisp keeps every pixel square when it is scaled up (pixel art). Automatic is crisp for pixel art and smooth for everything else" value={n.smoothing} options={SMOOTHING} onChange={(v) => set({ smoothing: v })} />
      <CheckField
        label="Essential motion"
        title="On, it plays as the page starts even for viewers who ask their device for less motion (only when the motion is the point, such as showing how something moves). Off, those viewers see the still frame until they set it going"
        value={!!n.essential}
        onChange={(v) => set({ essential: v || undefined })}
      />
      {!n.essential && (
        <NumberField
          label="Still frame"
          title={`The frame shown instead of playing for viewers who ask for less motion (when Respect reduced motion is on in Project settings), counted from 0, the clip's first${len ? `. This clip has ${len}` : ''}`}
          value={n.stillFrame ?? 0}
          step={1}
          min={0}
          max={len ? len - 1 : undefined}
          onChange={(v) => set({ stillFrame: v > 0 ? Math.round(v) : undefined })}
          onCommit={() => store().commit()}
        />
      )}
      {repeated && (
        <NumberField
          label="Copy offset"
          title="The copies of a repeater share one playhead. Each copy shows this many frames on from the one before, so a row of the same animation doesn't move in step (0: all together)"
          value={n.copyOffset ?? 0}
          step={1}
          onChange={(v) => set({ copyOffset: v || undefined })}
          onCommit={() => store().commit()}
        />
      )}
      {m && (
        <button className="btn small" title="Make the layer the size the animation was drawn (smaller if it is very big)" onClick={() => (set(startSize(m)), store().commit())}>
          Size to the animation
        </button>
      )}
      {marks.length > 0 && <p className="hint">Markers in this clip: {marks.map((k) => `${k.name} (frame ${k.frame - range!.start})`).join(', ')}.</p>}
      <SectionBlurb
        text={
          <>
            Play clips from a click or a timer with <strong>Play a Frameling clip</strong>, or from a script with <code>ix.playClip</code>.
          </>
        }
        name="Frameling animation controls"
        help={['frameling-animations', 'control-it']}
      />
    </Section>
  );
}
