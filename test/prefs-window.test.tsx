import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { PREF_DEFAULTS, prefs, setPrefs } from '../src/lib/prefs';
import { PrefsHost } from '../src/components/PrefsModal';
import { DialogHost } from '../src/components/dialogs';
import { PAGES, closePrefs, offerImport, openPrefs, prefsWindow, setEditorShown } from '../src/lib/prefs-window';
import { closeShortcuts, openShortcuts, shortcutsOpen } from '../src/lib/shortcuts-sheet';
import { PAGE_INFO, SETTINGS, pageIsDefault, pageKeys, searchSettings } from '../src/components/PrefsPages';
import { activeSet, customSets, exportText, currentAsFile, shareCode, EXPORT_FORMAT, saveCurrentAs } from '../src/lib/keymap-sets';
import { bindingsOf, keysSuspended } from '../src/lib/keymap';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const reset = () => setPrefs({ ...PREF_DEFAULTS, keymap: undefined, keymapPreset: 'default', keymapSets: undefined, keymapActive: undefined, sectionOrder: undefined, toolOrder: undefined });
beforeEach(() => {
  reset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <>
        <PrefsHost />
        <DialogHost />
      </>,
    ),
  );
});
afterEach(() => {
  act(() => (openPrefs('general'), closePrefs()));
  act(() => root.unmount());
  host.remove();
  setEditorShown(false);
  reset();
});

const open = (page?: (typeof PAGES)[number]) => act(() => openPrefs(page));
const tabs = () => [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const tab = (label: string) => tabs().find((t) => t.textContent === label)!;
const panel = () => document.querySelector<HTMLElement>('[role="tabpanel"]')!;
const key = (el: Element, k: string, init: KeyboardEventInit = {}) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })));
const typeInto = (el: HTMLInputElement | HTMLTextAreaElement, v: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 10))));
const dialogButton = (re: RegExp) => [...document.querySelectorAll<HTMLButtonElement>('.dialog-backdrop button')].find((b) => re.test(b.textContent ?? ''))!;
const checkbox = (label: string) => [...panel().querySelectorAll<HTMLLabelElement>('label')].find((l) => l.textContent === label)!.querySelector('input') as HTMLInputElement;

describe('every preference has a place', () => {
  //the keys the server keeps (PREF_KEYS in index.js) that have no setting of their own, and why
  const NO_SETTING: Record<string, string> = {
    keymapSets: 'the keyboard set picker keeps them; Reset leaves saved sets alone on purpose',
    sectionFolds: 'remembered as you fold a section',
    onboarding: 'what the first-run screen remembers',
    workspaces: 'saved from the Workspace page',
  };
  const server = [...readFileSync('index.js', 'utf8').matchAll(/PREF_KEYS = \{(.*)\},\n/g)][0][1].match(/(\w+): (?=[\['{])/g)!.map((m) => m.slice(0, -2));
  const owned = new Set(SETTINGS.flatMap((s) => s.keys as string[]));

  it('every preference the editor starts with, and every one the server keeps, is on a page or on the short list that has none', () => {
    expect(server.length).toBeGreaterThan(30);
    for (const k of [...Object.keys(PREF_DEFAULTS), ...server]) expect(owned.has(k) || k in NO_SETTING, `${k} has no setting`).toBe(true);
  });

  it('settings have unique ids, real pages, a label and words to search by', () => {
    expect(new Set(SETTINGS.map((s) => s.id)).size).toBe(SETTINGS.length);
    for (const s of SETTINGS) {
      expect(PAGES).toContain(s.page);
      expect(s.label.length).toBeGreaterThan(2);
      expect(s.tip.length).toBeGreaterThan(10);
    }
    for (const id of PAGES) expect(SETTINGS.some((s) => s.page === id), id).toBe(true);
  });

  it('the page shows every setting that belongs to it', () => {
    setEditorShown(true);
    for (const id of PAGES) {
      open(id);
      const shown = [...panel().querySelectorAll('[data-pref]')].map((e) => e.getAttribute('data-pref'));
      expect(shown, id).toEqual(SETTINGS.filter((s) => s.page === id).map((s) => s.id));
    }
  });
});

describe('the window', () => {
  it('opens on General, as a dialog with a vertical tablist and one labelled panel', () => {
    open();
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Preferences');
    const list = document.querySelector('[role="tablist"]')!;
    expect(list.getAttribute('aria-orientation')).toBe('vertical');
    expect(tabs().map((t) => t.textContent)).toEqual(['General', 'Canvas and guides', 'Timeline', 'Interactions', 'Text and fonts', 'Accessibility', 'Keyboard shortcuts']);
    expect(tabs().filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.textContent)).toEqual(['General']);
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1, -1, -1, -1, -1]);
    expect(panel().getAttribute('aria-labelledby')).toBe(tab('General').id);
    expect(panel().querySelector('h2')?.textContent).toBe('General');
    expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
  });

  it('the Workspace page is for the editor only', () => {
    open();
    expect(tabs().map((t) => t.textContent)).not.toContain('Workspace');
    act(() => closePrefs());
    setEditorShown(true);
    open();
    expect(tabs().map((t) => t.textContent)).toContain('Workspace');
    act(() => tab('Workspace').click());
    expect(panel().querySelector('[aria-label="Section and tool order"]')).not.toBeNull();
    expect(panel().querySelector('.prefs-workspaces')).not.toBeNull();
  });

  it('arrow keys, Home and End move between the pages and take the selection with them', async () => {
    setEditorShown(true);
    open();
    key(tab('General'), 'ArrowDown');
    expect(prefsWindow().page).toBe('canvas');
    expect(tab('Canvas and guides').getAttribute('aria-selected')).toBe('true');
    expect(panel().querySelector('h2')?.textContent).toBe('Canvas and guides');
    await flush();
    expect(document.activeElement).toBe(tab('Canvas and guides'));
    key(tab('Canvas and guides'), 'ArrowUp');
    key(tab('General'), 'ArrowUp');
    expect(prefsWindow().page).toBe('workspace');
    key(tab('Workspace'), 'Home');
    expect(prefsWindow().page).toBe('general');
    key(tab('General'), 'End');
    expect(prefsWindow().page).toBe('workspace');
  });

  it('changes apply at once, with no OK', () => {
    open();
    const dark = panel().querySelector<HTMLSelectElement>('select')!;
    expect(dark.value).toBe('dark');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(dark, 'light');
      dark.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(prefs().theme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect([...document.querySelectorAll('button')].some((b) => /^(OK|Apply|Cancel)$/.test(b.textContent ?? ''))).toBe(false);
  });

  it('Escape closes it, and the editor keys stand down while it is open', () => {
    open();
    expect(keysSuspended()).toBe(true);
    key(window as unknown as Element, 'Escape');
    expect(prefsWindow().open).toBe(false);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(keysSuspended()).toBe(false);
  });

  it('a dialog from inside it takes its own Escape and leaves the window open', async () => {
    open('general');
    act(() => void [...document.querySelectorAll<HTMLButtonElement>('.prefs-foot button')].find((b) => b.textContent === 'Reset everything')!.click());
    expect(document.querySelector('.dialog-backdrop')).not.toBeNull();
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    await flush();
    expect(document.querySelector('.dialog-backdrop')).toBeNull();
    expect(prefsWindow().open).toBe(true);
  });

  it('the shortcuts sheet is its Keyboard shortcuts page, and ? toggles it', () => {
    act(() => openShortcuts(false));
    expect(shortcutsOpen()).toBe(true);
    expect(tab('Keyboard shortcuts').getAttribute('aria-selected')).toBe('true');
    expect(panel().querySelector('.keys-list')).not.toBeNull();
    act(() => openShortcuts());
    expect(prefsWindow().open).toBe(false);
    open('canvas');
    act(() => openShortcuts());
    expect(prefsWindow().open).toBe(true);
    expect(prefsWindow().page).toBe('keys');
    act(() => closeShortcuts());
    expect(prefsWindow().open).toBe(false);
  });
});

describe('search', () => {
  it('finds settings on any page by name, by what they do, and by the other words people use, best match first', () => {
    const names = (q: string) => searchSettings(q, true).map((s) => s.id);
    expect(names('snap')[0]).toBe('snapOn');
    expect(names('snap').length).toBeGreaterThan(8);
    expect(names('dark')).toContain('theme');
    expect(names('typeface')).toEqual(['defaultFont']);
    expect(names('screen reader')).toContain('screenReader');
    expect(names('nothing matches this zzz')).toEqual([]);
    expect(names('   ')).toEqual([]);
    //every word has to match
    expect(names('snap zzz')).toEqual([]);
    expect(names('reset order')).toContain('workspace-order');
    expect(searchSettings('reset order', false).map((s) => s.id)).not.toContain('workspace-order');
  });

  it('picking a result goes to the page, marks the setting and puts focus on it', () => {
    open();
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Search preferences"]')!;
    typeInto(input, 'grid size');
    expect(document.querySelector('.prefs-results')).not.toBeNull();
    const first = document.querySelector<HTMLButtonElement>('.prefs-result')!;
    expect(first.textContent).toContain('Grid size');
    expect(first.textContent).toContain('Canvas and guides › Rulers and grid');
    act(() => first.click());
    expect(prefsWindow().page).toBe('canvas');
    expect(input.value).toBe('');
    const target = panel().querySelector('[data-pref="gridSize"]')!;
    expect(target.classList.contains('pref-flash')).toBe(true);
    expect(target.contains(document.activeElement)).toBe(true);
  });

  it('Enter in the box takes the first result, Escape clears it first and closes second', () => {
    open();
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Search preferences"]')!;
    typeInto(input, 'tooltips');
    key(input, 'Enter');
    expect(prefsWindow().page).toBe('general');
    expect(panel().querySelector('[data-pref="tooltips"]')?.classList.contains('pref-flash')).toBe(true);
    typeInto(input, 'zzzz');
    expect(document.querySelector('.prefs-results')?.textContent).toContain('Nothing found');
    key(input, 'Escape');
    expect(input.value).toBe('');
    expect(prefsWindow().open).toBe(true);
    key(window as unknown as Element, 'Escape');
    expect(prefsWindow().open).toBe(false);
  });

  it('also offers the keyboard shortcuts that match, which opens that page with the search filled in', () => {
    open();
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Search preferences"]')!;
    typeInto(input, 'rectangle');
    const more = [...document.querySelectorAll<HTMLButtonElement>('.prefs-result')].find((b) => /keyboard shortcuts? match/.test(b.textContent ?? ''))!;
    act(() => more.click());
    expect(prefsWindow().page).toBe('keys');
    expect(document.querySelector<HTMLInputElement>('.keys-search input')!.value).toBe('rectangle');
    expect([...document.querySelectorAll('.keys-name')].map((n) => n.textContent)).toContain('Rectangle tool');
  });
});

describe('Reset this page and Reset everything', () => {
  const foot = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.prefs-foot button')].find((b) => b.textContent === label)!;

  it('Reset this page is off when the page is as it starts, and puts only that page back', async () => {
    open('canvas');
    expect(foot('Reset this page').disabled).toBe(true);
    act(() => setPrefs({ rulers: true, snapDistance: 12, theme: 'light' }));
    expect(foot('Reset this page').disabled).toBe(false);
    expect(pageIsDefault('canvas', prefs())).toBe(false);
    act(() => foot('Reset this page').click());
    expect(dialogButton(/Reset this page/)).toBeTruthy();
    act(() => dialogButton(/Reset this page/).click());
    await flush();
    expect(prefs().rulers).toBe(false);
    expect(prefs().snapDistance).toBe(6);
    expect(prefs().theme).toBe('light');
    expect(foot('Reset this page').disabled).toBe(true);
  });

  it('can be cancelled', async () => {
    open('canvas');
    act(() => setPrefs({ rulers: true }));
    act(() => foot('Reset this page').click());
    act(() => dialogButton(/Cancel/).click());
    await flush();
    expect(prefs().rulers).toBe(true);
  });

  it('Reset everything puts every page back, keys included, and keeps saved sets', async () => {
    open('general');
    act(() => setPrefs({ theme: 'light', rulers: true, timelineList: false, defaultFont: 'Lora', technicalWording: true, keymap: { 'tool.rect': ['M'] } }));
    saveCurrentAs('Mine');
    act(() => setPrefs({ keymap: { 'tool.rect': ['M'] }, keymapActive: undefined }));
    act(() => foot('Reset everything').click());
    act(() => dialogButton(/Reset everything/).click());
    await flush();
    const p = prefs();
    expect([p.theme, p.rulers, p.timelineList, p.defaultFont, p.technicalWording]).toEqual(['dark', false, true, 'Open Sans', false]);
    expect(bindingsOf('tool.rect')).toEqual(['R']);
    expect(activeSet()).toMatchObject({ kind: 'built-in', modified: false });
    expect(customSets().map((s) => s.name)).toEqual(['Mine']);
    for (const id of PAGES) expect(pageIsDefault(id, prefs()), id).toBe(true);
  });

  it('puts the Getting started strip back too, even when it was put away for good', async () => {
    act(() => setPrefs({ gettingStarted: false, onboarding: { dismissed: true } }));
    open('general');
    act(() => foot('Reset this page').click());
    act(() => dialogButton(/Reset this page/).click());
    await flush();
    expect(prefs().gettingStarted).toBe(true);
    expect(prefs().onboarding?.dismissed).toBeUndefined();
  });

  it('the Timeline lanes are settings too: hidden is off by default and reset shows them again', async () => {
    open('timeline');
    act(() => checkbox('Show the Sound lane').click());
    expect(prefs().timelineHideSound).toBe(true);
    expect(checkbox('Show the Sound lane').checked).toBe(false);
    act(() => foot('Reset this page').click());
    act(() => dialogButton(/Reset this page/).click());
    await flush();
    expect(checkbox('Show the Sound lane').checked).toBe(true);
    expect(pageKeys('timeline')).toEqual(expect.arrayContaining(['timelineHideSound', 'timelineHideCaptions', 'timelineHideDescriptions']));
  });
});

describe('the Keyboard shortcuts page: sets', () => {
  const setBar = () => document.querySelector('.keys-sets')!;
  const picker = () => setBar().querySelector<HTMLSelectElement>('select')!;
  const pick = (v: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(picker(), v);
      picker().dispatchEvent(new Event('change', { bubbles: true }));
    });
  const menu = () => setBar().querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
  const item = (label: RegExp) => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => label.test(b.textContent ?? ''))!;
  const fillPrompt = (v: string) => {
    typeInto(document.querySelector<HTMLInputElement>('.dialog-field input')!, v);
    act(() => dialogButton(/^Save$|^Rename$/).click());
  };

  it('lists the built-in sets, and switching to Illustration style applies at once', async () => {
    open('keys');
    expect([...picker().options].map((o) => o.textContent)).toEqual(['Default', 'Illustration style']);
    expect(picker().value).toBe('default');
    pick('illustration');
    await flush();
    expect(bindingsOf('tool.rect')).toEqual(['M']);
    expect(picker().value).toBe('illustration');
  });

  it('Save as asks for a name, adds it under Mine and uses it', async () => {
    open('keys');
    act(() => setPrefs({ keymap: { 'tool.rect': ['M'] } }));
    expect([...picker().options].find((o) => o.value === 'default')!.textContent).toBe('Default (changed)');
    act(() => void [...setBar().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Save as…')!.click());
    expect(document.querySelector<HTMLInputElement>('.dialog-field input')!.value).toBe('My keys');
    fillPrompt('Drawing');
    await flush();
    expect(customSets().map((s) => s.name)).toEqual(['Drawing']);
    expect(picker().value).toBe(customSets()[0].id);
    expect(picker().querySelector('optgroup[label="Mine"]')?.textContent).toBe('Drawing');
    expect(bindingsOf('tool.rect')).toEqual(['M']);
  });

  it('asks before leaving changes that are not saved, and can save them first', async () => {
    open('keys');
    act(() => setPrefs({ keymap: { 'tool.rect': ['M'] } }));
    pick('illustration');
    await flush();
    expect(document.querySelector('.dialog-backdrop')?.textContent).toContain('Keep your changed keys?');
    act(() => dialogButton(/Cancel/).click());
    await flush();
    expect(picker().value).toBe('default');
    expect(bindingsOf('tool.rect')).toEqual(['M']);
    pick('illustration');
    await flush();
    act(() => dialogButton(/Save them first/).click());
    await flush();
    fillPrompt('Kept');
    await flush();
    expect(customSets().map((s) => s.name)).toEqual(['Kept']);
    expect(customSets()[0].keys).toEqual({ 'tool.rect': ['M'] });
  });

  it('the More menu opens with the keyboard, Rename and Delete are only for saved sets, and Escape closes just the menu', async () => {
    open('keys');
    act(() => menu().click());
    expect(menu().getAttribute('aria-expanded')).toBe('true');
    expect(item(/Rename/).disabled).toBe(true);
    expect(item(/Delete/).disabled).toBe(true);
    expect(item(/Export/).disabled).toBe(false);
    key(item(/Export/), 'Escape');
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(prefsWindow().open).toBe(true);
    saveCurrentAs('Mine');
    act(() => menu().click());
    expect(item(/Rename/).disabled).toBe(false);
    act(() => item(/Rename/).click());
    fillPrompt('Renamed');
    await flush();
    expect(customSets()[0].name).toBe('Renamed');
    act(() => menu().click());
    act(() => item(/Delete/).click());
    act(() => dialogButton(/^Delete$/).click());
    await flush();
    expect(customSets()).toHaveLength(0);
    expect(picker().value).toBe('default');
  });

  it('Share shows a code and a link', () => {
    open('keys');
    saveCurrentAs('Mine');
    act(() => menu().click());
    act(() => item(/Share/).click());
    const code = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Share code"]')!;
    expect(code.value).toBe(shareCode(currentAsFile()));
    expect(code.readOnly).toBe(true);
  });

  it('Import: paste, see what it does (with clashes and what was left out) before anything is added, then add it', async () => {
    open('keys');
    act(() => menu().click());
    act(() => item(/Import/).click());
    const box = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Share code, link or file text"]')!;
    typeInto(box, 'nonsense');
    act(() => void [...document.querySelectorAll<HTMLButtonElement>('.keys-panel button')].find((b) => b.textContent === 'Look at it')!.click());
    expect(document.querySelector('.keys-panel [role="alert"]')?.textContent).toContain('does not look like');
    typeInto(box, JSON.stringify({ format: EXPORT_FORMAT, version: 1, name: 'From a friend', base: 'default', keys: { 'tool.rect': ['P'], 'tool.hand': ['Q'], 'gone.command': ['Z'] } }));
    act(() => void [...document.querySelectorAll<HTMLButtonElement>('.keys-panel button')].find((b) => b.textContent === 'Look at it')!.click());
    const review = document.querySelector('[aria-label="What this set would do"]')!;
    expect(review.textContent).toContain('2 commands');
    expect(review.textContent).toContain('1 command this editor does not have');
    expect(review.textContent).toContain('gone.command');
    expect(review.querySelector('.keys-clash')?.textContent).toContain('used twice');
    expect(review.querySelector('.keys-clash')?.textContent).toContain('Rectangle tool and Pen tool');
    //nothing has changed yet
    expect(customSets()).toHaveLength(0);
    expect(bindingsOf('tool.rect')).toEqual(['R']);
    act(() => void [...review.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Add and use it')!.click());
    await flush();
    expect(customSets().map((s) => s.name)).toEqual(['From a friend']);
    expect(bindingsOf('tool.hand')).toEqual(['Q']);
    expect(picker().value).toBe(customSets()[0].id);
  });

  it('Add, keep my keys adds the set without switching', async () => {
    open('keys');
    act(() => menu().click());
    act(() => item(/Import/).click());
    typeInto(document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Share code, link or file text"]')!, exportText({ format: EXPORT_FORMAT, version: 1, name: 'Later', base: 'illustration', keys: { 'tool.pen': ['Q'] } }));
    act(() => void [...document.querySelectorAll<HTMLButtonElement>('.keys-panel button')].find((b) => b.textContent === 'Look at it')!.click());
    act(() => void [...document.querySelectorAll<HTMLButtonElement>('.keys-review button')].find((b) => b.textContent === 'Add, keep my keys')!.click());
    await flush();
    expect(customSets().map((s) => s.name)).toEqual(['Later']);
    expect(activeSet()).toMatchObject({ kind: 'built-in', id: 'default' });
    expect(bindingsOf('tool.pen')).toEqual(['P']);
  });

  it('a share link opened in the editor shows the import box with the code already read', async () => {
    const code = shareCode({ format: EXPORT_FORMAT, version: 1, name: 'Linked', base: 'default', keys: { 'tool.pen': ['Q'] } });
    act(() => offerImport(code));
    await flush();
    expect(prefsWindow().page).toBe('keys');
    expect(document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Share code, link or file text"]')!.value).toBe(code);
    expect(document.querySelector('[aria-label="What this set would do"]')?.textContent).toContain('1 command');
    expect(document.querySelector<HTMLInputElement>('.keys-review-name input')!.value).toBe('Linked');
    expect(prefsWindow().pendingImport).toBeNull();
  });

  it('a key changed on a saved set stays in it, and the page says so', async () => {
    open('keys');
    saveCurrentAs('Mine');
    await flush();
    expect(setBar().textContent).toContain('Every key you change is kept in it');
    const row = [...document.querySelectorAll<HTMLTableRowElement>('.keys-group tr')].find((r) => r.querySelector('.keys-name')?.textContent === 'Rectangle tool')!;
    act(() => void [...row.querySelectorAll('button')].find((b) => /Add a key/.test(b.getAttribute('aria-label') ?? ''))!.click());
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', code: 'KeyX', bubbles: true, cancelable: true })));
    expect(customSets()[0].keys).toEqual({ 'tool.rect': ['R', 'X'] });
  });

  it('Reset this page on the keys page goes back to Default and keeps the saved sets', async () => {
    open('keys');
    saveCurrentAs('Mine');
    act(() => setPrefs({ singleKeys: false }));
    act(() => void [...document.querySelectorAll<HTMLButtonElement>('.prefs-foot button')].find((b) => b.textContent === 'Reset this page')!.click());
    act(() => dialogButton(/Reset this page/).click());
    await flush();
    expect(activeSet()).toMatchObject({ kind: 'built-in', id: 'default' });
    expect(prefs().singleKeys).toBe(true);
    expect(customSets()).toHaveLength(1);
  });
});

describe('the pages', () => {
  it('describe themselves, for the tooltip on each tab', () => {
    for (const id of PAGES) expect(PAGE_INFO[id].about.length, id).toBeGreaterThan(10);
  });
  it('a page that is for the editor falls back to General when there is no editor', () => {
    act(() => openPrefs('workspace'));
    expect(panel().querySelector('h2')?.textContent).toBe('General');
  });
});
