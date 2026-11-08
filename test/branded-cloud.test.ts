//The Word cloud starter: builds in every colourway, the clouds are live variables over lists, contrast holds in every colourway,
//a learner can add, undo, remove and clear words, the blocklist refuses, and the class setting is ready for shared responses.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject, walk, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { BRANDED_STARTERS, COLOURWAYS, HIGH_CONTRAST, projectFromBrandedStarter } from '../src/lib/branded';
import { byName } from '../src/lib/branded/kit';
import { checkProjectContrast } from '../src/lib/branded/contrast-check';
import { checkProjectLayout, preparedPage } from '../src/lib/branded/layout-check';

const S = BRANDED_STARTERS.find((s) => s.key === 'explore/word-cloud')!;
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
const play = (project: Project, at?: Artboard) => {
  const player = new Player(document.getElementById('stage')!, project, { loadData: false });
  if (at) player.goTo(at.id);
  player.step(1000);
  return player;
};
const variable = (project: Project, name: string) => project.variables.find((v) => v.name === name)!;

beforeEach(() => {
  document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => vi.unstubAllGlobals());

//WCAG contrast of two theme colours, for a theme's tokens
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('Word cloud starter', () => {
  it('is in the explore set with a description and a layout state for each thing that shows later', () => {
    expect(S.set).toBe('explore');
    expect(S.description.length).toBeGreaterThan(40);
    expect(S.description).not.toMatch(/—/);
    expect(S.layoutStates!.map((l) => l.label)).toEqual(expect.arrayContaining(['word open', 'list view', 'crowded cloud']));
  });

  for (const way of [...COLOURWAYS, HIGH_CONTRAST]) {
    it(`builds in ${way.name}, normalises, paints with tokens only, plays, and every word colour reads on its fill`, async () => {
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
      //the three tiers of word: filled in the button colour, soft grey, and plain on the stage; each text colour has to read on its own fill in every theme
      const theme = way === HIGH_CONTRAST ? 'theme-high-contrast' : `theme-${way.id}`;
      const tok = (n: string) => project.themes!.tokens.find((t) => t.name === n)!.values[theme];
      expect(contrast(tok('color/button'), tok('color/on-button')), 'button').toBeGreaterThanOrEqual(4.5);
      expect(contrast(tok('color/surface-muted'), tok('color/text')), 'soft grey').toBeGreaterThanOrEqual(4.5);
      expect(contrast(tok('color/surface'), tok('color/text')), 'plain').toBeGreaterThanOrEqual(4.5);
      expect(contrast(tok('color/background'), tok('color/muted')), 'summary line').toBeGreaterThanOrEqual(4.5);
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

  it('makes the clouds with live variables over lists, one layer repeated over each, and counts the pages from the project', () => {
    const { project, board } = build();
    expect(variable(project, 'ourCloud')).toMatchObject({ live: true });
    expect(variable(project, 'ourCloud').formula).toContain('cloud(ourWords');
    expect(variable(project, 'myCloud').formula).toContain('cloud(cloudSource');
    expect(JSON.parse(String(variable(project, 'ourWords').initial))).toHaveLength(19);
    for (const [pageName, items] of [['Our cloud', 'ourCloud'], ['My cloud', 'myCloud']]) {
      const words = byName(board(pageName), 'Cloud words') as SceneNode & { repeat: { items: string; layout: string }; keyNav: Record<string, unknown> };
      expect(words.repeat).toMatchObject({ items, layout: 'none' });
      //one Tab stop, the arrows walk the words in reading order, hidden words keep their number
      expect(words.keyNav).toMatchObject({ mode: 'list', orientation: 'both', countHidden: true });
      const list = byName(board(pageName), 'Cloud list') as SceneNode & { repeat: { items: string }; keyNav: Record<string, unknown> };
      expect(list.repeat.items).toBe(items);
      expect(list.keyNav.mode).toBe('list');
    }
    expect(project.settings.reducedMotion).toBe(true);
  });

  it('draws every word of the author cloud at its own place without touching another, and in the list view too', async () => {
    const { project, board } = build();
    const page = board('Our cloud');
    const player = play(project, page);
    const cloud = player.getVariable('ourCloud') as { x: number; y: number; w: number; h: number; shown: boolean; text: string }[];
    expect(cloud).toHaveLength(19);
    expect(cloud.every((w) => w.shown)).toBe(true);
    expect(cloud[0].text).toBe('practice');
    expect(player.getVariable('ourHidden')).toBe(0);
    const word = byName(page, 'Cloud word')!.id;
    for (let i = 0; i < cloud.length; i++) {
      const el = must(`${word}~${i}`);
      const at = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform)!;
      expect(el.style.display).not.toBe('none');
      expect(parseFloat(at[1])).toBeCloseTo(cloud[i].x, 0);
      expect(parseFloat(at[2])).toBeCloseTo(cloud[i].y, 0);
      expect(parseFloat(el.style.width)).toBeCloseTo(cloud[i].w, 0);
      expect(el.textContent).toBe(cloud[i].text);
    }
    //the list view is the same words with their weights
    expect(must(byName(page, 'Cloud words')!.id).style.display).not.toBe('none');
    await click(byName(page, 'View button')!.id);
    expect(player.getVariable('asList')).toBe(true);
    player.step(100);
    expect(must(byName(page, 'Cloud words')!.id).style.display).toBe('none');
    const row = byName(page, 'Cloud row')!.id;
    expect(must(`${row}~0`).textContent).toContain('practice');
    expect(must(`${row}~0`).textContent).toContain('14');
    expect(must(`${row}~0`).getAttribute('aria-label')).toBe('practice, weight 14');
    player.destroy?.();
  });

  it('opens a word in a dialog with its detail, from a click on the cloud or on the list, and reads the right word', async () => {
    const { project, board } = build();
    const page = board('Our cloud');
    const player = play(project, page);
    const word = byName(page, 'Cloud word')!.id;
    await click(`${word}~2`);
    expect(player.getVariable('ourPicked')).toBe(2);
    expect(player.getVariable('ourOpen')).toBe(true);
    player.step(100);
    const dialog = must(byName(page, 'Word dialog')!.id);
    expect(dialog.textContent).toContain('notes');
    expect(dialog.textContent).toContain('own words');
    expect(dialog.textContent).toContain('Weight 9');
    //a word with no link has no Read more
    expect(must(byName(page, 'Read more button')!.id).style.display).toBe('none');
    await click(byName(page, 'Word dialog close button')!.id);
    expect(player.getVariable('ourOpen')).toBe(false);
    await click(byName(page, 'View button')!.id);
    player.step(100);
    await click(`${byName(page, 'Cloud row')!.id}~0`);
    expect(player.getVariable('ourPicked')).toBe(0);
    player.step(100);
    expect(must(byName(page, 'Word dialog')!.id).textContent).toContain('practice');
    expect(must(byName(page, 'Read more button')!.id).style.display).not.toBe('none');
    player.destroy?.();
  });

  it('puts words below minCount, blocked words and words that cannot fit out of the picture, and still lists the ones that do not fit', () => {
    const { project, board } = build();
    const player = play(project, board('Our cloud'));
    player.setVariable('ourWords', [{ text: 'spam', weight: 99 }, { text: 'big', weight: 5 }, { text: 'once', weight: 1 }]);
    player.setVariable('minCount', 2);
    player.step(50);
    expect((player.getVariable('ourCloud') as { text: string }[]).map((w) => w.text)).toEqual(['big']);
    player.setVariable('minCount', 1);
    player.setVariable('ourWidth', 120);
    player.setVariable('ourHeight', 50);
    player.setVariable('ourWords', Array.from({ length: 30 }, (_, i) => ({ text: `word${i}`, weight: 30 - i })));
    player.step(50);
    expect(player.getVariable('ourHidden')).toBeGreaterThan(0);
    expect((player.getVariable('ourCloud') as unknown[]).length).toBe(30);
    player.destroy?.();
  });

  describe('the pills and word colour settings', () => {
    const tokenRef = (project: Project, name: string) => `token:${project.themes!.tokens.find((t) => t.name === name)!.id}`;
    //a word is a clickable chip (a frame) with its text inside: the chip's fill and the text's colour and size are what the settings change
    type Word = { fill: { color?: string } | null; color: string; fontSize: number };
    const cloudWords = (nodes: SceneNode[]): Word[] => {
      const out: Word[] = [];
      walk(nodes, (n: SceneNode) => {
        if (n.name !== 'Cloud word') return;
        const label = (n as unknown as { children: (SceneNode & Word)[] }).children[0];
        out.push({ fill: (n as unknown as Word).fill, color: label.color, fontSize: label.fontSize });
      });
      return out;
    };
    //the first few words of a cloud as the page draws them under a combination of the two settings
    const look = (pills: boolean, wordColour: string, pageName = 'Our cloud') => {
      const { project, board } = build();
      const state = { label: 'x', page: pageName, vars: { pills, wordColour } };
      const { nodes } = preparedPage(project, board(pageName), state);
      const words = cloudWords(nodes);
      const tok = (n: string) => tokenRef(project, n);
      return { words, tok, project };
    };

    it('start as pills on and plain words, and say so as variables with those values', () => {
      const { project } = build();
      expect(variable(project, 'pills')).toMatchObject({ type: 'boolean' });
      expect(String(variable(project, 'pills').initial)).toBe('true');
      expect(variable(project, 'wordColour')).toMatchObject({ type: 'enum', options: ['Plain', 'Colourway'] });
      expect(String(variable(project, 'wordColour').initial)).toBe('Plain');
    });

    it('pills on, plain: a grey chip behind every word, in the theme text colour', () => {
      const { words, tok } = look(true, 'Plain');
      expect(words.length).toBeGreaterThan(10);
      for (const w of words) {
        expect(w.fill?.color).toBe(tok('color/surface-muted'));
        expect(w.color).toBe(tok('color/text'));
      }
    });

    it('pills off, plain: the chip takes the stage colour and every word is in the theme text colour', () => {
      const { words, tok } = look(false, 'Plain');
      for (const w of words) {
        expect(w.fill?.color).toBe(tok('color/surface'));
        expect(w.color).toBe(tok('color/text'));
      }
    });

    it('colourway with pills: the biggest words in the button colour, large words in primary, the rest plain', () => {
      const { words, tok } = look(true, 'Colourway');
      const big = words.filter((w) => w.fill?.color === tok('color/button'));
      expect(big.length).toBeGreaterThan(0);
      for (const w of big) expect(w.color).toBe(tok('color/on-button'));
      const rest = words.filter((w) => w.fill?.color !== tok('color/button'));
      for (const w of rest) {
        expect(w.fill?.color).toBe(tok('color/surface-muted'));
        expect([tok('color/primary'), tok('color/text')]).toContain(w.color);
      }
      expect(rest.some((w) => w.color === tok('color/primary'))).toBe(true);
    });

    it('colourway without pills: no chip, large words in primary and small ones plain, never the button colour', () => {
      const { words, tok } = look(false, 'Colourway');
      expect(words.some((w) => w.color === tok('color/primary'))).toBe(true);
      for (const w of words) {
        expect(w.fill?.color).toBe(tok('color/surface'));
        expect([tok('color/primary'), tok('color/text')]).toContain(w.color);
        expect(w.color === tok('color/primary')).toBe(w.fontSize >= 24);
      }
    });

    it('keeps every word a labelled button in the one keyboard group (one Tab stop), under every setting', () => {
      for (const [pills, wordColour] of [[true, 'Plain'], [false, 'Plain'], [true, 'Colourway'], [false, 'Colourway']] as const) {
        const { project, board } = build();
        const page = board('Our cloud');
        const player = play(project, page);
        player.setVariable('pills', pills);
        player.setVariable('wordColour', wordColour);
        player.step(50);
        const id = byName(page, 'Cloud word')!.id;
        const els = [0, 1, 2, 3].map((i) => must(`${id}~${i}`));
        for (const el of els) expect(el.getAttribute('role')).toBe('button');
        expect(els[0].getAttribute('aria-label')).toBe('practice, weight 14');
        expect(els.filter((el) => el.getAttribute('tabindex') === '0')).toHaveLength(1);
        player.destroy?.();
      }
    });

    it('applies to the learner cloud too', () => {
      const { project, board } = build();
      const state = { label: 'x', page: 'My cloud', vars: { pills: false, wordColour: 'Colourway', answers: ['practice', 'practice', 'sleep', 'notes'] } };
      const { nodes } = preparedPage(project, board('My cloud'), state);
      const words = cloudWords(nodes);
      expect(words.length).toBe(3);
      expect(words[0].color).toBe(tokenRef(project, 'color/primary'));
    });

    it('holds the layout and every contrast in every colourway and High contrast, for all four combinations on both pages', () => {
      const project = projectFromBrandedStarter(S, COLOURWAYS[0]);
      const states = ['no pills', 'colourway words', 'colourway words, no pills'];
      expect(S.layoutStates!.map((l) => l.label)).toEqual(expect.arrayContaining(states));
      //the words fade in from nothing, and both checkers skip a layer that starts at 0 opacity, so they would not see a single word. Read them at the end of the fade
      for (const ab of project.artboards) walk(ab.children, (n: SceneNode) => void (n.name === 'Cloud words' && (n.opacity = 1)));
      expect(checkProjectContrast(project, S.layoutStates)).toEqual([]);
      expect(checkProjectLayout(project, S.layoutStates)).toEqual([]);
    });

    it('is read by the contrast check at all: a word colour that fails is caught', () => {
      const project = projectFromBrandedStarter(S, COLOURWAYS[0]);
      for (const ab of project.artboards) walk(ab.children, (n: SceneNode) => void (n.name === 'Cloud words' && (n.opacity = 1)));
      const surface = tokenRef(project, 'color/surface');
      for (const ab of project.artboards) walk(ab.children, (n: SceneNode) => void (n.name === 'Word label' && ((n as { bindings: Record<string, string> }).bindings.color = JSON.stringify(surface))));
      expect(checkProjectContrast(project, S.layoutStates).filter((f) => f.kind === 'text' && f.layer.startsWith('Word label')).length).toBeGreaterThan(0);
    });
  });

  describe('the learner cloud', () => {
    const setup = () => {
      const { project, board } = build();
      const page = board('My cloud');
      const player = play(project, page);
      const id = (name: string) => byName(page, name)!.id;
      const add = async (word: string) => {
        player.setVariable('draft', word);
        player.step(10);
        await click(id('Add button'));
      };
      return { project, page, player, id, add };
    };

    it('starts empty, with a line that says so, and a disabled Add, Undo and Clear', () => {
      const { page, player, id } = setup();
      expect(player.getVariable('answers')).toEqual([]);
      expect(must(id('Empty cloud text')).style.display).not.toBe('none');
      for (const n of ['Add button', 'Undo button', 'Clear button']) expect(must(id(n)).querySelector('button')!.disabled, n).toBe(true);
      expect(page).toBeTruthy();
      player.destroy?.();
    });

    it('adds a word on Add or Enter, tidies the spacing, empties the box, marks the newest, and counts the same word once in any capitals', async () => {
      const { player, id, add } = setup();
      await add('  Deep   sleep ');
      expect(player.getVariable('answers')).toEqual(['Deep sleep']);
      expect(player.getVariable('draft')).toBe('');
      expect(player.getVariable('lastAdded')).toBe('deep sleep');
      player.setVariable('draft', 'deep SLEEP');
      player.step(10);
      const box = must(id('Word box')).querySelector('input,textarea') ?? must(id('Word box'));
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await flush();
      expect(player.getVariable('answers')).toEqual(['Deep sleep', 'deep SLEEP']);
      const cloud = player.getVariable('myCloud') as { text: string; weight: number }[];
      expect(cloud).toHaveLength(1);
      expect(cloud[0]).toMatchObject({ text: 'Deep sleep', weight: 2 });
      player.destroy?.();
    });

    it('refuses a blocked word (and a phrase with one in it) and a long one, says why, and Enter does nothing', async () => {
      const { player, id } = setup();
      for (const [text, state] of [['spam', 'blocked'], ['Some SPAM here', 'blocked'], ['x'.repeat(41), 'long'], ['   ', 'empty'], ['fine', 'ok']] as const) {
        player.setVariable('draft', text);
        player.step(10);
        expect(player.getVariable('draftState'), text).toBe(state);
        expect(must(id('Add button')).querySelector('button')!.disabled, text).toBe(state !== 'ok');
      }
      player.setVariable('draft', 'spam');
      player.step(10);
      expect(must(id('Word note')).textContent).toContain('not allowed');
      const box = must(id('Word box')).querySelector('input,textarea') ?? must(id('Word box'));
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await flush();
      expect(player.getVariable('answers')).toEqual([]);
      player.destroy?.();
    });

    it('undoes the last word, removes one from its dialog, and clears everything only after asking', async () => {
      const { player, id, add, page } = setup();
      for (const w of ['one', 'two', 'two', 'three']) await add(w);
      expect((player.getVariable('myCloud') as unknown[]).length).toBe(3);
      await click(id('Undo button'));
      expect(player.getVariable('answers')).toEqual(['one', 'two', 'two']);
      //click the word "two" (the heaviest, so the first) and remove it
      await click(`${byName(page, 'Cloud word')!.id}~0`);
      expect(player.getVariable('myPicked')).toBe(0);
      player.step(100);
      expect(must(id('Word dialog')).textContent).toContain('You added this 2 times');
      await click(id('Remove word button'));
      expect(player.getVariable('answers')).toEqual(['one']);
      expect(player.getVariable('myOpen')).toBe(false);
      player.step(100);
      await click(id('Clear button'));
      expect(player.getVariable('clearOpen')).toBe(true);
      expect(player.getVariable('answers')).toEqual(['one']);
      await click(id('Clear all words button'));
      expect(player.getVariable('answers')).toEqual([]);
      expect(player.getVariable('clearOpen')).toBe(false);
      player.destroy?.();
    });

    it('keeps the words as user data', () => {
      const { project } = setup();
      expect(variable(project, 'answers')).toMatchObject({ userData: true, type: 'list' });
      expect(variable(project, 'blocked').initial).toContain('spam');
    });
  });

  it('has one author setting for who sees the cloud, whole for Only me and ready to be switched over to a shared source', () => {
    const { project, board } = build();
    const who = variable(project, 'whoSees');
    expect(who).toMatchObject({ type: 'enum', initial: 'Only me', options: ['Only me', 'Everyone in this class'] });
    const player = play(project, board('My cloud'));
    player.setVariable('answers', ['mine', 'mine']);
    player.setVariable('sharedAnswers', ['theirs']);
    player.step(20);
    expect((player.getVariable('myCloud') as { text: string }[]).map((w) => w.text)).toEqual(['mine']);
    //the class option keeps showing their own words until shared responses are wired (sharedReady)
    player.setVariable('whoSees', 'Everyone in this class');
    player.step(20);
    expect(player.getVariable('cloudShared')).toBe(false);
    expect((player.getVariable('myCloud') as { text: string }[]).map((w) => w.text)).toEqual(['mine']);
    player.setVariable('sharedReady', true);
    player.step(20);
    expect(player.getVariable('cloudShared')).toBe(true);
    expect((player.getVariable('myCloud') as { text: string }[]).map((w) => w.text)).toEqual(['theirs']);
    expect(must(byName(board('My cloud'), 'Footer text')!.id).textContent).toContain('Shared with everyone in this class');
    player.destroy?.();
    const notes = board('My cloud').notes!.map((n) => n.text).join('\n');
    expect(notes).toMatch(/shared responses/i);
    expect(JSON.stringify(S.build(COLOURWAYS[0]).checklist)).toMatch(/whoSees/);
  });

  it('has author notes beside the pages, in the template voice', () => {
    const { board } = build();
    for (const name of ['Our cloud', 'My cloud']) {
      const notes = board(name).notes!;
      expect(notes.length).toBeGreaterThanOrEqual(3);
      for (const n of notes) {
        expect(n.author).toBe('Template');
        expect(n.y).toBeGreaterThanOrEqual(board(name).height);
        expect(n.text).not.toMatch(/—/);
        expect(n.text.split('\n').length).toBeLessThanOrEqual(3);
      }
    }
  });
});
