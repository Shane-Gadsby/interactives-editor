//A new overlay's card is bound to its page, so the page's size is the overlay's; and a page can fit its width to its content
import { describe, expect, it } from 'vitest';
import { cardOf, createNode, createProject, huggedWidth, type Artboard, type FrameNode, type Project } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { addDialog, bindCardToPage, unbindCard } from '../src/lib/dialog-kit';

function make(kind: 'tooltip' | 'modal' | 'confirm' | 'input' | 'toast') {
  const s = new EditorStore(createProject());
  let id = '';
  s.update((d) => void (id = addDialog(d as Project, kind).overlayId));
  const page = () => s.get().project.artboards.find((a) => a.id === id)!;
  const card = () => cardOf(page().children)!;
  const set = (fn: (a: Artboard) => void) => s.update((d) => fn(d.artboards.find((a) => a.id === id) as Artboard));
  return { s, page, card, set };
}

describe('a new overlay is bound to its page', () => {
  it('the card fills the page from its corner, and the page has no ground of its own', () => {
    for (const kind of ['tooltip', 'modal', 'confirm', 'input', 'toast'] as const) {
      const { page, card } = make(kind);
      expect(page().overlay!.bindCard).toBe(true);
      expect([card().x, card().y]).toEqual([0, 0]);
      expect([page().width, page().height]).toEqual([Math.ceil(card().width), Math.ceil(card().height)]);
      expect(page().background).toBeNull();
      expect(page().clip).toBe(false);
    }
  });

  it('a dialog is a set width and as tall as what is in it; a tooltip and a toast are as big as their words', () => {
    const modal = make('modal');
    expect(modal.page().hugWidth).toBeUndefined();
    expect(modal.page().hugHeight).toBe(true);
    for (const kind of ['tooltip', 'toast'] as const) {
      const p = make(kind).page();
      expect(p.hugWidth).toBe(true);
      expect(p.hugHeight).toBe(true);
    }
  });

  it('making the page wider makes the card wider, and the page stays as tall as the card', () => {
    const { page, card, set } = make('modal');
    set((a) => (a.width = 600));
    expect(card().width).toBe(600);
    expect(card().layout!.hugWidth).toBe(false);
    expect(page().height).toBe(Math.ceil(card().height));
  });

  it('turning Fit height off hands the height to the page too', () => {
    const { page, card, set } = make('confirm');
    set((a) => {
      delete a.hugHeight;
      a.height = 400;
    });
    expect(card().height).toBe(400);
    expect(card().layout!.hugHeight).toBe(false);
    //and back on, the card hugs again and the page follows it down
    set((a) => (a.hugHeight = true));
    expect(card().layout!.hugHeight).toBe(true);
    expect(page().height).toBe(Math.ceil(card().height));
    expect(page().height).toBeLessThan(400);
  });

  it('resizing the card itself resizes the page, so either handle works', () => {
    const { page, card, s } = make('modal');
    s.update((d) => {
      const c = cardOf(d.artboards.find((a) => a.id === page().id)!.children) as FrameNode;
      c.width = 520;
    });
    expect(page().width).toBe(520);
    expect(card().width).toBe(520);
    //its height is the content's to decide, so pulling that just springs back to what the content needs
    const h = card().height;
    s.update((d) => {
      const c = cardOf(d.artboards.find((a) => a.id === page().id)!.children) as FrameNode;
      c.height = 900;
    });
    expect(card().height).toBe(h);
    expect(page().height).toBe(Math.ceil(h));
  });

  it('a card dragged away snaps back to the page\'s corner', () => {
    const { card, s, page } = make('modal');
    s.update((d) => {
      const c = cardOf(d.artboards.find((a) => a.id === page().id)!.children) as FrameNode;
      c.x = 30;
      c.y = 12;
    });
    expect([card().x, card().y]).toEqual([0, 0]);
  });

  it('unbound, the two are sized apart again; bound later, the page takes the card\'s size so nothing shown changes', () => {
    const { page, card, set } = make('modal');
    set((a) => unbindCard(a));
    expect(page().overlay!.bindCard).toBeUndefined();
    set((a) => {
      delete a.hugHeight;
      a.width = 700;
      a.height = 500;
    });
    expect(card().width).toBe(440);
    const was = { w: card().width, h: card().height };
    set((a) => void bindCardToPage(a));
    expect([page().width, page().height]).toEqual([Math.ceil(was.w), Math.ceil(was.h)]);
    expect(card().width).toBe(was.w);
  });
});

describe('a toast is sized the way a modal is', () => {
  it('a set size once Fit width and Fit height are off, the card filling the page', () => {
    const { page, card, set } = make('toast');
    set((a) => {
      delete a.hugWidth;
      delete a.hugHeight;
      a.width = 360;
      a.height = 140;
    });
    expect([card().width, card().height]).toEqual([360, 140]);
    expect(card().layout!.hugWidth).toBe(false);
    expect(card().layout!.hugHeight).toBe(false);
    //and back on, it hugs its words again
    set((a) => {
      a.hugWidth = true;
      a.hugHeight = true;
    });
    expect(page().width).toBe(Math.ceil(card().width));
    expect(page().height).toBe(Math.ceil(card().height));
  });

  it('resizing the card resizes the page, once the page has a set width', () => {
    const { page, card, set, s } = make('toast');
    set((a) => void delete a.hugWidth);
    s.update((d) => {
      const c = cardOf(d.artboards.find((a) => a.id === page().id)!.children) as FrameNode;
      c.width = 480;
    });
    expect(page().width).toBe(480);
    expect(card().width).toBe(480);
  });

  it('a toast made before binding takes its card\'s size when bound, so nothing shown changes', () => {
    const { page, card, set } = make('toast');
    set((a) => unbindCard(a));
    set((a) => {
      delete a.hugWidth;
      delete a.hugHeight;
      a.width = 700;
      a.height = 500;
    });
    const was = { w: card().width, h: card().height };
    set((a) => void bindCardToPage(a));
    expect([page().width, page().height]).toEqual([Math.ceil(was.w), Math.ceil(was.h)]);
  });
});

describe('fit width to content', () => {
  it('the page is as wide as its furthest showing layer, and follows it', () => {
    const s = new EditorStore(createProject());
    const id = s.get().project.artboards[0].id;
    const ab = () => s.get().project.artboards[0];
    s.update((d) => {
      const a = d.artboards.find((x) => x.id === id)!;
      a.children.push(createNode('rect', { id: 'a', x: 20, y: 20, width: 100, height: 40 }), createNode('rect', { id: 'hidden', x: 900, y: 20, width: 100, height: 40, visible: false }));
      a.hugWidth = true;
    });
    expect(ab().width).toBe(120);
    s.update((d) => void ((d.artboards[0].children[0] as { width: number }).width = 300));
    expect(ab().width).toBe(320);
    //with room kept beyond it
    s.update((d) => void (d.artboards[0].hugPadding = 16));
    expect(ab().width).toBe(336);
    //and off, the width is the author's again
    expect(huggedWidth({ width: 500, hugWidth: false }, ab().children)).toBe(500);
  });
});

describe('a confirmation\'s buttons differ by job', () => {
  it('an answer marked danger is red, the one you mean is the button colour, and a way out is plain', () => {
    const { card } = make('confirm');
    const find = (n: { name?: string; children?: unknown[] }): { bindings: Record<string, string> } | null =>
      n.name === 'Answer button' ? (n as never) : ((n.children ?? []) as { name?: string }[]).map(find).find(Boolean) ?? null;
    const b = find(card())!.bindings;
    expect(b['fill.color']).toMatch(/^item\.danger \? ".+" : item\.main \? ".+" : ".+"$/);
    expect(b.color).toContain('item.danger');
    expect(b['stroke.paint.color']).toContain('item.danger');
  });
});
