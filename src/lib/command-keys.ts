//Gives every command palette command a place in the keymap (lib/keymap.ts), so it shows in the shortcuts sheet and can be given a key
//(most have none until someone sets one). The palette (lib/commands.ts) is the list of "do this" actions the editor has, so a command
//added there is keyable straight away, and test/keymap-coverage.test.ts fails for a menu or tool bar action that is in neither.
import { createProject } from 'interactives-player';
import { EditorStore, maybeStore, setCurrentStore, store } from '../store/store';
import { buildCommands, type CommandGroup } from './commands';
import { commandById, keymapIdFor, registerCommand, runnerOf, setRunner, type CommandDef, type Context } from './keymap';

const GROUP_OF: Record<CommandGroup, { group: CommandDef['group']; context: Context; edits: boolean } | null> = {
  Add: { group: 'Add', context: 'canvas', edits: true },
  Selection: { group: 'Arrange', context: 'canvas', edits: true },
  Pages: { group: 'Pages', context: 'canvas', edits: true },
  Layers: null,
  Animate: { group: 'Animate', context: 'canvas', edits: true },
  Behaviours: { group: 'Behaviours', context: 'canvas', edits: true },
  View: { group: 'View', context: 'canvas', edits: false },
  Tools: { group: 'Tools', context: 'canvas', edits: false },
  Panels: { group: 'Panels and help', context: 'everywhere', edits: false },
  Workspaces: { group: 'Workspaces', context: 'everywhere', edits: false },
  Questions: { group: 'Questions', context: 'canvas', edits: true },
  Project: { group: 'Project', context: 'everywhere', edits: false },
};

/** Do what the palette's command does now, or say why it cannot (a key press with nothing picked gets "Select a layer first"). */
function runFromPalette(paletteId: string): (e?: KeyboardEvent) => boolean {
  //(a palette command that hands back to its keymap command, with none of its own wired yet, must not loop)
  let running = false;
  return (e) => {
    if (running) return false;
    const c = buildCommands().find((x) => x.id === paletteId);
    if (!c) return false;
    e?.preventDefault();
    running = true;
    try {
      if (c.disabled) store().toast(c.disabled, 'info');
      else c.run();
    } finally {
      running = false;
    }
    return true;
  };
}

let done = false;

/** Register the palette's commands with the keymap. Safe to call again; needs no open project (it borrows an empty one to list them). */
export function ensureCommandKeys(): void {
  if (done) return;
  done = true;
  const had = maybeStore();
  if (!had) setCurrentStore(new EditorStore(createProject('keys')));
  try {
    for (const c of buildCommands()) {
      const def = GROUP_OF[c.group];
      if (!def || c.dynamic) continue;
      const id = keymapIdFor(c.id);
      //The ones the keymap already had stay as they are, with their keys; one with no runner of its own does what the palette's does
      if (commandById(id)) {
        if (!runnerOf(id)) setRunner(id, runFromPalette(c.id));
        continue;
      }
      registerCommand({ id, name: c.title, group: def.group, context: def.context, keys: [], edits: def.edits, words: c.words }, runFromPalette(c.id));
    }
  } finally {
    if (!had) setCurrentStore(null);
  }
}
