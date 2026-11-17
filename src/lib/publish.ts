// Publish: Share's "Update to the latest version" from the editor's top bar. Every link and embed of the project changes at once,
// the ones in courses already and any added later, so it asks first. A project with no share link has nothing to update: it's sent
// to Share instead.
import { track } from './analytics';
import { getShare, publishShare } from './db';
import { standaloneHtml, warnInEditor } from './export';
import { confirmDialog } from '../components/dialogs';
import { store } from '../store/store';

export const PUBLISH_MESSAGE =
  'Everyone gets the project as it is now, straight away: the share link, the Link for StudyDesk, every embed already in a course, and every embed added from now on.\n\nThe version showing now is kept, so Revert to previous version (in Share) can put it back.';

/** What happened: published, cancelled at the question, not shared yet (and whether they chose Share), or it failed (a toast says why). */
export async function publishLatest(openShare: () => void, busy: (on: boolean) => void = () => undefined): Promise<'published' | 'cancelled' | 'not-shared' | 'failed'> {
  const st = store();
  const id = st.get().project.id;
  let shared;
  try {
    shared = await getShare(id);
  } catch (e) {
    st.toast(`Couldn't check the share link: ${e instanceof Error ? e.message : String(e)}`, 'error');
    return 'failed';
  }
  if (!shared) {
    if (await confirmDialog({ title: 'Not shared yet', message: "This project hasn't been shared, so there's nothing to update yet. Share it first: choose where people will use it and copy the one thing that needs.", confirmLabel: 'Share…' })) openShare();
    return 'not-shared';
  }
  if (!(await confirmDialog({ title: 'Publish this version?', message: PUBLISH_MESSAGE, confirmLabel: 'Publish' }))) return 'cancelled';
  busy(true);
  try {
    await publishShare(id, await standaloneHtml(st.get().project, { embedFonts: true, optimise: true, onWarning: warnInEditor }), (notes) => st.toast(notes.join(' '), 'error'));
    track('feature', 'share-publish', { detail: { from: 'top-bar' } });
    st.toast('Published. Every link and embed shows this version now.');
    return 'published';
  } catch (e) {
    st.toast(`Couldn't publish: ${e instanceof Error ? e.message : String(e)}`, 'error');
    return 'failed';
  } finally {
    busy(false);
  }
}
