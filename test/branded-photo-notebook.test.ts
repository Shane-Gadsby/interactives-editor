//The Photo prompts notebook starter, played through the real player against the pretend media host: the privacy gate, a photo per prompt,
//the example route, delete, skip with a reason, retake, the bingo board, and the downloaded report with the pictures inside it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeMediaHost, Player, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { STARTERS } from '../src/lib/branded/sets/media';
import { projectFromBrandedStarter } from '../src/lib/branded';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { byName } from '../src/lib/branded/kit';
import { checkAccessibility } from '../src/lib/a11y/checks';

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const stage = () => document.getElementById('stage')!;
const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!;
const board = (p: Project, name: string): Artboard => p.artboards.find((a) => a.name === name)!;
const layer = (p: Project, page: string, name: string): SceneNode => {
  const n = byName(board(p, page), name);
  if (!n) throw new Error(`no layer ${name} on ${page}`);
  return n;
};
const starter = STARTERS.find((s) => s.key === 'media/photo-notebook')!;

const PRIVACY = 'Before you take any photo';
const PROMPT = 'Photo prompt';
const NOTEBOOK = 'My notebook';
const HANDIN = 'Hand in your notebook';

type Entry = { status: string; caption: string; tag: string; why: string; reason: string };

describe('photo prompts notebook', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    URL.createObjectURL = vi.fn((b: Blob) => `blob:${b.size}`);
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  const open = async (behaviour: 'works' | 'denied' | 'off' | 'no-device' | 'blocked' = 'works') => {
    const project = projectFromBrandedStarter(starter, COLOURWAYS[0]);
    const host = new FakeMediaHost({ declaration: project.settings.sensors, behaviour });
    const player = new Player(stage(), JSON.parse(JSON.stringify(project)), { loadData: false, media: host });
    const click = async (id: string) => {
      const e = el(id);
      if (!e) throw new Error(`no layer ${id}`);
      e.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
      player.step(16);
    };
    const on = (page: string, name: string) => layer(project, page, name).id;
    const entries = () => player.getVariable('entries') as Entry[];
    const saves = () => host.calls.filter((c) => c.op === 'save');
    await flush(20);
    player.step(16);
    return { project, host, player, click, on, entries, saves };
  };
  type Rig = Awaited<ReturnType<typeof open>>;

  /** Through the hero and the pledge, onto the first prompt. */
  const toPrompts = async (r: Rig) => {
    await r.click(r.on('Photo prompts notebook', 'Start'));
    expect(r.player.artboard.name).toBe(PRIVACY);
    const row = r.on(PRIVACY, 'Pledge row');
    for (let i = 0; i < 4; i++) await r.click(`${row}~${i}`);
    await r.click(r.on(PRIVACY, 'Continue'));
    expect(r.player.artboard.name).toBe(PROMPT);
  };

  it('is in the media set, declares photos, and has about six prompts', () => {
    const project = projectFromBrandedStarter(starter, COLOURWAYS[0]);
    expect(project.settings.sensors).toMatchObject({ photos: true });
    expect(project.settings.sensors?.microphone).toBeFalsy();
    const prompts = project.variables.find((v) => v.name === 'prompts')!;
    expect(JSON.parse(String(prompts.initial))).toHaveLength(6);
    expect(project.artboards.filter((a) => !a.isMaster).map((a) => a.name)).toEqual(['Photo prompts notebook', PRIVACY, PROMPT, NOTEBOOK, HANDIN]);
    //every prompt's two pictures are assets in the project
    const ids = new Set(project.assets.map((a) => a.id));
    for (const p of JSON.parse(String(prompts.initial)) as { photo: string; example: string }[]) {
      expect(ids.has(p.photo) && ids.has(p.example)).toBe(true);
    }
  });

  it('passes the sensors check: a learner with no camera can finish through the example pictures', () => {
    for (const way of COLOURWAYS) {
      const project = projectFromBrandedStarter(starter, way);
      const sensors = checkAccessibility(project).findings.filter((f) => f.check === 'sensors');
      expect(sensors, way.id).toEqual([]);
    }
  });

  it('has nothing the accessibility checker calls an issue, in any colourway', () => {
    for (const way of COLOURWAYS) {
      const issues = checkAccessibility(projectFromBrandedStarter(starter, way)).findings.filter((f) => f.severity === 'issue');
      expect(issues.map((f) => f.title), way.id).toEqual([]);
    }
  });

  it('keeps the learner out of the prompts until every privacy line is ticked', async () => {
    const r = await open();
    await r.click(r.on('Photo prompts notebook', 'Start'));
    const row = r.on(PRIVACY, 'Pledge row');
    expect(document.querySelectorAll(`[data-ix-id^="${row}~"]`)).toHaveLength(4);
    expect(el(`${row}~0`).getAttribute('role')).toBe('checkbox');
    const go = r.on(PRIVACY, 'Continue');
    await r.click(`${row}~0`);
    await r.click(`${row}~1`);
    await r.click(`${row}~2`);
    await r.click(go);
    expect(r.player.artboard.name).toBe(PRIVACY);
    //unticking one and ticking it again keeps the count honest
    await r.click(`${row}~1`);
    expect(r.player.getVariable('agreed')).toEqual([0, 2]);
    await r.click(`${row}~1`);
    await r.click(`${row}~3`);
    await r.click(go);
    expect(r.player.artboard.name).toBe(PROMPT);
    r.player.destroy();
  });

  it('takes a photo into the prompt\'s own slot, then caption, tag and reason go with it into the entry', async () => {
    const r = await open();
    await toPrompts(r);
    expect(el(r.on(PROMPT, 'Empty slot note')).textContent).toContain('No photo yet');
    await r.click(r.on(PROMPT, 'Take or choose a photo'));
    await flush(20);
    r.player.step(16);
    expect(r.entries()[0].status).toBe('photo');
    expect(r.host.calls.some((c) => c.op === 'pick')).toBe(true);
    const urls = (r.player as unknown as { assetUrls: Map<string, string> }).assetUrls;
    const prompts = r.player.getVariable('prompts') as { photo: string }[];
    expect(urls.get(prompts[0].photo)).toMatch(/^blob:/);
    expect(urls.get(prompts[1].photo)).toMatch(/^data:/);
    expect(el(r.on(PROMPT, 'Take or choose a photo')).textContent).toBe('Retake photo');
    r.player.setVariable('caption', 'A sign by the lift');
    r.player.setVariable('tag', 'Key idea');
    r.player.setVariable('why', 'It tells you what to do in a fire');
    await r.click(r.on(PROMPT, 'Next'));
    expect(r.player.getVariable('current')).toBe(1);
    expect(r.entries()[0]).toEqual({ status: 'photo', caption: 'A sign by the lift', tag: 'Key idea', why: 'It tells you what to do in a fire', reason: '' });
    //the new prompt starts with empty boxes, and going back brings the words back
    expect(r.player.getVariable('caption')).toBe('');
    await r.click(r.on(PROMPT, 'Previous'));
    expect(r.player.getVariable('caption')).toBe('A sign by the lift');
    expect(r.player.getVariable('tag')).toBe('Key idea');
    r.player.destroy();
  });

  it('retakes by taking again, and deletes a photo so the slot is empty and the photo is forgotten', async () => {
    const r = await open();
    await toPrompts(r);
    const take = r.on(PROMPT, 'Take or choose a photo');
    await r.click(take);
    await flush(20);
    await r.click(take);
    await flush(20);
    expect(r.host.calls.filter((c) => c.op === 'pick')).toHaveLength(2);
    expect(r.entries()[0].status).toBe('photo');
    const prompts = r.player.getVariable('prompts') as { photo: string }[];
    const urls = (r.player as unknown as { assetUrls: Map<string, string> }).assetUrls;
    await r.click(r.on(PROMPT, 'Delete photo'));
    await flush(20);
    expect(r.entries()[0].status).toBe('empty');
    expect(urls.get(prompts[0].photo)).toMatch(/^data:/);
    expect(el(r.on(PROMPT, 'Empty slot note')).style.display).not.toBe('none');
    r.player.destroy();
  });

  it('skips with a reason, and can undo the skip', async () => {
    const r = await open();
    await toPrompts(r);
    const skipBtn = r.on(PROMPT, 'Skip this prompt');
    await r.click(skipBtn);
    expect(r.player.getVariable('skipping')).toBe(true);
    expect(el(r.on(PROMPT, 'Confirm skip')).style.display).not.toBe('none');
    expect(el(r.on(PROMPT, 'Why box')).style.display).toBe('none');
    //it cannot be confirmed with no reason: the button is off, and a click that got past it would still go nowhere
    expect(el(r.on(PROMPT, 'Confirm skip')).querySelector('button')!.disabled).toBe(true);
    await r.click(r.on(PROMPT, 'Confirm skip'));
    expect(r.entries()[0].status).toBe('empty');
    r.player.setVariable('skipReason', 'Only people in the area');
    r.player.step(16);
    await r.click(r.on(PROMPT, 'Confirm skip'));
    expect(r.entries()[0]).toMatchObject({ status: 'skipped', reason: 'Only people in the area' });
    expect(r.player.getVariable('skipping')).toBe(false);
    expect(el(r.on(PROMPT, 'Skip this prompt')).textContent).toBe('Undo skip');
    expect(el(r.on(PROMPT, 'Empty slot note')).textContent).toContain('Only people in the area');
    await r.click(skipBtn);
    expect(r.entries()[0].status).toBe('empty');
    r.player.destroy();
  });

  it('uses the example picture when photos are not available, and still finishes', async () => {
    const r = await open('no-device');
    await toPrompts(r);
    expect(el(r.on(PROMPT, 'Empty slot note')).textContent).toContain('Photos are not available here');
    expect(el(r.on(PROMPT, 'Take or choose a photo')).querySelector('button')!.disabled).toBe(true);
    await r.click(r.on(PROMPT, 'Use the example picture'));
    expect(r.entries()[0].status).toBe('example');
    expect(el(r.on(PROMPT, 'Example badge frame')).style.display).not.toBe('none');
    expect(r.host.calls.some((c) => c.op === 'pick')).toBe(false);
    r.player.destroy();
  });

  it('shows the notebook as a list, switches to the bingo board and counts lines of three', async () => {
    const r = await open();
    await toPrompts(r);
    //photo, example, skip for the first three prompts
    await r.click(r.on(PROMPT, 'Take or choose a photo'));
    await flush(20);
    await r.click(r.on(PROMPT, 'Next'));
    await r.click(r.on(PROMPT, 'Use the example picture'));
    await r.click(r.on(PROMPT, 'Next'));
    await r.click(r.on(PROMPT, 'Use the example picture'));
    await r.click(r.on(PROMPT, 'My notebook'));
    expect(r.player.artboard.name).toBe(NOTEBOOK);
    const summary = () => el(r.on(NOTEBOOK, 'Summary')).textContent;
    expect(summary()).toBe('3 of 6 done');
    const card = r.on(NOTEBOOK, 'List card');
    expect(document.querySelectorAll(`[data-ix-id^="${card}~"]`)).toHaveLength(6);
    expect(el(r.on(NOTEBOOK, 'Notebook list')).style.display).not.toBe('none');
    expect(el(r.on(NOTEBOOK, 'Bingo board')).style.display).toBe('none');
    await r.click(r.on(NOTEBOOK, 'Switch view'));
    expect(r.player.getVariable('bingo')).toBe(true);
    expect(el(r.on(NOTEBOOK, 'Bingo board')).style.display).not.toBe('none');
    expect(summary()).toBe('3 of 6 done. Lines of three complete: 1');
    const square = r.on(NOTEBOOK, 'Bingo square');
    expect(document.querySelectorAll(`[data-ix-id^="${square}~"]`)).toHaveLength(6);
    expect(el(`${square}~0`).getAttribute('aria-label')).toContain('Photo');
    expect(el(`${square}~5`).getAttribute('aria-label')).toContain('Not done yet');
    //a square opens its prompt
    await r.click(`${square}~4`);
    expect(r.player.artboard.name).toBe(PROMPT);
    expect(r.player.getVariable('current')).toBe(4);
    r.player.destroy();
  });

  it('opens the bingo board when the author sets the variable', async () => {
    const project = projectFromBrandedStarter(starter, COLOURWAYS[0]);
    project.variables.find((v) => v.name === 'bingo')!.initial = true;
    const player = new Player(stage(), JSON.parse(JSON.stringify(project)), { loadData: false, media: new FakeMediaHost({ declaration: project.settings.sensors }) });
    await flush(20);
    player.goTo(board(project, NOTEBOOK).id);
    player.step(16);
    expect(el(layer(project, NOTEBOOK, 'Bingo board').id).style.display).not.toBe('none');
    expect(el(layer(project, NOTEBOOK, 'Notebook list').id).style.display).toBe('none');
    player.destroy();
  });

  it('downloads one web page report with the photos inside it, the words escaped, and skipped and empty prompts said plainly', async () => {
    const r = await open();
    await toPrompts(r);
    //prompt 1: a photo with words that must be escaped
    await r.click(r.on(PROMPT, 'Take or choose a photo'));
    await flush(20);
    r.player.setVariable('caption', 'A <b>sign</b> & "more"');
    r.player.setVariable('tag', 'Safety or risk');
    r.player.setVariable('why', 'Line one\nLine two');
    await r.click(r.on(PROMPT, 'Next'));
    //prompt 2: skipped
    await r.click(r.on(PROMPT, 'Skip this prompt'));
    r.player.setVariable('skipReason', 'No safe place to stand');
    r.player.step(16);
    await r.click(r.on(PROMPT, 'Confirm skip'));
    await r.click(r.on(PROMPT, 'Next'));
    //prompt 3: the example picture
    await r.click(r.on(PROMPT, 'Use the example picture'));
    await r.click(r.on(PROMPT, 'My notebook'));
    await r.click(r.on(NOTEBOOK, 'Hand in my notebook'));
    expect(r.player.artboard.name).toBe(HANDIN);
    expect(el(r.on(HANDIN, 'Hand-in warning')).textContent).toContain('Download before you leave');
    expect(el(r.on(HANDIN, 'Hand-in count')).textContent).toBe('Your notebook has 2 of 6 prompts done and 1 skipped.');
    await r.click(r.on(HANDIN, 'Download my notebook'));
    await flush(30);
    expect(r.saves()).toHaveLength(1);
    const save = r.saves()[0].args as { name: string; mime: string; text: string };
    expect(save.mime).toBe('text/html');
    expect(JSON.stringify(save.name)).toContain('photo-notebook');
    const html = save.text;
    expect(html).toMatch(/^<!doctype html><html lang="en"><head><meta charset="utf-8"><title>My photo notebook<\/title>/);
    //the learner's photo, and the example picture, are both inside as data pictures; no marks left over
    expect(html).not.toContain('[[image:');
    expect(html.match(/<img src="data:image\/(svg\+xml|jpeg|png);base64,[A-Za-z0-9+/=]{20,}"/g)).toHaveLength(2);
    //escaped
    expect(html).toContain('alt="A &lt;b&gt;sign&lt;/b&gt; &amp; &quot;more&quot;"');
    expect(html).not.toContain('<b>sign</b>');
    expect(html).toContain('Tag: Safety or risk');
    expect(html).toContain('Line one<br>Line two');
    expect(html).toContain('<strong>Skipped.</strong> Reason: No safe place to stand');
    expect(html).toContain('Example picture used instead of a photo.');
    expect(html).toContain('<p>Not done.</p>');
    //prompt 3 had no tag chosen, so no tag line for it
    expect(html.match(/class="tag"/g)).toHaveLength(1);
    expect(html).toContain('Saved ');
    expect(html).toContain('2 of 6 prompts done.');
    r.player.destroy();
  });

  it('a deleted photo is not in the report, and nothing in the report page can run', async () => {
    const r = await open();
    await toPrompts(r);
    await r.click(r.on(PROMPT, 'Take or choose a photo'));
    await flush(20);
    await r.click(r.on(PROMPT, 'Delete photo'));
    await flush(20);
    await r.click(r.on(PROMPT, 'My notebook'));
    await r.click(r.on(NOTEBOOK, 'Hand in my notebook'));
    await r.click(r.on(HANDIN, 'Download my notebook'));
    await flush(30);
    const html = String((r.saves()[0].args as { text: string }).text);
    expect(html).not.toContain('data:image');
    expect(html).not.toContain('<script');
    expect(html).toContain('0 of 6 prompts done.');
    r.player.destroy();
  });
});
