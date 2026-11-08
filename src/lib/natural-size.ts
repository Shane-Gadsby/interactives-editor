import { useEffect, useState } from 'react';
import { assetUrls, imageSize } from './assets';
import type { Size } from './crop';

/** The picture's own size in pixels once it has loaded (null until then, and for a layer with no picture). */
export function useNaturalSize(assetId: string | null | undefined): Size | null {
  const url = assetId ? assetUrls.resolve(assetId) : undefined;
  const [size, setSize] = useState<Size | null>(null);
  useEffect(() => {
    let live = true;
    setSize(null);
    if (url) void imageSize(url).then((s) => live && setSize({ w: s.width, h: s.height }));
    return () => void (live = false);
  }, [url]);
  return size;
}
