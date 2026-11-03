/**
 * The accessibility checker. `checkAccessibility(project)` reads the document (no rendering, no DOM) and lists what it
 * found, per artboard. It reports "checks found", never "compliant": some things it can't see (a photo behind text, what a
 * script does), and those come back as `review` findings so a person looks instead of assuming.
 */
import { isContainer, type Artboard, type ButtonNode, type InputNode, type LogicNode, type Matrix, type Project, type SceneNode, type TextNode, type TextRun } from 'interactives-player';
import { backdropAt, buildPaintList, samplePoints, textExtent, type ArtboardPaint, type ImageColours, type Target, type TextMeasure } from './backdrop';
import { contrastRatio, luminance, over, requiredRatio, suggestColour, toRgba, type RGB } from './colour';
import { FLASH_PROPS, maxFlashesPerSecond, trackSignal } from './flash';
import type { A11yReport, CheckId, CheckInfo, Finding, Fix, Severity } from './types';

export interface CheckOptions {
  /** Colours of the pictures behind text (the editor samples them from the asset files). Without it, text over a picture is a "review". */
  images?: ImageColours;
  /** A real measurement of a text's size, for finding where its ink falls. Without it the size is estimated. */
  measure?: TextMeasure;
}

export const CHECKS: CheckInfo[] = [
  {
    id: 'contrast',
    title: 'Text contrast',
    wcag: '1.4.3 Contrast (Minimum), AA',
    why: 'Low-contrast text is hard or impossible to read for people with low vision, colour blindness, a dim screen or a bright room. Text needs 4.5:1 against what is behind it (3:1 when it is large: 24 px, or 18.66 px and bold).',
    how: 'Darken or lighten the text, or change what is behind it. "Fix" moves the text colour toward black or white by the smallest amount that passes.',
  },
  {
    id: 'small-text',
    title: 'Small text',
    wcag: 'Good practice (1.4.4 Resize Text, AA, depends on the page)',
    why: 'Text under about 12 px on screen is tiring or impossible to read for many people, and gets worse once the artboard is scaled down to fit a phone.',
    how: 'Make it at least 12 px. "Fix" raises it to 12 px; check the layout around it afterwards.',
  },
  {
    id: 'keyboard',
    title: 'Needs a mouse or touch',
    wcag: '2.1.1 Keyboard, A; 2.5.7 Dragging Movements, AA; 1.4.13 Content on Hover or Focus, AA',
    why: 'People who cannot use a mouse (keyboard, switch and voice users, and many screen reader users) cannot reach a layer that only reacts to a pointer. Dragging also needs a way to do it with a single tap or click.',
    how: 'Use a Button layer, or give the layer an On key interaction that does the same thing as its click. Offer a click or key way to do whatever a drag or a hover does.',
  },
  {
    id: 'name',
    title: 'No name for assistive technology',
    wcag: '4.1.2 Name, Role, Value, A; 2.4.4 Link Purpose, A; 3.3.2 Labels or Instructions, A',
    why: 'A screen reader announces a control by its name. A clickable shape, an icon-only button or a field with no label is read as just "button" or "edit text", or skipped, so the person cannot tell what it does.',
    how: 'Give the layer an ARIA label that says what it does ("Next page", not "arrow"). "Fix" adds the label you type.',
  },
  {
    id: 'description',
    title: 'No description',
    wcag: '1.1.1 Non-text Content, A; 2.4.1 Bypass Blocks / 4.1.2 (frames), A',
    why: 'A picture, video or embedded page with no description is invisible to a screen reader user. If it carries meaning (a chart, a diagram, a photo that matters), they miss it.',
    how: 'Describe what the picture shows and why it is there, in a sentence, in its ARIA label. If it is only decoration, mark the finding as reviewed.',
  },
  {
    id: 'target-size',
    title: 'Small click target',
    wcag: '2.5.8 Target Size (Minimum), AA (44 px is the AAA target)',
    why: 'Small targets are hard to hit with a finger, a tremor or a coarse pointer. Targets under 24 by 24 px need spacing around them to meet the standard.',
    how: 'Make the layer at least 24 by 24 px (44 is better), or leave at least 24 px between it and its neighbours.',
  },
  {
    id: 'autoplay-motion',
    title: 'Animation starts by itself',
    wcag: '2.3.3 Animation from Interactions, AAA; supports 2.2.2 Pause, Stop, Hide, A',
    why: 'Movement that starts on its own can make people with vestibular disorders feel ill, and is distracting for people with attention difficulties. Their device tells the page when they prefer less motion.',
    how: 'Turn on "Respect reduced motion" in Project settings. Then an autoplaying timeline shows its last frame instead of moving for those viewers. "Fix" turns it on.',
  },
  {
    id: 'autoplay-media',
    title: 'Video starts by itself',
    wcag: '1.4.2 Audio Control, A; 2.2.2 Pause, Stop, Hide, A',
    why: 'A video that plays sound on its own talks over a screen reader and cannot be stopped without finding the right control. Moving content that runs for more than 5 seconds needs a way to pause it.',
    how: 'Mute it, and show the controls so it can be paused. "Fix" does both.',
  },
  {
    id: 'pause',
    title: 'No way to pause moving content',
    wcag: '2.2.2 Pause, Stop, Hide, A',
    why: 'Animation that starts by itself, runs for more than 5 seconds (or loops) and cannot be paused is a barrier for people who cannot read or concentrate while something moves.',
    how: 'Add a button whose click runs a "Control timeline" node set to Pause or Toggle for that timeline.',
  },
  {
    id: 'flashing',
    title: 'Flashing',
    wcag: '2.3.1 Three Flashes or Below Threshold, A',
    why: 'More than three flashes in a second over a large part of the screen can trigger seizures in people with photosensitive epilepsy.',
    how: 'Slow the changes down to three or fewer a second, or shrink the area, or soften the brightness change.',
  },
  {
    id: 'captions',
    title: 'Video needs captions',
    wcag: '1.2.2 Captions (Prerecorded), A; 1.2.5 Audio Description, AA',
    why: 'Deaf and hard of hearing people need captions for the speech and sounds in a video, and blind people need the pictures described. A checker cannot hear a file.',
    how: 'Check that the video file or its player has captions (and a description track or transcript when the pictures matter), then mark this reviewed.',
  },
  {
    id: 'title',
    title: 'Page title',
    wcag: '2.4.2 Page Titled, A',
    why: 'The title is the first thing a screen reader reads and what shows in the browser tab and history.',
    how: 'Give the project a title in Project settings. "Fix" uses the project name.',
  },
];

const INFO = new Map(CHECKS.map((c) => [c.id, c]));

/** What this checker can't see, shown in every report. */
export const NOT_CHECKED = [
  'Whether text is right: reading order, heading structure, plain language, or the language of the page.',
  'Anything a script does (script and code nodes, embedded HTML and pages): keyboard handling, focus, flashing, announcements.',
  'Whether a video has captions or audio description, or an audio file has a transcript.',
  'Colour as the only way to tell things apart, and text that is part of a picture.',
  'Flashing from anything but timelines (timers, scripts, video, shader layers).',
  'Contrast over photos that are not loaded, over video, shaders and blend modes, and anything a binding or timeline changes while it runs.',
  'Focus order and visible focus: the Tab order follows the layer order and the browser default.',
  'Content that only appears after something is done (hidden layers are checked as they would look when shown).',
];

// ---------------------------------------------------------------------------
// Reading a layer (the 'layer semantics' task adds roles and text alternatives; they are read here when they exist)

/** What assistive technology gets from a layer. Reads `ariaLabel` today and the layer-semantics fields (`altText`, `decorative`, `focusable`, `role`) when a layer has them. */
export interface Semantics {
  label: string;
  decorative: boolean;
  focusable: boolean;
  role: string;
}

export function semanticsOf(n: SceneNode): Semantics {
  const x = n as unknown as { ariaLabel?: string; altText?: string; decorative?: boolean; focusable?: boolean; tabIndex?: number; role?: string };
  return {
    label: String(x.altText || x.ariaLabel || '').trim(),
    decorative: x.decorative === true,
    focusable: x.focusable === true || (typeof x.tabIndex === 'number' && x.tabIndex >= 0),
    role: String(x.role ?? ''),
  };
}

/** Roles that can be operated from the keyboard once a layer can take focus. */
const OPERABLE_ROLES = new Set(['button', 'link', 'checkbox', 'switch', 'menuitem', 'tab', 'radio', 'slider']);

const GENERIC_NAME = /^(rectangle|ellipse|polygon|star|path|text|image|group|frame|button|input|link|embed|video|instance|layer|shape|bone|line|vector|script layer|shader layer|copy)(\s+\d+)?$|\.(png|jpe?g|gif|webp|svg|mp4|webm|mov)$|^img[_\s-]?\d+/i;

/** The layer's name when it reads like a human wrote it ("Logo", "Next arrow"), not like the editor did ("Rectangle 4"). */
export function meaningfulName(name: string): string {
  const n = (name ?? '').trim();
  return n && !GENERIC_NAME.test(n) ? n : '';
}

function textOf(n: SceneNode): string {
  switch (n.type) {
    case 'text':
      return n.text ?? '';
    case 'button':
      return n.label ?? '';
    case 'link':
      return n.text ?? '';
    default:
      return '';
  }
}

/** Any readable text in the layer or below it. */
function hasText(n: SceneNode): boolean {
  if (textOf(n).trim()) return true;
  return isContainer(n) && n.children.some(hasText);
}

const scaleOf = (m: Matrix) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

// ---------------------------------------------------------------------------
// Interactions: who reacts to what, and whether a key does the same thing

type PointerKind = 'click' | 'hover' | 'drag';
const KIND_OF: Record<string, PointerKind> = {
  click: 'click',
  dblclick: 'click',
  pointerdown: 'click',
  pointerup: 'click',
  pointerenter: 'hover',
  pointerleave: 'hover',
  pointermove: 'hover',
  dragstart: 'drag',
  drag: 'drag',
  dragend: 'drag',
};

interface Interactions {
  /** Layer id -> what kinds of pointer event it listens for, and what each runs. */
  pointer: Map<string, { kinds: Set<PointerKind>; runs: Map<PointerKind, Set<string>> }>;
  /** What each On key event runs. */
  keys: Set<string>[];
  /** Timelines that something can pause or stop. */
  pausable: Set<string>;
}

/** The actions an event leads to, as "kind + settings" so two separate nodes doing the same thing count as the same. */
function reach(ab: Artboard, startId: string): Set<string> {
  const byId = new Map(ab.logic.nodes.map((n) => [n.id, n]));
  const out = new Set<string>();
  const seen = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of ab.logic.edges) {
      if (e.from !== id || seen.has(e.to)) continue;
      seen.add(e.to);
      queue.push(e.to);
      const n = byId.get(e.to);
      if (n && n.kind.startsWith('action.')) out.add(n.kind + JSON.stringify(n.params));
    }
  }
  return out;
}

function interactionsOf(ab: Artboard): Interactions {
  const pointer: Interactions['pointer'] = new Map();
  const keys: Set<string>[] = [];
  const pausable = new Set<string>();
  for (const ln of ab.logic.nodes as LogicNode[]) {
    if (ln.kind === 'event.pointer') {
      const target = String(ln.params.target ?? '');
      const kind = KIND_OF[String(ln.params.type ?? 'click')];
      if (!target || !kind) continue;
      let e = pointer.get(target);
      if (!e) pointer.set(target, (e = { kinds: new Set(), runs: new Map() }));
      e.kinds.add(kind);
      const set = e.runs.get(kind) ?? new Set<string>();
      for (const a of reach(ab, ln.id)) set.add(a);
      e.runs.set(kind, set);
    } else if (ln.kind === 'event.key') {
      keys.push(reach(ab, ln.id));
    } else if (ln.kind === 'action.timeline' && ['pause', 'stop', 'toggle'].includes(String(ln.params.op ?? 'play'))) {
      pausable.add(String(ln.params.timeline ?? ''));
    }
  }
  return { pointer, keys, pausable };
}

// ---------------------------------------------------------------------------

const RANK: Record<Severity, number> = { issue: 0, warning: 1, review: 2 };

export function checkAccessibility(project: Project, opts: CheckOptions = {}): A11yReport {
  const findings: Finding[] = [];

  const add = (ab: Artboard | null, node: SceneNode | null, check: CheckId, severity: Severity, title: string, detail: string, extra: { fix?: Fix; key?: string } = {}) => {
    findings.push({
      id: `${check}:${ab?.id ?? 'project'}:${extra.key ?? node?.id ?? ''}`,
      check,
      severity,
      title: title || INFO.get(check)!.title,
      detail,
      artboardId: ab?.id ?? null,
      artboardName: ab?.name ?? '',
      nodeId: node?.id ?? null,
      nodeName: node?.name ?? '',
      nodeType: node?.type ?? '',
      readOnly: ab?.library ? true : undefined,
      fix: ab?.library ? undefined : extra.fix,
    });
  };

  const layerFix = (ab: Artboard, node: SceneNode, label: string, set: Record<string, unknown>, input?: Fix['input']): Fix => ({ label, target: { scope: 'layer', artboardId: ab.id, nodeId: node.id }, set, input });
  const labelFix = (ab: Artboard, node: SceneNode, what: string, suggestion = ''): Fix =>
    layerFix(ab, node, `Add ${what}`, { ariaLabel: suggestion }, { key: 'ariaLabel', label: what.replace(/^an? /, '').replace(/^./, (c) => c.toUpperCase()), placeholder: what === 'a description' ? 'What it shows, in a sentence' : 'What it does, e.g. Next page', value: suggestion });

  /** Contrast and size of the words in a text, button, link or input. */
  const checkText = (ab: Artboard, pt: ArtboardPaint, n: SceneNode, target: Target, hiddenNote: string) => {
    if (n.type !== 'text' && n.type !== 'button' && n.type !== 'link' && n.type !== 'input') return;
    const node = n as TextNode | ButtonNode | InputNode;
    const text = n.type === 'input' ? n.value || n.placeholder || '' : textOf(n);
    const runs: TextRun[] = n.type === 'text' && n.runs?.length ? n.runs : [];
    if (!text.trim() && !runs.some((r) => r.text.trim())) return;
    const world = scaleOf(target.m);

    // Size: the layer's own, and any run that sets its own
    const baseUsed = !runs.length || runs.some((r) => !r.fontSize && r.text.trim());
    const smallBase = baseUsed && node.fontSize * world < 12 && node.fontSize > 0;
    const smallRuns = runs.filter((r) => r.fontSize && r.text.trim() && r.fontSize * world < 12);
    if (smallBase || smallRuns.length) {
      const worst = Math.min(...(smallBase ? [node.fontSize] : []), ...smallRuns.map((r) => r.fontSize!)) * world;
      const set: Record<string, unknown> = {};
      if (smallBase) set.fontSize = Math.round(12 / world);
      if (smallRuns.length) set.runs = runs.map((r) => (r.fontSize && r.text.trim() && r.fontSize * world < 12 ? { ...r, fontSize: Math.round(12 / world) } : r));
      add(ab, n, 'small-text', 'warning', 'Small text', `${n.name} is ${Math.round(worst * 10) / 10} px on the artboard${world !== 1 ? ` (${node.fontSize} px at a scale of ${Math.round(world * 100) / 100})` : ''}. Under 12 px is hard to read for many people.${hiddenNote}`, { fix: layerFix(ab, n, 'Raise to 12 px', set) });
    }

    // Contrast: every colour the words use, against the sampled colours behind the part of the box the words fill
    const pts = samplePoints(target.m, textExtent(n, opts.measure));
    const backs = pts.map((p) => backdropAt(pt, target, p.x, p.y, opts.images));
    const used: { colour: string; rgba: NonNullable<ReturnType<typeof toRgba>>; need: number; idx: number }[] = [];
    const use = (colour: string, size: number, weight: number, idx: number) => {
      const rgba = toRgba(colour);
      if (rgba) used.push({ colour, rgba, need: requiredRatio(size * world, weight), idx });
    };
    if (baseUsed) use(node.color, node.fontSize, node.fontWeight, -1);
    runs.forEach((r, i) => {
      if (r.text.trim() && (r.color || r.fontSize || r.fontWeight)) use(r.color || node.color, r.fontSize ?? node.fontSize, r.fontWeight ?? node.fontWeight, i);
    });
    if (!used.length) {
      add(ab, n, 'contrast', 'review', 'Text colour could not be read', `The colour of ${n.name} (${node.color}) is not one this checker understands.`);
      return;
    }

    let worst: { ratio: number; need: number; colour: string } | null = null;
    let review = '';
    const failing = new Set<number>();
    for (const u of used) {
      let pass = 0;
      let fail = 0;
      let lowest = Infinity;
      let unknown = '';
      for (const b of backs) {
        if (b.unknown) {
          unknown = b.unknown;
          continue;
        }
        const ratios = b.colours.map((c) => contrastRatio(over(u.rgba, c, target.alpha), c));
        const lo = Math.min(...ratios);
        lowest = Math.min(lowest, lo);
        if (lo >= u.need) pass++;
        else if (Math.max(...ratios) < u.need) fail++;
      }
      if (pass === backs.length) continue;
      if (fail === backs.length) {
        if (!worst || lowest < worst.ratio) worst = { ratio: lowest, need: u.need, colour: u.colour };
        failing.add(u.idx);
      } else if (!review) {
        review = unknown ? `The text sits over ${unknown}, so the colour behind it could not be worked out.` : 'Some of the area behind the text passes and some does not (a gradient, a picture, or the edge of the shape behind it), so check where the words actually sit.';
      }
    }
    const changes = [target.alpha < 1 ? ' The layer is partly transparent.' : '', n.bindings?.color || ab.timelines.some((t) => t.tracks.some((tr) => tr.nodeId === n.id && tr.prop === 'color')) ? ' A binding or timeline changes its colour, and only the starting colour was checked.' : ''].join('');
    if (worst) {
      // A fix needs one colour that clears every colour that is behind the words, and a layer that is not styled or driven from elsewhere
      const all = backs.flatMap((b) => b.colours);
      const sugg = new Map<number, string | null>();
      for (const u of used) if (failing.has(u.idx)) sugg.set(u.idx, suggestColour([u.rgba[0], u.rgba[1], u.rgba[2], 1], all, u.need));
      const ownOpacity = n.visible && n.opacity > 0 ? n.opacity : 1;
      const ancestorsFade = Math.abs(target.alpha - ownOpacity) > 0.001;
      let fix: Fix | undefined;
      if (![...sugg.values()].some((v) => !v) && !n.bindings?.color && !n.styleRefs?.color && !n.styleRefs?.text && !ancestorsFade) {
        const set: Record<string, unknown> = {};
        if (failing.has(-1)) set.color = sugg.get(-1);
        if ([...failing].some((i) => i >= 0)) set.runs = runs.map((r, i) => (failing.has(i) ? { ...r, color: sugg.get(i) } : r));
        if (ownOpacity < 1) set.opacity = 1;
        fix = layerFix(ab, n, `Change the text colour to ${[...new Set(sugg.values())].join(' and ')}${ownOpacity < 1 ? ' and make it opaque' : ''}`, set);
      }
      add(ab, n, 'contrast', 'issue', 'Low text contrast', `${n.name}: ${Math.round(worst.ratio * 100) / 100}:1 against what is behind it (${worst.colour}); it needs ${worst.need}:1.${changes}${hiddenNote}`, { fix });
    } else if (review) {
      add(ab, n, 'contrast', 'review', 'Text contrast could not be confirmed', `${n.name}: ${review}${changes}${hiddenNote}`);
    }
  };

  for (const ab of project.artboards) {
    const paint = buildPaintList(project, ab);
    const inter = interactionsOf(ab);
    const area = Math.max(1, ab.width * ab.height);

    const walkAll = (list: SceneNode[], fn: (n: SceneNode) => void) => {
      for (const n of list) {
        fn(n);
        if (isContainer(n)) walkAll(n.children, fn);
      }
    };

    walkAll(ab.children, (n) => {
      const target = paint.targets.get(n.id);
      const sem = semanticsOf(n);
      const native = n.type === 'button' || n.type === 'input' || n.type === 'link' || !!n.link;
      const ptr = inter.pointer.get(n.id);
      const interactive = native || !!ptr || !!(n.draggable && n.draggable.enabled !== false);
      const hiddenNote = target && target.hidden.length ? ' It is hidden until something shows it, and was checked as it will look then.' : '';

      // ---- Keyboard: can the thing be done without a pointer
      if (ptr && !native) {
        const operable = sem.focusable && OPERABLE_ROLES.has(sem.role);
        const keyDoes = (kind: PointerKind) => {
          const runs = ptr.runs.get(kind) ?? new Set<string>();
          return operable || [...runs].length === 0 || inter.keys.some((k) => [...runs].some((r) => k.has(r)));
        };
        const missing = (['click', 'hover', 'drag'] as PointerKind[]).filter((k) => ptr.kinds.has(k) && !keyDoes(k));
        const clickMissing = missing.includes('click');
        // A hover or a drag is a gap only when it is the layer's only way in; next to a click that works, it is a nicety
        if (clickMissing || (!ptr.kinds.has('click') && missing.length)) {
          const bits = missing.map((k) => (k === 'click' ? 'clicking or tapping it' : k === 'hover' ? 'hovering over it' : 'dragging it'));
          const tail = inter.keys.length ? ' This artboard has On key interactions, but none runs the same actions.' : ' Nothing on this artboard reacts to a key.';
          add(ab, n, 'keyboard', clickMissing ? 'issue' : 'warning', clickMissing ? 'Only works with a mouse or touch' : missing.includes('drag') ? 'Dragging is the only way' : 'Only works on hover', `${n.name} reacts to ${bits.join(' and ')}, and no key does the same thing.${tail} A Button layer is focusable and works with Enter and Space on its own.${hiddenNote}`);
        }
      }

      // ---- Name: what a screen reader calls it
      if (interactive && !sem.decorative) {
        let noName: boolean;
        let placeholderOnly = false;
        if (n.type === 'button') noName = !n.label.trim() && !sem.label;
        else if (n.type === 'link') noName = !n.text.trim() && !sem.label;
        else if (n.type === 'input') {
          noName = !sem.label;
          placeholderOnly = noName && !!n.placeholder?.trim();
        } else noName = !sem.label && !hasText(n);
        if (noName) {
          add(ab, n, 'name', placeholderOnly ? 'warning' : 'issue', placeholderOnly ? 'Field named only by its placeholder' : 'No name for a screen reader', placeholderOnly ? `${n.name} has placeholder text ("${(n as InputNode).placeholder}") but no label. Placeholders disappear when you type, and not every screen reader announces them as a name.` : `${n.name} is something people click or use, with no text and no ARIA label, so a screen reader cannot say what it is.${hiddenNote}`, { fix: labelFix(ab, n, 'a label', meaningfulName(n.name)) });
        }
      }

      // ---- Target size
      if (interactive && n.type !== 'link' && target && !(n.type === 'input' && n.inputType === 'textarea')) {
        const sw = Math.hypot(target.m[0], target.m[1]) * n.width;
        const sh = Math.hypot(target.m[2], target.m[3]) * n.height;
        if (Math.min(sw, sh) < 24 && Math.min(sw, sh) > 0) {
          add(ab, n, 'target-size', 'warning', 'Small click target', `${n.name} is ${Math.round(sw)} by ${Math.round(sh)} px. The standard asks for 24 by 24 px at least, unless there is 24 px of space around it.${hiddenNote}`);
        }
      }

      // ---- Pictures, videos, frames
      if (!interactive && !sem.decorative && !sem.label) {
        if (n.type === 'image' && n.assetId) add(ab, n, 'description', 'warning', 'Picture has no description', `${n.name} has no ARIA label, so a screen reader skips it. If it shows something that matters, describe it. If it is decoration, mark this reviewed.${hiddenNote}`, { fix: labelFix(ab, n, 'a description', meaningfulName(n.name)) });
        else if (n.type === 'video' && (n.assetId || n.src)) add(ab, n, 'description', 'warning', 'Video has no description', `${n.name} has no ARIA label. Say what the video is about in one sentence.${hiddenNote}`, { fix: labelFix(ab, n, 'a description', meaningfulName(n.name)) });
        else if (n.type === 'embed' && n.mode === 'iframe' && n.src) add(ab, n, 'description', 'warning', 'Embedded page has no title', `${n.name} is an embedded page with no ARIA label. Screen reader users get a list of frames by title, and an untitled one is just "frame".${hiddenNote}`, { fix: labelFix(ab, n, 'a title', meaningfulName(n.name)) });
        else if (n.type === 'draw' || n.type === 'shader') add(ab, n, 'description', 'review', `${n.type === 'draw' ? 'Script' : 'Shader'} layer may need a description`, `${n.name} is painted by code. If it shows information (a chart, a diagram), give it an ARIA label that says what it shows. If it is decoration, mark this reviewed.${hiddenNote}`, { fix: labelFix(ab, n, 'a description', '') });
      }
      if (n.type === 'embed' && n.mode === 'html') add(ab, n, 'description', 'review', 'Embedded HTML is not checked', `${n.name} runs your own HTML, which this checker does not read. Test it with a keyboard and a screen reader.`);

      // ---- Video: autoplay and captions
      if (n.type === 'video' && (n.assetId || n.src)) {
        if (n.autoplay) {
          const loud = !n.muted;
          const still = !n.controls;
          if (loud || still) {
            const set: Record<string, unknown> = {};
            if (loud) set.muted = true;
            if (still) set.controls = true;
            add(ab, n, 'autoplay-media', loud ? 'issue' : 'warning', 'Video starts by itself', `${n.name} plays as soon as it is shown${loud ? ', with sound' : ''}${still ? `${loud ? ' and' : ','} has no controls to pause it` : ''}.${hiddenNote}`, { fix: layerFix(ab, n, loud && still ? 'Mute it and show controls' : loud ? 'Mute it' : 'Show controls', set) });
          }
        }
        add(ab, n, 'captions', 'review', 'Check this video has captions', `${n.name} is a video. A checker cannot tell whether it has captions or an audio description.`);
      }

      // ---- Text: contrast and size
      if (target) checkText(ab, paint, n, target, hiddenNote);
    });

    // ---- Timelines: autoplay, pausing, flashing
    const moving = ab.timelines.filter((t) => t.tracks.some((tr) => tr.keys.length > 1));
    const auto = moving.filter((t) => t.autoplay);
    if (auto.length && !project.settings.reducedMotion) {
      add(ab, null, 'autoplay-motion', 'warning', 'Animation starts by itself', `${auto.map((t) => `"${t.name}"`).join(', ')} ${auto.length === 1 ? 'plays' : 'play'} on ${auto.length === 1 ? 'its' : 'their'} own and the project does not respect the viewer's reduced motion setting.`, { key: 'timelines', fix: { label: 'Respect reduced motion', target: { scope: 'project' }, set: { 'settings.reducedMotion': true } } });
    }
    for (const t of auto) {
      if ((t.loop !== 'once' || t.duration > 5000) && !inter.pausable.has(t.id)) {
        add(ab, null, 'pause', 'warning', 'No way to pause moving content', `"${t.name}" starts by itself and ${t.loop === 'once' ? `runs for ${Math.round(t.duration / 100) / 10} seconds` : 'loops'}. Nothing on this artboard pauses or stops it.`, { key: t.id });
      }
    }
    for (const t of moving) {
      for (const tr of t.tracks) {
        if (!FLASH_PROPS.includes(tr.prop) || tr.keys.length < 2) continue;
        const target = paint.targets.get(tr.nodeId);
        if (!target) continue;
        const sw = Math.hypot(target.m[0], target.m[1]) * target.node.width;
        const sh = Math.hypot(target.m[2], target.m[3]) * target.node.height;
        const share = (sw * sh) / area;
        if (share < 0.1) continue;
        const own = ownColour(target.node);
        const grid = samplePoints(target.m, { x: 0, y: 0, w: target.node.width, h: target.node.height });
        const step = Math.max(1, Math.floor(grid.length / 5));
        const bk = grid.filter((_, i) => i % step === 0).map((p) => backdropAt(paint, target, p.x, p.y, opts.images));
        const backLum = bk.every((b) => !b.unknown) ? average(bk.flatMap((b) => b.colours.map(luminance))) : null;
        const res = trackSignal(t, tr, { layerLum: own ? luminance(own) : null, backLum });
        if (!res) continue;
        const fl = maxFlashesPerSecond(res.signal);
        if (fl > 3) {
          add(ab, target.node, 'flashing', 'issue', 'Flashing more than three times a second', `"${t.name}" makes ${target.node.name} go bright and dark about ${fl} times in a second, over ${Math.round(share * 100)}% of the artboard (the ${tr.prop} track).${res.assumed ? ' How bright the layer or what is behind it is could not be worked out, so the worst case (white on black) was assumed.' : ''}`, { key: `${t.id}:${tr.id}` });
        }
      }
    }
  }

  if (!project.settings.title?.trim()) {
    add(null, null, 'title', 'warning', 'The project has no title', 'The title is empty. It is what a screen reader reads first and what the browser tab shows.', { key: 'title', fix: { label: `Use "${project.name}" as the title`, target: { scope: 'project' }, set: { 'settings.title': project.name } } });
  }

  const order = new Map(project.artboards.map((a, i) => [a.id, i]));
  findings.sort((a, b) => (order.get(a.artboardId ?? '') ?? -1) - (order.get(b.artboardId ?? '') ?? -1) || RANK[a.severity] - RANK[b.severity]);
  return {
    generated: new Date().toISOString(),
    projectId: project.id,
    projectName: project.name,
    artboards: project.artboards.map((a) => ({ id: a.id, name: a.name })),
    findings,
    checks: CHECKS,
    notChecked: NOT_CHECKED,
  };
}

function average(v: number[]): number {
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

/** The colour a layer is mostly made of: its first visible solid fill, or its text colour. */
function ownColour(n: SceneNode): RGB | null {
  const x = n as unknown as { fill?: { type: string; color?: string; visible?: boolean } | null; color?: string };
  const c = x.fill && x.fill.type === 'solid' && x.fill.visible !== false ? toRgba(x.fill.color) : x.color ? toRgba(x.color) : null;
  return c ? [c[0], c[1], c[2]] : null;
}

export function summarise(findings: Finding[], reviewed: ReadonlySet<string> = new Set()): { issue: number; warning: number; review: number; reviewed: number; open: number } {
  const s = { issue: 0, warning: 0, review: 0, reviewed: 0, open: 0 };
  for (const f of findings) {
    if (reviewed.has(f.id)) s.reviewed++;
    else {
      s[f.severity]++;
      s.open++;
    }
  }
  return s;
}
