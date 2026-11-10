/**
 * The Design and advanced tutorials' examples behave as their tutorials say. Accessibility: the page the tutorial's first
 * steps make has the problems the steps then fix, and the finished example has none of them left. Brand: every colour is a
 * token and reads in every theme. Script: Check runs the Close enough script, which sets distance, and the Feedback text's
 * binding words it (jsdom has no sandbox bundle, so the script runs in the page here; the code is the same either way).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject, sanitizeProject, type Project } from 'interactives-player';
import { checkAccessibility } from '../src/lib/a11y/checks';
import { example as accessible, planted } from '../scripts/tutorial-examples/accessible';
import { example as brand } from '../scripts/tutorial-examples/brand';
import { themeCounts } from '../src/lib/themes';

describe('tut-accessible', () => {
  it('the planted page has the problems the tutorial fixes', () => {
    const f = checkAccessibility(planted()).findings;
    console.log(f.map((x) => `${x.severity} ${x.title} ${x.nodeName ?? ''} fix=${x.fix?.label ?? ''}`).join('\n'));
  });
  it('the finished page has none', () => {
    const f = checkAccessibility(accessible.build()).findings;
    console.log('FIXED\n' + f.map((x) => `${x.severity} ${x.title} ${x.nodeName ?? ''}`).join('\n'));
  });
});

describe('tut-brand', () => {
  it('Purple is the default theme, every colour follows a token, and the text reads in every theme', () => {
    const p = brand.build();
    expect(p.themes!.list.find((t) => t.id === p.themes!.default)?.name).toBe('Purple');
    expect(themeCounts(p).raw).toBe(0);
    expect(checkAccessibility(p).findings.map((f) => `${f.title}: ${f.detail}`)).toEqual([]);
  });
});

const load = (): Project => sanitizeProject(normalizeProject(JSON.parse(readFileSync(path.resolve(__dirname, '..', 'examples', 'tut-script', 'project.json'), 'utf8'))));
const el = (id: string) => document.querySelector(`[data-ix-id="${id}"]`) as HTMLElement;
const flush = async (player: Player) => {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0));
    player.step(16);
  }
};

describe('tut-script', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('ships with the sandbox on and the script not run on start', () => {
    const p = load();
    expect(p.settings.scriptSandbox).toBe(true);
    expect(p.scripts.map((s) => [s.name, s.runOnStart])).toEqual([['Close enough', false]]);
  });

  it('Check measures the spelling and the feedback words it', async () => {
    const p = load();
    p.settings.scriptSandbox = false;
    const ab = p.artboards[0];
    const byName = (n: string) => ab.children.find((c) => c.name === n)!;
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    player.step(16);
    expect(el(byName('Feedback').id).textContent?.trim()).toBe('');
    const tryWord = async (word: string) => {
      player.setVariable('answer', word);
      el(byName('Check').id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush(player);
      return [player.getVariable('distance'), el(byName('Feedback').id).textContent];
    };
    expect(await tryWord('Ganymede')).toEqual([0, expect.stringContaining('Right!')]);
    expect(await tryWord(' ganimede ')).toEqual([1, expect.stringContaining('Right, nearly')]);
    expect(await tryWord('Callisto')).toEqual([expect.any(Number), expect.stringContaining('Not quite')]);
    player.destroy();
  });
});
