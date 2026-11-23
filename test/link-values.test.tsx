import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createNode, createProject, sanitizeProject, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { linkNames, linkNamesIn, linkNamesUsed, withLinkValues } from '../src/lib/link-values';
import { embedCode } from '../src/lib/embed';
import { ShareWhere } from '../src/components/ShareWhere';
import { LinkValueField } from '../src/components/LinkValueField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function reader(): Project {
  const p = createProject('Pathway');
  p.artboards = [createArtboard({ id: 'p1', name: 'Start', width: 800, height: 500 })];
  p.artboards[0].children.push(createNode('text', { name: 'Hi', text: 'Program {link.program}, year {link["start-year"]}, not {item.link.x}', x: 0, y: 0, width: 100, height: 40 } as never));
  p.scripts.push({ id: 's1', name: 'Router', code: "const p = ix.link.mode ?? 'FT'; const q = ix.link?.term; const r = something.link.no;" } as never);
  return p;
}

describe('the link values a project reads', () => {
  it('finds link.x in templates and formulas and ix.link.x in scripts, but not item.link.x', () => {
    expect(linkNamesUsed(reader()).sort()).toEqual(['mode', 'program', 'start-year', 'term']);
  });

  it('skips prose: comments, quoted text, a template outside its slots, and a sentence that ends on link.', () => {
    expect(linkNamesIn('code', "// on a share link. It reaches the project as link.program\n/* link.x */ const s = 'see link.y'; go(`${ix.link.term}`);")).toEqual(['term']);
    expect(linkNamesIn('template', 'Use the link.Then {link.mode}')).toEqual(['mode']);
    expect(linkNamesIn('expr', "link.program == 'link.z' ? link['start-year'] : ''")).toEqual(['program', 'start-year']);
  });

  it('lists the samples and the ones with choices first, then the rest it reads, once each', () => {
    const p = reader();
    p.sampleLink = { course: 'X', program: '' };
    p.linkChoices = { program: ['MSCN', 'GDSI'], level: ['PG'] };
    expect(linkNames(p)).toEqual(['course', 'program', 'level', 'mode', 'term', 'start-year']);
  });

  it('puts values on the end of an address, leaving empty ones and bad names off', () => {
    expect(withLinkValues('https://x/s/tok', { program: 'GCSC', mode: '', title: 'no' })).toBe('https://x/s/tok?program=GCSC');
    expect(withLinkValues('https://x/s/tok?a=1#top', { program: 'A B' })).toBe('https://x/s/tok?a=1&program=A%20B#top');
    expect(withLinkValues('https://x/s/tok', {})).toBe('https://x/s/tok');
  });

  it('the embed code carries them after title and cdtID', () => {
    const code = embedCode({ url: 'https://x/play/tok', title: 'A', cdtID: 1, link: { program: 'GDSI', mode: '' } });
    expect(code).toContain('src="https://x/play/tok?title=A&cdtID=1&program=GDSI"');
  });

  it('choices survive a save, cleaned', async () => {
    const p = reader();
    p.linkChoices = { program: ['MSCN', 'GDSI', 'GCSC'] };
    expect(sanitizeProject(structuredClone(p)).linkChoices).toEqual({ program: ['MSCN', 'GDSI', 'GCSC'] });
  });
});

describe('link value fields', () => {
  let root: Root;
  let host: HTMLElement;
  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('a value with choices is a list starting at none; one without is text that applies on Enter', () => {
    const got: string[] = [];
    act(() =>
      root.render(
        <>
          <LinkValueField name="program" value="" choices={['MSCN', 'GDSI']} onChange={(v) => got.push(v)} />
          <LinkValueField name="term" value="" onChange={(v) => got.push(v)} />
        </>,
      ),
    );
    const sel = host.querySelector<HTMLSelectElement>('select')!;
    expect([...sel.options].map((o) => o.textContent)).toEqual(['program: none', 'program: MSCN', 'program: GDSI']);
    expect(sel.getAttribute('aria-label')).toBe('link.program in the preview');
    act(() => {
      sel.value = 'GDSI';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const input = host.querySelector<HTMLInputElement>('input')!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, 'T3');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => void input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(got).toEqual(['GDSI', 'T3']);
  });

  it('Share offers them above what to copy, and the copied link and embed code carry the chosen one', () => {
    const p = reader();
    p.linkChoices = { program: ['MSCN', 'GDSI', 'GCSC'] };
    setCurrentStore(new EditorStore(p));
    act(() => root.render(<ShareWhere projectId="proj1" share={{ token: 'tok_abc123', created: '2026-01-01T00:00:00Z', updated: '2026-01-02T00:00:00Z' }} busy={null} publish={() => undefined} embedId={42} marked={0} />));
    const group = host.querySelector('.share-link-values')!;
    expect(group.textContent).toMatch(/Open it with/);
    const sel = group.querySelector<HTMLSelectElement>('select[aria-label="link.program on the copied link"]')!;
    const code = () => host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Embed code"]')!.value;
    expect(code()).not.toContain('program=');
    act(() => {
      sel.value = 'GCSC';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(code()).toContain('&cdtID=42&program=GCSC"');
  });
});

describe('a variable that starts from the link, on the canvas', () => {
  it('takes the sample link value when it fits, and its own starting value otherwise', async () => {
    const { previewScope } = await import('../src/lib/data');
    const p = createProject('L');
    p.variables.push({ id: 'v1', name: 'prog', type: 'enum', options: ['MSCN', 'GDSI'], initial: 'MSCN', fromLink: 'program' });
    expect(previewScope(p).prog).toBe('MSCN');
    p.sampleLink = { program: 'GDSI' };
    expect(previewScope(p).prog).toBe('GDSI');
    p.sampleLink = { program: 'BSC' };
    expect(previewScope(p).prog).toBe('MSCN');
  });
});
