import { useEffect, useState } from 'react';
import { uid, type Asset, type ImageNode, type SceneNode } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { assetKind } from '../lib/asset-kind';
import { assetUrls } from '../lib/assets';
import { insertFiles, pickFiles } from '../lib/insert';
import { askAboutPictures } from '../lib/alt-prompt';
import { track } from '../lib/analytics';
import type { CataloguePick } from '../lib/media-catalogue';
import { MediaCatalogueModal } from './MediaCatalogueModal';
import { Modal } from './ProjectModals';

/** The three places a swapped-in picture can come from. */
export type SwapFrom = 'project' | 'catalogue' | 'upload';

export const SWAP_CHOICES: { from: SwapFrom; label: string; title: string }[] = [
  { from: 'project', label: 'One already in this project…', title: "Pick from the pictures in this project's Assets" },
  { from: 'catalogue', label: 'From the Media Catalogue…', title: 'Find a photo in the Media Catalogue. It is linked, not copied, so the project stays small' },
  { from: 'upload', label: 'Upload a new one…', title: 'Choose a picture from your computer. It is added to Assets and shown here' },
];

const SWAP_EVENT = 'ix-swap-picture';

/**
 * Give an image layer another picture, keeping everything else about the layer: where it is, its size, its corners, its
 * interactions and its animation. Only the crop goes, since it was framed for the old picture. One undo puts it back.
 */
export function setLayerPicture(nodeId: string, assetId: string, hint?: string): void {
  const s = store();
  const before = find(s.get().project.artboards.flatMap((a) => a.children), nodeId);
  if (!before || before.type !== 'image' || before.assetId === assetId) return;
  s.setProps([nodeId], { assetId, crop: undefined });
  s.commit();
  // the description said what the old picture showed, so the new one is asked about
  const after = find(s.get().project.artboards.flatMap((a) => a.children), nodeId);
  if (after) askAboutPictures(s.get().project.id, [{ node: { ...after, ariaLabel: undefined } as SceneNode, hint }]);
  track('feature', 'picture-swap');
}

/** Start a swap for this image layer. Uploading opens the file picker straight away; the other two open over the editor. */
export async function swapPicture(nodeId: string, from: SwapFrom): Promise<void> {
  if (from !== 'upload') {
    window.dispatchEvent(new CustomEvent(SWAP_EVENT, { detail: { nodeId, from } }));
    return;
  }
  const [file] = await pickFiles('image/*', false);
  if (!file) return;
  if (assetKind(file.type, file.name) !== 'image') {
    store().toast(`${file.name} isn't a picture, so nothing was swapped`, 'error');
    return;
  }
  //(no page and no place: it goes into Assets without making a layer of its own)
  const [asset] = await insertFiles([file], null, null);
  if (asset) setLayerPicture(nodeId, asset.id);
}

/** A catalogue photo as this layer's picture: linked like any other photo from there, one asset per address. */
export function swapToCataloguePhoto(nodeId: string, pick: CataloguePick): void {
  const s = store();
  const known = s.get().project.assets.find((a) => a.src === pick.src);
  const asset: Asset = known ?? { id: uid('as'), name: pick.name, mime: pick.mime, size: 0, src: pick.src, ...(pick.catalogue ? { catalogue: pick.catalogue } : {}) };
  assetUrls.link([asset]);
  s.update((d) => {
    const have = d.assets.find((a) => a.id === asset.id);
    if (!have) d.assets.push(asset);
    else if (pick.catalogue) have.catalogue = pick.catalogue;
  });
  setLayerPicture(nodeId, asset.id, pick.alt || undefined);
}

/** Mounted once in the editor: shows the picker for a swap that asked for the project's pictures or the catalogue. */
export function ImageSwapHost() {
  const [ask, setAsk] = useState<{ nodeId: string; from: SwapFrom } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setAsk((e as CustomEvent<{ nodeId: string; from: SwapFrom }>).detail);
    window.addEventListener(SWAP_EVENT, on);
    return () => window.removeEventListener(SWAP_EVENT, on);
  }, []);
  if (!ask) return null;
  const close = () => setAsk(null);
  if (ask.from === 'catalogue') return <MediaCatalogueModal onClose={close} onPick={(pick) => swapToCataloguePhoto(ask.nodeId, pick)} />;
  return <ProjectPictures nodeId={ask.nodeId} onClose={close} />;
}

/** The project's own pictures as a grid of thumbnails: click one and the layer shows it. */
function ProjectPictures({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const assets = useEditor((st) => st.project.assets);
  const artboards = useEditor((st) => st.project.artboards);
  const node = find(artboards.flatMap((a) => a.children), nodeId) as ImageNode | null;
  const pictures = assets.filter((a) => assetKind(a.mime, a.name) === 'image');
  const others = pictures.filter((a) => a.id !== node?.assetId);
  return (
    <Modal title="Swap picture" help="images-media#swap-a-picture" onClose={onClose} className="swap-modal">
      <div className="swap-body">
        {others.length ? (
          <>
            <p className="hint">Pick the picture this layer should show. It keeps its place, its size and everything wired to it.</p>
            <div className="swap-grid" role="list">
              {pictures.map((a) => {
                const current = a.id === node?.assetId;
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="listitem"
                    className={`swap-pick${current ? ' current' : ''}`}
                    disabled={current}
                    title={current ? `${a.name}: the picture it shows now` : a.name}
                    onClick={() => {
                      setLayerPicture(nodeId, a.id);
                      onClose();
                    }}
                  >
                    <img src={assetUrls.resolve(a.id) ?? a.src ?? ''} alt="" loading="lazy" />
                    <span className="swap-name">{a.name}</span>
                    {current && <span className="swap-now">Showing now</span>}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <p className="hint">This project has no other pictures yet. Use the Media Catalogue or upload one.</p>
        )}
        <div className="swap-actions">
          <button
            className="btn"
            onClick={() => {
              onClose();
              void swapPicture(nodeId, 'catalogue');
            }}
          >
            From the Media Catalogue…
          </button>
          <button
            className="btn"
            onClick={() => {
              onClose();
              void swapPicture(nodeId, 'upload');
            }}
          >
            Upload a new one…
          </button>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

function find(list: SceneNode[], id: string): SceneNode | null {
  for (const n of list) {
    if (n.id === id) return n;
    if ('children' in n && Array.isArray(n.children)) {
      const hit = find(n.children as SceneNode[], id);
      if (hit) return hit;
    }
  }
  return null;
}
