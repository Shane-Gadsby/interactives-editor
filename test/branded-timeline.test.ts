//The Dated timeline starter: builds in every colourway, places events by date on a real scale, labels never overlap on screen,
//zoom and pan and walking the events work, the dialog and the list are the same events, the portrait variant is a responsive
//set with the same layer names, and the ordering activity is marked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject, pickMember, setMembers, walk, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { BRANDED_STARTERS, COLOURWAYS, HIGH_CONTRAST, projectFromBrandedStarter } from '../src/lib/branded';
import { byName } from '../src/lib/branded/kit';
import { questionFrames } from '../src/lib/question-kit';

const S = BRANDED_STARTERS.find((s) => s.key === 'explore/dated-timeline')!;
const flush = () => new Promise((r) => setTimeout(r, 0));
const elOf = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`);
const must = (id: string) => {
  const el = elOf(id);
  if (!el) throw new Error(`no layer ${id}`);
  return el;
};
const click = async (id: string) => {
  must(id).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  await flush();
};
const build = (way = COLOURWAYS[0]) => {
  const project = JSON.parse(JSON.stringify(projectFromBrandedStarter(S, way))) as Project;
  const board = (name: string) => project.artboards.find((a) => a.name === name)!;
  return { project, board };
};
const play = (project: Project, at?: Artboard, w = 1024, h = 640) => {
  document.body.innerHTML = `<div id="stage" style="width:${w}px;height:${h}px"></div>`;
  const player = new Player(document.getElementById('stage')!, project, { loadData: false });
  if (at) player.goTo(at.id);
  player.step(1000);
  return player;
};
const at = (el: HTMLElement) => {
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform)!;
  return { x: parseFloat(m[1]), y: parseFloat(m[2]), w: parseFloat(el.style.width), h: parseFloat(el.style.height) };
};
const variable = (project: Project, name: string) => project.variables.find((v) => v.name === name)!;

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => vi.unstubAllGlobals());

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
type Ev = { title: string; pos: number; inView: boolean; labelled: boolean; lane: number; start: number; dateText: string; labelPos: number; labelW: number; labelH: number };

describe('Dated timeline starter', () => {
  it('is in the explore set beside the simpler interactive timeline, which is still there', () => {
    expect(S.set).toBe('explore');
    expect(S.description).not.toMatch(/—/);
    expect(BRANDED_STARTERS.some((s) => s.key === 'drag/interactive-timeline')).toBe(true);
    expect(S.layoutStates!.map((l) => l.label)).toEqual(expect.arrayContaining(['event open', 'list view', 'zoomed in']));
  });

  for (const way of [...COLOURWAYS, HIGH_CONTRAST]) {
    it(`builds in ${way.name}, normalises, paints with tokens only, plays, and its text reads on what it sits on`, async () => {
      const { project, checklist } = S.build(way);
      expect(() => normalizeProject(JSON.parse(JSON.stringify(project)))).not.toThrow();
      const layers = JSON.stringify(project.artboards.map((a) => [a.children, a.background, a.logic]));
      expect(layers).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      const ids = new Set<string>();
      for (const ab of project.artboards) walk(ab.children, (n: SceneNode) => void ids.add(n.id));
      expect(checklist.length).toBeGreaterThanOrEqual(8);
      for (const c of checklist) {
        if (c.nodeId) expect(ids.has(c.nodeId), c.text).toBe(true);
        expect(c.text).not.toMatch(/—/);
      }
      const theme = `theme-${way.id}`;
      const tok = (n: string) => project.themes!.tokens.find((t) => t.name === n)!.values[theme];
      //the text on the page, on the grey bands and on the stage; the marker line and the strokes against the stage
      for (const [fg, bg] of [['color/text', 'color/background'], ['color/text', 'color/surface'], ['color/text', 'color/surface-muted'], ['color/muted', 'color/background'], ['color/error', 'color/background'], ['color/text', 'color/background']]) {
        expect(contrast(tok(fg), tok(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(tok('color/button'), tok('color/on-button'))).toBeGreaterThanOrEqual(4.5);
      const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const player = play(JSON.parse(JSON.stringify(project)));
      for (const ab of project.artboards) {
        player.goTo(ab.id);
        player.step(3000);
        await flush();
      }
      expect(err).not.toHaveBeenCalled();
      err.mockRestore();
      player.destroy?.();
    });
  }

  it('writes the events and eras once, as lists with dates, and everything else is live variables over them', () => {
    const { project } = build();
    const events = JSON.parse(String(variable(project, 'events').initial)) as { date: string; end?: string; title: string; detail: string }[];
    expect(events.length).toBeGreaterThanOrEqual(20);
    expect(events.some((e) => e.end)).toBe(true);
    expect(events.some((e) => /^\d{4}-\d\d-\d\d$/.test(e.date))).toBe(true);
    expect(JSON.parse(String(variable(project, 'eras').initial)).length).toBeGreaterThanOrEqual(5);
    for (const n of ['tlEvents', 'tlEras', 'tlTicks', 'tlMarker', 'tlInfo', 'tlpEvents', 'bounds', 'viewFrom', 'viewTo', 'viewSpan', 'maxZoom', 'centreAt']) expect(variable(project, n), n).toMatchObject({ live: true });
    expect(variable(project, 'tlEvents').formula).toContain('timelineLayout(events, eras, viewFrom, viewTo');
    expect(variable(project, 'tlpEvents').formula).toContain('orientation: "vertical"');
  });

  it('puts every event where its date falls on the scale, a range as a bar, and the view starts a step in at the later end', () => {
    const { project, board } = build();
    const page = board('Timeline');
    const player = play(project, page);
    expect(player.getVariable('zoom')).toBe(1);
    const evs = player.getVariable('tlEvents') as Ev[];
    const bounds = player.getVariable('bounds') as number[];
    const from = player.getVariable('viewFrom') as number;
    const span = player.getVariable('viewSpan') as number;
    expect(span).toBeCloseTo(bounds[2] / 2, 6);
    expect(from + span).toBeCloseTo(bounds[1], 6);
    const dot = byName(page, 'Event dot')!.id;
    let shown = 0;
    evs.forEach((e, i) => {
      const el = must(`${dot}~${i}`);
      const hidden = el.style.display === 'none';
      expect(hidden, e.title).toBe(!e.inView);
      expect(e.pos).toBeCloseTo(((e.start - from) / span) * 880, 0);
      if (!hidden) {
        shown++;
        expect(at(el).x).toBeCloseTo(24 + e.pos - 9, 0);
        expect(at(el).y).toBe(170 - 9);
      }
    });
    expect(shown).toBeGreaterThan(12);
    //a range has a bar the length of the range
    const bar = byName(page, 'Range bar')!.id;
    const cr = evs.findIndex((e) => e.title.startsWith('ARPANET is'));
    expect(evs[cr].labelled).toBe(true);
    expect(at(must(`${bar}~${cr}`)).w).toBeGreaterThan(100);
    expect(must(`${bar}~${evs.findIndex((e) => e.title.startsWith('Turing'))}`).style.display).toBe('none');
    player.destroy?.();
  });

  it('draws the eras behind the events and the scale of ticks, stepping finer as it zooms in', () => {
    const { project, board } = build();
    const page = board('Timeline');
    const player = play(project, page);
    const tick = byName(page, 'Tick')!.id;
    const labels = () => (player.getVariable('tlTicks') as { label: string }[]).map((t) => t.label);
    expect(labels()).toContain('2000');
    expect(must(`${tick}~0`).textContent).toBe(labels()[0]);
    const era = byName(page, 'Era')!.id;
    const eras = player.getVariable('tlEras') as { name: string; inView: boolean }[];
    expect(eras.filter((e) => e.inView).length).toBeGreaterThanOrEqual(5);
    expect(must(`${era}~2`).textContent).toBe(eras[2].name);
    player.setVariable('zoom', 8);
    player.setVariable('pan', 0.7);
    player.step(50);
    expect(labels().some((l) => /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/.test(l))).toBe(true);
    player.destroy?.();
  });

  it('never draws two labels over each other or off the stage, in any view, on either page', () => {
    for (const [name, w, h, key] of [['Timeline', 1024, 640, 'tl'], ['Timeline (portrait)', 480, 960, 'tlp']] as const) {
      const { project, board } = build();
      const page = board(name);
      const player = play(project, page, w, h);
      const label = byName(page, 'Event label')!.id;
      const stageW = name === 'Timeline' ? 928 : 384;
      const stageH = name === 'Timeline' ? 352 : 604;
      for (const [zoom, pan] of [[0, 0], [1, 1], [1, 0], [2, 0.5], [3, 0.9], [4, 0.4], [5, 0.75], [6, 0.69], [8, 0.7]]) {
        player.setVariable('zoom', zoom);
        player.setVariable('pan', pan);
        player.step(50);
        const evs = player.getVariable(`${key}Events`) as Ev[];
        const boxes: { x: number; y: number; w: number; h: number; t: string }[] = [];
        evs.forEach((e, i) => {
          const el = must(`${label}~${i}`);
          const shown = el.style.display !== 'none';
          expect(shown, `${name} ${zoom}/${pan} ${e.title}`).toBe(e.labelled && e.inView);
          if (shown) boxes.push({ ...at(el), t: e.title });
        });
        for (const b of boxes) {
          expect(b.x, b.t).toBeGreaterThanOrEqual(0);
          expect(b.y, b.t).toBeGreaterThanOrEqual(0);
          expect(b.x + b.w, `${name} ${zoom}/${pan} ${b.t}`).toBeLessThanOrEqual(stageW + 0.5);
          expect(b.y + b.h, `${name} ${zoom}/${pan} ${b.t}`).toBeLessThanOrEqual(stageH + 0.5);
        }
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i];
            const b = boxes[j];
            const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
            expect(apart, `${name} ${zoom}/${pan}: ${a.t} and ${b.t}`).toBe(true);
          }
        }
      }
      player.destroy?.();
    }
  });

  it('zooms in and out keeping the middle, fits all, and pans earlier and later, stopping at the ends', async () => {
    const { project, board } = build();
    const page = board('Timeline');
    const player = play(project, page);
    const id = (n: string) => byName(page, n)!.id;
    await click(id('Fit all button'));
    player.step(50);
    expect(player.getVariable('zoom')).toBe(0);
    expect(player.getVariable('pan')).toBe(0);
    expect(must(id('Earlier button')).querySelector('button')!.disabled).toBe(true);
    expect(must(id('Zoom out button')).querySelector('button')!.disabled).toBe(true);
    const bounds = player.getVariable('bounds') as number[];
    const mid = bounds[0] + bounds[2] / 2;
    await click(id('Zoom in button'));
    player.step(50);
    expect(player.getVariable('zoom')).toBe(1);
    const from = player.getVariable('viewFrom') as number;
    const span = player.getVariable('viewSpan') as number;
    expect(from + span / 2).toBeCloseTo(mid, 3);
    //pan a quarter of the view each press, and stop at the end
    await click(id('Later button'));
    expect(player.getVariable('viewFrom') as number).toBeCloseTo(from + span / 4, 3);
    for (let i = 0; i < 6 && !must(id('Later button')).querySelector('button')!.disabled; i++) {
      await click(id('Later button'));
      player.step(20);
    }
    expect((player.getVariable('viewFrom') as number) + span).toBeCloseTo(bounds[1], 3);
    expect(must(id('Later button')).querySelector('button')!.disabled).toBe(true);
    await click(id('Earlier button'));
    expect(player.getVariable('viewFrom') as number).toBeLessThan(bounds[1] - span);
    //zooming all the way in is stopped, and out again keeps the middle
    const centre = (player.getVariable('viewFrom') as number) + span / 2;
    for (let i = 0; i < 12 && !must(id('Zoom in button')).querySelector('button')!.disabled; i++) {
      await click(id('Zoom in button'));
      player.step(20);
    }
    expect(player.getVariable('zoom')).toBe(player.getVariable('maxZoom'));
    expect(must(id('Zoom in button')).querySelector('button')!.disabled).toBe(true);
    expect(player.getVariable('viewSpan') as number).toBeLessThanOrEqual(1);
    await click(id('Zoom out button'));
    expect((player.getVariable('viewFrom') as number) + (player.getVariable('viewSpan') as number) / 2).toBeGreaterThan(centre - 1);
    expect((player.getVariable('viewFrom') as number) + (player.getVariable('viewSpan') as number) / 2).toBeLessThan(centre + 1);
    player.destroy?.();
  });

  it('opens an event on a click on its dot, its label or its list row, with the date, era and detail, and no picture unless it has one', async () => {
    const { project, board } = build();
    const page = board('Timeline');
    const player = play(project, page);
    const id = (n: string) => byName(page, n)!.id;
    const evs = player.getVariable('tlEvents') as Ev[];
    const moon = evs.findIndex((e) => e.title.startsWith('The first message'));
    await click(`${id('Event dot')}~${moon}`);
    expect(player.getVariable('current')).toBe(moon);
    expect(player.getVariable('open')).toBe(true);
    player.step(100);
    const dialog = must(id('Event dialog')).textContent!;
    expect(dialog).toContain('The first message on ARPANET');
    expect(dialog).toContain('29 October 1969');
    expect(dialog).toContain('Chips and mainframes');
    expect(dialog).toContain('UCLA');
    expect(must(id('Event picture')).style.display).toBe('none');
    await click(id('Event dialog close button'));
    player.step(100);
    expect(player.getVariable('open')).toBe(false);
    //a click on a label opens it too
    await click(`${id('Event label')}~${moon}`);
    expect(player.getVariable('open')).toBe(true);
    await click(id('Event dialog close button'));
    player.step(100);
    //an event with a picture shows it
    const events = JSON.parse(JSON.stringify(player.getVariable('events'))) as Record<string, unknown>[];
    const i = evs.findIndex((e) => e.title.startsWith('ENIAC'));
    const row = events.findIndex((e) => String(e.title).startsWith('ENIAC'));
    events[row].image = 'asset-eniac';
    player.setVariable('events', events);
    player.step(50);
    await click(`${id('Event dot')}~${i}`);
    player.step(100);
    expect(must(id('Event picture')).style.display).not.toBe('none');
    player.destroy?.();
  });

  it('walks the events with Next and Previous, the view following to bring the one it lands on into sight, and Step through zooms to the first', async () => {
    const { project, board } = build();
    const page = board('Timeline');
    const player = play(project, page);
    const id = (n: string) => byName(page, n)!.id;
    await click(id('Fit all button'));
    await click(id('Step through button'));
    player.step(50);
    expect(player.getVariable('zoom')).toBe(4);
    expect(player.getVariable('current')).toBe(0);
    let evs = player.getVariable('tlEvents') as Ev[];
    expect(evs[0].inView).toBe(true);
    expect(must(id('Previous event button')).querySelector('button')!.disabled).toBe(true);
    //walk to the end: every event is in view when it is the current one
    for (let i = 1; i < evs.length; i++) {
      await click(id('Next event button'));
      player.step(50);
      expect(player.getVariable('current')).toBe(i);
      evs = player.getVariable('tlEvents') as Ev[];
      expect(evs[i].inView, evs[i].title).toBe(true);
    }
    expect(must(id('Next event button')).querySelector('button')!.disabled).toBe(true);
    await click(id('Previous event button'));
    expect(player.getVariable('current')).toBe(evs.length - 2);
    player.step(50);
    //the dot of the current event says so
    const dot = must(`${id('Event dot')}~${evs.length - 2}`).querySelector('button') ?? must(`${id('Event dot')}~${evs.length - 2}`);
    expect(dot.getAttribute('aria-current')).toBe('date');
    expect(dot.getAttribute('aria-label')).toContain(evs[evs.length - 2].dateText);
    player.destroy?.();
  });

  it('has the events as one keyboard group in date order, and every event as a row of the list with the same words', async () => {
    const { project, board } = build();
    const page = board('Timeline');
    const dots = byName(page, 'Event dots') as SceneNode & { keyNav: Record<string, unknown>; repeat: { items: string } };
    expect(dots.keyNav).toMatchObject({ mode: 'list', orientation: 'both', countHidden: true, indexVariable: variable(project, 'current').id });
    expect(dots.repeat.items).toBe('tlEvents');
    const player = play(project, page);
    const id = (n: string) => byName(page, n)!.id;
    const evs = player.getVariable('tlEvents') as Ev[];
    expect(evs.map((e) => e.start)).toEqual([...evs.map((e) => e.start)].sort((a, b) => a - b));
    await click(id('View button'));
    player.step(100);
    expect(player.getVariable('asList')).toBe(true);
    expect(must(id('Timeline view')).style.display).toBe('none');
    for (const n of ['Zoom in button', 'Zoom out button', 'Fit all button', 'Earlier button']) expect(must(id(n)).querySelector('button')!.disabled, n).toBe(true);
    const row = id('Event row');
    evs.forEach((e, i) => {
      expect(must(`${row}~${i}`).textContent).toContain(e.title);
      expect(must(`${row}~${i}`).textContent).toContain(e.dateText);
    });
    await click(`${row}~5`);
    expect(player.getVariable('current')).toBe(5);
    expect(player.getVariable('open')).toBe(true);
    player.destroy?.();
  });

  it('marks today with a line (and says so), which goes when markerDate is emptied', () => {
    const { project, board } = build();
    const page = board('Timeline');
    const player = play(project, page);
    const line = byName(page, 'Marker line')!.id;
    expect(must(line).style.display).not.toBe('none');
    expect(must(byName(page, 'Marker label')!.id).textContent).toBe('Today');
    player.setVariable('markerDate', '');
    player.step(50);
    expect(must(line).style.display).toBe('none');
    player.destroy?.();
  });

  it('has a portrait variant in a responsive set, built the same way with the same layer names, and the pages count as one', () => {
    const { project, board } = build();
    const land = board('Timeline');
    const port = board('Timeline (portrait)');
    expect(port.variantOf).toBe(land.id);
    expect(land.minWidth).toBe(560);
    expect(port.minWidth).toBe(0);
    expect([port.width, port.height]).toEqual([480, 960]);
    const names = (ab: Artboard) => {
      const out = new Set<string>();
      walk(ab.children, (n: SceneNode) => void out.add(n.name));
      return out;
    };
    for (const n of names(land)) expect(names(port).has(n), n).toBe(true);
    //the pages are hero, timeline (with its variant), activity and results
    const player = play(project, land);
    expect(must(byName(land, 'Footer text')!.id).textContent).toContain('Page 2 of 4');
    player.destroy?.();
    //a phone width gets the portrait page, a desktop one the wide page
    const members = setMembers(project.artboards, land);
    expect(members.map((m) => m.name)).toEqual(['Timeline (portrait)', 'Timeline']);
    expect(pickMember(members, 400).name).toBe('Timeline (portrait)');
    expect(pickMember(members, 559).name).toBe('Timeline (portrait)');
    expect(pickMember(members, 1000).name).toBe('Timeline');
  });

  it('runs the same lists down the portrait page, one column of labels beside the axis', () => {
    const { project, board } = build();
    const page = board('Timeline (portrait)');
    const player = play(project, page, 480, 960);
    const evs = player.getVariable('tlpEvents') as Ev[];
    expect(evs.length).toBe((player.getVariable('tlEvents') as Ev[]).length);
    expect(evs.map((e) => e.title)).toEqual((player.getVariable('tlEvents') as Ev[]).map((e) => e.title));
    const dot = byName(page, 'Event dot')!.id;
    const shown = evs.map((e, i) => ({ e, i })).filter(({ e }) => e.inView);
    expect(shown.length).toBeGreaterThan(5);
    for (const { e, i } of shown) {
      expect(at(must(`${dot}~${i}`)).x).toBe(84 - 9);
      expect(at(must(`${dot}~${i}`)).y).toBeCloseTo(24 + e.pos - 9, 0);
    }
    expect(evs.every((e) => e.lane < 2)).toBe(true);
    player.destroy?.();
  });

  it('ends with an ordering activity, marked by the question kit, that goes on to results', async () => {
    const { project, board } = build();
    const activity = board('Put in order');
    const frame = questionFrames(activity)[0];
    expect(frame.question).toMatchObject({ kind: 'ordering', points: 6 });
    expect(frame.question!.options).toHaveLength(6);
    const player = play(project, board('Timeline'));
    await click(byName(board('Timeline'), 'Activity button')!.id);
    player.step(500);
    expect(player.artboard.name).toBe('Put in order');
    player.destroy?.();
  });

  it('has author notes beside the pages, in the template voice', () => {
    const { board } = build();
    for (const name of ['Timeline', 'Timeline (portrait)', 'Put in order']) {
      const notes = board(name).notes ?? [];
      expect(notes.length, name).toBeGreaterThanOrEqual(1);
      for (const n of notes) {
        expect(n.author).toBe('Template');
        expect(n.y).toBeGreaterThanOrEqual(board(name).height);
        expect(n.text).not.toMatch(/—/);
      }
    }
    expect(board('Timeline').notes!.length).toBeGreaterThanOrEqual(3);
  });
});
