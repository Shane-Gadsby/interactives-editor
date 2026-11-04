//The usage and errors page (power users): renders the server's report, and says so to anyone else.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const report = {
  days: 7,
  generatedAt: Date.now(),
  truncated: false,
  editor: {
    rows: 120,
    visits: 9,
    users: 4,
    activeMs: 12600000,
    builds: [{ build: 'mabc123', rows: 100 }],
    browsers: [{ browser: 'chrome 155', visits: 9 }],
    funnel: [
      { label: 'Opened the editor', people: 4 },
      { label: 'Opened a project', people: 3 },
    ],
    features: [{ key: 'steps-enable', uses: 7, users: 2, ms: 0, last: 0 }],
    inspector: [{ key: 'fill', uses: 40, users: 4, ms: 0, last: 0 }],
    nodes: [],
    doc: [],
    history: [],
    tools: [{ tool: 'pen', uses: 12, users: 3, ms: 600000 }],
    panels: [],
    imports: [{ format: 'riv', ok: 3, failed: 1, kb: 90, users: 2 }],
    exports: [],
    help: { topics: [], searches: 5, notFound: 2 },
    preview: { loads: 0, avgLoadMs: 0 },
    live: [],
    api: [],
    faults: [{ fp: 'aaaa1111', kind: 'boundary', where: 'inspector', cls: 'TypeError', msg: 'options.split is not a function', frame: 'render@index.js', status: null, via: '', reports: 3, count: 40, users: 2, visits: 2, builds: ['mabc123'], projects: 1, first: 1, last: Date.now() }],
    faultCount: 1,
  },
  player: { rows: 0, pageLoads: 0, learners: 0, loads: { n: 0, p50: 0, p90: 0, p99: 0 }, byKind: [], versions: [], faults: [], projects: [] },
};

let power = true;
vi.mock('../src/lib/db', () => ({
  session: async () => ({ user: { username: 'pat' }, power }),
  getUsageReport: vi.fn(async () => report),
}));

import { UsagePage } from '../src/UsagePage';

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

describe('UsagePage', () => {
  it('shows the funnel, the tools and the imports that failed', async () => {
    power = true;
    act(() => root.render(<UsagePage />));
    await settle();
    expect(host.textContent).toContain('Opened a project');
    expect(host.textContent).toContain('pen');
    expect(host.textContent).toContain('riv');
    expect(host.textContent).toContain('3.5h');
  });

  it('lists the faults grouped by fingerprint with counts', async () => {
    power = true;
    act(() => root.render(<UsagePage />));
    await settle();
    const tab = [...host.querySelectorAll('button[role=tab]')].find((b) => b.textContent?.includes('Editor errors'))!;
    expect(tab.textContent).toContain('(1)');
    act(() => (tab as HTMLButtonElement).click());
    expect(host.textContent).toContain('aaaa1111');
    expect(host.textContent).toContain('options.split is not a function');
    expect(host.querySelector('td.num')?.textContent).toBe('40');
  });

  it('is for power users only', async () => {
    power = false;
    act(() => root.render(<UsagePage />));
    await settle();
    expect(host.textContent).toContain('for power users');
    expect(host.textContent).not.toContain('Opened a project');
  });
});
