import { useEffect, useState } from 'react';
import { VersionInfo } from './VersionInfo';
import { DEFAULT_FONT, setPrefs, usePrefs, type Prefs } from '../lib/prefs';
import { SNAP_DISTANCE_RANGE, SNAP_ITEMS } from '../lib/snapping';
import { FontField } from './FontPicker';
import { IconButton, SelectField, CheckField, NumberField } from './ui';
import { cleanGrid, GRID_PRESETS, GRID_SIZE_RANGE, GRID_SUBDIV_RANGE } from '../lib/grid';
import { Icons } from './icons';
import { HelpLink } from '../help/Help';
import { BUILT_IN, applyWorkspace, deleteWorkspace, renameWorkspace, saveWorkspace, savedWorkspaces, MAX_SAVED } from '../lib/workspaces';
import { confirmDialog, promptDialog } from './dialogs';
import { restartTips, stripShown } from '../lib/onboarding';

/** Personal preferences, kept in this browser. */
export function PrefsModal({ onClose, workspace = false }: { onClose: () => void; workspace?: boolean }) {
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
          <VersionInfo />
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
          <FontField
            label="Default font"
            title="Font for new text, buttons, inputs and links, included in every new project. Search any Google font, or type a name"
            value={p.defaultFont}
            system={false}
            placeholder="Open Sans"
            typedLabel={(name) => `Use “${name}” (not in the list)`}
            onPick={(o) => setPrefs({ defaultFont: o.family.trim() || DEFAULT_FONT })}
          />
          <section className="prefs-canvas" aria-label="Canvas">
            <div className="field-label block">Canvas</div>
            <CheckField label="Show rulers" title="Rulers along the canvas edges; drag from them to make guides (Shift+R)" value={p.rulers} onChange={(v) => setPrefs({ rulers: v })} />
            <CheckField label="Show grid" title="Draws the grid on the artboards. Only the canvas shows it: Preview and exports never do (Shift+G)" value={p.showGrid} onChange={(v) => setPrefs({ showGrid: v })} />
            <CheckField label="Snapping" title="Every snap target on or off together; the ticks below are kept while it is off. Hold Ctrl while dragging to skip snapping for that drag (the Snap button on the tool bar has the same choices)" value={p.snapOn} onChange={(v) => setPrefs({ snapOn: v })} />
            {SNAP_ITEMS.map((i) => (
              <CheckField key={i.kind} label={`Snap to ${i.label.toLowerCase()}`} title={i.tip} value={!!p[i.pref]} disabled={!p.snapOn} onChange={(v) => setPrefs({ [i.pref]: v } as Partial<Prefs>)} />
            ))}
            <CheckField label="Layers: all, not just siblings" title="Layers snap to every layer on the artboard, not only the ones beside the layer you drag" value={p.snapLayersAll} disabled={!p.snapOn || !p.snapLayers} onChange={(v) => setPrefs({ snapLayersAll: v })} />
            <NumberField label="Snap distance" title="How close (screen pixels) an edge has to come to a target to snap to it" value={p.snapDistance} min={SNAP_DISTANCE_RANGE.min} max={SNAP_DISTANCE_RANGE.max} suffix="px" onChange={(v) => setPrefs({ snapDistance: Math.min(SNAP_DISTANCE_RANGE.max, Math.max(SNAP_DISTANCE_RANGE.min, Math.round(v))) })} />
            <NumberField
              label="Grid size"
              title="The width and height of one grid cell in pixels, measured from the artboard's top left corner. An artboard can have its own (right-click the artboard)"
              value={p.gridSize}
              min={GRID_SIZE_RANGE.min}
              max={GRID_SIZE_RANGE.max}
              suffix="px"
              onChange={(v) => setPrefs({ gridSize: cleanGrid({ size: v }).size })}
            />
            <div className="chip-row" role="group" aria-label="Grid size presets">
              {GRID_PRESETS.map((n) => (
                <button key={n} type="button" className={`chip${p.gridSize === n ? ' on' : ''}`} aria-pressed={p.gridSize === n} onClick={() => setPrefs({ gridSize: n })}>
                  {n}
                </button>
              ))}
            </div>
            <NumberField
              label="Stronger line every"
              title="Every this many cells the grid line is drawn stronger. 1 draws them all the same. Shift+arrow nudges by this many cells"
              value={p.gridSubdivisions}
              min={GRID_SUBDIV_RANGE.min}
              max={GRID_SUBDIV_RANGE.max}
              suffix="cells"
              onChange={(v) => setPrefs({ gridSubdivisions: cleanGrid({ subdivisions: v }).subdivisions })}
            />
          </section>
          <CheckField
            label="Show layers outside clipped artboards"
            title="Draws the parts of layers that hang outside an artboard that clips faintly beside it, so you can still see and pick them. Preview and exports still clip"
            value={p.ghostOutside}
            onChange={(v) => setPrefs({ ghostOutside: v })}
          />
          <CheckField
            label="Show notes on the canvas"
            title="The sticky notes authors leave on the canvas, including the explanations a template comes with. Players, Preview and exports never show them, whatever this says"
            value={p.showNotes}
            onChange={(v) => setPrefs({ showNotes: v })}
          />
          <CheckField
            label="Technical wording"
            title="Show the interaction nodes by the names they have in the file (On pointer, Set variable, Control timeline) instead of plain wording (When clicked or hovered, Change a value or counter, Play or stop an animation). Search and help find either name whichever is on screen"
            value={p.technicalWording}
            onChange={(v) => setPrefs({ technicalWording: v })}
          />
          <CheckField
            label="Ask what a picture shows"
            title="When you add a picture or video, a small box on its settings asks what it shows, so it gets a text alternative for screen readers. You can skip it or mark the picture decorative, and it never stops you carrying on. Switch it off if you add a lot of pictures at once"
            value={p.askPictureDescription}
            onChange={(v) => setPrefs({ askPictureDescription: v })}
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
          <CheckField
            label="Getting started strip"
            title="The five jobs along the top of the editor (add a shape, move it, make it do something when clicked, preview, share) that tick themselves as you do them. It puts itself away for good once all five are done"
            value={stripShown(p)}
            onChange={(v) => (v ? restartTips() : setPrefs({ gettingStarted: false }))}
          />
          {workspace && <WorkspaceSection />}
          <p className="hint">These settings are yours: they follow you to any browser you sign in on.</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Workspace: switch the whole panel arrangement in one go (the built-in ones, or ones saved under a name), and save
 * the current one. Only offered in the editor, where there are panels to arrange.
 */
function WorkspaceSection() {
  usePrefs();
  const saved = savedWorkspaces();
  const [applied, setApplied] = useState<string | null>(null);
  const use = (id: string, w: Parameters<typeof applyWorkspace>[0]) => {
    applyWorkspace(w);
    setApplied(id);
  };
  return (
    <section className="prefs-workspaces" aria-label="Workspace">
      <div className="field-label block">Workspace</div>
      <p className="hint">The panels' arrangement: where each one is docked or floating, the panel widths and the height of the bottom area.</p>
      <div className="ws-list">
        {BUILT_IN.map((w) => (
          <button key={w.id} type="button" className={`ws-item${applied === w.id ? ' on' : ''}`} title={w.about} onClick={() => use(w.id, w.make())}>
            <span className="ws-name">{w.name}</span>
            <span className="ws-about">{w.about}</span>
          </button>
        ))}
      </div>
      {saved.length > 0 && (
        <div className="ws-list">
          {saved.map((w) => (
            <div key={w.id} className={`ws-item ws-saved${applied === w.id ? ' on' : ''}`}>
              <button type="button" className="ws-main" title={`Switch to ${w.name}`} onClick={() => use(w.id, w)}>
                <span className="ws-name">{w.name}</span>
                <span className="ws-about">Saved</span>
              </button>
              <IconButton
                icon={<Icons.pencil width={13} />}
                title="Rename"
                onClick={async () => {
                  const v = await promptDialog({ title: 'Rename workspace', label: 'Name', initial: w.name, confirmLabel: 'Rename' });
                  if (v !== null) renameWorkspace(w.id, v);
                }}
              />
              <IconButton
                icon={<Icons.trash width={13} />}
                title="Delete this workspace"
                onClick={async () => {
                  if (await confirmDialog({ title: 'Delete workspace', message: `Delete “${w.name}”? The panels stay as they are now.`, confirmLabel: 'Delete', danger: true })) deleteWorkspace(w.id);
                }}
              />
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        className="btn"
        title={`Keep the panels as they are now under a name of your own${saved.length >= MAX_SAVED ? ` (you have ${MAX_SAVED}, the oldest makes way)` : ''}`}
        onClick={async () => {
          const name = await promptDialog({
            title: 'Save workspace',
            label: 'Name',
            placeholder: 'e.g. Animating on the laptop',
            confirmLabel: 'Save',
            validate: (v) => (v.trim() ? null : 'Give it a name'),
          });
          if (name) saveWorkspace(name);
        }}
      >
        Save current layout as…
      </button>
    </section>
  );
}
