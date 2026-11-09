//Flags a help picture whose editor is dark. The help is written for the light theme, so a shot that looks dark was taken in
//the wrong theme (or before the look was changed back). It reads each png without any packages (node's zlib) and measures how
//bright the whole picture is and the top left corner, where the editor's bar or the panel's own background sits.
//Run it by hand: node scripts/check-help-images.mjs [folder]   (test/help-images-light.test.ts runs the same check)
import { readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

//a picture is dark when it is dim all over, or when its top left corner is
export const LIMITS = { whole: 100, corner: 70 };
//the corner is this many pixels square at most
const CORNER = 40;

//Pictures that are dark on purpose (a dark theme comparison, say). Name them here with a reason.
export const ALLOW = {
  //'dark-theme-compare.png': 'shows the dark theme next to the light one',
};

//Decodes an 8 bit, non interlaced png (what a browser screenshot is) to its brightness, 0 to 255, one number per pixel
export function lumaOf(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let pos = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  const data = [];
  let palette = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString('latin1', pos + 4, pos + 8), body = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') { w = body.readUInt32BE(0); h = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (kind === 'PLTE') palette = body;
    else if (kind === 'IDAT') data.push(body);
    else if (kind === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error('only 8 bit, non interlaced pngs are read');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!ch) throw new Error(`png colour type ${type} is not read`);
  const raw = inflateSync(Buffer.concat(data));
  const stride = w * ch, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[dst + x - ch] : 0, b = y ? px[dst - stride + x] : 0, c = x >= ch && y ? px[dst - stride + x - ch] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + x] = v & 255;
    }
  }
  const luma = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    let r, g, b, al = 255;
    if (type === 0) r = g = b = px[i]; else if (type === 4) { r = g = b = px[i * 2]; al = px[i * 2 + 1]; }
    else if (type === 3) { const k = px[i] * 3; r = palette[k]; g = palette[k + 1]; b = palette[k + 2]; }
    else { r = px[i * ch]; g = px[i * ch + 1]; b = px[i * ch + 2]; if (type === 6) al = px[i * ch + 3]; }
    //see through pixels count as the white page they are shown on
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luma[i] = (l * al + 255 * (255 - al)) / 255;
  }
  return { w, h, luma };
}

export function measure(file) {
  const { w, h, luma } = lumaOf(readFileSync(file));
  let all = 0;
  for (let i = 0; i < luma.length; i++) all += luma[i];
  const cw = Math.min(CORNER, w), ch = Math.min(CORNER, h);
  let corner = 0;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) corner += luma[y * w + x];
  return { whole: all / luma.length, corner: corner / (cw * ch) };
}

//Every png in the folder that is dark and not on the allow list
export function darkPictures(dir, allow = ALLOW, filter = () => true) {
  return readdirSync(dir)
    .filter((n) => n.endsWith('.png') && filter(n) && !(n in allow))
    .map((n) => ({ name: n, ...measure(join(dir, n)) }))
    .filter((m) => m.whole < LIMITS.whole || m.corner < LIMITS.corner);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '../public/help'));
  const bad = darkPictures(dir);
  for (const m of bad) console.log(`dark: ${m.name} (whole ${m.whole.toFixed(0)}, corner ${m.corner.toFixed(0)})`);
  console.log(bad.length ? `${bad.length} dark picture(s) in ${dir}` : `No dark pictures in ${dir}`);
  process.exit(bad.length ? 1 : 0);
}
