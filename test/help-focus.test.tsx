import { afterEach, describe, expect, it, beforeAll } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { closeHelp, HelpHost, openHelp } from '../src/help/Help';
import { warmHelp } from './lazy-chunks';

//the editor loads these in chunks of their own; the test starts with them in
beforeAll(() => warmHelp());

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('help drawer focus', () => {
  let root: Root | null = null;
  let host: HTMLElement | null = null;
  afterEach(() => {
    act(() => closeHelp());
    act(() => root?.unmount());
    host?.remove();
  });
  const mount = () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<HelpHost />));
  };
  const searchBox = () => document.querySelector<HTMLInputElement>('.help-drawer .help-search');

  it('puts the caret in the search box when help opens', () => {
    mount();
    act(() => openHelp());
    expect(searchBox()).toBeTruthy();
    expect(document.activeElement).toBe(searchBox());
  });

  it('does it again when help is asked for while already open', () => {
    mount();
    act(() => openHelp());
    const other = document.createElement('button');
    document.body.appendChild(other);
    other.focus();
    expect(document.activeElement).toBe(other);
    act(() => openHelp('canvas'));
    expect(document.activeElement).toBe(searchBox());
    other.remove();
  });

  it('leaves focus alone when moving between topics inside the help', () => {
    mount();
    act(() => openHelp());
    const link = document.querySelector<HTMLAnchorElement>('.help-drawer .help-pager a');
    expect(link).toBeTruthy();
    link!.focus();
    act(() => link!.click());
    expect(document.activeElement).not.toBe(searchBox());
  });
});
