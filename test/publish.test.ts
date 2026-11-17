import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';

const db = vi.hoisted(() => ({ getShare: vi.fn(), publishShare: vi.fn() }));
const dialogs = vi.hoisted(() => ({ confirmDialog: vi.fn() }));
vi.mock('../src/lib/db', async (orig) => ({ ...(await orig<object>()), getShare: db.getShare, publishShare: db.publishShare }));
vi.mock('../src/components/dialogs', async (orig) => ({ ...(await orig<object>()), confirmDialog: dialogs.confirmDialog }));
vi.mock('../src/lib/export', async (orig) => ({ ...(await orig<object>()), standaloneHtml: async () => '<html>built</html>' }));

const { publishLatest, PUBLISH_MESSAGE } = await import('../src/lib/publish');

describe('Publish in the top bar', () => {
  let store: EditorStore;
  beforeEach(() => {
    vi.clearAllMocks();
    store = new EditorStore(createProject('T'));
    setCurrentStore(store);
  });

  it('asks first, saying every embed now and later changes, then publishes the project as it is', async () => {
    db.getShare.mockResolvedValue({ token: 'tok' });
    dialogs.confirmDialog.mockResolvedValue(true);
    db.publishShare.mockResolvedValue({ token: 'tok' });
    const busy: boolean[] = [];
    expect(await publishLatest(() => undefined, (on) => busy.push(on))).toBe('published');
    expect(dialogs.confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'Publish this version?', confirmLabel: 'Publish' }));
    expect(PUBLISH_MESSAGE).toMatch(/every embed already in a course, and every embed added from now on/);
    expect(db.publishShare).toHaveBeenCalledWith(store.get().project.id, '<html>built</html>', expect.any(Function));
    expect(busy).toEqual([true, false]);
  });

  it('does nothing when the question is cancelled', async () => {
    db.getShare.mockResolvedValue({ token: 'tok' });
    dialogs.confirmDialog.mockResolvedValue(false);
    expect(await publishLatest(() => undefined)).toBe('cancelled');
    expect(db.publishShare).not.toHaveBeenCalled();
  });

  it('sends a project that was never shared to Share instead', async () => {
    db.getShare.mockResolvedValue(null);
    dialogs.confirmDialog.mockResolvedValue(true);
    const openShare = vi.fn();
    expect(await publishLatest(openShare)).toBe('not-shared');
    expect(openShare).toHaveBeenCalled();
    expect(db.publishShare).not.toHaveBeenCalled();
  });

  it('says so when publishing fails, and stops looking busy', async () => {
    db.getShare.mockResolvedValue({ token: 'tok' });
    dialogs.confirmDialog.mockResolvedValue(true);
    db.publishShare.mockRejectedValue(new Error('offline'));
    const toast = vi.spyOn(store, 'toast');
    const busy: boolean[] = [];
    expect(await publishLatest(() => undefined, (on) => busy.push(on))).toBe('failed');
    expect(toast).toHaveBeenCalledWith("Couldn't publish: offline", 'error');
    expect(busy).toEqual([true, false]);
  });
});
