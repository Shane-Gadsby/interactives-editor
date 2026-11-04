/**
 * What the Libraries panel does: fetch from the server, bring the assets over, and change the document through
 * `store().update` (so undo works and other people editing see it). The document logic itself is in `libraries.ts`.
 */
import type { Project } from 'interactives-player';
import { store } from '../store/store';
import { nodeNames, uniqueName } from '../store/doc';
import { assetUrls } from './assets';
import { getLibrary, getLibraryAsset, putAsset } from './db';
import {
  addLibrary,
  applyComponents,
  changedComponents,
  describeChange,
  describeStyleChanges,
  detachArtboard,
  makeInstance,
  missingAssets,
  removeLibrary,
  updateAll,
  updateComponents,
  type ComponentUpdate,
  type LibraryContent,
  type LibraryInfo,
} from './libraries';

/** What a component dragged from the Libraries panel carries, read by the canvas on drop. */
export const COMPONENT_DRAG = 'application/x-interactives-library';

/** Libraries the panel has listed this session, so a drop on the canvas can find the one that was dragged. */
export const known = new Map<string, LibraryInfo>();

/** A component dragged from the Libraries panel and dropped on an artboard at a point (artboard coordinates). */
export async function dropComponent(libraryId: string, componentId: string, artboardId: string, at: { x: number; y: number }): Promise<void> {
  const info = known.get(libraryId);
  if (!info) return;
  try {
    await useComponent(info, componentId, { artboardId, at });
  } catch (err) {
    store().toast(err instanceof Error ? err.message : String(err), 'error');
  }
}

/** Full libraries fetched this session, by id and version (a new version is a new key). */
const cache = new Map<string, LibraryContent>();

export async function fetchContent(info: LibraryInfo): Promise<LibraryContent> {
  const key = `${info.id}@${info.version}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { snapshot } = await getLibrary(info.id);
  cache.set(key, snapshot);
  return snapshot;
}

/** Keep a library copy off the editor canvas (the instances that use it still draw). */
function hideOnCanvas(p: Project, artboardId: string): void {
  const ab = p.artboards.find((a) => a.id === artboardId);
  if (ab?.library) ab.canvasHidden = true;
}

/** Download assets the project is missing from the library's copy and store them in the project. */
async function bringAssets(libraryId: string, ids: string[]): Promise<void> {
  const projectId = store().get().project.id;
  for (const id of ids) {
    const blob = await getLibraryAsset(libraryId, id);
    await putAsset(projectId, id, blob);
    assetUrls.register(id, blob);
  }
}

/** Add a library to the project: remember it and take its styles. */
export async function addLibraryToProject(info: LibraryInfo): Promise<void> {
  const content = await fetchContent(info);
  store().update((d) => addLibrary(d as Project, info, content), { library: true });
}

/**
 * Put a component in the project (copying it in on first use). With `host` it is also placed as an instance in that
 * artboard, at a point (host coordinates) or centred. One undo step. Returns the artboard id of the copy.
 */
export async function useComponent(info: LibraryInfo, componentId: string, host?: { artboardId: string; at?: { x: number; y: number } }): Promise<string | null> {
  const st = store();
  if (host && st.get().project.artboards.find((a) => a.id === host.artboardId)?.library) {
    st.toast('That artboard comes from a library and is read-only. Pick one of your own.', 'error');
    return null;
  }
  const content = await fetchContent(info);
  if (!content.components.some((c) => c.id === componentId)) {
    st.toast('That component is not in the library any more', 'error');
    return null;
  }
  await bringAssets(info.id, missingAssets(st.get().project, content, [componentId]));
  let localId: string | null = null;
  st.update(
    (d) => {
      const p = d as Project;
      addLibrary(p, info, content);
      const applied = applyComponents(p, info.id, content, [componentId]);
      localId = applied.ids[componentId] ?? null;
      // Placing an instance needs the component's own copy in the project, but the person asked for one thing on the
      // canvas, not two: copies made just for this stay off the canvas (Layers has an eye to show them)
      if (host) for (const id of applied.added) hideOnCanvas(p, id);
      else if (localId) {
        // "Add artboard" asks for the artboard itself, so it shows even when a drop had left its copy hidden
        const copy = p.artboards.find((a) => a.id === localId);
        if (copy) delete copy.canvasHidden;
      }
      if (host && localId) {
        const node = makeInstance(p, host.artboardId, localId, host.at);
        const ab = p.artboards.find((a) => a.id === host.artboardId);
        if (node && ab) {
          node.name = uniqueName(nodeNames(ab), node.name);
          ab.children.push(node);
        }
      }
    },
    { library: true },
  );
  if (localId) st.set(host ? { activeArtboardId: host.artboardId, artboardSelected: false } : { activeArtboardId: localId, artboardSelected: true, selection: [] });
  return localId;
}

export interface UpdateReview extends ComponentUpdate {
  /** What changed, in words. Empty for a removed component. */
  changes: string[];
}

/** What would change if the library were updated: per component, and in the styles. */
export async function reviewUpdates(info: LibraryInfo): Promise<{ components: UpdateReview[]; styles: string[] }> {
  const project = store().get().project;
  const content = await fetchContent(info);
  const components = changedComponents(project, info.id, info.components).map((u) => {
    const next = content.artboards.find((a) => a.id === u.componentId);
    return { ...u, changes: u.status === 'removed' || !next ? [] : describeChange(project, info.id, u.localId, next) };
  });
  return { components, styles: describeStyleChanges(project, info.id, info.styles) };
}

/** Update the given components (by library component id), or every changed one. */
export async function applyUpdates(info: LibraryInfo, componentIds?: string[]): Promise<number> {
  const st = store();
  const content = await fetchContent(info);
  const ids = componentIds ?? changedComponents(st.get().project, info.id, content.components).map((u) => u.componentId);
  await bringAssets(info.id, missingAssets(st.get().project, content, ids));
  let done: string[] = [];
  st.update(
    (d) => {
      if (componentIds) {
        // styles first: the copies point at this project's ids for them
        addLibrary(d as Project, info, content);
        done = updateComponents(d as Project, info.id, content, componentIds);
      } else done = updateAll(d as Project, info, content);
    },
    { library: true },
  );
  return done.length;
}

export function detach(artboardId: string): void {
  store().update((d) => void detachArtboard(d as Project, artboardId), { library: true });
}

export function dropLibrary(libraryId: string): void {
  store().update((d) => removeLibrary(d as Project, libraryId), { library: true });
}

/** Wait until the document is saved (or live-synced) so the server's copy is what the person sees. */
export async function waitSaved(timeoutMs = 10000): Promise<boolean> {
  const st = store();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = st.get().saveState;
    if (s === 'saved') return true;
    if (s === 'error') return false;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}
