import { createNode, pathBounds, uid, type Paint, type PathPoint, type SceneNode, type Stroke, type SubPath } from 'interactives-player';

/**
 * SVG to editable layers. Shapes become path layers with the group transforms baked into their points,
 * <g> becomes a group, <text> a text layer, and fills/strokes (including linear and radial gradients)
 * carry over. Filters, masks, patterns and embedded images are reported, not imported.
 */
export interface SvgImport {
  nodes: SceneNode[];
  width: number;
  height: number;
  skipped: string[];
}

type M = [number, number, number, number, number, number];
const ID: M = [1, 0, 0, 1, 0, 0];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const ap = (m: M, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
/** Apply only the linear part (for bezier handles, which are relative). */
const apv = (m: M, x: number, y: number) => ({ x: m[0] * x + m[2] * y, y: m[1] * x + m[3] * y });
const scaleOf = (m: M) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

function parseTransform(s: string | null): M {
  let m: M = ID;
  if (!s) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let t: RegExpExecArray | null;
  while ((t = re.exec(s))) {
    const a = t[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let n: M = ID;
    switch (t[1]) {
      case 'matrix':
        n = [a[0], a[1], a[2], a[3], a[4], a[5]];
        break;
      case 'translate':
        n = [1, 0, 0, 1, a[0] || 0, a[1] || 0];
        break;
      case 'scale':
        n = [a[0], 0, 0, a[1] ?? a[0], 0, 0];
        break;
      case 'rotate': {
        const r = ((a[0] || 0) * Math.PI) / 180;
        const c = Math.cos(r);
        const sn = Math.sin(r);
        n = [c, sn, -sn, c, 0, 0];
        if (a.length >= 3) n = mul(mul([1, 0, 0, 1, a[1], a[2]], n), [1, 0, 0, 1, -a[1], -a[2]]);
        break;
      }
      case 'skewX':
        n = [1, 0, Math.tan(((a[0] || 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        n = [1, Math.tan(((a[0] || 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    m = mul(m, n);
  }
  return m;
}

// ---------------------------------------------------------------- path data

/** Parse SVG path data into sub-paths of points with relative bezier handles (arcs and quadratics become cubics). */
export function parsePathData(d: string): SubPath[] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: SubPath[] = [];
  let cur: SubPath | null = null;
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let lastC: { x: number; y: number } | null = null; // last cubic control (absolute), for S
  let lastQ: { x: number; y: number } | null = null; // last quadratic control, for T
  const num = () => Number(tokens[i++]);
  const isNum = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]);
  const lineTo = (nx: number, ny: number) => {
    cur!.points.push({ x: nx, y: ny });
    x = nx;
    y = ny;
  };
  const cubicTo = (c1x: number, c1y: number, c2x: number, c2y: number, nx: number, ny: number) => {
    const prev = cur!.points[cur!.points.length - 1];
    prev.out = { x: c1x - prev.x, y: c1y - prev.y };
    cur!.points.push({ x: nx, y: ny, in: { x: c2x - nx, y: c2y - ny } });
    lastC = { x: c2x, y: c2y };
    x = nx;
    y = ny;
  };
  while (i < tokens.length) {
    const before = i;
    if (/^[a-zA-Z]$/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) {
      i++;
      continue;
    }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    if (C !== 'C' && C !== 'S') lastC = null;
    if (C !== 'Q' && C !== 'T') lastQ = null;
    switch (C) {
      case 'M': {
        const nx = num() + ox;
        const ny = num() + oy;
        cur = { closed: false, points: [{ x: nx, y: ny }] };
        out.push(cur);
        x = sx = nx;
        y = sy = ny;
        cmd = rel ? 'l' : 'L'; // extra pairs are line-tos
        break;
      }
      case 'L':
        lineTo(num() + ox, num() + oy);
        break;
      case 'H':
        lineTo(num() + ox, y);
        break;
      case 'V':
        lineTo(x, num() + oy);
        break;
      case 'C': {
        const a = [num() + ox, num() + oy, num() + ox, num() + oy, num() + ox, num() + oy];
        cubicTo(a[0], a[1], a[2], a[3], a[4], a[5]);
        break;
      }
      case 'S': {
        const lc = lastC as { x: number; y: number } | null;
        const c1 = lc ? { x: 2 * x - lc.x, y: 2 * y - lc.y } : { x, y };
        const a = [num() + ox, num() + oy, num() + ox, num() + oy];
        cubicTo(c1.x, c1.y, a[0], a[1], a[2], a[3]);
        break;
      }
      case 'Q': {
        const qx = num() + ox;
        const qy = num() + oy;
        const nx = num() + ox;
        const ny = num() + oy;
        cubicTo(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), nx + (2 / 3) * (qx - nx), ny + (2 / 3) * (qy - ny), nx, ny);
        lastQ = { x: qx, y: qy };
        break;
      }
      case 'T': {
        const lq = lastQ as { x: number; y: number } | null;
        const q = lq ? { x: 2 * x - lq.x, y: 2 * y - lq.y } : { x, y };
        const nx = num() + ox;
        const ny = num() + oy;
        cubicTo(x + (2 / 3) * (q.x - x), y + (2 / 3) * (q.y - y), nx + (2 / 3) * (q.x - nx), ny + (2 / 3) * (q.y - ny), nx, ny);
        lastQ = q;
        break;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        const rot = num();
        const large = num();
        const sweep = num();
        const nx = num() + ox;
        const ny = num() + oy;
        for (const seg of arcToCubics(x, y, rx, ry, rot, !!large, !!sweep, nx, ny)) cubicTo(...seg);
        x = nx;
        y = ny;
        break;
      }
      case 'Z': {
        if (cur) {
          cur.closed = true;
          // A final point on top of the first is the same point
          const pts = cur.points;
          const last = pts[pts.length - 1];
          if (pts.length > 1 && Math.abs(last.x - pts[0].x) < 1e-6 && Math.abs(last.y - pts[0].y) < 1e-6) {
            pts[0].in = last.in;
            pts.pop();
          }
        }
        x = sx;
        y = sy;
        // Numbers right after Z (not valid SVG, but seen in the wild): line-tos from a new sub-path at the same point
        if (isNum()) {
          cur = { closed: false, points: [{ x, y }] };
          out.push(cur);
          cmd = rel ? 'l' : 'L';
        }
        break;
      }
      default:
        i++;
    }
    if (cur === null) break;
    // Every pass must use up at least one token, whatever the data says
    if (i === before) i++;
  }
  // Missing numbers at the end read as NaN: drop those points rather than draw garbage
  for (const sp of out) sp.points = sp.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  return out.filter((sp) => sp.points.length > 1 || sp.closed);
}

/** Endpoint-parameterised arc to cubic bezier segments [c1x, c1y, c2x, c2y, x, y]. */
function arcToCubics(x1: number, y1: number, rx: number, ry: number, angle: number, large: boolean, sweep: boolean, x2: number, y2: number): [number, number, number, number, number, number][] {
  if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];
  const phi = (angle * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) co = -co;
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
  const step = dt / n;
  const k = (4 / 3) * Math.tan(step / 4);
  const segs: [number, number, number, number, number, number][] = [];
  let t = t1;
  const pt = (a: number) => ({ x: cx + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin, y: cy + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos });
  const der = (a: number) => ({ x: -rx * Math.sin(a) * cos - ry * Math.cos(a) * sin, y: -rx * Math.sin(a) * sin + ry * Math.cos(a) * cos });
  for (let s = 0; s < n; s++) {
    const a = pt(t);
    const b = pt(t + step);
    const da = der(t);
    const db = der(t + step);
    segs.push([a.x + k * da.x, a.y + k * da.y, b.x - k * db.x, b.y - k * db.y, b.x, b.y]);
    t += step;
  }
  return segs;
}

// ---------------------------------------------------------------- styles

type Style = Record<string, string>;
const INHERITED = ['fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'color', 'visibility'];
const STYLE_PROPS = [...INHERITED, 'opacity', 'display'];

function ownStyle(el: Element, classRules: Map<string, Style>): Style {
  const s: Style = {};
  for (const p of STYLE_PROPS) {
    const v = el.getAttribute(p);
    if (v !== null) s[p] = v.trim();
  }
  for (const c of (el.getAttribute('class') ?? '').split(/\s+/)) Object.assign(s, classRules.get(c) ?? {});
  for (const decl of (el.getAttribute('style') ?? '').split(';')) {
    const [k, ...rest] = decl.split(':');
    if (k && rest.length) s[k.trim()] = rest.join(':').trim();
  }
  return s;
}

function parseClassRules(doc: Document): Map<string, Style> {
  const rules = new Map<string, Style>();
  for (const st of doc.querySelectorAll('style')) {
    const css = st.textContent ?? '';
    const re = /([^{}]+)\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css))) {
      const decls: Style = {};
      for (const d of m[2].split(';')) {
        const [k, ...v] = d.split(':');
        if (k && v.length) decls[k.trim()] = v.join(':').trim();
      }
      for (const sel of m[1].split(',')) {
        const cls = /^\s*\.([\w-]+)\s*$/.exec(sel);
        if (cls) rules.set(cls[1], { ...(rules.get(cls[1]) ?? {}), ...decls });
      }
    }
  }
  return rules;
}

function colorWithOpacity(c: string, opacity: number, current: string): string | null {
  if (!c || c === 'none' || c === 'transparent') return null;
  let col = c === 'currentColor' ? current || '#000' : c;
  if (opacity < 1) {
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(col);
    if (hex) {
      const h = hex[1].length === 3 ? [...hex[1]].map((ch) => ch + ch).join('') : hex[1];
      col = `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${opacity})`;
    }
  }
  return col;
}

// ---------------------------------------------------------------- the importer

export function importSvg(text: string): SvgImport {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg || doc.querySelector('parsererror')) throw new Error('That file is not a readable SVG.');
  const skipped = new Set<string>();
  const classRules = parseClassRules(doc);
  const vb = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  const wAttr = parseFloat(svg.getAttribute('width') ?? '');
  const hAttr = parseFloat(svg.getAttribute('height') ?? '');
  const hasVb = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0;
  const width = Number.isFinite(wAttr) && !/%/.test(svg.getAttribute('width') ?? '') ? wAttr : hasVb ? vb[2] : 300;
  const height = Number.isFinite(hAttr) && !/%/.test(svg.getAttribute('height') ?? '') ? hAttr : hasVb ? vb[3] : 150;
  let root: M = ID;
  if (hasVb) root = mul([width / vb[2], 0, 0, height / vb[3], 0, 0], [1, 0, 0, 1, -vb[0], -vb[1]]);

  const paintFrom = (value: string | undefined, opacity: number, current: string, bbox: { x: number; y: number; width: number; height: number }, m: M): Paint | null => {
    if (!value) return null;
    const ref = /^url\(\s*['"]?#([^'")]+)['"]?\s*\)/.exec(value);
    if (ref) {
      const g = doc.getElementById(ref[1]);
      if (!g) return null;
      const stopsEl = gradientStops(g);
      const stops = stopsEl.map((st) => {
        const ss = ownStyle(st, classRules);
        const off = st.getAttribute('offset') ?? '0';
        const o = off.endsWith('%') ? parseFloat(off) / 100 : parseFloat(off);
        const so = Number(ss['stop-opacity'] ?? st.getAttribute('stop-opacity') ?? 1) * opacity;
        return { offset: Math.max(0, Math.min(1, o || 0)), color: colorWithOpacity(ss['stop-color'] ?? st.getAttribute('stop-color') ?? '#000', so, current) ?? 'transparent' };
      });
      if (!stops.length) return null;
      if (g.tagName.toLowerCase() === 'lineargradient') {
        const user = g.getAttribute('gradientUnits') === 'userSpaceOnUse';
        const n = (a: string, d: number) => {
          const v = g.getAttribute(a);
          if (v === null) return d;
          return v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v);
        };
        let p1 = { x: n('x1', 0), y: n('y1', 0) };
        let p2 = { x: n('x2', 1), y: n('y2', 0) };
        if (user) {
          p1 = ap(m, p1.x, p1.y);
          p2 = ap(m, p2.x, p2.y);
        } else {
          p1 = { x: bbox.x + p1.x * bbox.width, y: bbox.y + p1.y * bbox.height };
          p2 = { x: bbox.x + p2.x * bbox.width, y: bbox.y + p2.y * bbox.height };
        }
        // CSS angles: 0deg points up, clockwise
        const angle = Math.round(((Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI + 90 + 360) % 360);
        return { type: 'linear', angle, stops };
      }
      return { type: 'radial', stops };
    }
    const c = colorWithOpacity(value, opacity, current);
    return c ? { type: 'solid', color: c } : null;
  };

  const gradientStops = (g: Element): Element[] => {
    const own = [...g.children].filter((c) => c.tagName.toLowerCase() === 'stop');
    if (own.length) return own;
    const href = g.getAttribute('href') ?? g.getAttribute('xlink:href');
    const parent = href?.startsWith('#') ? doc.getElementById(href.slice(1)) : null;
    return parent && parent !== g ? gradientStops(parent) : [];
  };

  const shapePaths = (el: Element): SubPath[] | null => {
    const a = (n: string, d = 0) => parseFloat(el.getAttribute(n) ?? '') || d;
    switch (el.tagName.toLowerCase()) {
      case 'path':
        return parsePathData(el.getAttribute('d') ?? '');
      case 'rect': {
        const x = a('x');
        const y = a('y');
        const w = a('width');
        const h = a('height');
        if (w <= 0 || h <= 0) return null;
        let rx = Math.min(a('rx', a('ry')), w / 2);
        let ry = Math.min(a('ry', a('rx')), h / 2);
        if (!rx && !ry) return [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }];
        rx ||= ry;
        ry ||= rx;
        return parsePathData(`M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`);
      }
      case 'circle':
      case 'ellipse': {
        const cx = a('cx');
        const cy = a('cy');
        const rx = el.tagName.toLowerCase() === 'circle' ? a('r') : a('rx', a('ry'));
        const ry = el.tagName.toLowerCase() === 'circle' ? a('r') : a('ry', a('rx'));
        if (rx <= 0 || ry <= 0) return null;
        return parsePathData(`M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`);
      }
      case 'line':
        return [{ closed: false, points: [{ x: a('x1'), y: a('y1') }, { x: a('x2'), y: a('y2') }] }];
      case 'polyline':
      case 'polygon': {
        const nums = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
        const points: PathPoint[] = [];
        for (let i = 0; i + 1 < nums.length; i += 2) points.push({ x: nums[i], y: nums[i + 1] });
        return points.length > 1 ? [{ closed: el.tagName.toLowerCase() === 'polygon', points }] : null;
      }
    }
    return null;
  };

  const walk = (el: Element, m: M, inherited: Style, opacity: number): SceneNode[] => {
    const out: SceneNode[] = [];
    for (const child of el.children) {
      const tag = child.tagName.toLowerCase();
      if (['defs', 'style', 'title', 'desc', 'metadata', 'lineargradient', 'radialgradient', 'clippath', 'mask', 'symbol', 'filter', 'pattern', 'marker'].includes(tag)) {
        if (tag === 'mask' || tag === 'filter' || tag === 'pattern' || tag === 'marker') skipped.add(`${tag} elements`);
        continue;
      }
      const own = ownStyle(child, classRules);
      if (own.display === 'none' || own.visibility === 'hidden') continue;
      const style: Style = { ...inherited };
      for (const p of INHERITED) if (own[p] !== undefined) style[p] = own[p];
      const op = opacity * (own.opacity !== undefined ? Number(own.opacity) : 1);
      const cm = mul(m, parseTransform(child.getAttribute('transform')));
      if (child.getAttribute('clip-path')) skipped.add('clip paths (shapes kept unclipped)');
      if (child.getAttribute('filter')) skipped.add('filters');

      if (tag === 'g' || tag === 'a' || tag === 'svg' || tag === 'switch') {
        let inner = cm;
        if (tag === 'svg') inner = mul(cm, [1, 0, 0, 1, parseFloat(child.getAttribute('x') ?? '0') || 0, parseFloat(child.getAttribute('y') ?? '0') || 0]);
        const kids = walk(child, inner, style, op);
        if (kids.length === 1 && !child.getAttribute('id')) out.push(kids[0]);
        else if (kids.length) out.push(groupOf(kids, child.getAttribute('id') ?? child.getAttribute('inkscape:label') ?? 'Group'));
        continue;
      }
      if (tag === 'use') {
        const href = child.getAttribute('href') ?? child.getAttribute('xlink:href');
        const ref = href?.startsWith('#') ? doc.getElementById(href.slice(1)) : null;
        if (ref) {
          const wrapper = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
          wrapper.appendChild(ref.cloneNode(true));
          const um = mul(cm, [1, 0, 0, 1, parseFloat(child.getAttribute('x') ?? '0') || 0, parseFloat(child.getAttribute('y') ?? '0') || 0]);
          out.push(...walk(wrapper, um, style, op));
        }
        continue;
      }
      if (tag === 'text') {
        const t = textNode(child, cm, style, op);
        if (t) out.push(t);
        continue;
      }
      if (tag === 'image') {
        skipped.add('embedded images');
        continue;
      }
      const raw = shapePaths(child);
      if (!raw?.length) continue;
      // Bake the transform into the points
      const paths: SubPath[] = raw.map((sp) => ({
        closed: sp.closed,
        points: sp.points.map((p) => {
          const q = ap(cm, p.x, p.y);
          return { x: q.x, y: q.y, in: p.in ? apv(cm, p.in.x, p.in.y) : null, out: p.out ? apv(cm, p.out.x, p.out.y) : null };
        }),
      }));
      const b = pathBounds(paths);
      const current = style.color ?? '#000';
      const fillValue = style.fill ?? (tag === 'line' || tag === 'polyline' ? 'none' : '#000');
      const fill = tag === 'line' ? null : paintFrom(fillValue, Number(style['fill-opacity'] ?? 1), current, b, cm);
      const sp = paintFrom(style.stroke, Number(style['stroke-opacity'] ?? 1), current, b, cm);
      const sw = (parseFloat(style['stroke-width'] ?? '1') || 1) * scaleOf(cm);
      const dash = (style['stroke-dasharray'] ?? '').split(/[\s,]+/).map(Number).filter((x) => x > 0).map((x) => x * scaleOf(cm));
      const stroke: Stroke | null = sp ? { paint: sp, width: Math.round(sw * 100) / 100, ...(dash.length ? { dash } : {}) } : null;
      if (!fill && !stroke) continue;
      const node = createNode('path', {
        name: child.getAttribute('id') ?? child.getAttribute('inkscape:label') ?? tag[0].toUpperCase() + tag.slice(1),
        x: r2(b.x),
        y: r2(b.y),
        width: Math.max(0.01, r2(b.width)),
        height: Math.max(0.01, r2(b.height)),
        opacity: op,
        fill,
        stroke,
        paths: paths.map((s) => ({ closed: s.closed, points: s.points.map((p) => ({ ...p, x: r2(p.x - b.x), y: r2(p.y - b.y) })) })),
        fillRule: style['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero',
        lineCap: (['butt', 'round', 'square'].includes(style['stroke-linecap'] ?? '') ? style['stroke-linecap'] : 'butt') as 'butt',
        lineJoin: (['miter', 'round', 'bevel'].includes(style['stroke-linejoin'] ?? '') ? style['stroke-linejoin'] : 'miter') as 'miter',
      });
      out.push(node);
    }
    return out;
  };

  const textNode = (el: Element, m: M, style: Style, opacity: number): SceneNode | null => {
    const str = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!str) return null;
    const size = (parseFloat(style['font-size'] ?? '16') || 16) * scaleOf(m);
    const firstSpan = el.querySelector('tspan');
    const x = parseFloat(el.getAttribute('x') ?? firstSpan?.getAttribute('x') ?? '0') || 0;
    const y = parseFloat(el.getAttribute('y') ?? firstSpan?.getAttribute('y') ?? '0') || 0;
    const p = ap(m, x, y);
    const width = Math.ceil(str.length * size * 0.6) + 4;
    const anchor = style['text-anchor'];
    const left = anchor === 'middle' ? p.x - width / 2 : anchor === 'end' ? p.x - width : p.x;
    const color = colorWithOpacity(style.fill ?? '#000', Number(style['fill-opacity'] ?? 1), style.color ?? '#000') ?? '#000';
    return createNode('text', {
      name: str.slice(0, 30),
      text: str.replace(/\{/g, '{{').replace(/\}/g, '}}'),
      x: r2(left),
      y: r2(p.y - size * 0.95),
      width,
      height: Math.ceil(size * 1.3),
      fontSize: Math.round(size * 10) / 10,
      fontFamily: (style['font-family'] ?? 'Inter, system-ui, sans-serif').replace(/['"]/g, ''),
      fontWeight: Number(style['font-weight']) || (style['font-weight'] === 'bold' ? 700 : 400),
      fontStyle: style['font-style'] === 'italic' ? 'italic' : 'normal',
      color,
      opacity,
      align: anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left',
      autoSize: 'width',
      lineHeight: 1.3,
    });
  };

  const nodes = walk(svg, root, {}, 1);
  return { nodes, width, height, skipped: [...skipped] };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A group around already-positioned layers (their coordinates become relative to it). */
function groupOf(kids: SceneNode[], name: string): SceneNode {
  const minX = Math.min(...kids.map((k) => k.x));
  const minY = Math.min(...kids.map((k) => k.y));
  const maxX = Math.max(...kids.map((k) => k.x + k.width));
  const maxY = Math.max(...kids.map((k) => k.y + k.height));
  for (const k of kids) {
    k.x = r2(k.x - minX);
    k.y = r2(k.y - minY);
  }
  return createNode('group', { id: uid('n'), name, x: r2(minX), y: r2(minY), width: r2(maxX - minX), height: r2(maxY - minY), children: kids });
}
