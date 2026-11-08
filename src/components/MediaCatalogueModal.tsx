import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createNode, uid, type Asset } from 'interactives-player';
import { store } from '../store/store';
import { assetUrls, imageSize } from '../lib/assets';
import { catalogueUrl, parseCatalogueMessage, type CataloguePick } from '../lib/media-catalogue';
import { track } from '../lib/analytics';
import { IconButton } from './ui';
import { Icons } from './icons';
import { HelpLink } from '../help/Help';

/** Put a catalogue photo on the open artboard as an image layer linked to the catalogue (one asset per address). */
export async function addCataloguePhoto(pick: CataloguePick): Promise<void> {
  const st = store();
  const ab = st.artboard();
  if (!ab) return;
  const known = st.get().project.assets.find((a) => a.src === pick.src);
  const asset: Asset = known ?? { id: uid('as'), name: pick.name, mime: pick.mime, size: 0, src: pick.src, ...(pick.catalogue ? { catalogue: pick.catalogue } : {}) };
  assetUrls.link([asset]);
  st.update((d) => {
    const have = d.assets.find((a) => a.id === asset.id);
    if (!have) d.assets.push(asset);
    else if (pick.catalogue) have.catalogue = pick.catalogue;
  });
  const size = await imageSize(pick.src);
  const scale = Math.min(1, 600 / Math.max(size.width, size.height));
  const w = Math.round(size.width * scale);
  const h = Math.round(size.height * scale);
  const node = createNode('image', { name: pick.name, assetId: asset.id, x: Math.round(ab.width / 2 - w / 2), y: Math.round(ab.height / 2 - h / 2), width: w, height: h });
  st.addNodes([node], { artboardId: ab.id });
  track('import', 'ok', { thing: 'media-catalogue', detail: { as: 'link' } });
}

/** The selected image layer's catalogue text, so the catalogue opens where that photo was found. */
function selectedCatalogue(): string | null {
  const s = store();
  const nodes = s.selectedNodes();
  if (nodes.length !== 1 || nodes[0].type !== 'image' || !nodes[0].assetId) return null;
  const id = nodes[0].assetId;
  return s.get().project.assets.find((a) => a.id === id)?.catalogue ?? null;
}

/**
 * The Media Catalogue in a frame over the editor. It answers with the toolbox's insert message, which is only believed when it
 * comes from this frame and from the catalogue's own origin. Opening it with an image layer that came from there selected
 * puts it back where that photo was found.
 */
export function MediaCatalogueModal({ onClose }: { onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const origin = window.location.origin;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const m = parseCatalogueMessage(e.data, e.origin, origin);
      if (!m) return;
      if (m.kind === 'close') onClose();
      else {
        void addCataloguePhoto(m.pick);
        onClose();
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('keydown', k);
      window.removeEventListener('message', onMessage);
    };
  }, [onClose, origin]);
  return createPortal(
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal catalogue-modal" role="dialog" aria-modal="true" aria-label="Media Catalogue">
        <header>
          <Icons.catalogue />
          <strong>Media Catalogue</strong>
          <HelpLink topic="media-catalogue" />
          <div className="spacer" />
          <IconButton icon={<Icons.close />} title="Close (Esc)" onClick={onClose} />
        </header>
        <iframe
          ref={frame}
          className="catalogue-frame"
          title="Media Catalogue"
          src={catalogueUrl(origin)}
          onLoad={() => {
            const raw = selectedCatalogue();
            if (raw) frame.current?.contentWindow?.postMessage({ transferData: { insert: true, image: { 'data-media-catalogue': raw } } }, origin);
            else frame.current?.contentWindow?.postMessage({ transferData: { insert: true } }, origin);
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
