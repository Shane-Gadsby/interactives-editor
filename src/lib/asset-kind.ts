//What kind of file an asset is, kept apart from assets.ts (which reaches for the browser's storage) so the server's bundle can use it
export type AssetKind = 'image' | 'video' | 'audio' | 'font' | 'data' | 'other';

export function assetKind(mime: string, name = ''): AssetKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('font/') || /\.(woff2?|ttf|otf)$/i.test(name)) return 'font';
  if (/json|csv|tab-separated|text\/plain/.test(mime) || /\.(json|csv|tsv|txt)$/i.test(name)) return 'data';
  return 'other';
}
