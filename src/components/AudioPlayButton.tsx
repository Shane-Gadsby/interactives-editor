import { useState } from 'react';
import { playAudio, stopAudio, useAudioPlaying } from '../lib/audio-player';

/**
 * Play / Stop for one sound, through the editor's shared player (so it also stops whatever else was playing). `source` finds the url when it is
 * pressed: a recording's own blob, or an asset that may still have to be fetched. A plain-words reason in `off` turns it off and says why.
 */
export function AudioPlayButton({ playKey, source, off, label = 'Play', title, onProblem }: { playKey: string; source: () => Promise<string | undefined>; off?: string; label?: string; title: string; onProblem?: (text: string) => void }) {
  const playing = useAudioPlaying(playKey);
  const [loading, setLoading] = useState(false);
  const press = async () => {
    if (playing) return stopAudio(playKey.split('|')[0]);
    setLoading(true);
    try {
      const src = await source();
      if (!src) return void onProblem?.('That sound could not be found. It may still be loading: try again in a moment.');
      await playAudio(playKey, src);
    } catch {
      onProblem?.('The browser could not play that sound.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      <button className="btn" type="button" disabled={!!off || loading} title={off ?? (playing ? 'Stop the sound' : title)} onClick={() => void press()}>
        {playing ? 'Stop' : label}
      </button>
      <span className="sr-only" role="status">
        {playing ? 'Playing...' : ''}
      </span>
    </>
  );
}
