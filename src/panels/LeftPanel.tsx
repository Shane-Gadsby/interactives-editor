import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createNode, isContainer, nodeTypeLabel, type Artboard, type SceneNode } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { Icons, type IconName } from '../components/icons';
import { IconButton } from '../components/ui';
import { confirmDialog } from '../components/dialogs';
import { assetKind, assetUrls } from '../lib/assets';
import { insertFiles, pickFiles } from '../lib/insert';
import { ANIMATION_ACCEPT, chooseLinking, importAnimationFile } from '../lib/importers';
import { getArtboard, locate } from '../store/doc';
import { deleteAsset } from '../lib/db';

export function LeftPanel() {
  const [tab, setTab] = useState<'layers' | 'assets'>('layers');
  return (
    <aside className="left-panel">
      <div className="tabs">
        <button className={tab === 'layers' ? 'active' : ''} onClick={() => setTab('layers')}>
          Layers
        </button>
        <button className={tab === 'assets' ? 'active' : ''} onClick={() => setTab('assets')}>
          Assets
        </button>
      </div>
      {tab === 'layers' ? <Layers /> : <Assets />}
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
  instance: 'copy',
};

const ROW_H = 26;

type DropPos = { id: string; where: 'before' | 'after' | 'inside' } | null;

function Layers() {
  const s = useEditor((st) => ({ project: st.project, activeArtboardId: st.activeArtboardId, selection: st.selection, artboardSelected: st.artboardSelected }));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropPos>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const toggle = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
  };

  const doDrop = (ab: Artboard) => {
    if (!dragId || !drop || dragId === drop.id) return;
    const target = locate(ab, drop.id);
    if (!target) return;
    if (drop.where === 'inside' && isContainer(target.node)) {
      store().moveNode(dragId, target.node.id, Infinity);
    } else {
      // The list is drawn top-most first, so "before" in the list is "after" in the children array.
      const index = drop.where === 'before' ? target.index + 1 : target.index;
      store().moveNode(dragId, target.parent?.id ?? null, index);
    }
  };

  // Only the rows in view are drawn: big imports have thousands of layers
  const flat = useMemo(() => {
    const out: ({ kind: 'artboard'; ab: Artboard } | { kind: 'node'; ab: Artboard; n: SceneNode; depth: number; parent: SceneNode | null })[] = [];
    const add = (ab: Artboard, list: SceneNode[], depth: number, parent: SceneNode | null = null) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const n = list[i];
        out.push({ kind: 'node', ab, n, depth, parent });
        if (isContainer(n) && !collapsed.has(n.id)) add(ab, n.children, depth + 1, n);
      }
    };
    for (const ab of s.project.artboards) {
      out.push({ kind: 'artboard', ab });
      if (!collapsed.has(ab.id)) add(ab, ab.children, 1);
    }
    return out;
  }, [s.project.artboards, collapsed]);
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

  const artboardRow = (ab: Artboard) => {
    const active = ab.id === s.activeArtboardId;
    const open = !collapsed.has(ab.id);
    return (
      <div
        key={`ab-${ab.id}`}
        className={`artboard-row${active && s.artboardSelected ? ' selected' : ''}${active ? ' active' : ''}`}
        onClick={() => store().set({ activeArtboardId: ab.id, artboardSelected: true, selection: [], activeTimelineId: active ? store().get().activeTimelineId : null })}
        onDragOver={(e) => {
          if (dragId && active) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragId) store().moveNode(dragId, null, Infinity);
          setDragId(null);
          setDrop(null);
        }}
      >
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
        <Icons.artboard width={14} height={14} />
        <span className="layer-name">{ab.name}</span>
        {s.project.settings.startArtboardId === ab.id && <span className="badge">start</span>}
      </div>
    );
  };

  const row = (ab: Artboard, n: SceneNode, depth: number, parent: SceneNode | null): JSX.Element => {
    // A Solo group or frame shows one child; the others are hidden even though their own Visible is on
    const soloOf = parent && isContainer(parent) ? (parent as { solo?: { active: string | null } }).solo : undefined;
    const soloHidden = !!soloOf && soloOf.active !== n.id;
    const shown = n.visible && !soloHidden;
    const selected = s.selection.includes(n.id) && ab.id === s.activeArtboardId;
    const container = isContainer(n);
    const open = container && !collapsed.has(n.id);
    const Icon = Icons[TYPE_ICON[n.type] ?? 'rect'];
    const dropClass = drop?.id === n.id ? ` drop-${drop.where}` : '';
    return (
      <div
        key={n.id}
        className={`layer-row${selected ? ' selected' : ''}${shown ? '' : ' hidden-layer'}${dropClass}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable={renaming !== n.id}
        onDragStart={(e) => {
          setDragId(n.id);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', n.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setDrop(null);
        }}
        onDragOver={(e) => {
          if (!dragId || ab.id !== s.activeArtboardId) return;
          e.preventDefault();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const f = (e.clientY - r.top) / r.height;
          setDrop({ id: n.id, where: container && f > 0.3 && f < 0.7 ? 'inside' : f < 0.5 ? 'before' : 'after' });
        }}
        onDrop={(e) => {
          e.preventDefault();
          doDrop(ab);
          setDrop(null);
          setDragId(null);
        }}
        onClick={(e) => {
          const st = store().get();
          let sel = ab.id === st.activeArtboardId ? st.selection : [];
          if (e.shiftKey || e.metaKey || e.ctrlKey) sel = sel.includes(n.id) ? sel.filter((x) => x !== n.id) : [...sel, n.id];
          else sel = [n.id];
          store().set({ activeArtboardId: ab.id, selection: sel, artboardSelected: false, activeTimelineId: ab.id === st.activeArtboardId ? st.activeTimelineId : null });
        }}
        onDoubleClick={() => setRenaming(n.id)}
      >
        {container ? (
          <button
            className="twisty"
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
            title={n.locked ? 'Unlock' : 'Lock'}
            className={n.locked ? 'on' : ''}
            onClick={(e) => {
              e.stopPropagation();
              store().select([n.id], { artboardId: ab.id });
              store().setProps([n.id], { locked: !n.locked });
            }}
          >
            {n.locked ? <Icons.lock width={13} /> : <Icons.unlock width={13} />}
          </button>
          <button
            title={soloHidden ? `Hidden by Solo on ${parent!.name}: show this one instead` : n.visible ? 'Hide' : 'Show'}
            className={!shown ? 'on' : ''}
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

  return (
    <div className="layers" ref={scroller}>
      <div style={{ height: first * ROW_H }} />
      {flat.slice(first, last).map((r) => (r.kind === 'artboard' ? artboardRow(r.ab) : row(r.ab, r.n, r.depth, r.parent)))}
      <div style={{ height: (flat.length - last) * ROW_H }} />
      <button className="link-btn add-artboard" onClick={() => store().addArtboard()}>
        + Add artboard
      </button>
      <button
        className="link-btn add-artboard"
        onClick={async () => {
          const files = await pickFiles(ANIMATION_ACCEPT, true);
          if (!files.length) return;
          const linking = await chooseLinking(files);
          if (!linking) return;
          for (const file of files) await importAnimationFile(file, linking);
        }}
      >
        + Import Lottie / Rive / PSD / AI / PDF / VectorCraft / PhotoCraft as artboard
      </button>
    </div>
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

function Assets() {
  const s = useEditor((st) => ({ project: st.project, activeArtboardId: st.activeArtboardId }));
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
  const isUsed = (id: string) => JSON.stringify(s.project.artboards).includes(`"${id}"`) || s.project.fonts.some((f) => f.assetId === id);
  const upload = async () => {
    const files = await pickFiles('image/*,.psd,.ai,.pdf,.dxf,.dwg,.vectorcraft,.drawcraft,.pcraft,video/*,audio/*,.woff,.woff2,.ttf,.otf,.json,.csv,.tsv,.txt');
    if (files.length) await insertFiles(files, null, null);
  };
  const removeIds = async (ids: string[]) => {
    store().update((d) => {
      d.assets = d.assets.filter((a) => !ids.includes(a.id));
      d.fonts = d.fonts.filter((f) => !f.assetId || !ids.includes(f.assetId));
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
  const setViewKeep = (v: 'grid' | 'list') => {
    setView(v);
    writeLocal(ASSET_VIEW_KEY, v);
  };
  return (
    <div className="assets">
      <button className="btn wide" onClick={upload}>
        <Icons.upload width={14} /> Upload files
      </button>
      <p className="hint">Images, video, audio, fonts and data files (JSON/CSV/TSV/text, used from the Data tab). Drop files on the canvas to place them.</p>
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
                  </div>
                </div>
                {actions}
              </div>
            );
          return (
            <div key={a.id} className={`asset-card${on ? ' checked' : ''}`} title={`${a.name} · ${kb(a.size)}`} onClick={(e) => toggle(a.id, e)}>
              <div className="asset-thumb" style={{ height: Math.round(size * 0.66), ...(kind === 'image' && url ? { backgroundImage: `url("${url}")` } : {}) }}>
                {kind !== 'image' && <span className="asset-kind">{kind}</span>}
                {box}
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
