//The Credits button every starter carries on its first page: small, quiet, in a corner, inside the page, wired to Open credits,
//one per page of the start page's responsive set, and the automatic button left off.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, createNode, showsCredits, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { BRANDED_STARTERS, COLOURWAYS, projectFromBrandedStarter } from '../src/lib/branded';
import { STARTERS, projectFromStarter } from '../src/lib/template-starters';
import { brandedPage, brandedProject, footerMidY } from '../src/lib/branded/kit';
import { CREDITS_BUTTON_NAME, addCreditsButton } from '../src/lib/starter-credits';

const all: { key: string; make: () => Project }[] = [
  ...BRANDED_STARTERS.map((s) => ({ key: s.key, make: () => projectFromBrandedStarter(s, COLOURWAYS[0]) })),
  ...STARTERS.map((s) => ({ key: s.key, make: () => projectFromStarter(s) })),
];
const credits = (page: Artboard) => page.children.filter((n) => n.name === CREDITS_BUTTON_NAME);
const startOf = (p: Project) => p.artboards.find((a) => a.id === p.settings.startArtboardId)!;
const setOf = (p: Project) => [startOf(p), ...p.artboards.filter((a) => a.variantOf === startOf(p).id)];

describe('the Credits button on every starter', () => {
  it('is on the first page of every starter, once, small, in a corner and inside the page', () => {
    expect(all.length).toBeGreaterThan(60);
    for (const { key, make } of all) {
      const p = make();
      for (const page of setOf(p)) {
        const found = credits(page);
        expect(found, `${key}: ${page.name}`).toHaveLength(1);
        const b = found[0] as SceneNode & { label: string; fontSize: number };
        expect(b.type, key).toBe('button');
        expect(b.label, key).toBe('Credits');
        expect(b.width, key).toBeLessThanOrEqual(80);
        expect(b.height, key).toBeGreaterThanOrEqual(24);
        expect(b.height, key).toBeLessThanOrEqual(32);
        expect(b.fontSize, key).toBeLessThanOrEqual(13);
        //inside the page, and within 64px of its side and of its top or bottom
        expect(b.x, key).toBeGreaterThanOrEqual(0);
        expect(b.y, key).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width, key).toBeLessThanOrEqual(page.width);
        expect(b.y + b.height, key).toBeLessThanOrEqual(page.height);
        expect(Math.min(b.x, page.width - b.x - b.width), key).toBeLessThanOrEqual(64);
        expect(Math.min(b.y, page.height - b.y - b.height), key).toBeLessThanOrEqual(64);
      }
    }
  });

  it('is only on the first page (and its variants), never on the others, and not on a master', () => {
    for (const { key, make } of all) {
      const p = make();
      const own = new Set(setOf(p).map((a) => a.id));
      for (const page of p.artboards) if (!own.has(page.id)) expect(credits(page), `${key}: ${page.name}`).toHaveLength(0);
    }
  });

  it('opens the credits: a click on it runs Open credits, on the same page', () => {
    for (const { key, make } of all) {
      const p = make();
      for (const page of setOf(p)) {
        const b = credits(page)[0];
        const click = page.logic.nodes.find((n) => n.kind === 'event.pointer' && n.params.target === b.id && n.params.type === 'click');
        expect(click, key).toBeTruthy();
        const next = page.logic.edges.filter((e) => e.from === click!.id).map((e) => page.logic.nodes.find((n) => n.id === e.to)!.kind);
        expect(next, key).toEqual(['action.credits']);
      }
    }
  });

  it('leaves the automatic Credits button off, so there are never two', () => {
    for (const { key, make } of all) {
      const p = make();
      expect(p.settings.credits?.button, key).toBeFalsy();
      p.attributions = [{ id: 'a', kind: 'image', title: 'A picture' }];
      expect(showsCredits(p), key).toBe(false);
    }
  });

  it('gives the checklist an item that points at the button, and a graph note that says what it does', () => {
    for (const { key, make } of all) {
      const p = make();
      const item = p.template!.checklist.find((i) => i.text.startsWith('Check the credits list'));
      expect(item, key).toBeTruthy();
      expect(item!.nodeId, key).toBe(credits(startOf(p))[0].id);
      expect(item!.detail, key).toContain('Project > Credits');
      expect(startOf(p).logic.notes?.some((n) => /\*\*Open credits\*\*/.test(n.text)), key).toBe(true);
    }
  });

  it('goes level with the footer line on a white page, and the footer text stops short of it', () => {
    const ctx = brandedProject(COLOURWAYS[0], 'White page');
    const page = brandedPage(ctx, 'A white page', { footer: 'ICT101 Module 3' });
    addCreditsButton(ctx.project);
    const b = credits(page)[0];
    const footer = page.children.find((n) => n.name === 'Footer text')!;
    expect(b.x + b.width).toBe(page.width - 48 + 12);
    expect(b.y + b.height / 2).toBeCloseTo(footerMidY(page.height), 0);
    expect(footer.x + footer.width).toBeLessThanOrEqual(b.x);
    //and it keeps off the logo's side of the page
    expect(b.x).toBeGreaterThan(page.width / 2);
  });

  it('takes the next free corner when the first is taken', () => {
    const ctx = brandedProject(COLOURWAYS[0], 'Crowded');
    const page = brandedPage(ctx, 'Crowded', { kind: 'hero' });
    page.children.push(createNode('button', { name: 'Start', label: 'Start', x: page.width - 48 - 180, y: page.height - 70, width: 180, height: 46 }));
    addCreditsButton(ctx.project);
    const b = credits(page)[0];
    expect(b.x + b.width).toBeLessThanOrEqual(page.width);
    //not on the Start button
    expect(b.y + b.height <= page.height - 70 || b.x + b.width <= page.width - 48 - 180).toBe(true);
  });
});

describe('in the player', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  const play = (p: Project) => {
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    return new Player(document.getElementById('stage')!, p, { loadData: false, autoplay: false });
  };

  it('opens a labelled dialog with the credits from the starter\'s own button, keyboard and screen reader friendly, and gives focus back', () => {
    const p = JSON.parse(JSON.stringify(projectFromBrandedStarter(BRANDED_STARTERS.find((x) => x.key === 'explore/accordion')!, COLOURWAYS[0]))) as Project;
    p.attributions = [{ id: 'a', kind: 'image', title: 'Sunset over the bay', creator: 'Jane Smith', year: '2021', licence: 'CC BY 4.0' }];
    const pl = play(p);
    const id = credits(startOf(p))[0].id;
    const real = document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!;
    const button = real.tagName === 'BUTTON' ? real : real.querySelector('button')!;
    expect(button.textContent).toContain('Credits');
    //no automatic button beside it
    expect(document.querySelector('.ix-credits-btn:not([hidden])')).toBeNull();
    button.focus();
    button.click();
    const dialog = document.querySelector<HTMLElement>('.ix-credits-dialog')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('Jane Smith (2021). Sunset over the bay [Image]. Licence: CC BY 4.0.');
    expect(document.querySelector<HTMLElement>('.ix-credits-scrim')!.hidden).toBe(false);
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(document.querySelector<HTMLElement>('.ix-credits-scrim')!.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
    pl.destroy();
  });

  it('says so when the starter has no credits yet', () => {
    const p = JSON.parse(JSON.stringify(projectFromBrandedStarter(BRANDED_STARTERS.find((x) => x.key === 'explore/accordion')!, COLOURWAYS[0]))) as Project;
    const pl = play(p);
    expect(pl.openCredits()).toBe(true);
    expect(document.querySelector('.ix-credits-dialog')!.textContent).toContain('No credits have been added yet.');
    pl.destroy();
  });

  it('keeps the list in a published page', async () => {
    const { withPublishedCredits } = await import('interactives-player');
    const p = projectFromBrandedStarter(BRANDED_STARTERS.find((x) => x.key === 'explore/accordion')!, COLOURWAYS[0]);
    p.attributions = [{ id: 'a', kind: 'image', title: 'A picture' }];
    expect(withPublishedCredits(p).attributions).toHaveLength(1);
  });
});
