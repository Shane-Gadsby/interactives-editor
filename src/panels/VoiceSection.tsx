import { useCallback, useEffect, useRef, useState } from 'react';
import type { Artboard, FrameNode, LogicNode, Project, QuestionVoice } from 'interactives-player';
import { store } from '../store/store';
import { locate } from '../store/doc';
import { CheckField, NumberField, Row, SelectField, TextField } from '../components/ui';
import { assetKind, storeFile } from '../lib/assets';
import { addAssetOption, withQuickAdd } from '../lib/quick-add';
import { recordingSupported, startRecording, type Recorder } from '../lib/record-audio';
import {
  DEFAULT_SPEED,
  SPEED_RANGE,
  VoiceError,
  addPlayButton,
  applyAudio,
  installVoice,
  isWord,
  partsFor,
  ownAudioNameProblem,
  setAudioSource,
  setOwnAudio,
  setPractice,
  setVoice,
  soundNodes,
  speak,
  targetNode,
  usesOwnAudio,
  voiceStatus,
  voiceWordsIn,
  type VoiceStatus,
} from '../lib/voice';

type Note = { kind: 'info' | 'error'; text: string } | null;

/** What a Play sound node is, in words: the layer that starts it, else its note, else its place in the list. */
function nodeLabel(ab: Artboard, node: LogicNode, index: number): string {
  const from = ab.logic.edges.find((e) => e.to === node.id);
  const event = from && ab.logic.nodes.find((n) => n.id === from.from);
  const layer = event && typeof event.params.target === 'string' ? locate(ab, event.params.target)?.node.name : undefined;
  return layer ? `Played by ${layer}` : node.note || `Play sound node ${index + 1}`;
}

/**
 * The Spelling test's voice: make the audio for a word with a synthesised voice, as an ordinary sound asset in the word's Play sound node.
 * The server makes the speech while someone is authoring, so a learner's page only ever holds the sound. Practice mode is the other
 * choice, the learner's own device reading the word, which puts the word in the page.
 */
export function VoiceSection({ frame, ab, project }: { frame: FrameNode; ab: Artboard; project: Project }) {
  const q = frame.question!;
  const v: QuestionVoice = q.voice ?? {};
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [busy, setBusy] = useState<'' | 'preview' | 'make' | 'all' | 'install'>('');
  const [recording, setRecording] = useState(false);
  const recorder = useRef<Recorder | null>(null);
  const [note, setNote] = useState<Note>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      player.current?.pause();
      recorder.current?.cancel();
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await voiceStatus();
      if (alive.current) setStatus(s);
      return s;
    } catch {
      if (alive.current) setStatus(null);
      return null;
    }
  }, []);

  //Asked once, and again every couple of seconds while the voice downloads
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (status?.state !== 'installing') return;
    const t = setTimeout(() => void refresh(), 1500);
    return () => clearTimeout(t);
  }, [status, refresh]);

  const ready = status?.state === 'ready';
  const voices = status?.voices ?? [];
  const voiceId = v.voice && voices.some((x) => x.id === v.voice) ? v.voice : (status?.defaultVoice ?? 'bf_emma');
  const speed = v.speed ?? DEFAULT_SPEED;
  const word = isWord(q);
  const nodes = soundNodes(ab);
  const target = targetNode(ab, q);
  const setting = (patch: Partial<QuestionVoice>, key?: string) => store().update((d) => setVoice(d as Project, ab.id, frame.id, patch), { coalesce: key ? `voice-${frame.id}-${key}` : undefined });
  const fail = (e: unknown) => setNote({ kind: 'error', text: e instanceof VoiceError || e instanceof Error ? e.message : String(e) });

  const preview = async () => {
    setBusy('preview');
    setNote(null);
    try {
      const blob = await speak(partsFor(q), voiceId, speed);
      player.current?.pause();
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      a.onended = () => URL.revokeObjectURL(url);
      player.current = a;
      await a.play();
    } catch (e) {
      fail(e);
    } finally {
      if (alive.current) setBusy('');
    }
  };

  /** Make the audio for these words with the voice settings on show, and put each in its page's Play sound node. */
  const make = async (items: { ab: Artboard; frame: FrameNode }[], all: boolean) => {
    setBusy(all ? 'all' : 'make');
    setNote(null);
    const problems: string[] = [];
    let done = 0;
    let added = 0;
    for (const it of items) {
      const current = locateFrame(it.ab.id, it.frame.id);
      //A word on its own audio keeps it
      if (!current || usesOwnAudio(current.question)) continue;
      const label = `${it.ab.name}`;
      try {
        //The settings on show go to every word, each keeping its own Say it like and sentence
        const withShared = { ...current, question: { ...current.question!, voice: { ...(current.question!.voice ?? {}), voice: voiceId, speed, twice: v.twice } } };
        const blob = await speak(partsFor(withShared.question as never), voiceId, speed);
        const file = new File([blob], `Spoken word ${current.question!.prefix}.wav`, { type: 'audio/wav' });
        const asset = await storeFile(project.id, file);
        let outcome = '';
        store().update((d) => {
          const draft = d as Project;
          const abd = draft.artboards.find((a) => a.id === it.ab.id)!;
          const qd = locateIn(draft, it.ab.id, it.frame.id)!.question!;
          let node = targetNode(abd, qd);
          if (!node && !soundNodes(abd).length) {
            const id = addPlayButton(draft, it.ab.id, it.frame.id);
            node = abd.logic.nodes.find((n) => n.id === id) ?? null;
            if (node) added++;
          }
          if (!node) {
            outcome = 'unclear';
            return;
          }
          setVoice(draft, it.ab.id, it.frame.id, { voice: voiceId, speed, twice: v.twice });
          applyAudio(draft, it.ab.id, it.frame.id, asset, node.id);
        });
        if (outcome) problems.push(`${label}: there is more than one Play sound node on the page, pick which one this word's audio goes in first.`);
        else done++;
      } catch (e) {
        problems.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
        //Nothing else will work either when the voice is gone
        if (e instanceof VoiceError && (e.code === 'unsupported' || e.code === 'missing' || e.code === 'installing')) break;
      }
    }
    if (alive.current) {
      setBusy('');
      const said = `Made the audio for ${done} ${done === 1 ? 'word' : 'words'} and put ${done === 1 ? 'it' : 'each'} in a Play sound node${added ? `, adding a Play the word button to ${added} ${added === 1 ? 'page' : 'pages'}` : ''}. Press Preview or play the page to hear it.`;
      setNote(problems.length ? { kind: 'error', text: `${done ? `${said} ` : ''}${problems.join(' ')}` } : { kind: 'info', text: said });
    }
  };

  const install = async () => {
    setBusy('install');
    setNote(null);
    try {
      setStatus(await installVoice());
    } catch (e) {
      fail(e);
    } finally {
      if (alive.current) setBusy('');
    }
  };

  const practice = (on: boolean) => {
    store().update((d) => void setPractice(d as Project, ab.id, frame.id, on));
    setNote(
      on
        ? { kind: 'info', text: 'Practice mode is on: the learner\'s device reads the word, the question is marked in the page, and no grade is sent from it.' }
        : { kind: 'info', text: 'Practice mode is off. The question is still marked in the page: turn on Mark answers on the server again to keep the word off the learner\'s page and send a grade.' },
    );
  };

  const words = voiceWordsIn(project);
  const own = usesOwnAudio(q);
  const ownAsset = project.assets.find((a) => a.id === v.ownAsset);
  const nameProblem = own && ownAsset ? ownAudioNameProblem(q, ownAsset.name) : null;

  /** Use this asset as the word's own audio, adding a Play the word button when the page has no Play sound node. */
  const chooseOwn = (assetId: string) => {
    const asset = store().get().project.assets.find((a) => a.id === assetId);
    if (!asset) return;
    let outcome = '';
    store().update((d) => {
      const draft = d as Project;
      const abd = draft.artboards.find((a) => a.id === ab.id)!;
      const qd = locateIn(draft, ab.id, frame.id)!.question!;
      let node = targetNode(abd, qd);
      if (!node && !soundNodes(abd).length) {
        const id = addPlayButton(draft, ab.id, frame.id);
        node = abd.logic.nodes.find((n) => n.id === id) ?? null;
      }
      if (!node) {
        outcome = 'unclear';
        return;
      }
      setOwnAudio(draft, ab.id, frame.id, asset, node.id);
    });
    if (outcome) setNote({ kind: 'error', text: 'There is more than one Play sound node on this page. Pick which one this word\'s audio goes in first.' });
    else setNote({ kind: 'info', text: `${asset.name} is this word's audio. The made voice audio, if there is any, is kept in Assets and comes back when you switch to Made with a voice.` });
  };

  const record = async () => {
    setNote(null);
    if (recorder.current) {
      const r = recorder.current;
      recorder.current = null;
      setRecording(false);
      try {
        const file = await r.stop();
        const asset = await storeFile(project.id, file);
        store().update((d) => void (d as Project).assets.push(asset));
        chooseOwn(asset.id);
      } catch (e) {
        fail(e);
      }
      return;
    }
    try {
      recorder.current = await startRecording(`Recorded word ${q.prefix}`);
      setRecording(true);
    } catch (e) {
      fail(e);
    }
  };

  const nodePicker = nodes.length > 1 && (
    <SelectField
      label="Put the audio in"
      title="This page has more than one Play sound node. Pick the one the Play the word button runs"
      value={target?.id ?? ''}
      options={[{ value: '', label: 'Pick a Play sound node' }, ...nodes.map((n, i) => ({ value: n.id, label: nodeLabel(ab, n, i) }))]}
      onChange={(id) => id && setting({ node: id })}
    />
  );
  const audioAssets = project.assets.filter((a) => assetKind(a.mime, a.name) === 'audio');
  const mb = (n?: number) => Math.round((n ?? 0) / 1048576);

  return (
    <>
      <div className="q-sub">Voice for the word</div>
      {!v.device && (
        <SelectField
          label="Word audio"
          title="Made with a voice: the server speaks the word, here, while you are authoring. My own audio: you pick, upload or record the sound yourself. Either way it is the word's Play sound node that plays it, and switching never deletes the other one"
          value={own ? 'own' : 'voice'}
          options={[
            { value: 'voice', label: 'Made with a voice' },
            { value: 'own', label: 'My own audio' },
          ]}
          onChange={(x) => store().update((d) => void setAudioSource(d as Project, ab.id, frame.id, x === 'own'))}
        />
      )}
      {!v.device && own && (
        <>
          <div className="muted small">
            Your own sound goes in this word&apos;s Play sound node, the same node the made voice uses. The word is then only in your audio, so it has to be said clearly and its file must not be named after it. Marking on the server and the word being kept off the learner&apos;s page work as before.
          </div>
          <SelectField
            label="Sound"
            title="A sound from this project's Assets, or add one"
            value={ownAsset?.id ?? ''}
            options={[{ value: '', label: audioAssets.length ? 'Choose a sound…' : 'No sounds yet' }, ...audioAssets.map((a) => ({ value: a.id, label: a.name })), addAssetOption('audio')]}
            onChange={withQuickAdd((id) => id && chooseOwn(id), { asset: 'audio' })}
          />
          <Row>
            <button className="btn" disabled={!recording && !recordingSupported()} title={recordingSupported() ? 'Record the word with your microphone, then press Stop' : 'This browser cannot record sound: upload a file instead'} onClick={() => void record()}>
              {recording ? 'Stop recording' : 'Record it now'}
            </button>
            {recording && (
              <span className="muted small" role="status">
                Recording... say the word, then press Stop.
              </span>
            )}
          </Row>
          {nodePicker}
          {nodes.length === 0 && <div className="muted small">This page has no Play sound node yet. Choosing or recording a sound adds a Play the word button with one.</div>}
          {nameProblem && (
            <div className="q-problem" role="alert">
              {nameProblem}
            </div>
          )}
          {v.asset && <div className="muted small">The audio the voice made for this word is still in Assets. Switch to Made with a voice to use it again.</div>}
        </>
      )}
      {!v.device && !own && (
        <>
          <div className="muted small">
            Turns the first accepted spelling into speech here, while you are authoring, and saves it as a sound in this word&apos;s Play sound node. The learner&apos;s page only gets the sound, never the word.
          </div>
          {status === null && <div className="muted small">Asking the server about the voice...</div>}
          {status?.state === 'unsupported' && <div className="q-problem">{status.error}</div>}
          {(status?.state === 'missing' || status?.state === 'failed') && (
            <div className="q-option">
              {status.state === 'failed' && status.error && <div className="q-problem">{status.error}</div>}
              <div className="muted small">
                The voice has to be downloaded to this server once (about {status.model.megabytes} MB, {status.model.name}, {status.model.licence} licence). After that anyone here can use it.
              </div>
              <button className="btn" disabled={busy === 'install'} onClick={() => void install()}>
                {status.state === 'failed' ? 'Try the download again' : 'Set up the voice'}
              </button>
            </div>
          )}
          {status?.state === 'installing' && (
            <div className="muted small" role="status">
              Downloading the voice: {mb(status.done)} of {mb(status.total)} MB. It carries on if you leave this open.
            </div>
          )}
          {ready && (
            <>
              <SelectField label="Voice" title="British voices. The same voice and speed are used for every word when you make the audio for all of them" value={voiceId} options={voices.map((x) => ({ value: x.id, label: `${x.name} (${x.gender.toLowerCase()}, ${x.accent})` }))} onChange={(id) => setting({ voice: id })} />
              <NumberField label="Speed" title="1 is normal talking speed. A little slower is clearer for a spelling test" value={speed} min={SPEED_RANGE.min} max={SPEED_RANGE.max} step={0.05} onChange={(n) => setting({ speed: Math.min(SPEED_RANGE.max, Math.max(SPEED_RANGE.min, n)) }, 'speed')} />
              <TextField
                label="Say it like"
                title="Only used to make the audio, never put in the page. Type the word as it sounds, in ordinary English words, when the voice says it wrongly or does not know it (cull er for colour). Empty: it says the word as spelled"
                value={v.say ?? ''}
                placeholder="Only if it says the word wrongly"
                onChange={(t) => setting({ say: t }, 'say')}
              />
              <TextField
                label="Sentence"
                title="Optional. Said after the word, like a teacher would (The colour of the sky is blue). It is only in the audio, never in the page"
                value={v.sentence ?? ''}
                placeholder="Optional, said after the word"
                onChange={(t) => setting({ sentence: t }, 'sentence')}
              />
              <CheckField label="Say the word again at the end" title="The word, the sentence, then the word once more" value={!!v.twice} onChange={(on) => setting({ twice: on })} />
              {nodePicker}
              {nodes.length === 0 && <div className="muted small">This page has no Play sound node yet. Making the audio adds a Play the word button with one.</div>}
              <Row>
                <button className="btn" disabled={!word || !!busy} title={word ? 'Hear it without saving anything' : 'Type the accepted spelling first'} onClick={() => void preview()}>
                  {busy === 'preview' ? 'Making it...' : 'Preview'}
                </button>
                <button className="btn" disabled={!word || !!busy || (nodes.length > 1 && !target)} onClick={() => void make([{ ab, frame }], false)}>
                  {busy === 'make' ? 'Making it...' : v.asset ? 'Make the audio again' : 'Make the audio with a voice'}
                </button>
              </Row>
              <button className="btn" disabled={!words.length || !!busy} title="Uses this voice and speed for every spelling word in the project. Each word keeps its own Say it like and sentence. Words set to My own audio are skipped" onClick={() => void make(words, true)}>
                {busy === 'all' ? 'Making them...' : `Make the audio for all ${words.length} ${words.length === 1 ? 'word' : 'words'}`}
              </button>
              {v.asset && <div className="muted small">The audio for this word is in the project&apos;s Assets. Change the word or how it is said, then make it again to replace it.</div>}
            </>
          )}
        </>
      )}
      {note && (
        <div className={note.kind === 'error' ? 'q-problem' : 'muted small'} role={note.kind === 'error' ? 'alert' : 'status'}>
          {note.text}
        </div>
      )}
      <CheckField
        label="Practice mode: the learner's own device reads the word"
        title="Not for a graded test. The device's voice has to be given the word, so the word is in the page and anyone can read it in their browser. The question is then marked in the page and no grade is sent"
        value={!!v.device}
        onChange={practice}
      />
      {v.device && (
        <div className="q-problem" role="alert">
          The word is in the page. Anyone can read it in their browser&apos;s developer tools, so this is for practice, not a graded test. This question is marked in the page and sends no grade, and Mark answers on the server is off. The voice is whatever the learner&apos;s device has, and with none for the language nothing is said. For a graded test turn this off and make the audio with the voice above.
        </div>
      )}
    </>
  );
}

function locateIn(d: Project, abId: string, frameId: string): FrameNode | null {
  const ab = d.artboards.find((a) => a.id === abId);
  const f = ab && locate(ab, frameId)?.node;
  return f && f.type === 'frame' ? f : null;
}

function locateFrame(abId: string, frameId: string): FrameNode | null {
  return locateIn(store().get().project, abId, frameId);
}
