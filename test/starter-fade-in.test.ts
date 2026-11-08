//The layout and contrast checks judge a layer that fades in at its settled look, and still skip one that is hidden for good.
import { describe, expect, it } from 'vitest';
import { createNode, uid, type Artboard, type SceneNode, type Timeline } from 'interactives-player';
import { brandedPage, brandedProject, button, text } from '../src/lib/branded/kit';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { checkPageLayout } from '../src/lib/branded/layout-check';
import { checkProjectContrast } from '../src/lib/branded/contrast-check';

type Ctx = ReturnType<typeof brandedProject>;
const key = (t: number, value: number) => ({ id: uid('kf'), t, value, ease: 'linear' as const });
const fadeIn = (page: Artboard, node: SceneNode, autoplay = true): Timeline => {
  const tl = { id: uid('tl'), name: 'In', duration: 600, loop: 'once', autoplay, speed: 1, tracks: [{ id: uid('tr'), nodeId: node.id, prop: 'opacity', keys: [key(0, 0), key(600, 1)] }] } as Timeline;
  page.timelines = [...(page.timelines ?? []), tl];
  return tl;
};
//a words layer inside a frame that starts at opacity 0, with a button across it
const build = (fn: (ctx: Ctx, page: Artboard, group: SceneNode) => void) => {
  const ctx = brandedProject(COLOURWAYS[0], 'T');
  const page = brandedPage(ctx, 'Page');
  const words = text(ctx, 'Faded words', 'Some words that fade in', 60, 200, 300);
  const group = createNode('frame', { name: 'Faded group', x: 0, y: 0, width: 600, height: 400, fill: null, stroke: null, clip: false, opacity: 0, children: [words] } as never);
  page.children.push(group, button(ctx, 'Over it', 'Go', 60, 200));
  fn(ctx, page, group);
  return { ctx, page, group, words };
};
const clash = (ctx: Ctx, page: Artboard) => checkPageLayout(ctx.project, page).filter((v) => v.kind === 'button-text');

describe('checks of layers that fade in', () => {
  it('finds a button over words that start at opacity 0 and fade in', () => {
    const { ctx, page } = build((_, p, g) => fadeIn(p, g));
    expect(clash(ctx, page)).toHaveLength(1);
  });

  it('finds one that an Animate property brings up', () => {
    const { ctx, page } = build((_c, p, g) => {
      p.logic.nodes.push({ id: uid('ln'), kind: 'action.animate', x: 0, y: 0, params: { target: g.id, prop: 'opacity', to: '1', duration: 300 } });
    });
    expect(clash(ctx, page)).toHaveLength(1);
  });

  it('settles on the last key, so a timeline that is not autoplay still counts', () => {
    const { ctx, page } = build((_, p, g) => fadeIn(p, g, false));
    expect(clash(ctx, page)).toHaveLength(1);
  });

  it('still skips a layer at opacity 0 that nothing ever raises', () => {
    const { ctx, page } = build(() => undefined);
    expect(clash(ctx, page)).toEqual([]);
  });

  it('still skips one a timeline only fades out', () => {
    const { ctx, page } = build((_, p, g) => {
      const tl = fadeIn(p, g);
      tl.tracks[0].keys = [key(0, 0), key(600, 0)];
    });
    expect(clash(ctx, page)).toEqual([]);
  });

  it('reads the contrast of words that fade in', () => {
    const { ctx, words } = build((_c, p, g) => fadeIn(p, g));
    Object.assign(words, { color: ctx.L.border });
    const bad = checkProjectContrast(ctx.project, [], ['theme-gold']).filter((f) => f.kind === 'text' && f.layer.startsWith('Faded words'));
    expect(bad.length).toBeGreaterThan(0);
    //and none of it when nothing brings them up
    const quiet = build(() => undefined);
    Object.assign(quiet.words, { color: quiet.ctx.L.border });
    expect(checkProjectContrast(quiet.ctx.project, [], ['theme-gold']).filter((f) => f.layer.startsWith('Faded words'))).toEqual([]);
  });
});
