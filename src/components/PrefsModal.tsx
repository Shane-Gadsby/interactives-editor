import { useEffect } from 'react';
import { BUILD_ID, VERSION, VERSION_LABEL } from '../lib/version';
import { setPrefs, usePrefs } from '../lib/prefs';
import { IconButton, SelectField, CheckField, TextField } from './ui';
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
          <span className="version-tag" title={`${VERSION_LABEL}. Mention it when reporting a problem`}>v{VERSION} · {BUILD_ID}</span>
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
          <TextField
            label="Default font"
            title="Font for new text, buttons, inputs and links, included in every new project. Any Google font name works"
            value={p.defaultFont}
            placeholder="Open Sans"
            commitOnBlur
            onChange={(v) => setPrefs({ defaultFont: v.trim() || 'Open Sans' })}
          />
          <CheckField label="Show rulers" title="Rulers along the canvas edges; drag from them to make guides (Shift+R)" value={p.rulers} onChange={(v) => setPrefs({ rulers: v })} />
          <CheckField
            label="Show layers outside clipped artboards"
            title="Draws the parts of layers that hang outside an artboard that clips faintly beside it, so you can still see and pick them. Preview and exports still clip"
            value={p.ghostOutside}
            onChange={(v) => setPrefs({ ghostOutside: v })}
          />
          <CheckField
            label="Accessibility features"
            title="Layer roles, tab stops that Enter and Space click, the focus ring and screen reader announcements while you Preview. Switch it off to see whether a problem comes from it"
            value={p.accessibility}
            onChange={(v) => setPrefs({ accessibility: v })}
          />
          <CheckField
            label="Screen reader strip"
            title="A strip under Preview showing what a screen reader would be told by Announce nodes and ix.announce, as it is spoken. Off by default; it needs Accessibility features on"
            value={p.screenReader}
            onChange={(v) => setPrefs({ screenReader: v })}
          />
          <CheckField
            label="Comment notices"
            title="Tell me (a bell on the projects page, a message while a project is open) when a review comment is handed to me, mentions me, or gets a reply in a conversation I am in"
            value={p.commentNotices}
            onChange={(v) => setPrefs({ commentNotices: v })}
          />
          <CheckField label="Show tooltips" title="Explanations when you hover buttons and field names" value={p.tooltips} onChange={(v) => setPrefs({ tooltips: v })} />
          <p className="hint">These settings are yours: they follow you to any browser you sign in on.</p>
        </div>
      </div>
    </div>
  );
}
