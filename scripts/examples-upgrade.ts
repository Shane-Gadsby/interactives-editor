/**
 * Brings the shipped examples (examples/<key>/project.json) up to the editor's native features, tidies them and gives each one or
 * two author notes. It is the body of `node scripts/upgrade-examples.mjs` (which loads it through vite so it can import the
 * editor's own helpers). Safe to run again: every change checks what is there first, the tidies settle where they are, and the
 * notes have fixed ids that are replaced, so a second run writes the same files.
 *
 * It edits the raw project JSON (not a normalised copy) so a diff only shows what changed, and writes it back in the same compact
 * form the export script uses.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { makeNote, prepareNodes, relayoutTree, startingValue, type Artboard, type Note, type NoteColour, type Project, type SceneNode } from 'interactives-player';
import { applyTidy } from '../src/lib/artboard-tidy';
import { tidyBoardGraph } from '../src/lib/branded/graph-kit';

export const EXAMPLE_NOTE_PREFIX = 'note_example_';

// ------------------------------------------------------------------ helpers

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function walk(list: Raw[], fn: (n: Raw, parent: Raw[], at: number) => void): void {
  list.forEach((n, i) => {
    fn(n, list, i);
    if (Array.isArray(n.children)) walk(n.children, fn);
  });
}

function find(ab: Raw, name: string): Raw {
  let hit: Raw | undefined;
  walk(ab.children, (n) => {
    if (!hit && n.name === name) hit = n;
  });
  if (!hit) throw new Error(`no layer "${name}" on "${ab.name}"`);
  return hit;
}

function logicNode(ab: Raw, kind: string, pick?: (n: Raw) => boolean): Raw {
  const n = ab.logic.nodes.find((x: Raw) => x.kind === kind && (!pick || pick(x)));
  if (!n) throw new Error(`no ${kind} node on "${ab.name}"`);
  return n;
}

let counter = 0;
const nid = (prefix: string) => `${prefix}ex${(++counter).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** A fixed id per example and note, so a second run replaces rather than adds. */
const noteId = (key: string, n: number) => `${EXAMPLE_NOTE_PREFIX}${key.replace(/[^a-z0-9]/g, '_')}_${n}`;

// ------------------------------------------------------------------ notes

interface NoteSpec {
  /** Which artboard (by index); default the first. */
  page?: number;
  text: string;
  colour?: NoteColour;
  w?: number;
}

/** A guess at how tall a note has to be for its text (the editor wraps it itself; this only has to be roomy enough). */
function noteHeight(text: string, w: number): number {
  const perLine = Math.max(10, Math.floor((w - 28) / 7));
  const lines = text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.replace(/\*\*|`/g, '').length / perLine)), 0);
  return Math.max(72, 30 + lines * 19);
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const hits = (a: Box, b: Box, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

/** Everything on the canvas a note should keep clear of: every artboard, and every layer parked outside its own artboard. */
function canvasObstacles(p: Raw): Box[] {
  const out: Box[] = [];
  for (const ab of p.artboards as Raw[]) {
    out.push({ x: ab.canvasX, y: ab.canvasY, w: ab.width, h: ab.height });
    for (const n of ab.children as Raw[]) {
      const inside = n.x >= 0 && n.y >= 0 && n.x + n.width <= ab.width && n.y + n.height <= ab.height;
      if (!inside) out.push({ x: ab.canvasX + n.x, y: ab.canvasY + n.y, w: n.width, h: n.height });
    }
  }
  return out;
}

/** The first free place beside an artboard (right, then below, left, above) for a note of this size; local to the artboard. */
function freeSpot(ab: Raw, obstacles: Box[], w: number, h: number): { x: number; y: number } {
  const gap = 36;
  const at = (lx: number, ly: number): Box => ({ x: ab.canvasX + lx, y: ab.canvasY + ly, w, h });
  const right = (step: number) => ({ x: ab.width + gap, y: step * (h + 16) });
  const below = (step: number) => ({ x: step * (w + 16), y: ab.height + gap });
  const left = (step: number) => ({ x: -w - gap, y: step * (h + 16) });
  const above = (step: number) => ({ x: step * (w + 16), y: -h - gap });
  //the right of the artboard first, then under it, then the left, then further down the right and above
  const candidates = [right(0), ...[0, 1, 2, 3].map(below), ...[0, 1, 2, 3].map(left), ...[1, 2, 3, 4, 5].map(right), ...[0, 1, 2, 3].map(above)];
  const free = candidates.find((c) => !obstacles.some((o) => hits(at(c.x, c.y), o, 12)));
  return free ?? candidates[0];
}

function setNotes(p: Raw, key: string, specs: NoteSpec[]): void {
  for (const ab of p.artboards as Raw[]) {
    if (!Array.isArray(ab.notes)) continue;
    ab.notes = ab.notes.filter((n: Raw) => !String(n.id).startsWith(`${EXAMPLE_NOTE_PREFIX}${key.replace(/[^a-z0-9]/g, '_')}_`));
    if (!ab.notes.length) delete ab.notes;
  }
  const obstacles = canvasObstacles(p);
  specs.forEach((spec, i) => {
    const ab = (p.artboards as Raw[])[spec.page ?? 0];
    const w = spec.w ?? 260;
    const h = noteHeight(spec.text, w);
    const at = freeSpot(ab, obstacles, w, h);
    const note: Note = makeNote({ id: noteId(key, i + 1), x: at.x, y: at.y, w, h, text: spec.text, colour: spec.colour, author: 'Example' });
    (ab.notes ??= []).push(note);
    obstacles.push({ x: ab.canvasX + at.x, y: ab.canvasY + at.y, w, h });
  });
}

// ------------------------------------------------------------------ the changes, one example at a time

interface Upgrade {
  /** Edits to the raw project beyond the tidies. Returns a line for the report. */
  edit?: (p: Raw) => string[];
  notes: NoteSpec[];
  /** Run the player's own layout over the artboards (the layout demos store positions from before it ran). */
  relayout?: boolean;
}

const UPGRADES: Record<string, Upgrade> = {
  'first-animation': {
    notes: [{ text: "**Two keyframes make the animation.** Open the Timeline tab and scrub: the Box's X changes between them. Press Play in the Preview to see it run." }],
  },

  'first-interaction': {
    notes: [{ text: "**One event, one action.** The button's click fires *On pointer*, which runs *Play timeline* on Slide. Open the Interactions tab to see the two nodes joined." }],
  },

  lamp: {
    edit(p) {
      const ab = p.artboards[0];
      const sw = find(ab, 'Switch');
      if (sw.bindings?.ariaPressed === 'lit') return [];
      sw.bindings = { ...(sw.bindings ?? {}), ariaPressed: 'lit' };
      return ['Switch button announces its pressed state (ariaPressed bound to lit)'];
    },
    notes: [
      { text: "**Variables drive the picture.** *Switch* toggles `lit` and adds one to `taps`. The Bulb's fill and the counter text read them, so nothing is redrawn by hand." },
      { text: "**Pressed state.** The Switch button's pressed state is bound to `lit` too, so a screen reader announces whether the lamp is on.", colour: 'sky' },
    ],
  },

  blends: {
    notes: [{ text: '**Blend by variable.** The slider sets `mix` from 0 to 1 and *Example blend* mixes the *small and red* and *big and blue* timelines to match. Drag it slowly.' }],
  },

  'canvas-tour': {
    notes: [
      { page: 0, text: '**Practise on this page.** Pan, zoom and click the sun, the title and the backdrop. Each layer you select is highlighted in the Layers panel.' },
      { page: 1, text: '**Pictures outside the page.** The four photos sit above the artboard on purpose. Drag them onto the card and reorder them in the Layers panel.', colour: 'sky' },
    ],
  },

  joysticks: {
    edit(p) {
      const out: string[] = [];
      //page links instead of two hard-wired artboard ids: the canvas order is the page order
      const eyes = p.artboards[0];
      const scrub = p.artboards[1];
      for (const [ab, to] of [
        [eyes, 'next'],
        [scrub, 'previous'],
      ] as [Raw, string][]) {
        const go = logicNode(ab, 'action.artboard');
        if (go.params.to !== to) {
          go.params = { to, transition: go.params.transition ?? 'fade', duration: go.params.duration ?? 300 };
          out.push(`${ab.name}: the page button goes to the ${to} artboard instead of a hard-wired one`);
        }
      }
      //the explanation ran into the Next button: use the full width so it sits on two lines
      const how = find(eyes, 'How it works');
      if (how.x !== 40 || how.width !== 720) {
        Object.assign(how, { x: 40, width: 720, y: 482 });
        out.push('Eyes: the "How it works" text is wider so it no longer runs down onto the Next button');
      }
      return out;
    },
    notes: [
      { page: 0, text: '**Why a joystick.** The pupils never use the Interactions graph: the joystick maps the pointer onto two timelines, so their keyframes set how far the eyes can travel.' },
      { page: 1, text: '**Back is a page link.** Both buttons use *Go to artboard* set to next or previous, so the order of the artboards on the canvas is the order of the pages.', colour: 'sky' },
    ],
  },

  'grid-and-stack': {
    relayout: true,
    notes: [
      { text: '**The frame places the tiles.** Select *Gallery* to see its grid: a 100 px, a 25%, a flexible and an automatic column. Tile 3 fills its cell and Tile 5 spans two columns.' },
      { text: '**Stack mode.** *Badge stack* puts every child in the same cell, so Photo fills it and Tag sits in the bottom-right corner.', colour: 'sky' },
    ],
  },

  'layout-item': {
    relayout: true,
    notes: [
      { text: '**Each child sizes itself.** *Sign in* has an automatic left margin, so it pushes right. *Card A* and *Card B* fill and share the space 1 to 2, and *Thumbnail* fills at a 16:9 shape.' },
    ],
  },

  'line-gap': {
    relayout: true,
    notes: [{ text: "**Two gaps.** The frame's gap is 12 px between items along a row and its cross gap is 40 px between rows. Change them in the frame's Layout section and watch the wrap react." }],
  },

  'paint-order': {
    notes: [{ text: '**Stroke, fill, stroke.** The thick pink stroke is drawn first, so the fill covers its inner half. The thin navy stroke is drawn last, so it sits on top of both. Reorder them in the Paint order list.' }],
  },

  'text-patterns': {
    notes: [{ text: '**Patterns in a slot.** Each line is a {} slot holding a regular expression. The third one can backtrack for ever, so the player refuses it instead of freezing the page.' }],
  },

  'ui-layers': {
    edit(p) {
      const ab = p.artboards[0];
      const out: string[] = [];
      const userName = p.variables.find((v: Raw) => v.name === 'userName');
      const dark = p.variables.find((v: Raw) => v.name === 'dark');
      const field = find(ab, 'Name field');
      if (!field.variableId) {
        field.variableId = userName.id;
        out.push('Name field is bound to userName (it was a loose variable)');
      }
      const headline = find(ab, 'Headline');
      if (!/userName/.test(headline.text)) {
        headline.text = 'Hello {userName || "world"}';
        if (Array.isArray(headline.runs)) delete headline.runs;
        out.push('Headline greets the name typed in the field');
      }
      const dot = find(ab, 'Dot');
      const card = find(ab, 'Card');
      if (!dot.role) {
        Object.assign(dot, { role: 'button', ariaLabel: 'Switch the card between light and dark', focusable: true });
        const light = card.fill?.color ?? '#ffffff';
        card.bindings = { ...(card.bindings ?? {}), 'fill.color': `dark ? "#1b2433" : "${light}"` };
        const ev = nid('l');
        const act = nid('l');
        ab.logic.nodes.push(
          { id: ev, kind: 'event.pointer', x: 0, y: 0, params: { target: dot.id, type: 'click' } },
          { id: act, kind: 'action.setVariable', x: 0, y: 0, params: { variable: dark.id, op: 'toggle', value: '0' } },
        );
        ab.logic.edges.push({ id: nid('e'), from: ev, fromPort: 'out', to: act, toPort: 'in' });
        out.push('The Dot toggles the dark variable and the Card colour follows it (the variable was never used)');
      }
      return out;
    },
    notes: [
      { text: '**One of each layer.** Go adds to `score` and plays Intro, the Name field fills `userName`, and the dot toggles `dark` for the card behind it. Everything else is a layer type to try.' },
      { text: '[ ] *Clip* and *Embed* are placeholders: point Clip at a video and Embed at a page.', colour: 'orange' },
    ],
  },

  'script-and-shader': {
    notes: [
      { text: '**Four ways to draw.** *Script layer* runs `draw(g, t)` every frame, *Shader layer* runs GLSL on the GPU, *Wavy text* is a text modifier, and the bones follow a blend of Walk and Run.' },
      { text: '[ ] *Image* has no picture yet: drop one in and the bone chain moves it.', colour: 'orange' },
    ],
  },

  bones: {
    notes: [{ text: '**Skin, IK and a timeline.** *Arm* is skinned to the three bones, the orange dot is the IK target the hand chases, and *Wave* plays a timeline over the top.' }],
  },

  'matching-question': {
    notes: [
      { text: '**Made by Add question.** The *Question 1* frame holds the pairs and the scoring (Question section of the Inspector). *Terms* and *Matches* are plain layers, so restyle them freely.' },
      { text: '**One layer set per pair.** Draggable terms cannot sit in a repeater, so each pair has its own term and slot. The slots are drop zones that accept `q1-term`.', colour: 'sky' },
    ],
  },

  'hotspot-question': {
    edit(p) {
      const ab = p.artboards[0];
      const out: string[] = [];
      const spots = find(ab, 'Picture area');
      if (!find(ab, 'Picture area').children.some((c: Raw) => c.name === 'Areas')) {
        const areas = spots.children.filter((c: Raw) => String(c.name).startsWith('Area: '));
        spots.children = spots.children.filter((c: Raw) => !areas.includes(c));
        const group = {
          id: nid('n'),
          type: 'group',
          name: 'Areas',
          x: 0,
          y: 0,
          width: spots.width,
          height: spots.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          originX: 0.5,
          originY: 0.5,
          opacity: 1,
          visible: true,
          children: areas,
        };
        spots.children.push(group);
        //four copied click flows become one flow on the group: event.childIndex is the area, and the areas are in option order
        const frame = find(ab, 'Question 1');
        const click = ab.logic.nodes.filter((n: Raw) => n.kind === 'event.pointer' && areas.some((a: Raw) => a.id === n.params.target));
        const choose = ab.logic.nodes.filter((n: Raw) => n.kind === 'action.questionChoose');
        const dropIds = new Set([...click, ...choose].map((n) => n.id));
        ab.logic.nodes = ab.logic.nodes.filter((n: Raw) => !dropIds.has(n.id));
        ab.logic.edges = ab.logic.edges.filter((e: Raw) => !dropIds.has(e.from) && !dropIds.has(e.to));
        const ev = nid('l');
        const act = nid('l');
        ab.logic.nodes.push(
          { id: ev, kind: 'event.pointer', x: 0, y: 0, params: { type: 'click', target: group.id, childrenOnly: true } },
          { id: act, kind: 'action.questionChoose', x: 0, y: 0, params: { question: frame.id, option: 'event.childIndex' } },
        );
        ab.logic.edges.push({ id: nid('e'), from: ev, fromPort: 'out', to: act, toPort: 'in' });
        out.push(`the four click flows (one per area, ${click.length + choose.length} nodes) are one On pointer on the Areas group with Choose option event.childIndex`);
      }
      return out;
    },
    notes: [
      { text: '**One flow for every area.** The four Area layers sit in the *Areas* group, and one *On pointer* on it (only when a child is hit) chooses option `event.childIndex`. Area N is option N.' },
      { text: '**Hotspot kind.** The question settings hold the right answer; the areas are invisible layers over the picture. Swap the drawn house for your own image.', colour: 'sky' },
    ],
  },

  'dusk-poster': {
    edit(p) {
      const ab = p.artboards[0];
      const out: string[] = [];
      const poster = ab.children[0];
      poster.name = 'Poster';
      const kids: Raw[] = poster.children;
      //the twenty identical sparkles become one layer repeated over a list
      const isStar = (n: Raw) => n.type === 'path' && n.fill?.color === '#fff6e0' && n.opacity === 1 && n.paths?.[0]?.points?.length === 8 && n.width < 20;
      const stars = kids.filter(isStar);
      if (stars.length) {
        const first = kids.indexOf(stars[0]);
        const items = stars.map((s) => ({ x: round(s.x + s.width / 2), y: round(s.y + s.height / 2), size: round(s.width) }));
        const unit = stars[0];
        const template: Raw = {
          ...unit,
          id: nid('n'),
          name: 'Star',
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          paths: [{ closed: true, points: unit.paths[0].points.map((pt: Raw) => ({ ...pt, x: round((pt.x / unit.width) * 10), y: round((pt.y / unit.width) * 10) })) }],
        };
        const minX = Math.min(...stars.map((s) => s.x));
        const minY = Math.min(...stars.map((s) => s.y));
        const maxX = Math.max(...stars.map((s) => s.x + s.width));
        const maxY = Math.max(...stars.map((s) => s.y + s.height));
        const group: Raw = {
          id: nid('n'),
          type: 'group',
          name: 'Stars',
          x: round(minX),
          y: round(minY),
          width: round(maxX - minX),
          height: round(maxY - minY),
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          originX: 0.5,
          originY: 0.5,
          opacity: 1,
          visible: true,
          fitContents: false,
          repeat: { items: 'stars', layout: 'none', gap: 0, columns: 1 },
          children: [template],
        };
        //a group's children are in its own coordinates, so the copies are placed from the group's corner
        template.bindings = { x: `item.x - 5 - ${round(minX)}`, y: `item.y - 5 - ${round(minY)}`, scaleX: 'item.size / 10', scaleY: 'item.size / 10' };
        poster.children = kids.filter((n) => !stars.includes(n));
        poster.children.splice(first, 0, group);
        p.variables.push({ id: 'vduskstars01', name: 'stars', type: 'list', initial: JSON.stringify(items) });
        out.push(`20 star paths became one Star layer repeated over a stars list (${stars.length} layers to 1, plus the list)`);
      }
      //names that say what they are
      const rename = (from: Raw[], names: string[]) => from.forEach((n, i) => names[i] && (n.name = names[i]));
      const plain = poster.children.filter((n: Raw) => n.type === 'path' && n.name === 'Path');
      const by = (test: (n: Raw) => boolean) => plain.filter(test).sort((a: Raw, b: Raw) => a.x - b.x || a.y - b.y);
      rename(by((n) => n.y > 700 && n.height < 5), ['Reflection 1', 'Reflection 2', 'Reflection 3', 'Reflection 4']);
      rename(by((n) => n.y < 700 && n.y > 500 && n.x < 120), ['Pine left 1', 'Pine left 2', 'Pine left 3']);
      rename(by((n) => n.y < 700 && n.y > 500 && n.x > 400), ['Pine right 1', 'Pine right 2', 'Pine right 3', 'Pine right 4']);
      rename(by((n) => n.y > 200 && n.y < 260 && n.height < 10 && n.width > 30), ['Bird 1', 'Bird 2']);
      return out;
    },
    notes: [{ text: '**Imported, then tidied.** The poster came in from a VectorCraft file as plain paths. The twenty stars are now one repeated *Star* layer reading the `stars` list: change a number in it and a star moves.' }],
  },

  'little-house': {
    edit(p) {
      const ab = p.artboards[0];
      const out: string[] = [];
      const group = (n: string) => find(ab, n);
      const names: [string, string][] = [
        ['WALLS', 'Walls'],
        ['ROOF', 'Roof'],
        ['TEXT', 'Title'],
        ['FILL', 'Window'],
      ];
      for (const [from, to] of names) if (ab.children.some((c: Raw) => c.name === from)) group(from).name = to;
      const sub = (g: string, list: [(n: Raw) => boolean, string][]) => {
        for (const n of group(g).children) for (const [test, name] of list) if (n.name !== name && test(n) && /^(Line|Polyline|Circle|Arc|Hatch)$/.test(n.name)) n.name = name;
      };
      sub('Walls', [
        [(n) => n.name === 'Line' && n.height < 2 && n.y > 1000, 'Wall bottom'],
        [(n) => n.name === 'Line' && n.height < 2 && n.y < 1000, 'Wall top'],
        [(n) => n.name === 'Line' && n.width < 2 && n.x > 100, 'Wall right'],
        [(n) => n.name === 'Line' && n.width < 2 && n.x < 100, 'Wall left'],
        [(n) => n.name === 'Polyline', 'Door'],
        [(n) => n.name === 'Circle', 'Round window'],
      ]);
      sub('Roof', [
        [(n) => n.name === 'Line' && n.x < 100, 'Roof left'],
        [(n) => n.name === 'Line' && n.x > 100, 'Roof right'],
        [(n) => n.name === 'Arc', 'Sun'],
      ]);
      sub('Window', [[(n) => n.name === 'Hatch', 'Window fill']]);
      //the title ran past the bottom of the page
      const title = group('Title');
      if (title.y + title.height > ab.height - 20) {
        title.y = Math.round(ab.height - 25 - title.height);
        out.push('the Little house title sits inside the page (it ran 10 px off the bottom)');
      }
      return out;
    },
    notes: [{ text: '**Groups keep the drawing readable.** Walls, roof, window and title each sit in their own group, so you can hide, move or restyle one part at a time.' }],
  },

  'rive-breathing': {
    //the imported graph is a fixture of the importer tests: only the tidies and a note
    notes: [{ text: '**As the importer made it.** Rive states and transitions became timelines and nodes. Start with *Main Animation Artboard*; the smaller artboards are its parts (buttons, bubbles, panels).', w: 300 }],
  },
};

const round = (n: number) => Math.round(n * 1000) / 1000;

// ------------------------------------------------------------------ the checks the script makes of itself

/** Where each star ends up on the poster, by centre and drawn size, before and after the repeater swap. */
export function starBoxes(p: Raw): { cx: number; cy: number; size: number }[] {
  const ab = p.artboards[0];
  const vars: Record<string, unknown> = {};
  for (const v of p.variables as Raw[]) vars[v.name] = startingValue(v as never, vars);
  const prepared = prepareNodes(ab.children as SceneNode[], { vars, extra: { event: {} } } as never, { layout: false });
  const out: { cx: number; cy: number; size: number }[] = [];
  const visit = (list: SceneNode[], dx: number, dy: number) => {
    for (const n of list) {
      const x = n.x + dx;
      const y = n.y + dy;
      if (n.type === 'path' && (n.fill as { color?: string } | null)?.color === '#fff6e0' && n.opacity === 1 && n.width < 20) {
        out.push({ cx: round(x + n.width / 2), cy: round(y + n.height / 2), size: round(n.width * (n.scaleX ?? 1)) });
      }
      if ('children' in n && Array.isArray(n.children)) visit(n.children, x, y);
    }
  };
  visit(prepared, 0, 0);
  return out.sort((a, b) => a.cx - b.cx || a.cy - b.cy);
}

// ------------------------------------------------------------------ the run

export interface UpgradeResult {
  key: string;
  changes: string[];
  graphs: { page: string; nodes: number; moved: number }[];
  artboardsMoved: boolean;
  notes: number;
  bytes: [number, number];
}

export function upgradeExample(dir: string, key: string): UpgradeResult {
  const file = path.join(dir, key, 'project.json');
  const before = readFileSync(file, 'utf8');
  const p = JSON.parse(before) as Raw;
  const spec = UPGRADES[key];
  if (!spec) throw new Error(`no upgrade written for example "${key}"`);
  const changes: string[] = [];
  const starsBefore = key === 'dusk-poster' ? starBoxes(p) : null;

  if (spec.edit) changes.push(...spec.edit(p));
  if (starsBefore) {
    const after = starBoxes(p);
    if (JSON.stringify(after) !== JSON.stringify(starsBefore)) throw new Error('the star repeater does not draw the stars where they were');
  }

  if (spec.relayout) {
    for (const ab of p.artboards as Raw[]) if (relayoutTree(ab.children as SceneNode[])) changes.push(`${ab.name}: stored layer positions brought in line with what the layout engine draws`);
  }

  //graphs: the editor's own tidy (columns from the events, fewest crossings, groups fitted)
  const graphs: UpgradeResult['graphs'] = [];
  for (const ab of p.artboards as Raw[]) {
    if (!ab.logic?.nodes?.length) continue;
    const was = new Map<string, string>(ab.logic.nodes.map((n: Raw) => [n.id, `${n.x},${n.y}`]));
    const corner = (a: Raw) => {
      const all = [...a.logic.nodes, ...(a.logic.groups ?? [])] as Raw[];
      return { x: Math.min(...all.map((n) => n.x)), y: Math.min(...all.map((n) => n.y)) };
    };
    const origin = corner(ab);
    tidyBoardGraph(ab as unknown as Artboard);
    //a graph with a group in it comes out a group title lower every time it is tidied, so hold the top left corner where it was
    const now = corner(ab);
    for (const n of [...ab.logic.nodes, ...(ab.logic.groups ?? [])] as Raw[]) {
      n.x = Math.round(n.x - now.x + origin.x);
      n.y = Math.round(n.y - now.y + origin.y);
    }
    const moved = ab.logic.nodes.filter((n: Raw) => was.get(n.id) !== `${n.x},${n.y}`).length;
    graphs.push({ page: ab.name, nodes: ab.logic.nodes.length, moved });
  }

  //artboards: the editor's own tidy for the canvas
  const artboardsMoved = (p.artboards as Raw[]).length > 1 ? applyTidy(p as unknown as Project) : false;

  setNotes(p, key, spec.notes);

  const text = JSON.stringify(p);
  if (text !== before) writeFileSync(file, text);
  const notes = (p.artboards as Raw[]).reduce((n, ab) => n + (ab.notes?.length ?? 0), 0);
  return { key, changes, graphs, artboardsMoved, notes, bytes: [before.length, text.length] };
}

export function upgradeAll(dir: string, only?: string[]): UpgradeResult[] {
  const keys = (JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8')) as { key: string }[]).map((e) => e.key);
  return keys.filter((k) => !only?.length || only.includes(k)).map((k) => upgradeExample(dir, k));
}

/** The one example description that changes with the work (the stars are no longer 20 paths). */
export function updateIndex(dir: string): boolean {
  const file = path.join(dir, 'index.json');
  const text = readFileSync(file, 'utf8');
  const list = JSON.parse(text) as { key: string; description: string }[];
  const dusk = list.find((e) => e.key === 'dusk-poster');
  const want = 'A vector poster brought in from a VectorCraft file: gradients and paths, with its twenty stars drawn by one repeated layer.';
  if (!dusk || dusk.description === want) return false;
  dusk.description = want;
  writeFileSync(file, JSON.stringify(list, null, '\t') + '\n');
  return true;
}
