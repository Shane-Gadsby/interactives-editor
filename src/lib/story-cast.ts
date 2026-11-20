import type { Asset, CastExpression } from 'interactives-player';

/**
 * Faces from pictures named after someone: "Millie smiling.png", "millie_sad", "Millie - happy" give Millie the faces smiling,
 * sad and happy, and a picture called just "Millie" gives a neutral one. "... blink" and "... talk" pictures are matched to the
 * face with the same name as its eyes-shut and mouth-open pictures. Faces already there are left out.
 */
export function facesFromPictures(name: string, images: Asset[], have: CastExpression[]): CastExpression[] {
  const key = name.trim().toLowerCase();
  if (!key) return [];
  const taken = new Set(have.map((e) => e.name.toLowerCase()));
  const used = new Set(have.flatMap((e) => [e.assetId, e.blink, e.talk]).filter(Boolean));
  const faces = new Map<string, CastExpression>();
  const extras: { face: string; kind: 'blink' | 'talk'; id: string }[] = [];
  for (const a of images) {
    if (used.has(a.id)) continue;
    const base = a.name.replace(/\.[a-z0-9]+$/i, '').trim();
    const low = base.toLowerCase();
    if (!low.startsWith(key)) continue;
    const rest = base.slice(key.length);
    // The name has to end there: "Millicent" isn't Millie
    if (rest && !/^[\s_\-.,]/.test(rest)) continue;
    let face = rest.replace(/^[\s_\-.,]+/, '').replace(/[_]+/g, ' ').trim() || 'neutral';
    const extra = /^(.*?)[\s_-]*(blink|eyes shut|closed|talk|talking|mouth open)$/i.exec(face);
    if (extra) {
      const kind = /blink|eyes|closed/i.test(extra[2]) ? 'blink' : 'talk';
      extras.push({ face: (extra[1].trim() || 'neutral').toLowerCase(), kind, id: a.id });
      continue;
    }
    face = face.toLowerCase();
    if (taken.has(face) || faces.has(face)) continue;
    faces.set(face, { name: face, assetId: a.id });
  }
  for (const x of extras) {
    const f = faces.get(x.face);
    if (f && !f[x.kind]) f[x.kind] = x.id;
  }
  // neutral first, as the face they come on with
  return [...faces.values()].sort((a, b) => (a.name === 'neutral' ? -1 : b.name === 'neutral' ? 1 : 0));
}
