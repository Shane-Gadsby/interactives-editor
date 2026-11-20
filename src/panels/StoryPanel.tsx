import { useMemo, useRef, useState } from 'react';
import { chapterText, checkStory, matchLines, readChapter, storyCounts, storySpots, uid, type CastMember, type Project, type Story, type StoryChapter } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { confirmDialog } from '../components/dialogs';
import { CheckField, ColorField, IconButton, NumberField, SelectField, TextField } from '../components/ui';
import { CodeEditor } from '../components/CodeEditor';
import { Icons } from '../components/icons';
import { SplitColumns } from '../components/SplitColumns';
import { SectionBlurb } from '../components/SectionBlurb';
import { assetKind } from '../lib/asset-kind';
import { nextChapterName, startStory } from '../lib/story';
import { facesFromPictures } from '../lib/story-cast';

/** Ask the editor to open Preview playing the story from a line (Editor.tsx listens). */
export const PREVIEW_STORY_EVENT = 'ix-preview-story';

type Pick = { kind: 'chapter'; id: string } | { kind: 'cast'; id: string } | { kind: 'settings' };

/**
 * The Story panel: the story's chapters as plain text, the cast, and its settings. Every keystroke is matched to the lines
 * that were there (story.ts matchLines), so a line keeps its id while it's edited and two writers merge line by line.
 */
export function StoryPanel() {
  const story = useEditor((st) => st.project.story ?? null);
  const [pick, setPick] = useState<Pick | null>(null);
  if (!story) {
    return (
      <div className="panel-empty story-empty">
        <SectionBlurb
          text="Write a story as plain text: who says what, the choices, where it jumps. It plays on a stage page, already wired."
          name="Story"
          help={['story']}
        />
        <button
          className="btn primary"
          onClick={() => {
            let stage = '';
            store().update((d) => {
              stage = startStory(d as Project);
            });
            store().set({ activeArtboardId: stage, selection: [], artboardSelected: true });
            store().toast('Story started: press Preview to play the sample, then make it yours', 'info');
          }}
        >
          Start a story
        </button>
      </div>
    );
  }
  const current: Pick = pick && (pick.kind === 'settings' || (pick.kind === 'chapter' ? story.chapters.some((c) => c.id === pick.id) : story.cast?.some((c) => c.id === pick.id))) ? pick : story.chapters[0] ? { kind: 'chapter', id: story.chapters[0].id } : { kind: 'settings' };
  return (
    <SplitColumns id="story" columns={[{ width: 190, min: 140, max: 360 }, 'flex', { width: 280, min: 200, max: 520, hideBelow: 720 }]} className="story-panel">
      <StoryList story={story} pick={current} onPick={setPick} />
      {current.kind === 'chapter' ? (
        <ChapterEditor key={current.id} story={story} chapterId={current.id} />
      ) : current.kind === 'cast' ? (
        <CastEditor key={current.id} story={story} memberId={current.id} />
      ) : (
        <StorySettingsForm story={story} />
      )}
      <StorySide story={story} chapterId={current.kind === 'chapter' ? current.id : null} />
    </SplitColumns>
  );
}

function StoryList({ story, pick, onPick }: { story: Story; pick: Pick; onPick: (p: Pick) => void }) {
  const addChapter = () => {
    const ch: StoryChapter = { id: uid('ch'), name: nextChapterName(story), lines: [{ id: uid('l'), text: '' }] };
    store().update((d) => {
      d.story?.chapters.push(ch);
    });
    onPick({ kind: 'chapter', id: ch.id });
  };
  const addCast = (name?: string) => {
    const used = new Set((story.cast ?? []).map((c) => c.name.toLowerCase()));
    let n = name ?? 'Someone';
    for (let i = 2; !name && used.has(n.toLowerCase()); i++) n = `Someone ${i}`;
    const m: CastMember = { id: uid('cm'), name: n, expressions: [] };
    store().update((d) => {
      if (!d.story) return;
      (d.story.cast ??= []).push(m);
    });
    onPick({ kind: 'cast', id: m.id });
  };
  return (
    <div className="story-list">
      <div className="field-label block">Chapters</div>
      {story.chapters.map((c, i) => (
        <div key={c.id} className="story-row">
          <button className={`list-item${pick.kind === 'chapter' && pick.id === c.id ? ' active' : ''}`} onClick={() => onPick({ kind: 'chapter', id: c.id })} title={`${c.name}: ${c.lines.filter((l) => l.text.trim()).length} lines`}>
            <Icons.text width={14} /> {c.name}
          </button>
          {i > 0 && (
            <IconButton
              icon={<Icons.chevronUp />}
              title="Move up: chapters play one after another, top to bottom"
              onClick={() =>
                store().update((d) => {
                  const list = d.story!.chapters;
                  const at = list.findIndex((x) => x.id === c.id);
                  if (at > 0) list.splice(at - 1, 0, list.splice(at, 1)[0]);
                })
              }
            />
          )}
        </div>
      ))}
      <button className="link-btn" onClick={addChapter}>
        + New chapter
      </button>
      <div className="field-label block">Cast</div>
      {(story.cast ?? []).map((m) => (
        <button key={m.id} className={`list-item${pick.kind === 'cast' && pick.id === m.id ? ' active' : ''}`} onClick={() => onPick({ kind: 'cast', id: m.id })}>
          <span className="story-swatch" style={{ background: m.colour || 'var(--muted)' }} aria-hidden="true" /> {m.name}
          {m.expressions.length > 0 && <span className="badge">{m.expressions.length}</span>}
        </button>
      ))}
      <button className="link-btn" onClick={() => addCast()}>
        + Add someone
      </button>
      <div className="field-label block">Story</div>
      <button className={`list-item${pick.kind === 'settings' ? ' active' : ''}`} onClick={() => onPick({ kind: 'settings' })}>
        <Icons.gear width={14} /> Settings
      </button>
    </div>
  );
}

/** Line numbers of the problems in a chapter (1-based, as the editor counts). */
function problemLines(story: Story, chapterId: string, project: Project) {
  const has = haves(project);
  return checkStory(story, has).filter((p) => p.chapter === chapterId);
}

function haves(project: Project) {
  const names = new Set<string>();
  for (const a of project.assets) {
    names.add(a.name.trim().toLowerCase());
    names.add(a.name.replace(/\.[a-z0-9]+$/i, '').trim().toLowerCase());
  }
  const pages = new Set(project.artboards.map((a) => a.name.trim().toLowerCase()));
  const stage = project.artboards.find((a) => a.id === project.story?.stage);
  const timelines = new Set((stage?.timelines ?? []).map((t) => t.name.trim().toLowerCase()));
  const flows = new Set(project.artboards.flatMap((a) => a.logic.nodes.filter((n) => n.kind === 'event.flow').map((n) => String(n.params.name ?? '').trim().toLowerCase())));
  return {
    asset: (n: string) => names.has(n.trim().toLowerCase()) || project.assets.some((a) => a.id === n),
    page: (n: string) => pages.has(n.trim().toLowerCase()),
    timeline: (n: string) => timelines.has(n.trim().toLowerCase()),
    flow: (n: string) => flows.has(n.trim().toLowerCase()),
  };
}

function ChapterEditor({ story, chapterId }: { story: Story; chapterId: string }) {
  const project = useEditor((st) => st.project);
  const chapter = story.chapters.find((c) => c.id === chapterId)!;
  const text = useMemo(() => chapterText(chapter), [chapter]);
  const problems = useMemo(() => problemLines(story, chapterId, project), [story, chapterId, project.assets, project.artboards]);
  const [line, setLine] = useState(1);
  const [jump, setJump] = useState<{ line: number; n: number } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const setText = (next: string) => {
    // Matched against the lines as they are now (not a draft), so unchanged lines stay the very same objects
    const lines = matchLines(store().get().project.story?.chapters.find((c) => c.id === chapterId)?.lines ?? [], next);
    store().update(
      (d) => {
        const ch = d.story?.chapters.find((c) => c.id === chapterId);
        if (ch) ch.lines = lines as typeof ch.lines;
      },
      { coalesce: `story-${chapterId}` },
    );
  };
  const previewHere = () => {
    const prog = readChapter(chapter, story);
    // The line the caret is on, or the next one that does something
    let id: string | null = null;
    for (let i = line - 1; i < chapter.lines.length && !id; i++) if (prog.lines.has(chapter.lines[i].id)) id = chapter.lines[i].id;
    if (!id) return store().toast('Nothing plays from here: put the caret on a line', 'info');
    window.dispatchEvent(new CustomEvent(PREVIEW_STORY_EVENT, { detail: { chapter: chapterId, line: id } }));
  };
  return (
    <div className="story-main">
      <div className="script-bar">
        <TextField
          value={chapter.name}
          commitOnBlur
          title="The chapter's name: -> and a chapter's name jumps to its start"
          onChange={(v) =>
            store().update((d) => {
              const ch = d.story?.chapters.find((c) => c.id === chapterId);
              if (ch && v.trim()) ch.name = v.trim();
            })
          }
        />
        <div className="spacer" />
        <button className="btn" onClick={previewHere} title="Play the story in Preview from the line the caret is on, with the background, music and cast as the lines above it leave them">
          Preview from this line
        </button>
        <IconButton
          icon={<Icons.download />}
          title="Download as text: the chapter as you typed it, to work on in another editor"
          onClick={() => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
            a.download = `${chapter.name.replace(/[^\w\- ]+/g, '').trim() || 'chapter'}.txt`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          }}
        />
        <IconButton icon={<Icons.upload />} title="Replace with a text file: lines that are the same (or nearly) keep what hangs off them, like voice files" onClick={() => file.current?.click()} />
        <input
          ref={file}
          type="file"
          accept=".txt,.md,text/plain"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setText(await f.text());
          }}
        />
        {story.chapters.length > 1 && (
          <IconButton
            icon={<Icons.trash />}
            title="Delete chapter"
            onClick={async () => {
              if (!(await confirmDialog({ title: 'Delete chapter', message: `Delete "${chapter.name}" and its ${chapter.lines.filter((l) => l.text.trim()).length} lines?`, confirmLabel: 'Delete chapter', danger: true }))) return;
              store().update((d) => {
                if (d.story) d.story.chapters = d.story.chapters.filter((c) => c.id !== chapterId);
              });
            }}
          />
        )}
      </div>
      <CodeEditor value={text} onChange={setText} language="story" height="100%" errorLines={problems.map((p) => p.index + 1)} onCursorLine={setLine} goToLine={jump} label={`${chapter.name}, the story script`} />
      {problems.length > 0 && (
        <ul className="story-problems" aria-label="Problems in this chapter">
          {problems.slice(0, 50).map((p, i) => (
            <li key={i}>
              <button className="link-btn" onClick={() => setJump({ line: p.index + 1, n: Date.now() })}>
                Line {p.index + 1}
              </button>{' '}
              {p.message}{' '}
              {p.fix?.kind === 'add-cast' && (
                <button className="link-btn" onClick={() => store().update((d) => void (d.story!.cast ??= []).push({ id: uid('cm'), name: (p.fix as { name: string }).name, expressions: [] }))}>
                  Add {p.fix.name}
                </button>
              )}
              {p.fix?.kind === 'add-expression' && (
                <button
                  className="link-btn"
                  onClick={() =>
                    store().update((d) => {
                      const f = p.fix as { name: string; expression: string };
                      const m = d.story?.cast?.find((c) => c.name.toLowerCase() === f.name.toLowerCase());
                      if (m) m.expressions.push({ name: f.expression, assetId: null });
                    })
                  }
                >
                  Add the {p.fix.expression} face
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CastEditor({ story, memberId }: { story: Story; memberId: string }) {
  const assets = useEditor((st) => st.project.assets);
  const m = story.cast!.find((c) => c.id === memberId)!;
  const images = assets.filter((a) => assetKind(a.mime, a.name) === 'image');
  const sounds = assets.filter((a) => assetKind(a.mime, a.name) === 'audio');
  const set = (fn: (c: CastMember) => void, coalesce?: string) =>
    store().update(
      (d) => {
        const c = d.story?.cast?.find((x) => x.id === memberId);
        if (c) fn(c as CastMember);
      },
      { coalesce },
    );
  const pictureOptions = [{ value: '', label: 'None' }, ...images.map((a) => ({ value: a.id, label: a.name }))];
  const found = facesFromPictures(m.name, images, m.expressions);
  return (
    <div className="story-main story-form">
      <div className="script-bar">
        <TextField value={m.name} commitOnBlur title="The name lines use, like Millie: Hello. Capitals don't matter" onChange={(v) => v.trim() && set((c) => void (c.name = v.trim()))} />
        <div className="spacer" />
        <IconButton
          icon={<Icons.trash />}
          title="Take out of the cast"
          onClick={async () => {
            if (!(await confirmDialog({ title: 'Take out of the cast', message: `Take ${m.name} out of the cast? Their lines stay, with a name plate only.`, confirmLabel: 'Take out', danger: true }))) return;
            store().update((d) => {
              if (d.story) d.story.cast = (d.story.cast ?? []).filter((c) => c.id !== memberId);
            });
          }}
        />
      </div>
      <div className="story-fields">
        <TextField label="Shown as" value={m.display ?? ''} title="What the name plate says, if not their name. {values} work: {millieKnown ? 'Millie' : '???'}" onChange={(v) => set((c) => void (v ? (c.display = v) : delete c.display), `cast-display-${m.id}`)} />
        <ColorField label="Colour" value={m.colour ?? '#b8860b'} title="The name plate's colour" onChange={(v) => set((c) => void (c.colour = v), `cast-colour-${m.id}`)} />
        <SelectField
          label="Stands at"
          value={m.spot ?? ''}
          title="Where they stand when a line doesn't say. Any: the first free spot from the middle out"
          options={[{ value: '', label: 'Any' }, ...storySpots(story).map((s) => ({ value: s.name, label: s.name }))]}
          onChange={(v) => set((c) => void (v ? (c.spot = v) : delete c.spot))}
        />
        <NumberField label="Height" value={Math.round((m.height ?? 0.9) * 100)} min={10} max={200} suffix="%" title="Their picture's height, as a share of the stage's" onChange={(v) => set((c) => void (c.height = v / 100), `cast-height-${m.id}`)} />
        <SelectField label="Blip" value={m.blip ?? ''} title="A short sound for each letter as their words type on" options={[{ value: '', label: 'None' }, ...sounds.map((a) => ({ value: a.id, label: a.name }))]} onChange={(v) => set((c) => void (v ? (c.blip = v) : delete c.blip))} />
        {m.blip && <NumberField label="Blip pitch" value={m.blipPitch ?? 1} step={0.05} min={0.5} max={2} title="Higher or lower than the sound as it is (1)" onChange={(v) => set((c) => void (c.blipPitch = v), `cast-pitch-${m.id}`)} />}
      </div>
      <div className="field-label block">Faces</div>
      <SectionBlurb text={<>A face is a picture of them. A line picks one by name: <code>{m.name} (smiling): Hi</code>. The first is the one they come on with.</>} name="Faces" help={['story-stage', 'the-cast']} />
      <table className="story-faces">
        <thead>
          <tr>
            <th>Name</th>
            <th>Picture</th>
            <th title="Eyes shut, for blinking">Blink</th>
            <th title="Mouth open, for talking">Talking</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {m.expressions.map((e, i) => (
            <tr key={i}>
              <td>
                <TextField value={e.name} commitOnBlur title="The face's name, as lines use it" onChange={(v) => v.trim() && set((c) => void (c.expressions[i].name = v.trim()))} />
              </td>
              <td>
                <SelectField value={e.assetId ?? ''} options={pictureOptions} title="The picture" onChange={(v) => set((c) => void (c.expressions[i].assetId = v || null))} />
              </td>
              <td>
                <SelectField value={e.blink ?? ''} options={pictureOptions} title="The same face with its eyes shut: they blink now and then" onChange={(v) => set((c) => void (v ? (c.expressions[i].blink = v) : delete c.expressions[i].blink))} />
              </td>
              <td>
                <SelectField value={e.talk ?? ''} options={pictureOptions} title="The same face with its mouth open: it moves while their words type on" onChange={(v) => set((c) => void (v ? (c.expressions[i].talk = v) : delete c.expressions[i].talk))} />
              </td>
              <td>
                <IconButton icon={<Icons.trash />} title="Remove this face" onClick={() => set((c) => void c.expressions.splice(i, 1))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="story-actions">
        <button className="link-btn" onClick={() => set((c) => void c.expressions.push({ name: c.expressions.length ? `face ${c.expressions.length + 1}` : 'neutral', assetId: null }))}>
          + Add a face
        </button>
        {found.length > 0 && (
          <button className="btn" title={`Pictures in Assets named after ${m.name}: ${found.map((f) => f.name).join(', ')}`} onClick={() => set((c) => void c.expressions.push(...found))}>
            Add {found.length} {found.length === 1 ? 'face' : 'faces'} from pictures named {m.name}
          </button>
        )}
      </div>
    </div>
  );
}

function StorySettingsForm({ story }: { story: Story }) {
  const pages = useEditor((st) => st.project.artboards.filter((a) => !a.overlay && !a.variantOf));
  const s = story.settings ?? {};
  const set = (fn: (st: NonNullable<Story['settings']>) => void, coalesce?: string) =>
    store().update(
      (d) => {
        if (!d.story) return;
        fn((d.story.settings ??= {}));
      },
      { coalesce },
    );
  return (
    <div className="story-main story-form">
      <div className="story-fields">
        <SelectField label="Stage" value={story.stage ?? ''} title="The page the story plays on" options={[{ value: '', label: 'First page using story values' }, ...pages.map((a) => ({ value: a.id, label: a.name }))]} onChange={(v) => store().update((d) => void (d.story && (v ? (d.story.stage = v) : delete d.story.stage)))} />
        <NumberField label="Text speed" value={s.textSpeed ?? 40} min={0} max={400} suffix="letters/s" title="How fast words type on. 0 shows each line at once. Readers can change it in the settings screen" onChange={(v) => set((x) => void (x.textSpeed = v), 'story-speed')} />
        <NumberField label="Auto wait" value={s.autoDelay ?? 30} min={0} max={500} suffix="ms/letter" title="With Auto on, how long a shown line waits before going on, per letter (never under 1.2 s)" onChange={(v) => set((x) => void (x.autoDelay = v), 'story-auto')} />
        <NumberField label="Moves take" value={s.moveTime ?? 400} min={0} max={5000} step={50} suffix="ms" title="How long someone takes to come on, go off or move to another spot" onChange={(v) => set((x) => void (x.moveTime = v), 'story-move')} />
        <CheckField label="Dim whoever isn't speaking" value={s.dimOthers !== false} title="The others on stage go a little darker while someone talks" onChange={(v) => set((x) => void (x.dimOthers = v))} />
      </div>
    </div>
  );
}

function StorySide({ story, chapterId }: { story: Story; chapterId: string | null }) {
  const counts = useMemo(() => storyCounts(story), [story]);
  const ch = chapterId ? counts.chapters.find((c) => c.id === chapterId) : null;
  return (
    <div className="script-help story-side">
      <div className="field-label block">Words</div>
      <p className="hint">
        {ch ? `${ch.words.toLocaleString()} in this chapter, ` : ''}
        {counts.words.toLocaleString()} in the story
      </p>
      {counts.speakers.length > 0 && (
        <ul className="story-counts">
          {counts.speakers.slice(0, 8).map((s) => (
            <li key={s.name}>
              {s.name}: {s.words.toLocaleString()} words, {s.lines} {s.lines === 1 ? 'line' : 'lines'}
            </li>
          ))}
        </ul>
      )}
      <div className="field-label block">How to write it</div>
      <pre className="api-ref">{`Millie: You came!
Millie (smiling, left): Hi!
The quad was busy.     narration
# The club fair        a scene
-> The club fair       jump there
-> end Good friends    the end
? Join the club        a choice;
    set joined = true  indented lines
    -> Signing up      run if picked
? Not today [once]
? Chess [if flyer, grey]
if trust >= 3
    Millie: Thanks.
else
    Millie: Oh.
set trust += 1
[bg Quad, fade]   [music Hopeful]
[music off, 2s]   [sound Door]
[show Olive at right]  [hide Olive]
[wait 1s]   [shake]   [flash]
[tint night]   [tint off]
[zoom Millie]  [zoom off]
[call Puzzle 1]   back with a result
[open Notebook]   an overlay
[play Intro]   [run Give badge]
Hi {player_name}!    a value
{pause} {fast} {slow} {shake}…{/shake}
{wave}…{/wave} {b} {i} {big} {colour red}
// a note, never shown`}</pre>
    </div>
  );
}
