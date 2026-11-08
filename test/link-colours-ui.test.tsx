import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, defaultTheme, tokenValue, type Project, type RectNode } from 'interactives-player';
import { DialogHost, dismissAllDialogs } from '../src/components/dialogs';
import { ThemeFixedHint } from '../src/components/ThemeFixedHint';
import { ThemesPanel } from '../src/panels/ThemesPanel';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { starterThemes } from '../src/lib/themes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  dismissAllDialogs();
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const click = (el: Element | null | undefined) => act(() => void (el as HTMLElement).click());
const btn = (label: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent === label);

function plainThemed(): Project {
  const p = createProject('P');
  p.themes = starterThemes();
  const t = p.themes;
  const bg = t.tokens.find((x) => x.name === 'color/background')!;
  const surface = t.tokens.find((x) => x.name === 'color/surface')!;
  const def = defaultTheme(t).id;
  p.artboards[0].background = { type: 'solid', color: tokenValue(t, bg, def)! };
  p.artboards[0].children.push(createNode('rect', { name: 'Card', fill: { type: 'solid', color: tokenValue(t, surface, def)! } }));
  return p;
}

describe('the hint and the Link colours button', () => {
  it('shows the hint when nothing follows a token, and the button links after a preview, then the hint goes', async () => {
    s = new EditorStore(plainThemed());
    setCurrentStore(s);
    act(() =>
      root.render(
        <>
          <ThemeFixedHint />
          <DialogHost />
        </>,
      ),
    );
    expect(host.querySelector('.theme-fixed-hint')!.textContent).toContain('Nothing here follows the theme: these colours are fixed');
    click(btn('Link colours to tokens'));
    await flush();
    const dlg = document.querySelector('.dialog')!;
    expect(dlg.textContent).toContain('Link 2 colours: 1 background, 1 fill');
    // nothing changed before the yes
    expect((s.get().project.artboards[0].background as { color: string }).color).not.toContain('token:');
    click(btn('Link 2 colours'));
    await flush();
    expect(host.querySelector('.theme-fixed-hint')).toBeNull();
    expect((s.get().project.artboards[0].children[0] as RectNode).fill).toMatchObject({ color: expect.stringContaining('token:') });
    // one undo
    s.undo();
    expect((s.get().project.artboards[0].background as { color: string }).color).not.toContain('token:');
  });

  it('cancel changes nothing', async () => {
    s = new EditorStore(plainThemed());
    setCurrentStore(s);
    const before = JSON.stringify(s.get().project.artboards);
    act(() =>
      root.render(
        <>
          <ThemesPanel />
          <DialogHost />
        </>,
      ),
    );
    expect(host.querySelector('.theme-fixed-hint')).not.toBeNull();
    click(btn('Link colours to tokens'));
    await flush();
    click(btn('Cancel'));
    await flush();
    expect(JSON.stringify(s.get().project.artboards)).toBe(before);
  });

  it('no hint once something follows a token', () => {
    const p = plainThemed();
    p.artboards[0].background = { type: 'solid', color: `token:${p.themes!.tokens[0].id}` };
    s = new EditorStore(p);
    setCurrentStore(s);
    act(() => root.render(<ThemeFixedHint />));
    expect(host.querySelector('.theme-fixed-hint')).toBeNull();
  });
});
