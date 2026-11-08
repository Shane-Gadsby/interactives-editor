//Plain wording for the interaction nodes (and page for artboard): the technical names stay findable and shown on request.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CATALOG, CATALOG_BY_KIND, createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { GraphPalette } from '../src/panels/GraphPalette';
import { nodeMenuItems } from '../src/lib/node-menu';
import { rankNodes, suggestNode } from '../src/lib/node-search';
import { PLAIN_NODE, PLAIN_OPTION, labelOfKind, nodeAka, nodeHeading, nodeLabel, nodeTip, optionLabel, plainParam, pw, queryVariants } from '../src/lib/plain-words';
import { scoreEntry, type PropEntry } from '../src/lib/prop-search';
import { searchHelp } from '../src/help/search';
import { getTopic, topicBody } from '../src/help/topics';
import { nodeHelp } from '../src/help/context';
import { slug } from '../src/help/markdown';
import { prefs, setPrefs } from '../src/lib/prefs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  localStorage.clear();
  setPrefs({ technicalWording: false });
});
afterEach(() => setPrefs({ technicalWording: false }));

describe('the plain names', () => {
  it('belong to nodes that exist, say something different, and are short and plain', () => {
    for (const [kind, plain] of Object.entries(PLAIN_NODE)) {
      const def = CATALOG_BY_KIND[kind];
      expect(def, kind).toBeTruthy();
      expect(plain, kind).not.toBe(def.label);
      expect(plain.split(/\s+/).length, kind).toBeLessThanOrEqual(8);
      expect(plain, kind).not.toMatch(/—/);
      expect(plain, kind).not.toMatch(/\b(artboard|variable|boolean|timeline)\b/i);
    }
    for (const key of Object.keys(PLAIN_OPTION)) {
      const [kind, param, value] = key.split('.').length === 4 ? [key.split('.').slice(0, 2).join('.'), key.split('.')[2], key.split('.')[3]] : [];
      const p = CATALOG_BY_KIND[kind!]?.params.find((x) => x.key === param);
      expect(p?.options?.some((o) => o.value === value), key).toBe(true);
    }
  });

  it('no two nodes share one', () => {
    const shown = CATALOG.map((d) => nodeLabel(d));
    expect(new Set(shown).size).toBe(shown.length);
  });

  it('the headline ones the card asked for', () => {
    expect(nodeLabel(CATALOG_BY_KIND['event.pointer'])).toBe('When clicked or hovered');
    expect(nodeLabel(CATALOG_BY_KIND['action.timeline'])).toBe('Play or stop an animation');
    expect(nodeLabel(CATALOG_BY_KIND['action.setVariable'])).toBe('Change a value or counter');
    expect(nodeLabel(CATALOG_BY_KIND['action.artboard'])).toBe('Go to a page');
    expect(optionLabel('action.setVariable', 'op', { value: 'toggle', label: 'Toggle (boolean)' })).toBe('Flip on or off');
  });

  it('the technical name is the other name, in both modes', () => {
    const d = CATALOG_BY_KIND['event.pointer'];
    expect(nodeLabel(d, false)).toBe('When clicked or hovered');
    expect(nodeAka(d, false)).toBe('On pointer');
    expect(nodeLabel(d, true)).toBe('On pointer');
    expect(nodeAka(d, true)).toBe('When clicked or hovered');
    expect(nodeTip(d, false)).toContain('On pointer');
    expect(nodeTip(d, true)).toContain('When clicked or hovered');
    expect(nodeHeading(d)).toBe('When clicked or hovered (On pointer)');
    // a node that is already plain has no other name
    const wait = CATALOG_BY_KIND['action.delay'];
    expect(nodeAka(wait, false)).toBeNull();
    expect(nodeLabel(wait, false)).toBe(wait.label);
    expect(nodeHeading(wait)).toBe(wait.label);
  });

  it('follows the preference when it is not told', () => {
    const d = CATALOG_BY_KIND['action.setVariable'];
    expect(nodeLabel(d)).toBe('Change a value or counter');
    setPrefs({ technicalWording: true });
    expect(nodeLabel(d)).toBe('Set variable');
    expect(optionLabel('action.setVariable', 'op', { value: 'toggle', label: 'Toggle (boolean)' })).toBe('Toggle (boolean)');
    expect(labelOfKind('event.pointer')).toBe('On pointer');
    expect(labelOfKind('made.up')).toBe('made.up');
  });
});

describe('page for artboard', () => {
  it('says page in the catalog\'s own wording, unless the technical names are on', () => {
    expect(pw('Switches to another artboard: one you pick')).toBe('Switches to another page: one you pick');
    expect(pw('An artboard and its Artboards')).toBe('A page and its Pages');
    expect(pw('the artboard\'s name')).toBe('the page\'s name');
    expect(pw('artboardId stays')).toBe('artboardId stays');
    expect(pw('Go to artboard', true)).toBe('Go to artboard');
  });
  it('a node\'s settings read in plain words, with their choices', () => {
    const go = CATALOG_BY_KIND['action.artboard'];
    const to = plainParam(go.kind, go.params.find((p) => p.key === 'to')!, false);
    expect(to.options!.map((o) => o.label)).toEqual(['A chosen page', 'Next page', 'Previous page', 'Back (where the learner came from)', 'One named by an expression']);
    expect(plainParam(go.kind, go.params.find((p) => p.key === 'artboard')!, false).label).toBe('Page');
    const op = plainParam('action.setVariable', CATALOG_BY_KIND['action.setVariable'].params.find((p) => p.key === 'op')!, false);
    expect(op.options!.find((o) => o.value === 'toggle')!.label).toBe('Flip on or off');
    const same = CATALOG_BY_KIND['action.setVariable'].params.find((p) => p.key === 'op')!;
    expect(plainParam('action.setVariable', same, true)).toBe(same);
  });
  it('the query is tried both ways', () => {
    expect(queryVariants('artboard')).toEqual(['artboard', 'page']);
    expect(queryVariants('page title')).toEqual(['page title', 'artboard title']);
    expect(queryVariants('Artboards list')).toEqual(['Artboards list', 'pages list']);
    expect(queryVariants('opacity')).toEqual(['opacity']);
  });
  it('a row worded page is found by artboard, and one worded artboard by page', () => {
    const row = (label: string): PropEntry => ({ key: label, label, section: 'Layers' });
    expect(scoreEntry('artboard', row('Tidy up pages'))).toBeGreaterThan(0);
    expect(scoreEntry('artboards', row('Group pages'))).toBeGreaterThan(0);
    expect(scoreEntry('page', row('Artboard background'))).toBeGreaterThan(0);
    expect(scoreEntry('page', row('Opacity'))).toBe(0);
    // what the query says counts more than the other wording
    expect(scoreEntry('page', row('Page title'))).toBeGreaterThan(scoreEntry('page', row('Artboard title')));
  });
});

describe('searching nodes finds both names', () => {
  const first = (q: string) => rankNodes(q)[0]?.kind;
  it('by the technical name and by the plain one', () => {
    expect(first('on pointer')).toBe('event.pointer');
    expect(first('when clicked')).toBe('event.pointer');
    expect(first('clicked or hovered')).toBe('event.pointer');
    expect(first('set variable')).toBe('action.setVariable');
    expect(first('change a value')).toBe('action.setVariable');
    expect(first('counter')).toBe('action.setVariable');
    expect(first('control timeline')).toBe('action.timeline');
    expect(first('play or stop an animation')).toBe('action.timeline');
    expect(first('go to artboard')).toBe('action.artboard');
    expect(first('go to a page')).toBe('action.artboard');
    expect(first('on timeline end')).toBe('event.timelineEnd');
    expect(first('animation finishes')).toBe('event.timelineEnd');
  });
  it('whichever wording is on screen', () => {
    setPrefs({ technicalWording: true });
    expect(first('when clicked')).toBe('event.pointer');
    expect(first('on pointer')).toBe('event.pointer');
    expect(first('change a value')).toBe('action.setVariable');
    expect(suggestNode('artbaord')).toBe('Go to artboard');
  });
  it('the add menu searches by both too', () => {
    const leaves = nodeMenuItems(() => undefined).flatMap((i) => ('items' in i ? i.items : []));
    const pointer = leaves.find((l) => 'label' in l && l.label === 'When clicked or hovered') as { find?: string[]; title?: string };
    expect(pointer.find).toContain('On pointer');
    expect(pointer.title).toContain('On pointer');
  });
});

describe('the palette', () => {
  let root: Root;
  let host: HTMLElement;
  beforeEach(() => {
    setCurrentStore(new EditorStore(createProject('T')));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const mount = () => act(() => root.render(<GraphPalette onAdd={() => undefined} inputRef={createRef<HTMLInputElement>()} />));
  const item = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('.palette-item')].find((b) => b.textContent === text);
  const type = (v: string) =>
    act(() => {
      const i = host.querySelector<HTMLInputElement>('.palette-search-input')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, v);
      i.dispatchEvent(new Event('input', { bubbles: true }));
    });

  it('shows the plain name with the technical one in its tooltip', () => {
    mount();
    const b = item('When clicked or hovered')!;
    expect(b).toBeTruthy();
    expect(b.title).toContain('On pointer');
    expect(item('On pointer')).toBeUndefined();
  });

  it('searching by the technical name still gets there', () => {
    mount();
    type('on pointer');
    expect([...host.querySelectorAll('.palette-item')].map((b) => b.textContent)).toContain('When clicked or hovered');
    type('set variable');
    expect([...host.querySelectorAll('.palette-item')].map((b) => b.textContent)[0]).toBe('Change a value or counter');
  });

  it('Technical wording shows the file names, live, and the plain name moves to the tooltip', () => {
    mount();
    expect(item('On pointer')).toBeUndefined();
    act(() => setPrefs({ technicalWording: true }));
    expect(item('On pointer')).toBeTruthy();
    expect(item('When clicked or hovered')).toBeUndefined();
    expect(item('On pointer')!.title).toContain('When clicked or hovered');
    act(() => setPrefs({ technicalWording: false }));
    expect(item('When clicked or hovered')).toBeTruthy();
  });
});

describe('help names both', () => {
  const body = () => topicBody(getTopic('interaction-nodes')!);
  it('every node has a heading with its plain name and the technical one in brackets', () => {
    for (const [kind, plain] of Object.entries(PLAIN_NODE)) {
      expect(body(), kind).toContain(`### ${plain} (${CATALOG_BY_KIND[kind].label})`);
    }
  });
  it('the Help button for a node lands on a heading that exists, for every node', () => {
    const anchors = new Set([...body().matchAll(/^### (.*)$/gm)].map((m) => slug(m[1])));
    for (const d of CATALOG) {
      const t = nodeHelp(d.kind)!;
      expect(t.to.startsWith('interaction-nodes#'), d.kind).toBe(true);
      expect(anchors.has(t.to.split('#')[1]), `${d.kind} -> ${t.to}`).toBe(true);
      expect(t.label, d.kind).toBe(`${nodeLabel(d)} node`);
    }
  });
  it('is found by either name, and by either wording of a page', () => {
    for (const q of ['on pointer', 'when clicked or hovered', 'set variable', 'change a value or counter']) {
      expect(searchHelp(q).some((h) => h.topic.id === 'interaction-nodes'), q).toBe(true);
    }
    expect(searchHelp('artboard').some((h) => h.topic.id === 'artboards')).toBe(true);
    expect(searchHelp('page').some((h) => h.topic.id === 'artboards')).toBe(true);
  });
  it('the node reference speaks plainly', () => {
    expect(body()).toContain('Switches to another page');
    expect(body()).toContain('Flip on or off');
    expect(body()).not.toMatch(/^### [Aa]rtboard/m);
    expect(body()).toContain('### Go to a page (Go to artboard)');
  });
});

describe('the preference', () => {
  it('is off by default, and the server keeps it', () => {
    expect(prefs().technicalWording).toBe(false);
    const server = fs.readFileSync(path.resolve(__dirname, '..', 'index.js'), 'utf8');
    expect(server).toMatch(/technicalWording: 'boolean'/);
  });
  it('sits beside the other preferences the server keeps, on the client and the server', () => {
    const server = fs.readFileSync(path.resolve(__dirname, '..', 'index.js'), 'utf8');
    const keys = server.match(/const PREF_KEYS = \{([^\n]*)\}/)![1];
    const client = fs.readFileSync(path.resolve(__dirname, '..', 'src/lib/prefs.ts'), 'utf8');
    for (const k of ['technicalWording', 'askPictureDescription', 'gettingStarted']) {
      expect(keys, k).toContain(`${k}: 'boolean'`);
      expect(client, k).toMatch(new RegExp(`${k}: (true|false)`));
    }
  });
});

describe('the help written for behaviours, sentences and page navigation', () => {
  it('names nodes the way the editor shows them', () => {
    const text = ['interactions', 'links-cursors', 'page-navigation'].map((id) => getTopic(id)).filter(Boolean).map((t) => topicBody(t!)).join('\n');
    expect(text).toContain('When clicked or hovered');
    expect(text).not.toMatch(/\*\*(On pointer|Go to artboard|Set variable|Control timeline)\*\*/);
  });
});
