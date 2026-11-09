import { useState } from 'react';
import { usePrefs } from '../lib/prefs';
import { IconButton } from './ui';
import { Icons } from './icons';
import { BUILT_IN, applyWorkspace, deleteWorkspace, renameWorkspace, saveWorkspace, savedWorkspaces, MAX_SAVED } from '../lib/workspaces';
import { confirmDialog, promptDialog } from './dialogs';

/**
 * Workspace: switch the whole panel arrangement in one go (the built-in ones, or ones saved under a name), and save
 * the current one. Only offered in the editor, where there are panels to arrange.
 */
export function WorkspacePrefs() {
  usePrefs();
  const saved = savedWorkspaces();
  const [applied, setApplied] = useState<string | null>(null);
  const use = (id: string, w: Parameters<typeof applyWorkspace>[0]) => {
    applyWorkspace(w);
    setApplied(id);
  };
  return (
    <section className="prefs-workspaces" aria-label="Workspace">
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
