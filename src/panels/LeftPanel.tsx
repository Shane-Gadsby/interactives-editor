import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from 'react';
import { createNode, isContainer, isMasterArtboard, masterOf, nodeTypeLabel, pagesOfMaster, type Artboard, type ArtboardGroup, type Project, type SceneNode } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { Icons, type IconName } from '../components/icons';
import { IconButton } from '../components/ui';
import { ContextMenu, type MenuItem } from '../components/ContextMenu';
import { filterLayers, selectSameItems } from '../lib/layer-find';
import { confirmDialog } from '../components/dialogs';
import { assetKind, assetUrls } from '../lib/assets';
import { getVariantsVersion, onVariantsChange, savingsFor } from '../lib/asset-variants';
import { optimiseSettings } from '../lib/image-optimise';
import { acceptFor, insertFiles, pickFiles, replaceAssetFile } from '../lib/insert';
import { ANIMATION_ACCEPT, chooseLinking, importAnimationFile, updateFromFile } from '../lib/importers';
import { KIND_LABEL, linksOf } from '../lib/links';
import { getArtboard, locate } from '../store/doc';
import { assetDuplicates, dedupeAssetFiles, deleteAsset } from '../lib/db';
import { analyzeUsage, unusedAssetIds } from '../lib/dependencies';
import { mergeDuplicates, mergePlan } from '../lib/duplicates';
import { track } from '../lib/analytics';
import { attributionForAsset, focusEntryNext, forgetAssets } from '../lib/attributions';
import { unattributedAssets } from 'interactives-player';
import { LibrariesPanel } from './LibrariesPanel';
import { CommentsPanel } from './CommentsPanel';
import { jumpToThread } from '../lib/comment-jump';
import { useComments } from '../lib/comments';
import { countsOf } from '../../shared/comments.mjs';
import { rangeLabel } from '../lib/variants-edit';
import { artboardEntries, groupOf, pickedArtboardIds } from '../lib/artboard-groups';
import { artboardMenuItems, renameGroupCommand, tidyTheseCommand } from '../lib/artboard-commands';
import { brandHeldIds } from '../lib/branded/lock';
import { tidyArtboardsCommand } from '../lib/tidy-command';
import { INDENT, ROW_H, ROW_PAD, depthAtX, dropRows, slotAt, type DropSlot } from '../lib/layer-drop';

export function LeftPanel() {
  const [tab, setTab] = useState<'layers' | 'assets' | 'libraries' | 'comments'>('layers');
  const c = useComments();
  const open = countsOf(c.threads, c.me).open;
  const project = useEditor((st) => st.project);
  useEffect(() => track('panel', 'open', { thing: `left-${tab}` }), [tab]);
  return (
    <aside className="left-panel">
      <div className="tabs">
        <button className={tab === 'layers' ? 'active' : ''} onClick={() => setTab('layers')}>
          Layers
        </button>
        <button className={tab === 'assets' ? 'active' : ''} onClick={() => setTab('assets')}>
          Assets
        </button>
        <button className={tab === 'libraries' ? 'active' : ''} onClick={() => setTab('libraries')} title="Share components and styles between projects">
          Libraries
        </button>
        <button className={tab === 'comments' ? 'active' : ''} onClick={() => setTab('comments')} title={`Review comments: notes pinned on the canvas by you and by reviewers, with replies, resolve and assignees${open ? `. ${open} open` : ''}`}>
          Comments
        </button>
      </div>
      {tab === 'layers' ? <Layers /> : tab === 'assets' ? <Assets /> : tab === 'comments' ? <CommentsPanel project={project} onJump={jumpToThread} hint /> : <LibrariesPanel />}
    </aside>
  );
}

const TYPE_ICON: Record<string, IconName> = {
  rect: 'rect',
  ellipse: 'ellipse',
  polygon: 'polygon',
  star: 'star',
  path: 'pen',
  text: 'text',
  image: 'image',
  group: 'group',
  frame: 'frame',
  button: 'button',
  input: 'input',
  link: 'link',
  embed: 'embed',
  video: 'video',
  draw: 'draw',
  shader: 'shader',
  progress: 'progress',
  chart: 'chart',
  connector: 'connector',
  instance: 'copy',
  bone: 'bone',
};


export function Layers() {
  const s = useEditor((st) => ({ project: st.project, activeArtboardId: st.activeArtboardId, selection: st.selection, artboardSelected: st.artboardSelected, artboardPicked: st.artboardPicked, brandOverride: st.brandOverride }));
  //The selected artboards (more than one when Ctrl+click or Shift+click picked several)
  const pickedAbs = useMemo(() => pickedArtboardIds(s), [s.artboardSelected, s.activeArtboardId, s.artboardPicked]);
  //Brand layers (and what is inside them) of a branded project: shown with a lock, can't be picked here or on the canvas
  const held = useMemo(() => brandHeldIds(s.project, s.brandOverride), [s.project, s.brandOverride]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  //Artboard groups that are folded away (this panel only: the document doesn't remember it)
  const [foldedGroups, setFoldedGroups] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropSlot | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  //F2 (the keymap's Rename command) asks the list to rename the selected layer
  useEffect(() => {
    const f = (e: Event) => setRenaming((e as CustomEvent<string>).detail);
    window.addEventListener('ix-rename-layer', f);
    return () => window.removeEventListener('ix-rename-layer', f);
  }, []);
  const [query, setQuery] = useState('');
  const [inText, setInText] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  // While a search is on the list is the matches and the layers above them, whatever is collapsed, and nothing drags
  const filtering = query.trim() !== '';
  const found = useMemo(() => filterLayers(s.project.artboards, query, inText), [s.project.artboards, query, inText]);

  const toggle = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
  };

  const endDrag = () => {
    setDragId(null);
    setDrop(null);
  };

  // Where a drag over the list would land. Works from the pointer, not from the row under it, so the space below the
  // last row counts too and the horizontal position can pick the depth.
  const slotFor = (e: DragEvent): DropSlot | null => {
    const el = scroller.current;
    const ab = s.project.artboards.find((a) => a.id === s.activeArtboardId);
    if (!el || !dragId || !ab) return null;
    const base = flat.findIndex((r) => r.kind === 'artboard' && r.ab.id === ab.id);
    if (base < 0) return null;
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top + el.scrollTop - 4;
    let i = Math.floor(y / ROW_H);
    let frac = (y - i * ROW_H) / ROW_H;
    if (i >= flat.length) {
      i = flat.length - 1;
      frac = 1;
    }
    if (i < 0) return null;
    const hit = flat[i];
    if (hit.kind === 'group') return null;
    // Over a different artboard: only the row straight after the active artboard's last layer is the end of it
    const end = base + 1 + activeRows.length;
    if (hit.kind === 'artboard' && hit.ab.id !== ab.id) {
      if (i !== end || frac > 0.5) return null;
      return slotAt(ab, activeRows, end, base, 1, depthAtX(e.clientX, rect.left), dragId);
    }
    if (hit.kind === 'node' && hit.ab.id !== ab.id) return null;
    if (i > end) return null;
    return slotAt(ab, activeRows, i, base, frac, depthAtX(e.clientX, rect.left), dragId);
  };
  const sameSlot = (a: DropSlot | null, b: DropSlot | null) => a === b || (!!a && !!b && a.gap === b.gap && a.depth === b.depth && a.row === b.row && a.parentId === b.parentId && a.at === b.at);
  const onListDragOver = (e: DragEvent) => {
    if (!dragId) return;
    const slot = slotFor(e);
    if (!slot) {
      setDrop(null);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDrop((prev) => (sameSlot(prev, slot) ? prev : slot));
  };
  const onListDragLeave = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(null);
  };
  const onListDrop = (e: DragEvent) => {
    if (!dragId) return;
    e.preventDefault();
    const slot = slotFor(e);
    if (slot && !slot.noop) store().moveNode(dragId, slot.parentId, slot.at);
    endDrag();
  };

  // Only the rows in view are drawn: big imports have thousands of layers
  const flat = useMemo(() => {
    const out: ({ kind: 'group'; group: ArtboardGroup; boards: Artboard[] } | { kind: 'artboard'; ab: Artboard } | { kind: 'node'; ab: Artboard; n: SceneNode; depth: number; parent: SceneNode | null })[] = [];
    const add = (ab: Artboard, list: SceneNode[], depth: number, parent: SceneNode | null = null) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const n = list[i];
        out.push({ kind: 'node', ab, n, depth, parent });
        if (isContainer(n) && !collapsed.has(n.id)) add(ab, n.children, depth + 1, n);
      }
    };
    // A search keeps the hits and the groups they sit in, even inside a collapsed group
    const addFound = (ab: Artboard, list: SceneNode[], depth: number, parent: SceneNode | null = null) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const n = list[i];
        if (!found.keep.has(n.id)) continue;
        out.push({ kind: 'node', ab, n, depth, parent });
        if (isContainer(n)) addFound(ab, n.children, depth + 1, n);
      }
    };
    const board = (ab: Artboard) => {
      if (filtering) {
        const below = ab.children.some((n) => found.keep.has(n.id));
        if (!below && !found.artboards.has(ab.id)) return;
        out.push({ kind: 'artboard', ab });
        addFound(ab, ab.children, 1);
        return;
      }
      out.push({ kind: 'artboard', ab });
      if (!collapsed.has(ab.id)) add(ab, ab.children, 1);
    };
    for (const e of artboardEntries(s.project)) {
      if (e.kind === 'board') board(e.ab);
      else if (filtering) e.boards.forEach(board);
      else {
        // a group is a line of its own above its artboards, and folding it hides them
        out.push({ kind: 'group', group: e.group, boards: e.boards });
        if (!foldedGroups.has(e.group.id)) e.boards.forEach(board);
      }
    }
    return out;
  }, [s.project.artboards, s.project.artboardGroups, collapsed, foldedGroups, filtering, found]);
  const activeRows = useMemo(() => {
    const ab = s.project.artboards.find((a) => a.id === s.activeArtboardId);
    return ab ? dropRows(ab, collapsed) : [];
  }, [s.project.artboards, s.activeArtboardId, collapsed]);
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 800 });
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => setView({ top: el.scrollTop, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, []);
  // Selecting on the canvas brings the layer into view
  const firstSel = s.selection[0];
  useEffect(() => {
    const el = scroller.current;
    if (!el || !firstSel) return;
    const i = flat.findIndex((r) => r.kind === 'node' && r.n.id === firstSel && r.ab.id === s.activeArtboardId);
    if (i < 0) return;
    const y = i * ROW_H;
    if (y < el.scrollTop || y + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, y - el.clientHeight / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstSel, s.activeArtboardId]);
  const first = Math.max(0, Math.floor(view.top / ROW_H) - 10);
  const last = Math.min(flat.length, Math.ceil((view.top + view.height) / ROW_H) + 10);

  /** The artboard rows as listed, in order: what Shift+click ranges over. */
  const boardRows = () => flat.filter((r): r is { kind: 'artboard'; ab: Artboard } => r.kind === 'artboard').map((r) => r.ab.id);
  const pickBoard = (ab: Artboard, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
    const st = store();
    // Picking a library copy that was kept off the canvas brings it onto the canvas, so what is selected is there to see
    if (ab.canvasHidden) setOnCanvas(ab.id, true);
    if (e.ctrlKey || e.metaKey) {
      st.toggleArtboardPick(ab.id);
      return;
    }
    if (e.shiftKey && st.get().artboardSelected) {
      //from the active artboard to this one, through the rows as listed
      const rows = boardRows();
      const a = rows.indexOf(st.get().activeArtboardId);
      const b = rows.indexOf(ab.id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        st.pickArtboards(rows.slice(lo, hi + 1), ab.id);
        return;
      }
    }
    const active = ab.id === st.get().activeArtboardId;
    st.set({ activeArtboardId: ab.id, artboardSelected: true, selection: [], activeTimelineId: active ? st.get().activeTimelineId : null });
  };
  const boardMenu = (e: React.MouseEvent, ab: Artboard) => {
    e.preventDefault();
    const st = store();
    // right-clicking one of several selected acts on all of them; anything else picks it first
    if (!pickedArtboardIds(st.get()).includes(ab.id)) st.pickArtboards([ab.id]);
    const ids = pickedArtboardIds(st.get());
    const items = artboardMenuItems(ids);
    if (ids.length === 1) items.splice(items.findIndex((it) => 'separator' in it) + 1, 0, { label: 'Make start page', disabled: s.project.settings.startArtboardId === ab.id, onClick: () => st.update((d) => void (d.settings.startArtboardId = ab.id)) });
    setMenu({ x: e.clientX, y: e.clientY, items });
  };
  const groupRow = (group: ArtboardGroup, boards: Artboard[]) => {
    const open = !foldedGroups.has(group.id);
    const all = boards.length > 0 && boards.every((b) => pickedAbs.includes(b.id));
    const fold = () => {
      const next = new Set(foldedGroups);
      if (open) next.add(group.id);
      else next.delete(group.id);
      setFoldedGroups(next);
    };
    return (
      <div
        key={`abg-${group.id}`}
        className={`artboard-row group-row${all ? ' selected' : ''}`}
        data-group={group.id}
        onClick={(e) => store().pickGroup(group.id, e.ctrlKey || e.metaKey)}
        onDoubleClick={() => void renameGroupCommand(group.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!all) store().pickGroup(group.id);
          setMenu({ x: e.clientX, y: e.clientY, items: artboardMenuItems(boards.map((b) => b.id), group.id) });
        }}
      >
        <button
          className="twisty"
          title={open ? 'Fold the group' : 'Unfold the group'}
          aria-label={open ? 'Fold the group' : 'Unfold the group'}
          onClick={(e) => {
            e.stopPropagation();
            fold();
          }}
        >
          {open ? <Icons.chevronDown width={12} /> : <Icons.chevronRight width={12} />}
        </button>
        <Icons.folder width={14} height={14} />
        <span className="layer-name" title="Click to select every page in the group. Double-click to rename it">
          {group.name}
        </span>
        <span className="badge" title={`${boards.length} ${boards.length === 1 ? 'page' : 'pages'} in this group`}>
          {boards.length}
        </span>
      </div>
    );
  };
  const artboardRow = (ab: Artboard) => {
    const active = ab.id === s.activeArtboardId;
    const open = filtering || !collapsed.has(ab.id);
    const grouped = !filtering && !!groupOf(s.project, ab);
    return (
      <div
        key={`ab-${ab.id}`}
        className={`artboard-row${pickedAbs.includes(ab.id) ? ' selected' : ''}${active ? ' active' : ''}${ab.variantOf ? ' variant' : ''}${grouped ? ' in-group' : ''}`}
        onClick={(e) => pickBoard(ab, e)}
        onContextMenu={(e) => boardMenu(e, ab)}
      >
        {filtering ? (
          <span className="twisty" />
        ) : (
          <button
            className="twisty"
            title={open ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation();
              toggle(ab.id);
            }}
          >
            {open ? <Icons.chevronDown width={12} /> : <Icons.chevronRight width={12} />}
          </button>
        )}
        <Icons.artboard width={14} height={14} />
        <span className="layer-name">{ab.name}</span>
        {s.project.settings.startArtboardId === ab.id && <span className="badge">start</span>}
        {rangeLabel(s.project.artboards, ab) && (
          <span className="badge" title={`${ab.variantOf ? 'A variant' : 'The base'} of a responsive set: shown when the page is ${rangeLabel(s.project.artboards, ab)} wide`}>
            {rangeLabel(s.project.artboards, ab)}
          </span>
        )}
        {isMasterArtboard(s.project.artboards, ab) && (
          <span className="badge master-badge" title={`A page master: its layers are drawn on ${pagesOfMaster(s.project.artboards, ab).length || 'no'} page${pagesOfMaster(s.project.artboards, ab).length === 1 ? '' : 's'}, under (and some over) their own`}>
            master · {pagesOfMaster(s.project.artboards, ab).length}
          </span>
        )}
        {masterOf(s.project.artboards, ab) && (
          <span className="badge" title={`Draws the page master “${masterOf(s.project.artboards, ab)!.name}”. Right-click and choose Edit master to change it`}>
            on {masterOf(s.project.artboards, ab)!.name}
          </span>
        )}
        {ab.library && (
          <span className="badge" title={ab.library.internal ? 'Used inside a library component. Read-only until detached' : 'From a library. Read-only until detached'}>
            {ab.library.internal ? 'library · inner' : 'library'}
          </span>
        )}
        {ab.publish && s.project.settings.library && <span className="badge" title="Published to the library">published</span>}
        {ab.library && (
          <button
            className="icon-btn row-eye"
            title={ab.canvasHidden ? 'Off the canvas (instances still show it). Click to show it on the canvas' : 'Hide this library copy from the canvas (instances still show it)'}
            aria-label={ab.canvasHidden ? 'Show on the canvas' : 'Hide from the canvas'}
            onClick={(e) => {
              e.stopPropagation();
              setOnCanvas(ab.id, !!ab.canvasHidden);
            }}
          >
            {ab.canvasHidden ? <Icons.eyeOff width={13} /> : <Icons.eye width={13} />}
          </button>
        )}
      </div>
    );
  };
  /** Library copies are read-only, but whether they are drawn on the canvas is the person's own choice. */
  const setOnCanvas = (id: string, on: boolean) =>
    store().update(
      (d) => {
        const a = d.artboards.find((x) => x.id === id);
        if (!a) return;
        if (on) delete a.canvasHidden;
        else a.canvasHidden = true;
      },
      { library: true },
    );

  const row = (ab: Artboard, n: SceneNode, depth: number, parent: SceneNode | null): JSX.Element => {
    // A Solo group or frame shows one child; the others are hidden even though their own Visible is on
    const soloOf = parent && isContainer(parent) ? (parent as { solo?: { active: string | null } }).solo : undefined;
    const soloHidden = !!soloOf && soloOf.active !== n.id;
    const shown = n.visible && !soloHidden;
    const selected = s.selection.includes(n.id) && ab.id === s.activeArtboardId;
    const container = isContainer(n);
    const open = container && (filtering || !collapsed.has(n.id));
    const Icon = Icons[TYPE_ICON[n.type] ?? 'rect'];
    const brand = held.has(n.id);
    const dropClass = `${drop?.row !== undefined && activeRows[drop.row]?.n.id === n.id && ab.id === s.activeArtboardId ? ' drop-inside' : ''}${dragId === n.id ? ' dragging' : ''}`;
    return (
      <div
        key={n.id}
        className={`layer-row${selected ? ` selected${s.selection.length > 1 ? ' multi' : ''}` : ''}${brand ? ' brand-held' : ''}${shown ? '' : ' hidden-layer'}${filtering && !found.hits.has(n.id) ? ' not-a-hit' : ''}${dropClass}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable={renaming !== n.id && !filtering && !brand}
        tabIndex={brand ? undefined : selected || (!s.selection.length && n.id === firstLayerId) ? 0 : -1}
        onKeyDown={(e) => {
          //only for the row itself: the rename box and the lock and eye buttons keep their own keys
          if (e.target !== e.currentTarget || brand) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.currentTarget.click();
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const rows = Array.from(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('.layer-row:not(.brand-held)') ?? []);
            rows[rows.indexOf(e.currentTarget) + (e.key === 'ArrowDown' ? 1 : -1)]?.focus();
          }
        }}
        title={brand ? 'Part of the UniSQ brand: locked, so it can’t be selected or changed' : undefined}
        onContextMenu={(e) => {
          e.preventDefault();
          if (brand) return;
          const st = store().get();
          if (!(st.activeArtboardId === ab.id && st.selection.includes(n.id))) store().select([n.id], { artboardId: ab.id });
          setMenu({ x: e.clientX, y: e.clientY, items: [{ heading: n.name }, ...selectSameItems(ab, n)] });
        }}
        onDragStart={(e) => {
          setDragId(n.id);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', n.id);
        }}
        onDragEnd={endDrag}
        onClick={(e) => {
          //a brand layer is not selectable (it can be looked at here, not picked)
          if (brand) return;
          const st = store().get();
          let sel = ab.id === st.activeArtboardId ? st.selection : [];
          if (e.shiftKey || e.metaKey || e.ctrlKey) sel = sel.includes(n.id) ? sel.filter((x) => x !== n.id) : [...sel, n.id];
          else sel = [n.id];
          store().set({ activeArtboardId: ab.id, selection: sel, artboardSelected: false, activeTimelineId: ab.id === st.activeArtboardId ? st.activeTimelineId : null });
        }}
        onDoubleClick={() => !brand && setRenaming(n.id)}
      >
        {container && !filtering ? (
          <button
            className="twisty"
            title={open ? 'Collapse' : 'Expand'}
            aria-label={open ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation();
              toggle(n.id);
            }}
          >
            {open ? <Icons.chevronDown width={12} /> : <Icons.chevronRight width={12} />}
          </button>
        ) : (
          <span className="twisty" />
        )}
        <Icon width={14} height={14} className="layer-icon" />
        {renaming === n.id ? (
          <input
            className="rename"
            autoFocus
            defaultValue={n.name}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== n.name) store().update((d) => {
                const a = d.artboards.find((x) => x.id === ab.id);
                const l = a && locate(a as Artboard, n.id);
                if (l) l.node.name = v;
              });
              setRenaming(null);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setRenaming(null);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="layer-name" title={nodeTypeLabel(n.type)}>
            {n.name}
          </span>
        )}
        <span className="layer-actions">
          <button
            title={brand ? 'Part of the UniSQ brand: locked' : n.locked ? 'Unlock' : 'Lock'}
            className={n.locked || brand ? 'on' : ''}
            disabled={brand}
            onClick={(e) => {
              e.stopPropagation();
              store().select([n.id], { artboardId: ab.id });
              store().setProps([n.id], { locked: !n.locked });
            }}
          >
            {n.locked || brand ? <Icons.lock width={13} /> : <Icons.unlock width={13} />}
          </button>
          <button
            title={soloHidden ? `Hidden by Solo on ${parent!.name}: show this one instead` : n.visible ? 'Hide' : 'Show'}
            className={!shown ? 'on' : ''}
            disabled={brand}
            onClick={(e) => {
              e.stopPropagation();
              store().set({ activeArtboardId: ab.id });
              if (soloHidden) {
                store().setProps([parent!.id], { 'solo.active': n.id });
                if (!n.visible) store().setProps([n.id], { visible: true });
              } else store().setProps([n.id], { visible: !n.visible });
            }}
          >
            {shown ? <Icons.eye width={13} /> : <Icons.eyeOff width={13} />}
          </button>
        </span>
      </div>
    );
  };

  const firstLayerId = flat.slice(first, last).find((r) => r.kind !== 'group' && r.kind !== 'artboard')?.n?.id;
  const hitCount = found.hits.size + found.artboards.size;
  return (
    <>
    <div className="layers-search">
      <input
        type="search"
        value={query}
        placeholder="Filter layers"
        aria-label="Filter layers by name"
        title="Show only the layers whose name has these letters, with the groups they sit in. Esc clears it"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && query) {
            e.stopPropagation();
            setQuery('');
          }
        }}
      />
      <button
        className={`layers-search-text${inText ? ' on' : ''}`}
        aria-pressed={inText}
        title={inText ? 'Matching names and the words in text layers and buttons. Click to match names only' : 'Also match the words in text layers and buttons'}
        onClick={() => setInText(!inText)}
      >
        Text
      </button>
    </div>
    {filtering && (
      <div className="layers-search-count" role="status">
        {hitCount === 0 ? 'No layers match' : `${hitCount} ${hitCount === 1 ? 'match' : 'matches'}`}
      </div>
    )}
    <div className="layers" ref={scroller} onDragOver={onListDragOver} onDrop={onListDrop} onDragLeave={onListDragLeave}>
      {drop && drop.gap >= 0 && (
        <div className="drop-line" style={{ top: 4 + (flat.findIndex((r) => r.kind === 'artboard' && r.ab.id === s.activeArtboardId) + 1 + drop.gap) * ROW_H - 1, left: ROW_PAD + drop.depth * INDENT - 4 }} aria-hidden="true" />
      )}
      <div style={{ height: first * ROW_H }} />
      {flat.slice(first, last).map((r) => (r.kind === 'group' ? groupRow(r.group, r.boards) : r.kind === 'artboard' ? artboardRow(r.ab) : row(r.ab, r.n, r.depth, r.parent)))}
      <div style={{ height: (flat.length - last) * ROW_H }} />
      <button className="link-btn add-artboard" onClick={() => store().addArtboard()}>
        + Add page
      </button>
      <button
        className="link-btn add-artboard"
        title={pickedAbs.length > 1 ? 'Lay the selected pages out in a tidy grid among themselves. One undo step' : 'Lay the pages out in a tidy grid on the canvas, in the order of this list, with even gaps. A responsive variant stays beside its main page, and a page group stays together. One undo step'}
        disabled={s.project.artboards.filter((a) => !a.canvasHidden).length < 2}
        onClick={() => (pickedAbs.length > 1 ? tidyTheseCommand(pickedAbs) : tidyArtboardsCommand())}
      >
        {pickedAbs.length > 1 ? `Tidy up ${pickedAbs.length} selected pages` : 'Tidy up pages'}
      </button>
      <button
        className="link-btn add-artboard"
        title="Import Lottie, Rive, PSD, AI, PDF, PowerPoint, VectorCraft or PhotoCraft files as pages in this project"
        onClick={async () => {
          const files = await pickFiles(ANIMATION_ACCEPT, true);
          if (!files.length) return;
          const linking = await chooseLinking(files);
          if (!linking) return;
          for (const file of files) await importAnimationFile(file, linking);
        }}
      >
        + Import file as page
      </button>
    </div>
    {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </>
  );
}

const ASSET_VIEW_KEY = 'ix-assets-view';
const ASSET_SIZE_KEY = 'ix-assets-size';
const readLocal = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const writeLocal = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** The design files (Photoshop, Illustrator, ...) artboards were imported from, each with Update from file. */
function DesignFiles() {
  const project = useEditor((st) => st.project);
  const files = useMemo(() => [...linksOf(project).entries()], [project]);
  const [busy, setBusy] = useState<string | null>(null);
  if (!files.length) return null;
  return (
    <div className="design-files">
      <div className="design-files-title">Design files</div>
      {files.map(([linkId, f]) => (
        <div key={linkId} className="design-file-row">
          <div className="asset-row-text">
            <div className="asset-name" title={f.fileName}>
              {f.fileName}
            </div>
            <div className="asset-meta">
              {KIND_LABEL[f.kind] ?? f.kind} · {f.artboards.length === 1 ? f.artboards[0].name : `${f.artboards.length} artboards`}
            </div>
          </div>
          <button
            className="btn small"
            disabled={busy === linkId}
            title={`Pick the new version of ${f.fileName}. What changed in it comes in, and the edits made here are kept`}
            onClick={async () => {
              setBusy(linkId);
              try {
                await updateFromFile(linkId);
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === linkId ? 'Updating…' : 'Update…'}
          </button>
        </div>
      ))}
    </div>
  );
}

/** What an image's lighter copies are doing: the proxy the canvas shows, and what Optimise output saves in a download or share. */
function CopiesNote({ project, asset, optimising }: { project: Parameters<typeof savingsFor>[0]; asset: Parameters<typeof savingsFor>[1]; optimising: boolean }) {
  const sv = savingsFor(project, asset);
  const parts: string[] = [];
  if (sv.proxy) parts.push(`Editing copy ${kb(sv.proxy)}`);
  if (optimising && sv.output) parts.push(sv.output === 'same' ? 'Output: already small enough' : `Output ${kb(sv.output.size)}, saves ${kb(sv.output.saved)}`);
  return parts.length ? <div className="asset-meta" title="The original stays at full size. The canvas shows the editing copy; downloads and share links carry the output copy while Optimise output is on">{parts.join(' · ')}</div> : null;
}

export function Assets() {
  const s = useEditor((st) => ({ project: st.project, activeArtboardId: st.activeArtboardId }));
  //Thumbnails for files that arrive after the list (someone else's upload, fetched by useRemoteAssets)
  useSyncExternalStore(
    (fn) => assetUrls.subscribe(fn),
    () => assetUrls.version,
  );
  //The proxy and optimised sizes in the details view arrive as the copies get made
  useSyncExternalStore(onVariantsChange, getVariantsVersion);
  const optimising = optimiseSettings(s.project.settings).on;
  const ab = getArtboard(s.project, s.activeArtboardId);
  const center = ab ? { x: ab.width / 2, y: ab.height / 2 } : null;
  const [view, setView] = useState<'grid' | 'list'>(() => (readLocal(ASSET_VIEW_KEY, 'grid') === 'list' ? 'list' : 'grid'));
  const [size, setSize] = useState(() => Math.min(220, Math.max(56, Number(readLocal(ASSET_SIZE_KEY, '96')) || 96)));
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const lastClicked = useRef<string | null>(null);
  const assets = s.project.assets;
  // Forget checks for assets that are gone (deleted here, by undo, or by someone else)
  const live = new Set(assets.map((a) => a.id));
  const sel = [...checked].filter((id) => live.has(id));
  // The same rule as the Usage tab (layers, paints, fonts, data sources, sounds...), worked out once per document
  const unused = useMemo(() => new Set(unusedAssetIds(analyzeUsage(s.project))), [s.project]);
  const isUsed = (id: string) => !unused.has(id);
  // Which files no attribution covers yet (only said once the project has any attributions, so nobody is nagged who doesn't use them)
  const creditsInUse = !!s.project.attributions?.length;
  const uncredited = useMemo(() => new Set(creditsInUse ? unattributedAssets(s.project) : []), [s.project.assets, s.project.attributions, creditsInUse]);
  const openCredit = (assetId: string) => {
    let entry: string | null = null;
    store().update((d) => void (entry = attributionForAsset(d as Project, assetId)));
    focusEntryNext(entry);
    store().set({ bottomTab: 'credits', previewPlaying: false });
  };
  const upload = async () => {
    const files = await pickFiles('image/*,.psd,.ai,.pdf,.dxf,.dwg,.vectorcraft,.drawcraft,.pcraft,.pptx,video/*,audio/*,.woff,.woff2,.ttf,.otf,.json,.csv,.tsv,.txt');
    if (files.length) await insertFiles(files, null, null);
  };
  const findDuplicates = async () => {
    const project = store().get().project;
    let plan: { keep: string; drop: string[] }[];
    try {
      plan = mergePlan(project, (await assetDuplicates(project.id)).groups);
    } catch (e) {
      store().toast(e instanceof Error ? e.message : String(e), 'error');
      return;
    }
    if (!plan.length) {
      store().toast('No duplicate files: every file in this project is different.');
      return;
    }
    const name = (id: string) => project.assets.find((a) => a.id === id)?.name ?? id;
    const lines = plan.map((p) => `• ${name(p.keep)}: ${p.drop.length} more cop${p.drop.length === 1 ? 'y' : 'ies'} (${p.drop.map(name).join(', ')})`);
    const n = plan.reduce((t, p) => t + p.drop.length, 0);
    if (!(await confirmDialog({ title: 'Duplicate files', message: `These were added more than once:\n${lines.join('\n')}\n\nMerge them? Everything that used a copy uses the kept file instead, and the ${n} cop${n === 1 ? 'y goes' : 'ies go'}. Undo puts the references back.`, confirmLabel: `Merge ${n} cop${n === 1 ? 'y' : 'ies'}` }))) return;
    store().update((d) => void mergeDuplicates(d as Project, plan));
    track('feature', 'assets-dedupe', { sum: { files: n } });
    // The copies stay reachable (an Undo points layers back at them) but stop taking space: the server links them to the kept file
    const r = await dedupeAssetFiles(project.id, plan).catch(() => null);
    store().toast(`Merged ${n} duplicate file${n === 1 ? '' : 's'}${r?.freed ? `, ${Math.round(r.freed / 1024)} KB freed on the server` : ''}.`);
  };
  const removeIds = async (ids: string[]) => {
    store().update((d) => {
      d.assets = d.assets.filter((a) => !ids.includes(a.id));
      d.fonts = d.fonts.filter((f) => !f.assetId || !ids.includes(f.assetId));
      forgetAssets(d as Project, ids);
      // A sound on a timeline with no file behind it plays nothing: take it off the timeline too
      for (const ab of d.artboards) {
        for (const t of ab.timelines) {
          if (!t.audio?.some((a) => ids.includes(a.assetId))) continue;
          t.audio = t.audio.filter((a) => !ids.includes(a.assetId));
          if (!t.audio.length) delete t.audio;
        }
      }
    });
    for (const id of ids) {
      try {
        await deleteAsset(s.project.id, id);
      } catch {
        /* already gone */
      }
    }
    setChecked(new Set());
  };
  const remove = async (id: string) => {
    const a = assets.find((x) => x.id === id);
    const used = isUsed(id);
    const ok = await confirmDialog({
      title: 'Delete asset',
      message: used ? `“${a?.name}” is used in the project. Layers that show it will be empty. Delete it anyway?` : `Delete “${a?.name}”?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) await removeIds([id]);
  };
  const removeSelected = async () => {
    if (!sel.length) return;
    const used = sel.filter(isUsed);
    const names = sel.map((id) => assets.find((a) => a.id === id)?.name ?? id);
    const ok = await confirmDialog({
      title: `Delete ${sel.length} asset${sel.length === 1 ? '' : 's'}`,
      message: `${names.slice(0, 12).join('\n')}${names.length > 12 ? `\n…and ${names.length - 12} more` : ''}${used.length ? `\n\n${used.length} of them ${used.length === 1 ? 'is' : 'are'} used in the project; layers that show ${used.length === 1 ? 'it' : 'them'} will be empty.` : ''}`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) await removeIds(sel);
  };
  const toggle = (id: string, e?: { shiftKey: boolean }) => {
    setChecked((cur) => {
      const next = new Set([...cur].filter((x) => live.has(x)));
      // Shift-click checks everything between the last clicked asset and this one
      if (e?.shiftKey && lastClicked.current && live.has(lastClicked.current)) {
        const ids = assets.map((a) => a.id);
        const [i, j] = [ids.indexOf(lastClicked.current), ids.indexOf(id)].sort((x, y) => x - y);
        for (const x of ids.slice(i, j + 1)) next.add(x);
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastClicked.current = id;
  };
  const place = (a: (typeof assets)[number], kind: string) => {
    if (!ab || !center) return;
    store().addNodes(
      [createNode(kind === 'image' ? 'image' : 'video', { name: a.name.replace(/\.[^.]+$/, ''), assetId: a.id, x: center.x - 150, y: center.y - 100, width: 300, height: 200 })],
      { artboardId: ab.id },
    );
  };
  const replace = async (a: (typeof assets)[number]) => {
    const [file] = await pickFiles(acceptFor(a.mime, a.name), false);
    if (file) await replaceAssetFile(a.id, file);
  };
  const setViewKeep = (v: 'grid' | 'list') => {
    setView(v);
    writeLocal(ASSET_VIEW_KEY, v);
  };
  //Files dropped on the panel are uploaded as assets and nothing is placed (the canvas is where a drop places them)
  const [dropping, setDropping] = useState(false);
  const hasFiles = (e: DragEvent) => [...e.dataTransfer.types].includes('Files');
  return (
    <div
      className={`assets${dropping ? ' dropping' : ''}`}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        setDropping(false);
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        const files = [...e.dataTransfer.files];
        if (files.length) void insertFiles(files, null, null);
      }}
    >
      <button className="btn wide" onClick={upload}>
        <Icons.upload width={14} /> Upload files
      </button>
      <p className="hint">Images, video, audio, fonts and data files (JSON/CSV/TSV/text, used from the Data tab). Drop files here to add them, or on the canvas to place them.</p>
      <DesignFiles />
      {assets.length > 1 && (
        <button className="link-btn small" onClick={() => void findDuplicates()} title="Look for files that were added more than once (the same bytes), and keep one copy">
          Find duplicate files
        </button>
      )}
      {uncredited.size > 0 && (
        <p className="hint asset-credit-note">
          {uncredited.size} file{uncredited.size === 1 ? ' has' : 's have'} no attribution yet.{' '}
          <button className="link-btn" onClick={() => store().set({ bottomTab: 'credits', previewPlaying: false })} title="Open the Attributions tab">
            Open Attributions
          </button>
        </p>
      )}
      {assets.length > 0 && (
        <div className="asset-toolbar">
          <div className="seg">
            <button className={view === 'grid' ? 'on' : ''} title="Show assets as thumbnails" onClick={() => setViewKeep('grid')}>
              Thumbnails
            </button>
            <button className={view === 'list' ? 'on' : ''} title="Show assets as a list with details" onClick={() => setViewKeep('list')}>
              Details
            </button>
          </div>
          {view === 'grid' && (
            <input
              type="range"
              className="asset-size"
              min={56}
              max={220}
              step={2}
              value={size}
              title="Thumbnail size"
              onChange={(e) => {
                setSize(Number(e.target.value));
                writeLocal(ASSET_SIZE_KEY, e.target.value);
              }}
            />
          )}
        </div>
      )}
      {assets.length > 0 && (
        <div className={`asset-selbar${sel.length ? ' active' : ''}`}>
          <label title={sel.length === assets.length ? 'Uncheck every asset' : 'Check every asset'}>
            <input
              type="checkbox"
              checked={sel.length > 0 && sel.length === assets.length}
              ref={(el) => {
                if (el) el.indeterminate = sel.length > 0 && sel.length < assets.length;
              }}
              onChange={() => setChecked(sel.length === assets.length ? new Set() : new Set(assets.map((a) => a.id)))}
            />
            {sel.length ? `${sel.length} selected` : 'Select all'}
          </label>
          {sel.length > 0 && (
            <button className="btn small danger-fill" title="Delete the checked assets (you'll be asked first)" onClick={removeSelected}>
              <Icons.trash width={12} /> Delete
            </button>
          )}
        </div>
      )}
      <div className={view === 'grid' ? 'asset-grid' : 'asset-list'} style={view === 'grid' ? { gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` } : undefined}>
        {assets.map((a) => {
          const kind = assetKind(a.mime, a.name);
          const url = assetUrls.resolve(a.id);
          const on = sel.includes(a.id);
          const box = (
            <input
              type="checkbox"
              className="asset-check"
              checked={on}
              title={on ? 'Uncheck' : 'Check (Shift+click to check a range)'}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => toggle(a.id, e.nativeEvent as MouseEvent)}
            />
          );
          const actions = (
            <div className="asset-actions">
              {(kind === 'image' || kind === 'video') && ab && center && (
                <button className="link-btn" title={`Place on “${ab.name}”`} onClick={(e) => (e.stopPropagation(), place(a, kind))}>
                  Place
                </button>
              )}
              <IconButton
                icon={<Icons.credits width={13} />}
                title={uncredited.has(a.id) || !creditsInUse ? `Add an attribution for “${a.name}” (who made it, the licence) in the Attributions tab` : `Open the attribution for “${a.name}” in the Attributions tab`}
                onClick={(e) => (e?.stopPropagation(), openCredit(a.id))}
              />
              <IconButton
                icon={<Icons.upload width={13} />}
                title={`Replace with a new version of the file. Everything that uses “${a.name}” shows the new one`}
                onClick={(e) => (e?.stopPropagation(), void replace(a))}
              />
              <IconButton icon={<Icons.trash width={13} />} title="Delete asset" onClick={(e) => (e?.stopPropagation(), void remove(a.id))} />
            </div>
          );
          if (view === 'list')
            return (
              <div key={a.id} className={`asset-row${on ? ' checked' : ''}`} title={`${a.name} · ${kb(a.size)}`} onClick={(e) => toggle(a.id, e)}>
                {box}
                <div className="asset-mini" style={kind === 'image' && url ? { backgroundImage: `url("${url}")` } : undefined}>
                  {kind !== 'image' && <span className="asset-kind">{kind.slice(0, 4)}</span>}
                </div>
                <div className="asset-row-text">
                  <div className="asset-name">{a.name}</div>
                  <div className="asset-meta">
                    {kind} · {kb(a.size)}
                    {isUsed(a.id) ? '' : ' · unused'}
                    {uncredited.has(a.id) ? ' · no attribution' : ''}
                  </div>
                  {kind === 'image' && <CopiesNote project={s.project} asset={a} optimising={optimising} />}
                </div>
                {actions}
              </div>
            );
          return (
            <div key={a.id} className={`asset-card${on ? ' checked' : ''}`} title={`${a.name} · ${kb(a.size)}`} onClick={(e) => toggle(a.id, e)}>
              <div className="asset-thumb" style={{ height: Math.round(size * 0.66), ...(kind === 'image' && url ? { backgroundImage: `url("${url}")` } : {}) }}>
                {kind !== 'image' && <span className="asset-kind">{kind}</span>}
                {box}
                {uncredited.has(a.id) && (
                  <span className="asset-nocredit" title="No attribution yet: who made this, and the licence">
                    No attribution
                  </span>
                )}
              </div>
              <div className="asset-name">{a.name}</div>
              {actions}
            </div>
          );
        })}
      </div>
    </div>
  );
}
