/**
 * Page navigation in the branded starters sits on the bottom bar (kit.ts navBarY): Back at the left of the content box, Next at the
 * right, after the page's content in the tab order. Nothing that goes to the previous or next page sits in the title band.
 */
import { describe, expect, it } from 'vitest';
import { type Artboard, type SceneNode } from 'interactives-player';
import { BRANDED_STARTERS, COLOURWAYS, brandedStarterByKey, projectFromBrandedStarter } from '../src/lib/branded';
import { contentBox, navBarY } from '../src/lib/branded/kit';

const NAV_LABEL = /^(back|previous|next)( (step|part|chapter|sign|event|card|scene|one|question))?$/i;
const pagesOf = (key: string) => {
  const p = projectFromBrandedStarter(brandedStarterByKey(key)!, COLOURWAYS[0]);
  return p.artboards.filter((a) => !a.isMaster);
};
//a button's page y (the frames it sits in add theirs)
function buttons(page: Artboard) {
  const out: { n: SceneNode; label: string; y: number; x: number }[] = [];
  const go = (n: SceneNode, ox: number, oy: number) => {
    const x = ox + (n.x ?? 0);
    const y = oy + (n.y ?? 0);
    if (n.type === 'button') out.push({ n, label: String((n as { label?: string }).label ?? ''), x, y });
    for (const c of (n as { children?: SceneNode[] }).children ?? []) go(c, x, y);
  };
  for (const c of page.children) go(c, 0, 0);
  return out;
}

describe('starter page navigation', () => {
  it('has no Back, Previous or Next button in the title band of any page of any starter', () => {
    const found: string[] = [];
    for (const s of BRANDED_STARTERS) {
      for (const page of pagesOf(s.key)) {
        if (page.height > page.width) continue; //a phone sized variant lays its controls out down the page
        const top = contentBox(page).y;
        for (const b of buttons(page)) if (NAV_LABEL.test(b.label) && b.y < top) found.push(`${s.key} / ${page.name}: ${b.label} at y ${Math.round(b.y)}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('puts the quiz and spelling test Back at the left and Next at the right of the bottom bar, after the question', () => {
    for (const [key, pagePrefix] of [['assessment/multi-page-quiz', 'Question'], ['assessment/spelling-test', 'Word']] as const) {
      const pages = pagesOf(key).filter((p) => new RegExp(`^${pagePrefix} \\d+$`).test(p.name));
      expect(pages.length).toBeGreaterThan(2);
      for (const page of pages) {
        const box = contentBox(page);
        const back = page.children.find((c) => c.name === 'Back button')!;
        const next = page.children.find((c) => c.name === 'Next button')!;
        expect(back.y).toBe(navBarY(page));
        expect(next.y).toBe(navBarY(page));
        expect(back.x).toBe(box.x);
        expect(next.x + next.width).toBe(box.x + box.width);
        const order = page.children.map((c) => c.name);
        expect(order.indexOf('Back button')).toBeGreaterThan(order.findIndex((n) => /^(Question \d+|Word body)$/.test(n)));
        expect(order.indexOf('Next button')).toBe(order.indexOf('Back button') + 1);
      }
    }
  });

  it('keeps the stepping buttons of the image sequence, slider and dialog cards on the same bar', () => {
    const at = (key: string, name: string, label: string) => {
      const page = pagesOf(key).find((p) => p.name === name)!;
      return buttons(page).find((b) => b.label === label)!.y - navBarY(page);
    };
    expect(at('explore/image-sequence', 'From seed to seed', 'Previous')).toBe(0);
    expect(at('explore/image-sequence', 'From seed to seed', 'Next')).toBe(0);
    expect(at('explore/flip-and-dialog-cards', 'Dialog cards', 'Previous')).toBe(0);
    expect(at('explore/flip-and-dialog-cards', 'Dialog cards', 'Next')).toBe(0);
  });
});
