/**
 * Every shipped example (examples/<key>/project.json): it loads through the player's own sanitiser, plays without an error, carries
 * its author notes (beside the artboard, never drawn by the player), has nothing the layout check flags, and the upgrade script that
 * keeps them tidy leaves them as they are. Then the few that were rebuilt on native features are played to prove they still work.
 */
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, countNotes, normalizeProject, sanitizeProject, stripNotes, type Project, type SceneNode } from 'interactives-player';
import { STRICT_KINDS, checkProjectLayout } from '../src/lib/branded/layout-check';
import { EXAMPLE_NOTE_PREFIX, upgradeAll } from '../scripts/examples-upgrade';

const dir = path.resolve(__dirname, '..', 'examples');
const index = JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8')) as { key: string; artboards: number }[];
const raw = (key: string) => JSON.parse(readFileSync(path.join(dir, key, 'project.json'), 'utf8'));
const load = (key: string): Project => sanitizeProject(normalizeProject(raw(key)));
const find = (list: SceneNode[], name: string): SceneNode | undefined => {
  for (const n of list) {
    if (n.name === name) return n;
    if ('children' in n) {
      const hit = find(n.children, name);
      if (hit) return hit;
    }
  }
  return undefined;
};
const el = (id: string) => document.querySelector(`[data-ix-id="${id}"]`) as HTMLElement;

describe('examples', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    //jsdom has no media playback (the ui-layers video asks for it)
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lists every folder, and the artboard counts are right', () => {
    const folders = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    expect(index.map((e) => e.key).sort()).toEqual(folders);
    for (const e of index) expect(raw(e.key).artboards.length).toBe(e.artboards);
  });

  for (const { key } of index) {
    describe(key, () => {
      it('loads and plays with no error, and its notes are there but never drawn', () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const p = load(key);
        const stage = document.getElementById('stage')!;
        const player = new Player(stage, p, { loadData: false });
        const diagnostics: { kind: string; message?: string }[] = [];
        player.on('diagnostic', (d) => diagnostics.push(d));
        for (let i = 0; i < 4; i++) player.step(16);

        expect(diagnostics.filter((d) => d.kind === 'error')).toEqual([]);
        //jsdom has no WebGL and the sandbox bundle is not loaded here, so the script and shader layers of script-and-shader say so
        const unexpected = errors.mock.calls.filter((c) => !/sandbox bundle is not loaded|WebGL is not available/.test(String(c[1] ?? c[0])));
        expect(unexpected).toEqual([]);

        const count = countNotes(p);
        expect(count).toBeGreaterThanOrEqual(1);
        expect(count).toBeLessThanOrEqual(3);
        const texts = p.artboards.flatMap((a) => a.notes ?? []).map((n) => n.text.replace(/\*\*|`|\[ \] /g, ''));
        expect(texts.every((t) => t.trim().length > 20)).toBe(true);
        const shown = stage.textContent ?? '';
        for (const t of texts) expect(shown).not.toContain(t.slice(0, 24));
        expect(countNotes(stripNotes(p))).toBe(0);
        player.destroy();
        errors.mockRestore();
      });

      it('keeps every note beside its artboard: not over any artboard, layer parked outside, or other note', () => {
        const p = load(key);
        type Box = { x: number; y: number; w: number; h: number; what: string };
        const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        const notes: Box[] = [];
        const others: Box[] = [];
        for (const ab of p.artboards) {
          others.push({ x: ab.canvasX, y: ab.canvasY, w: ab.width, h: ab.height, what: `artboard ${ab.name}` });
          for (const n of ab.children) others.push({ x: ab.canvasX + n.x, y: ab.canvasY + n.y, w: n.width, h: n.height, what: `layer ${n.name}` });
          for (const n of ab.notes ?? []) notes.push({ x: ab.canvasX + n.x, y: ab.canvasY + n.y, w: n.w, h: n.h, what: `note ${n.id}` });
        }
        //a layer inside its own artboard is covered by the artboard's own box; only the whole artboard and the parked layers count
        const solid = others.filter((o) => o.what.startsWith('artboard') || !others.some((a) => a.what.startsWith('artboard') && a.x <= o.x && a.y <= o.y && a.x + a.w >= o.x + o.w && a.y + a.h >= o.y + o.h));
        for (const n of notes) {
          expect(solid.filter((o) => hit(n, o)).map((o) => o.what), n.what).toEqual([]);
          expect(notes.filter((m) => m !== n && hit(n, m)).map((m) => m.what), n.what).toEqual([]);
        }
        expect(p.artboards.flatMap((a) => a.notes ?? []).every((n) => n.id.startsWith(EXAMPLE_NOTE_PREFIX))).toBe(true);
      });

      it('has no button over words, and no words off the page', () => {
        expect(checkProjectLayout(load(key)).filter((v) => STRICT_KINDS.includes(v.kind))).toEqual([]);
      });
    });
  }

  it('the upgrade script has nothing left to change (running it again writes the same files)', () => {
    const copy = mkdtempSync(path.join(tmpdir(), 'ix-examples-'));
    try {
      cpSync(dir, copy, { recursive: true });
      const results = upgradeAll(copy);
      expect(results).toHaveLength(index.length);
      for (const r of results) {
        expect(readFileSync(path.join(copy, r.key, 'project.json'), 'utf8'), r.key).toBe(readFileSync(path.join(dir, r.key, 'project.json'), 'utf8'));
        expect(r.changes, r.key).toEqual([]);
      }
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  describe('rebuilt on native features', () => {
    const play = (key: string, artboard = 0) => {
      const p = load(key);
      p.settings.startArtboardId = p.artboards[artboard].id;
      const player = new Player(document.getElementById('stage')!, p, { loadData: false });
      player.step(16);
      return { p, player };
    };
    const click = (id: string) => el(id).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    it('hotspot: one pointer flow on the Areas group picks whichever area was clicked, and Check marks it', () => {
      const { p, player } = play('hotspot-question');
      const ab = p.artboards[0];
      expect(ab.logic.nodes.filter((n) => n.kind === 'event.pointer' && n.params.childrenOnly).length).toBe(1);
      expect(ab.logic.nodes.filter((n) => n.kind === 'action.questionChoose').length).toBe(1);
      const area = (name: string) => find(ab.children, `Area: ${name}`)!;
      const picked = () => (player.getVariable('q1_items') as { id: string; selected: boolean }[]).filter((i) => i.selected).map((i) => i.id);
      click(area('Sun').id);
      expect(picked()).toEqual(['o2']);
      click(area('Door').id);
      expect(picked()).toEqual(['o4']);
      click(find(ab.children, 'Picture')!.id);
      expect(picked()).toEqual(['o4']);
      click(area('Roof').id);
      expect(picked()).toEqual(['o1']);
      click(find(ab.children, 'Check answer')!.id);
      expect(player.getVariable('q1_correct')).toBe(true);
      expect(player.getVariable('q1_score')).toBe(1);
      player.destroy();
    });

    it('hotspot: the wrong area scores nothing', () => {
      const { p, player } = play('hotspot-question');
      click(find(p.artboards[0].children, 'Area: Tree')!.id);
      click(find(p.artboards[0].children, 'Check answer')!.id);
      expect(player.getVariable('q1_correct')).toBe(false);
      expect(player.getVariable('q1_score')).toBe(0);
      player.destroy();
    });

    it('dusk poster: twenty stars drawn by one repeated layer', () => {
      const p = load('dusk-poster');
      expect(find(p.artboards[0].children, 'Stars')).toBeTruthy();
      const player = new Player(document.getElementById('stage')!, p, { loadData: false });
      player.step(16);
      expect(document.querySelectorAll('[data-ix-id^="' + find(p.artboards[0].children, 'Star')!.id + '~"]').length).toBe(20);
      expect(player.getVariable('stars') as unknown[]).toHaveLength(20);
      player.destroy();
    });

    it('joysticks: the two buttons are next and previous page links', () => {
      const a = play('joysticks', 0);
      const nextBtn = find(a.p.artboards[0].children, 'Next')!;
      click(nextBtn.id);
      a.player.step(400);
      expect(a.player.artboard.name).toBe('Scrub a timeline');
      a.player.destroy();
      const b = play('joysticks', 1);
      click(find(b.p.artboards[1].children, 'Back')!.id);
      b.player.step(400);
      expect(b.player.artboard.name).toBe('Eyes');
      b.player.destroy();
    });

    it('lamp: the switch announces the lamp state', () => {
      const { p, player } = play('lamp');
      const sw = find(p.artboards[0].children, 'Switch')!;
      expect(el(sw.id).querySelector('button')!.getAttribute('aria-pressed')).toBe('false');
      click(sw.id);
      player.step(16);
      expect(player.getVariable('lit')).toBe(true);
      expect(el(sw.id).querySelector('button')!.getAttribute('aria-pressed')).toBe('true');
      player.destroy();
    });

    it('ui layers: the name field, the headline and the dot all use the variables', () => {
      const { p, player } = play('ui-layers');
      const ab = p.artboards[0];
      expect(el(find(ab.children, 'Headline')!.id).textContent).toContain('Hello world');
      player.setVariable('userName', 'Sam');
      player.step(16);
      expect(el(find(ab.children, 'Headline')!.id).textContent).toContain('Hello Sam');
      const card = find(ab.children, 'Card')!;
      const before = el(card.id).outerHTML;
      click(find(ab.children, 'Dot')!.id);
      player.step(16);
      expect(player.getVariable('dark')).toBe(true);
      expect(el(card.id).outerHTML).not.toBe(before);
      player.destroy();
    });
  });
});
