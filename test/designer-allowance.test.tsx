//Preferences: "Use my own Cogniti allowance". The token is typed once, handed to the server and gone from the page; all that is shown
//after is "Connected, added <date>, ends <date>" and Remove
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let status: any = { on: true, mine: null, shared: { limit: 6, left: 5, resetsIn: 10 } };
const designerStatus = vi.fn(async () => status);
const setDesignerToken = vi.fn(async (_t: string, _e?: string) => ({ ok: true, mine: { connected: true, added: '2026-11-11T12:00:00.000Z', ends: '2027-11-11T00:00:00.000Z' } }));
const removeDesignerToken = vi.fn(async () => ({ ok: true }));
vi.mock('../src/lib/db', () => ({
  apiUrl: (p: string) => `http://x.test/interactives/api/${p}`,
  restoreRevision: async () => ({ rev: 1 }),
  resetDesigner: async () => ({ ok: true }),
  session: async () => ({ user: null, power: false, designer: true }),
  designerStatus: () => designerStatus(),
  setDesignerToken: (...a: [string, string?]) => setDesignerToken(...a),
  removeDesignerToken: () => removeDesignerToken(),
}));
vi.mock('../src/components/dialogs', () => ({ confirmDialog: async () => true, promptDialog: async () => null }));

import { DesignerAllowance } from '../src/components/DesignerAllowance';
import { SETTINGS, searchSettings } from '../src/components/PrefsPages';

describe('Use my own Cogniti allowance', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    status = { on: true, mine: null, shared: { limit: 6, left: 5, resetsIn: 10 } };
    designerStatus.mockClear();
    setDesignerToken.mockClear();
    removeDesignerToken.mockClear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const fill = (el: HTMLInputElement, v: string) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const mount = async () => {
    await act(async () => root.render(<DesignerAllowance />));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  };

  //The Activity Designer is parked (11 Nov 2026), so Preferences doesn't offer it. agent-docs/PARKED.md has the entry to put back
  it('is not in Preferences while the Activity Designer is parked', () => {
    expect(SETTINGS.find((x) => x.id === 'designerAllowance')).toBeUndefined();
    expect(searchSettings('cogniti', true).some((x) => x.id === 'designerAllowance')).toBe(false);
  });

  it('explains where the token comes from, links to Cogniti, and hides what is typed', async () => {
    await mount();
    expect(host.textContent).toContain('User data, then API tokens');
    expect(host.textContent).toContain('365 days');
    expect(host.querySelector<HTMLAnchorElement>('a[href="https://cogniti.unisq.edu.au/"]')?.rel).toContain('noopener');
    expect(host.querySelector<HTMLInputElement>('input[type=password]')).not.toBeNull();
    expect((host.querySelector('button[type=submit]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('hands the token to the server, forgets it, and shows Connected with the dates, never the token', async () => {
    await mount();
    fill(host.querySelector<HTMLInputElement>('input[type=password]')!, 'cog_secret_token_123');
    fill(host.querySelector<HTMLInputElement>('input[type=date]')!, '2027-11-11');
    await act(async () => (host.querySelector('button[type=submit]') as HTMLButtonElement).click());
    expect(setDesignerToken).toHaveBeenCalledWith('cog_secret_token_123', '2027-11-11');
    expect(host.textContent).toMatch(/Connected, added 11 Nov 2026, ends 11 Nov 2027/);
    expect(host.innerHTML).not.toContain('cog_secret_token_123');
    expect(host.querySelector('input[type=password]')).toBeNull();
  });

  it('shows Connected when it already is, and Remove takes it away (after a confirm)', async () => {
    status = { on: true, mine: { connected: true, added: '2026-11-01T12:00:00.000Z', ends: null }, shared: null };
    await mount();
    expect(host.textContent).toContain('Connected, added 1 Nov 2026');
    expect(host.textContent).not.toContain('ends');
    await act(async () => ([...host.querySelectorAll('button')].find((b) => b.textContent === 'Remove') as HTMLButtonElement).click());
    expect(removeDesignerToken).toHaveBeenCalled();
    expect(host.querySelector('input[type=password]')).not.toBeNull();
  });

  it('shows the server\'s plain words when the token is turned away', async () => {
    setDesignerToken.mockRejectedValueOnce(new Error("That token works, but your Cogniti account can't chat with the Activity Designer yet. Ask the Toolbox team to share it with you, then try again."));
    await mount();
    fill(host.querySelector<HTMLInputElement>('input[type=password]')!, 'cog_secret_token_123');
    await act(async () => (host.querySelector('button[type=submit]') as HTMLButtonElement).click());
    expect(host.querySelector('[role=alert]')?.textContent).toContain("can't chat with the Activity Designer yet");
    expect(host.querySelector('input[type=password]')).not.toBeNull();
  });

  it('says so when the Activity Designer is not set up on the server', async () => {
    status = { on: false, mine: null, shared: null };
    await mount();
    expect(host.textContent).toContain('not set up on this server');
  });
});
