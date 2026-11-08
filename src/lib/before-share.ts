//"Before you share": one list of what is most likely wrong with a project, gathered from the checkers that already exist (the
//accessibility checker, Usage, the template review, the size readout) plus two checks of its own (buttons that do nothing, pages
//nothing leads to). Pure: a project in, groups of things to look at out. The dialog (components/BeforeShare.tsx) shows them and
//does the going there and the fixing, and what a person has marked "this is fine" is kept in this browser like the accessibility
//checker's reviewed marks.
import { isContainer, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { checkAccessibility } from './a11y/checks';
import { loadReviewed } from './a11y/reviewed';
import type { Finding } from './a11y/types';
import { analyzeUsage, unusedAssetIds } from './dependencies';
import { pageRoutes } from './page-link';
import { reviewReport } from './templates';

export type ShareCheckId = 'dead-buttons' | 'unreachable-pages' | 'template' | 'placeholder-text' | 'alt-text' | 'contrast' | 'broken' | 'unused-media' | 'size';

export interface ShareItem {
  /** Stable across edits, so a "this is fine" mark survives them. */
  key: string;
  /** The layer, page or file, as the person knows it. */
  name: string;
  /** Where it is ("on Welcome"), or what is wrong with it. */
  where?: string;
  artboardId?: string;
  nodeId?: string;
  /** The accessibility finding it came from (its fix, and its own reviewed mark). */
  finding?: Finding;
  /** A template checklist item's id. */
  itemId?: string;
}

export interface ShareGroup {
  id: ShareCheckId;
  /** "2 buttons do nothing". */
  title: string;
  /** One friendly sentence: why it matters. */
  why: string;
  /** Still to look at, in order. */
  items: ShareItem[];
  /** How many more the person marked as fine. */
  fine: number;
  /** The help page that says more. */
  help: string;
}

/** A project this big (the files it carries) is slow to open on a weak connection. */
export const HEAVY_BYTES = 25 * 1024 * 1024;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- what is kept

const key = (projectId: string) => `ix-share-fine:${projectId}`;
export type FineMap = Readonly<Record<string, string>>;

export function loadFine(projectId: string): FineMap {
  try {
    const v = JSON.parse(localStorage.getItem(key(projectId)) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** Mark these as fine (or, with `fine` false, look at them again). Returns the new map. */
export function setFine(projectId: string, keys: string[], fine: boolean, now = new Date()): FineMap {
  const map: Record<string, string> = { ...loadFine(projectId) };
  for (const k of keys) {
    if (fine) map[k] = now.toISOString();
    else delete map[k];
  }
  try {
    localStorage.setItem(key(projectId), JSON.stringify(map));
  } catch {
    /* storage unavailable: it lasts until the dialog closes */
  }
  return map;
}

// ---------------------------------------------------------------- the checks

/** Every layer with the page it is on and the ids of what it sits inside. */
function layers(project: Project): { ab: Artboard; node: SceneNode; chain: string[] }[] {
  const out: { ab: Artboard; node: SceneNode; chain: string[] }[] = [];
  for (const ab of project.artboards) {
    const go = (list: SceneNode[], chain: string[]) => {
      for (const node of list) {
        out.push({ ab, node, chain });
        if (isContainer(node)) go(node.children, [...chain, node.id]);
      }
    };
    go(ab.children, []);
  }
  return out;
}

/** Button layers that nothing happens to: no click, press or hover on them or on what holds them, and not switched off. */
export function deadButtons(project: Project): ShareItem[] {
  //A pointer event with no layer picked is anything on its page
  const wired = new Set<string>();
  const wild = new Set<string>();
  for (const ab of project.artboards)
    for (const n of ab.logic.nodes) {
      if (n.kind !== 'event.pointer') continue;
      if (typeof n.params.target === 'string' && n.params.target) wired.add(n.params.target);
      else wild.add(ab.id);
    }
  const out: ShareItem[] = [];
  for (const { ab, node, chain } of layers(project)) {
    if (node.type !== 'button' || node.disabled || node.visible === false) continue;
    if (wild.has(ab.id) || wired.has(node.id) || chain.some((id) => wired.has(id))) continue;
    out.push({ key: `dead:${node.id}`, name: node.label?.trim() ? `${node.name} (“${node.label.trim()}”)` : node.name, where: `on ${ab.name}`, artboardId: ab.id, nodeId: node.id });
  }
  return out;
}

/** Pages no route from the start page leads to. Empty when a graph picks pages by expression (it could lead anywhere). */
export function unreachablePages(project: Project): ShareItem[] {
  const masters = new Set(project.artboards.filter((a) => a.master).map((a) => a.master));
  const pages = project.artboards.filter((a) => !a.variantOf && !a.canvasHidden && !a.isMaster && !a.library && !masters.has(a.id));
  if (pages.length < 2) return [];
  for (const ab of project.artboards) for (const n of ab.logic.nodes) if (n.kind === 'action.artboard' && !['picked', 'next', 'previous', 'back'].includes(String(n.params.to ?? 'picked'))) return [];
  //A page an instance layer draws is a part of another page, not somewhere to go
  const parts = new Set<string>();
  for (const { node } of layers(project)) if (node.type === 'instance') parts.add(node.artboardId);
  const start = project.settings.startArtboardId && pages.some((p) => p.id === project.settings.startArtboardId) ? project.settings.startArtboardId : pages[0].id;
  const next = new Map<string, string[]>();
  for (const r of pageRoutes(project)) next.set(r.from, [...(next.get(r.from) ?? []), r.to]);
  const seen = new Set<string>([start]);
  for (const id of seen) for (const to of next.get(id) ?? []) seen.add(to);
  return pages.filter((p) => !seen.has(p.id) && !parts.has(p.id)).map((p) => ({ key: `page:${p.id}`, name: p.name, where: 'nothing leads here', artboardId: p.id }));
}

const PLACEHOLDER = /lorem ipsum|\b(?:your|the) (?:text|title|name|heading|question|answer|content|logo|description) (?:goes )?here\b|\b(?:replace|change|edit) (?:this|me)\b|\binsert (?:text|title|your|name)\b|\[[^\]]*\b(?:your|insert|title|name|text|add|enter)\b[^\]]*\]|\bTBC\b|\bTBD\b|\bx{3,}\b|\bplaceholder\b|\bsample text\b|\b(?:double[- ]?)?click to edit\b|\bnew text\b|\badd (?:your|a) (?:text|title|heading) here\b/i;
const DEFAULT_WORD = /^(?:text|button|link|label|title|heading|subheading|paragraph)$/i;

/** Text, button and link words that are still what the tool or a template put there. */
export function placeholderText(project: Project): ShareItem[] {
  const out: ShareItem[] = [];
  for (const { ab, node } of layers(project)) {
    const words = node.type === 'text' ? node.text : node.type === 'button' ? node.label : node.type === 'link' ? node.text : null;
    if (typeof words !== 'string' || node.visible === false) continue;
    const flat = words.replace(/\s+/g, ' ').trim();
    if (!flat) continue;
    if (PLACEHOLDER.test(flat) || DEFAULT_WORD.test(flat)) out.push({ key: `words:${node.id}`, name: node.name, where: `on ${ab.name}, says “${flat.length > 40 ? `${flat.slice(0, 39)}...` : flat}”`, artboardId: ab.id, nodeId: node.id });
  }
  return out;
}

/** Links with no address or one a browser would not open, and anything pointing at something that is gone. */
export function brokenThings(project: Project): ShareItem[] {
  const out: ShareItem[] = [];
  for (const { ab, node } of layers(project)) {
    if (node.type === 'link' && node.visible !== false) {
      const href = node.href?.trim() ?? '';
      const bad = !href ? 'has no address' : /\s/.test(href) && !href.includes('{') ? 'has a space in its address' : /^[a-z][a-z0-9+.-]*:/i.test(href) && !/^(https?|mailto|tel):/i.test(href) && !href.includes('{') ? `uses “${href.split(':')[0]}:”, which a browser may not open` : '';
      if (bad) out.push({ key: `href:${node.id}`, name: node.name, where: `on ${ab.name}: ${bad}`, artboardId: ab.id, nodeId: node.id });
    }
  }
  //Usage looks for a layer on the page that points at it; a button on a results page that resets a question on another page is fine
  const everyLayer = new Set(layers(project).map((l) => l.node.id));
  for (const m of analyzeUsage(project).missing) {
    if (m.what === 'layer' && everyLayer.has(m.ref)) continue;
    const by = m.by;
    const artboardId = 'artboardId' in by ? by.artboardId : by.type === 'artboard' ? by.id : undefined;
    out.push({ key: `missing:${m.what}:${m.ref}:${by.type}:${by.id}:${m.how}`, name: by.name, where: m.problem ? `${m.how}: ${m.problem}` : `${m.how} points at ${m.what === 'asset' ? 'a file' : `a ${m.what}`} that is gone`, artboardId, nodeId: by.type === 'layer' ? by.id : undefined });
  }
  return out;
}

/** The accessibility checker's findings of one kind, as items that keep the finding (for its fix and its reviewed mark). */
function findings(project: Project, check: 'description' | 'contrast', severities: string[]): ShareItem[] {
  //A locked layer (the brand's logo, its footer) is not the author's to change, so it is left to the accessibility panel
  const locked = new Set(layers(project).filter((l) => l.node.locked).map((l) => l.node.id));
  return checkAccessibility(project)
    .findings.filter((f) => f.check === check && severities.includes(f.severity) && !f.readOnly && !(f.nodeId && locked.has(f.nodeId)))
    .map((f) => ({ key: `a11y:${f.id}`, name: f.nodeName || f.artboardName, where: `on ${f.artboardName}`, artboardId: f.artboardId ?? undefined, nodeId: f.nodeId ?? undefined, finding: f }));
}

/** Template checklist items still to do, ticked but never changed, or pointing at a layer that is gone. */
export function templateLeftovers(project: Project): ShareItem[] {
  if (!project.template?.checklist?.length) return [];
  const r = reviewReport(project);
  const seen = new Set<string>();
  const out: ShareItem[] = [];
  const add = (i: (typeof r.open)[number], why: string) => {
    if (seen.has(i.id)) return;
    seen.add(i.id);
    out.push({ key: `tpl:${i.id}`, name: i.text, where: why, artboardId: i.artboardId, nodeId: i.nodeId, itemId: i.id });
  };
  for (const i of r.open) add(i, 'not ticked yet');
  for (const i of r.untouched) add(i, 'ticked, but the layer is still the template’s');
  for (const i of r.missing) add(i, 'its layer is gone');
  return out;
}

const mb = (bytes: number) => `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;

/** Files nothing uses (the Usage panel's list), and a project that is heavy to download. */
export function mediaThings(project: Project): { unused: ShareItem[]; heavy: ShareItem[] } {
  const report = analyzeUsage(project);
  const ids = new Set(unusedAssetIds(report));
  const unused = project.assets.filter((a) => ids.has(a.id)).map((a): ShareItem => ({ key: `unused:${a.id}`, name: a.name, where: mb(a.size) }));
  const total = project.assets.reduce((s, a) => s + (Number(a.size) || 0), 0);
  const heavy: ShareItem[] =
    total > HEAVY_BYTES
      ? [...project.assets]
          .sort((a, b) => b.size - a.size)
          .slice(0, 3)
          .map((a): ShareItem => ({ key: `heavy:${a.id}`, name: a.name, where: mb(a.size) }))
      : [];
  return { unused, heavy };
}

// ---------------------------------------------------------------- putting it together

/**
 * What to look at before sharing, grouped, with what the person marked as fine left out (and counted). `fine` is this browser's
 * map (loadFine); the accessibility findings also honour the checker's own reviewed marks. An empty list means nothing to look at.
 */
export function checkBeforeShare(project: Project, fine: FineMap = loadFine(project.id)): ShareGroup[] {
  const a11yFine = loadReviewed(project.id);
  const groups: ShareGroup[] = [];
  const add = (id: ShareCheckId, all: ShareItem[], title: (n: number) => string, why: string, help: string) => {
    const open = all.filter((i) => !fine[i.key] && !(i.finding && a11yFine[i.finding.id]));
    if (open.length) groups.push({ id, title: title(open.length), why, items: open, fine: all.length - open.length, help });
  };
  add('dead-buttons', deadButtons(project), (n) => `${plural(n, 'button does', 'buttons do')} nothing when clicked`, 'A learner who presses it will think the activity is broken. Choose what it does, or delete it.', 'interactions#behaviours-when-this-is-clicked');
  add('unreachable-pages', unreachablePages(project), (n) => `${plural(n, 'page', 'pages')} nothing leads to`, 'Learners can only get there if some button or link takes them, so as it stands nobody will see it.', 'artboards');
  add('template', templateLeftovers(project), (n) => `${plural(n, 'thing', 'things')} from the template still to do`, 'The sample content a template starts with is easy to leave behind.', 'templates#use-a-template');
  add('placeholder-text', placeholderText(project), (n) => `${plural(n, 'piece of text still says', 'pieces of text still say')} the sample words`, 'Words like “Text”, “Button” or “Your title here” show to learners as they are.', 'text');
  add('alt-text', findings(project, 'description', ['warning', 'issue']), (n) => `${plural(n, 'picture or video has', 'pictures and videos have')} no description`, 'Someone using a screen reader skips it. Describe what it shows, or mark it as decoration.', 'accessibility-checker');
  add('contrast', findings(project, 'contrast', ['issue']), (n) => `${plural(n, 'piece', 'pieces')} of text hard to read`, 'The text is too close in colour to what is behind it, which is hard to read in sunlight or with low vision.', 'accessibility-checker');
  add('broken', brokenThings(project), (n) => `${plural(n, 'link or reference', 'links and references')} lead nowhere`, 'A learner who follows it gets an error or nothing at all.', 'usage');
  const media = mediaThings(project);
  add('size', media.heavy, () => `The files add up to ${mb(project.assets.reduce((s, a) => s + (Number(a.size) || 0), 0))}`, 'Learners on a slow connection wait a long time for it to open. The biggest are listed.', 'download-size');
  add('unused-media', media.unused, (n) => `${plural(n, 'file', 'files')} nothing uses`, 'They travel with the project, making it bigger for nothing.', 'usage');
  return groups;
}

/** The count the Share button's line says: how many things to look at. */
export const thingsToLookAt = (groups: ShareGroup[]): number => groups.length;

