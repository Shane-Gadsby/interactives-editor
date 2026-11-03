import { useEffect } from 'react';
import { setPrefs, usePrefs } from '../lib/prefs';
import { IconButton, SelectField, CheckField } from './ui';
import { Icons } from './icons';
import { HelpLink } from '../help/Help';

/** Personal preferences, kept in this browser. */
export function PrefsModal({ onClose }: { onClose: () => void }) {
  const p = usePrefs();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal prefs-modal">
        <header>
          <strong>Preferences</strong>
          <HelpLink topic="preferences" />
          <div className="spacer" />
          <IconButton icon={<Icons.close />} title="Close (Esc)" onClick={onClose} />
        </header>
        <div className="prefs-body">
          <SelectField<'zoom' | 'ctrl'>
            label="Mouse wheel"
            title="What scrolling the mouse wheel over the canvas does. Ctrl/Cmd+wheel and trackpad pinch always zoom."
            value={p.wheel}
            options={[
              { value: 'zoom', label: 'Zoom (Shift+wheel pans)' },
              { value: 'ctrl', label: 'Pan (Ctrl+wheel zooms)' },
            ]}
            onChange={(v) => setPrefs({ wheel: v })}
          />
          <SelectField<'dark' | 'light' | 'auto'>
            label="Theme"
            title="Colours of the editor. Auto follows your system's light or dark setting"
            value={p.theme}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'auto', label: 'Auto (follow the system)' },
            ]}
            onChange={(v) => setPrefs({ theme: v })}
          />
          <CheckField label="Show rulers" title="Rulers along the canvas edges; drag from them to make guides (Shift+R)" value={p.rulers} onChange={(v) => setPrefs({ rulers: v })} />
          <CheckField label="Show tooltips" title="Explanations when you hover buttons and field names" value={p.tooltips} onChange={(v) => setPrefs({ tooltips: v })} />
          <p className="hint">These settings are yours and stay in this browser.</p>
        </div>
      </div>
    </div>
  );
}
