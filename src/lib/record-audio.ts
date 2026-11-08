/** Recording a sound with the person's microphone, for a word's own audio. The editor has no other use for the microphone. */

export interface Recorder {
  /** Stop and hand back the recording as a file. */
  stop(): Promise<File>;
  /** Stop and throw it away. */
  cancel(): void;
}

export const recordingSupported = (): boolean => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

/** The file extension for what the browser recorded (Chrome and Firefox: webm or ogg, Safari: mp4). */
export const extensionFor = (mime: string): string => (/ogg/.test(mime) ? 'ogg' : /mp4|aac/.test(mime) ? 'm4a' : /wav/.test(mime) ? 'wav' : 'webm');

/** Ask for the microphone and start. Rejects with a plain-English message when it is refused or there is none. */
export async function startRecording(baseName: string): Promise<Recorder> {
  if (!recordingSupported()) throw new Error('This browser cannot record sound. Upload a file instead.');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new Error('The microphone is not available. Allow it for this site in the browser, or upload a file instead.');
  }
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.addEventListener('dataavailable', (e) => {
    if (e.data.size) chunks.push(e.data);
  });
  const done = new Promise<void>((resolve) => rec.addEventListener('stop', () => resolve()));
  const release = () => stream.getTracks().forEach((t) => t.stop());
  rec.start();
  return {
    async stop() {
      if (rec.state !== 'inactive') rec.stop();
      await done;
      release();
      const type = rec.mimeType || chunks[0]?.type || 'audio/webm';
      return new File(chunks, `${baseName}.${extensionFor(type)}`, { type: type.split(';')[0] });
    },
    cancel() {
      if (rec.state !== 'inactive') rec.stop();
      release();
    },
  };
}
