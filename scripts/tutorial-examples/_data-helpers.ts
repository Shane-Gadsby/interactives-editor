//Helpers shared by the Data, results and media tutorial examples (no `example` here, so the kit's glob skips it)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArtboard, createNode, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { lookDefaults } from '../../src/lib/themes';


/**
 * An example's files live beside its project.json, in examples/<key>/assets/<id> with an <id>.json sidecar (what the server copies
 * into a copy of the example). This takes each asset that carries its bytes as a data: address out into that folder, so the project
 * holds only the record, the way an uploaded file is kept. The folder is emptied first, so a rebuild leaves no old files behind.
 */
export function writeExampleAssets(key: string, project: Project): void {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'examples', key, 'assets');
  fs.rmSync(dir, { recursive: true, force: true });
  for (const a of project.assets) {
    const m = a.src && /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(a.src);
    if (!m) continue;
    const bytes = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, a.id), bytes);
    fs.writeFileSync(path.join(dir, `${a.id}.json`), JSON.stringify({ mime: a.mime, size: bytes.length }));
    a.size = bytes.length;
    delete a.src;
  }
}

/** A text layer as the Text tool makes it, in the project's look. */
export function textLayer(p: Project, name: string, words: string, x: number, y: number, width: number, fontSize = 18, fontWeight = 400): SceneNode {
  return createNode('text', { ...lookDefaults(p, 'text'), name, text: words, x, y, width, height: Math.round(fontSize * 1.4), fontSize, fontWeight, autoSize: 'height' } as never);
}

/** A button as the Button tool makes it, in the project's look. */
export function buttonLayer(p: Project, name: string, label: string, x: number, y: number, width = 160, height = 48): SceneNode {
  return createNode('button', { ...lookDefaults(p, 'button'), name, label, x, y, width, height } as never);
}

/** + Add page: a new page to the right of the others, on the same background as the first. */
export function addPage(p: Project, name: string): Artboard {
  const first = p.artboards[0];
  const right = p.artboards.reduce((m, a) => Math.max(m, a.canvasX + a.width), 0);
  const ab = createArtboard({ name, canvasX: right + 100, canvasY: 0, width: first.width, height: first.height, background: structuredClone(first.background) });
  p.artboards.push(ab);
  return ab;
}
