//Every tool, panel, window and action in the editor has a place in the keymap, so it shows in the shortcuts sheet and can be given a
//key. This walks the command palette, the tool list, the panels, the top bar and the right-click menus, and fails for one that is
//not in the registry (unless it is on the allow list below, with the reason it must not be keyed).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createNode, createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { buildCommands } from '../src/lib/commands';
import { ensureCommandKeys } from '../src/lib/command-keys';
import { installEditorKeys } from '../src/lib/editor-keys';
import { ALL_PANELS } from '../src/lib/dock';
import { COMMANDS, GROUPS, commandById, keymapIdFor, runnerOf } from '../src/lib/keymap';

const src = (f: string) => readFileSync(resolve(__dirname, '../src', f), 'utf8');

let s: EditorStore;
beforeAll(() => {
  const p = createProject('Keys');
  const a = p.artboards[0];
  a.children.push(createNode('rect', { id: 'a', name: 'A', x: 10, y: 10, width: 40, height: 40 }), createNode('text', { id: 'b', name: 'B', x: 80, y: 80 }));
  s = new EditorStore(p);
  s.addArtboard();
  s.select(['a']);
  setCurrentStore(s);
  ensureCommandKeys();
  installEditorKeys(() => undefined);
});

//A command the palette has runs from its key by the palette's own code; the ones a panel handles itself (the Timeline's, the
//graph's, the Help and palette keys) are in the keymap and answered where they live
const keyed = (id: string) => {
  expect(commandById(id), `${id} is in the keymap`).toBeTruthy();
  if (buildCommands().some((c) => keymapIdFor(c.id) === id)) expect(runnerOf(id), `${id} does something when its key is pressed`).toBeTypeOf('function');
};

describe('the registry', () => {
  it('has a unique id, a plain name and a known group for every command, and ids the server keeps', () => {
    const ids = new Set<string>();
    for (const c of COMMANDS) {
      expect(ids.has(c.id), `${c.id} twice`).toBe(false);
      ids.add(c.id);
      expect(c.id).toMatch(/^[a-z][a-z0-9.-]{0,59}$/i);
      expect(c.name.trim().length).toBeGreaterThan(2);
      expect(GROUPS as readonly string[], `${c.id}'s group`).toContain(c.group);
    }
  });
});

describe('the command palette', () => {
  it('has a keymap command for every command that is not one of a list that follows the project', () => {
    const list = buildCommands();
    expect(list.length).toBeGreaterThan(100);
    const missed: string[] = [];
    for (const c of list) {
      if (c.dynamic) continue;
      const id = keymapIdFor(c.id);
      if (!commandById(id) || !runnerOf(id)) missed.push(`${c.id} (${c.title})`);
    }
    expect(missed).toEqual([]);
  });

  it('only leaves the lists that follow the project without a key: a page, a layer, a saved workspace', () => {
    const dyn = buildCommands().filter((c) => c.dynamic);
    expect(dyn.length).toBeGreaterThan(0);
    for (const c of dyn) expect(/^(page:n|page:[a-z]\w*|layer:|workspace:)/.test(c.id) && /^(Go to page|Select layer|Workspace)/.test(c.title)).toBe(true);
  });

  it('shows the key in the palette hint, whoever set it', () => {
    const fit = buildCommands().find((c) => c.id === 'page:fit-selection');
    expect(fit?.hint).toMatch(/Ctrl \+ Alt \+ Shift \+ F/);
    expect(buildCommands().find((c) => c.id === 'panel:layers')?.hint).toBeUndefined();
  });
});

describe('tools and panels', () => {
  it('has a command for every tool in the tool bar and in the Tool type', () => {
    const editor = src('Editor.tsx');
    const bar = [...editor.matchAll(/\{ tool: '(\w+)', icon:/g)].map((m) => m[1]);
    expect(bar.length).toBeGreaterThan(20);
    const type = src('store/store.ts').match(/export type Tool =([^;]+);/)![1];
    const all = new Set([...bar, ...[...type.matchAll(/'(\w+)'/g)].map((m) => m[1])]);
    //(the Tool type also has the modes that are not in the bar, which have no key either way)
    for (const t of all) keyed(`tool.${t}`);
  });

  it('has a command for every panel', () => {
    for (const p of ALL_PANELS) keyed(`panel.${p}`);
  });

  it('has a command for every workspace that comes built in', () => {
    for (const id of ['standard', 'essentials', 'animate', 'interactions', 'canvas', 'review']) keyed(`workspace.${id}`);
  });
});

describe('the top bar, the dialogs and the windows', () => {
  //Each action in the top bar, and the window or dialog it opens, with the command that does it
  const TOP: Record<string, string> = {
    'All projects': 'project.home',
    'Revision history': 'project.history',
    Undo: 'undo',
    Redo: 'redo',
    'Zoom out': 'zoom-out',
    'Zoom in': 'zoom-in',
    'Fit all': 'zoom-fit',
    Preferences: 'project.prefs',
    'Command palette': 'palette',
    Help: 'help-search',
    Preview: 'project.preview',
    'Export: Single HTML file': 'project.export-html',
    'Export: Project package': 'project.export-package',
    'Export: Project JSON': 'project.export-json',
    'Export: Public interface reference': 'project.reference',
    'Export: TypeScript definitions': 'project.export-dts',
    'Export: Lottie JSON': 'project.export-lottie',
    'Export: dotLottie': 'project.export-dotlottie',
    'Export: PNG image': 'project.export-png',
    'Export: PNG image, 1x': 'project.export-png-1x',
    'Export: SVG image': 'project.export-svg',
    'Export: Video, GIF or frames': 'project.motion',
    'Share: Share': 'project.share',
    'Share: Invite to collaborate': 'project.invite',
    'Share: Save as template': 'project.template',
    'Share: Share for review': 'project.review',
    'Keyboard shortcuts': 'shortcuts',
    'Paste questions': 'question.paste',
    'Import a GIFT file': 'question.gift',
    'Insert component picker': 'insert-component',
  };
  it('has a command for each', () => {
    for (const id of Object.values(TOP)) keyed(id);
  });
  it('lists the Export and Share menu items of the top bar, so a new one is not forgotten here', () => {
    const editor = src('Editor.tsx');
    const bar = editor.slice(editor.indexOf('<header className="topbar">'), editor.indexOf('const toolTip'));
    const items = [...bar.matchAll(/<button onClick=\{[^\n]*\}>\n\s+([^\n<]+)\n/g)].map((m) => m[1].trim());
    expect(items.length).toBeGreaterThanOrEqual(15);
    const named = Object.keys(TOP).map((k) => k.replace(/^(Export|Share): /, ''));
    for (const label of items) {
      const short = label.replace(/…$/, '').replace(/ \(.*\)$/, '').replace(/ \(\.\w+\)$/, '');
      expect(
        named.some((n) => short.toLowerCase().startsWith(n.toLowerCase()) || n.toLowerCase().startsWith(short.toLowerCase().replace(/^project package.*/, 'project package'))),
        `top bar item "${label}" is not in the keymap table of this test`,
      ).toBe(true);
    }
  });
});

//The right-click menus. Each label in a menu's source is a command, or is listed here with why it is not one of its own
const ALLOW = (why: string) => `!${why}`;
const MENUS: Record<string, Record<string, string>> = {
  'canvas/Canvas.tsx': {
    'Add interaction': ALLOW('a heading over its two choices below'),
    Animate: ALLOW('a heading over the animation presets, each its own animate.* command'),
    'Bring forward': 'forward',
    'Bring to front': 'front',
    'Send backward': 'backward',
    'Send to back': 'back',
    Order: ALLOW('a heading over the four order commands'),
    New: ALLOW('a heading over the layer types, each its own add.* command'),
    'Combine shapes': ALLOW('a heading over the four combine commands'),
    Button: 'add.button',
    Chart: 'add.chart',
    Ellipse: 'add.ellipse',
    Embed: 'add.embed',
    Frame: 'add.frame',
    'Input field': 'add.input',
    Link: 'add.link',
    Polygon: 'add.polygon',
    'Progress bar': 'add.progress',
    Rectangle: 'add.rect',
    'Script layer': 'add.draw',
    'Shader layer': 'add.shader',
    Star: 'add.star',
    Text: 'add.text',
    Video: 'add.video',
    Copy: 'copy',
    Cut: 'cut',
    Paste: 'paste',
    'Crop picture': 'enter',
    'Edit text': 'enter',
    Delete: 'delete',
    Duplicate: 'duplicate',
    'Empty On click event': 'behaviour.empty-click',
    'Empty On hover event': 'behaviour.empty-hover',
    'Fit page to its layers': 'fit-page-layers',
    'Fit page to selection': 'fit-page-selection',
    'Fit page to selection with space around…': 'fit-page-padding',
    Group: 'group',
    Ungroup: 'ungroup',
    Help: 'help-context',
    'Insert component here…': 'insert-component',
    Lock: 'lock-layers',
    'Make start page': 'page.start',
    'New page here': 'add.page',
    'Tidy up pages': 'page.tidy',
    'When clicked…': 'behaviour.click',
    'When hovered…': 'behaviour.hover',
    'Zoom to fit everything': 'zoom-fit',
    'Zoom to page': 'zoom-page',
  },
  'lib/artboard-commands.ts': {
    'Fit page to selection': 'fit-page-selection',
    'Fit page to selection with space around…': 'fit-page-padding',
    Duplicate: 'page.duplicate',
    'Edit master': 'page.edit-master',
    'Group pages…': 'page.group',
    'Link colours to tokens…': 'page.link-colours',
    'Make this a master': 'page.master',
    'Not a page master': 'page.unmaster',
    'Rename group…': 'page.rename-group',
    'Select all in group': 'page.select-group',
    Ungroup: 'page.ungroup',
    'Use as master for…': ALLOW('opens the Page master section of the Properties panel, which Properties (panel.inspector) already reaches'),
    'Group name': ALLOW('the label of a name field in a dialog, not an action'),
    'Space around the layers, in pixels': ALLOW('the label of a number field in a dialog, not an action'),
  },
  'lib/layer-find.ts': { 'Select same fill': 'sel.same-fill', 'Select same font': 'sel.same-font' },
  'lib/components.ts': { 'Place in…': ALLOW('a list of the pages to choose from; Insert component here… is the keyed way in from the other side') },
  'canvas/Rulers.tsx': {
    'Remove guide': ALLOW('acts on the one guide the pointer is on; Clear all guides is a command'),
    'Make it universal': ALLOW('acts on the one guide the pointer is on'),
  },
  'canvas/PageLinkLayer.tsx': { 'No page (remove the link)': ALLOW('one choice in a list of pages for a link arrow') },
  'lib/guides.ts': {
    'Clear all guides': 'view.guides-clear',
    'Clear this page’s guides': ALLOW('one choice of Clear all guides (it asks which)'),
    'Clear universal guides': ALLOW('one choice of Clear all guides (it asks which); the palette has its own command'),
  },
  'panels/LeftPanel.tsx': { 'Make start page': 'page.start' },
  'components/Dock.tsx': {
    ...Object.fromEntries(
      [
        ['Accessibility', 'a11y'],
        ['Assets', 'assets'],
        ['Attributions', 'credits'],
        ['Checklist', 'checklist'],
        ['Comments', 'comments'],
        ['Data', 'data'],
        ['Fill in', 'content'],
        ['Icons', 'icons'],
        ['Insights', 'insights'],
        ['Interactions', 'logic'],
        ['Layers', 'layers'],
        ['Libraries', 'libraries'],
        ['Properties', 'inspector'],
        ['Public interface', 'interface'],
        ['Scripts', 'scripts'],
        ['Themes', 'themes'],
        ['Timeline', 'timeline'],
        ['Usage', 'usage'],
        ['Variables', 'variables'],
      ].map(([l, p]) => [l, `panel.${p}`]),
    ),
    'Dock at the bottom': ALLOW('where a panel sits is set by dragging it or by this menu; Reset panel layout is a command'),
    'Dock at the top': ALLOW('where a panel sits is set by dragging it or by this menu; Reset panel layout is a command'),
    'Dock on the left': ALLOW('where a panel sits is set by dragging it or by this menu; Reset panel layout is a command'),
    'Dock on the right': ALLOW('where a panel sits is set by dragging it or by this menu; Reset panel layout is a command'),
    Floating: ALLOW('where the tools sit is set by dragging them or by this menu'),
    'Float in its own window': ALLOW('where a panel sits is set by dragging it or by this menu'),
    'Help for the tools': 'help-context',
    'Help for this panel': 'help-context',
    'Reset panel layout': 'dock.reset',
    'Show all panels and tools': 'dock.show-all',
  },
  'panels/LogicGraph.tsx': {
    'Tidy up': 'graph-tidy',
    'Tidy up the graph': 'graph-tidy',
    Copy: 'graph-copy',
    Cut: 'graph-cut',
    Paste: 'paste',
    Duplicate: 'graph-duplicate',
    Delete: 'graph-delete',
    'Edit text': 'graph-edit-note',
    'Put in a new group': 'graph-group',
    ...Object.fromEntries(
      [
        'Add node here',
        'Add note here',
        'Add note to this group',
        'Add note to this node',
        'All connections',
        'Amber',
        'Blue',
        'Colour',
        'Connect to existing node',
        'Connect to new node',
        'Copy group and its nodes',
        'Delete connection',
        'Delete note',
        'Disconnect',
        'Duplicate group and its nodes',
        'Expression…',
        'Green',
        'Grey',
        'Help for this node',
        'Name',
        'New group here',
        'No other nodes to connect to',
        'Purple',
        'Red',
        'Rename…',
        'Stop following',
        'Ungroup (keep the nodes)',
      ].map((l) => [l, ALLOW('acts on the one node, group, note or connection you right-click, or is placed where you right-click; the graph keys (Delete, Ctrl+G, Ctrl+D...) and the palette search cover the picked ones')]),
    ),
  },
};

describe('the right-click menus', () => {
  for (const [file, labels] of Object.entries(MENUS)) {
    it(`${file}: every menu label is a command, or says why not`, () => {
      const text = src(file);
      //The labels written out as text in a menu item ('label: "..."'), the way every menu in this suite is built
      const found = new Set([...text.matchAll(/label: '((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'")));
      const unlisted = [...found].filter((l) => !(l in labels));
      expect(unlisted, `${file} has a menu label that is not in this test's table: add the command (lib/commands.ts) or allow-list it with a reason`).toEqual([]);
      for (const [label, target] of Object.entries(labels)) {
        if (target.startsWith('!')) {
          expect(target.length, `${label} needs a reason`).toBeGreaterThan(12);
          continue;
        }
        keyed(target);
        void label;
      }
    });
  }
});

describe('the other places a command can be asked for', () => {
  it('has the timeline, graph and view commands the tool bars have', () => {
    for (const id of ['timeline-play', 'timeline-start', 'timeline-record', 'timeline-new', 'timeline-list', 'graph-tidy', 'graph-add-note', 'zoom-page', 'zoom-in', 'zoom-out', 'toggle-grid', 'toggle-rulers', 'snap-grid']) expect(commandById(id), id).toBeTruthy();
  });
  it('has the snapping toggles, the guides, the animation presets, the recipes and the questions', () => {
    for (const id of ['snap.on', 'view.guides-lock', 'view.notes', 'animate.fadeIn', 'behaviour.click', 'question.single', 'page.arrows']) keyed(id);
  });
});
