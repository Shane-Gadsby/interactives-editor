import { useState } from 'react';
import { createNode, isContainer, nodeTypeLabel, type Artboard, type SceneNode } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { Icons, type IconName } from '../components/icons';
import { IconButton } from '../components/ui';
import { assetKind, assetUrls } from '../lib/assets';
import { insertFiles, pickFiles } from '../lib/insert';
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
};

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

  const row = (ab: Artboard, n: SceneNode, depth: number): JSX.Element[] => {
    const selected = s.selection.includes(n.id) && ab.id === s.activeArtboardId;
    const container = isContainer(n);
    const open = container && !collapsed.has(n.id);
    const Icon = Icons[TYPE_ICON[n.type] ?? 'rect'];
    const dropClass = drop?.id === n.id ? ` drop-${drop.where}` : '';
    const out = [
      <div
        key={n.id}
        className={`layer-row${selected ? ' selected' : ''}${n.visible ? '' : ' hidden-layer'}${dropClass}`}
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
          store().set({ activeArtboardId: ab.id, selection: sel, artboardSelected: false, activeTimelineId: ab.id === st.activeArtboardId ? st.activeTimelineId : ab.timelines[0]?.id ?? null });
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
            title={n.visible ? 'Hide' : 'Show'}
            className={!n.visible ? 'on' : ''}
            onClick={(e) => {
              e.stopPropagation();
              store().set({ activeArtboardId: ab.id });
              store().setProps([n.id], { visible: !n.visible });
            }}
          >
            {n.visible ? <Icons.eye width={13} /> : <Icons.eyeOff width={13} />}
          </button>
        </span>
      </div>,
    ];
    if (open) for (const c of [...(n as { children: SceneNode[] }).children].reverse()) out.push(...row(ab, c, depth + 1));
    return out;
  };

  return (
    <div className="layers">
      {s.project.artboards.map((ab) => {
        const active = ab.id === s.activeArtboardId;
        const open = !collapsed.has(ab.id);
        return (
          <div key={ab.id} className="layer-group">
            <div
              className={`artboard-row${active && s.artboardSelected ? ' selected' : ''}${active ? ' active' : ''}`}
              onClick={() => store().set({ activeArtboardId: ab.id, artboardSelected: true, selection: [], activeTimelineId: active ? store().get().activeTimelineId : ab.timelines[0]?.id ?? null })}
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
            {open && [...ab.children].reverse().flatMap((n) => row(ab, n, 1))}
          </div>
        );
      })}
      <button className="link-btn add-artboard" onClick={() => store().addArtboard()}>
        + Add artboard
      </button>
    </div>
  );
}

function Assets() {
  const s = useEditor((st) => ({ project: st.project, activeArtboardId: st.activeArtboardId }));
  const ab = getArtboard(s.project, s.activeArtboardId);
  const center = ab ? { x: ab.width / 2, y: ab.height / 2 } : null;
  const upload = async () => {
    const files = await pickFiles('image/*,video/*,audio/*,.woff,.woff2,.ttf,.otf,.json,.csv,.tsv,.txt');
    if (files.length) await insertFiles(files, null, null);
  };
  const remove = async (id: string) => {
    const used = JSON.stringify(s.project.artboards).includes(`"${id}"`) || s.project.fonts.some((f) => f.assetId === id);
    if (used && !confirm('This asset is used in the project. Remove it anyway?')) return;
    store().update((d) => {
      d.assets = d.assets.filter((a) => a.id !== id);
      d.fonts = d.fonts.filter((f) => f.assetId !== id);
    });
    try {
      await deleteAsset(s.project.id, id);
    } catch {
      /* already gone */
    }
  };
  return (
    <div className="assets">
      <button className="btn wide" onClick={upload}>
        <Icons.upload width={14} /> Upload files
      </button>
      <p className="hint">Images, video, audio, fonts and data files (JSON/CSV/TSV/text, used from the Data tab). Drop files on the canvas to place them.</p>
      <div className="asset-grid">
        {s.project.assets.map((a) => {
          const kind = assetKind(a.mime, a.name);
          const url = assetUrls.resolve(a.id);
          return (
            <div key={a.id} className="asset-card" title={`${a.name} · ${(a.size / 1024).toFixed(0)} KB`}>
              <div className="asset-thumb" style={kind === 'image' && url ? { backgroundImage: `url("${url}")` } : undefined}>
                {kind !== 'image' && <span className="asset-kind">{kind}</span>}
              </div>
              <div className="asset-name">{a.name}</div>
              <div className="asset-actions">
                {(kind === 'image' || kind === 'video') && ab && center && (
                  <button
                    className="link-btn"
                    onClick={() => {
                      store().addNodes(
                        [createNode(kind === 'image' ? 'image' : 'video', { name: a.name.replace(/\.[^.]+$/, ''), assetId: a.id, x: center.x - 150, y: center.y - 100, width: 300, height: 200 })],
                        { artboardId: ab.id },
                      );
                    }}
                  >
                    Place
                  </button>
                )}
                <IconButton icon={<Icons.trash width={13} />} title="Remove asset" onClick={() => remove(a.id)} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
