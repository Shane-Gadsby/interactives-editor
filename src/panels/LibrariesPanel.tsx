import { useCallback, useEffect, useState } from 'react';
import { type ColorStyle, type Project, type SceneNode, type TextStyleDef } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { locate } from '../store/doc';
import { confirmDialog, promptDialog } from '../components/dialogs';
import { CheckField, PaletteButton, Row, Section, TextField } from '../components/ui';
import { getOwnLibrary, listLibraries, markBrandKit, publishLibrary, session, shareLibrary, unpublishLibrary } from '../lib/db';
import { offBrand, type OffBrandReport } from '../lib/brand';
import {
  addColorStyle,
  addTextStyle,
  applyColorStyle,
  applyTextStyle,
  changedComponents,
  deleteStyle,
  isBrandKit,
  editStyle,
  linkedArtboards,
  type LibraryInfo,
} from '../lib/libraries';
import { COMPONENT_DRAG, addLibraryToProject, applyUpdates, detach, dropLibrary, known, reviewUpdates, startWithKit, syncBrandFlag, useComponent, waitSaved, type UpdateReview } from '../lib/library-actions';

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function LibrariesPanel() {
  const s = useEditor((st) => ({ project: st.project, activeArtboardId: st.activeArtboardId }));
  const project = s.project;
  const [libs, setLibs] = useState<LibraryInfo[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const refresh = useCallback(async () => {
    try {
      const list = await listLibraries();
      for (const l of list) known.set(l.id, l);
      setLibs(list);
      setError('');
    } catch (err) {
      setError(errText(err));
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  // A library that became a brand kit (or stopped) since this project took it: lock or unlock its copies
  useEffect(() => {
    for (const l of libs ?? []) {
      const use = project.libraries?.find((u) => u.id === l.id);
      if (use && !!use.brand !== !!l.brand) void syncBrandFlag(l).catch(() => undefined);
    }
  }, [libs, project.libraries]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (err) {
      store().toast(errText(err), 'error');
    } finally {
      setBusy('');
    }
  };

  const usedIds = new Set([...(project.libraries ?? []).map((l) => l.id), ...linkedArtboards(project).map((a) => a.library!.libraryId)]);
  const used = [...usedIds].map((id) => ({ id, info: libs?.find((l) => l.id === id), use: project.libraries?.find((l) => l.id === id) }));
  const available = (libs ?? []).filter((l) => !usedIds.has(l.id) && l.id !== project.id);

  return (
    <div className="libraries-panel">
      <div className="lib-head">
        <span className="muted">Share components, styles and assets between projects.</span>
        <button className="btn small-btn" onClick={() => void refresh()} title="Look for libraries and new versions again">
          Refresh
        </button>
      </div>
      {error && <p className="hint lib-error">{error}</p>}
      {busy && <p className="hint">{busy}…</p>}

      <PublishSection project={project} onChanged={() => void refresh()} />

      <Section id="libraries-used" help="libraries" title={`Libraries in this project${used.length ? ` (${used.length})` : ''}`}>
        {!used.length && <p className="hint">None yet. Add one from the list below, then drag its components onto the canvas.</p>}
        {used.map(({ id, info, use }) => (
          <UsedLibrary key={id} id={id} name={info?.name ?? use?.name ?? 'Library'} info={info} project={project} activeArtboardId={s.activeArtboardId} run={run} onChanged={() => void refresh()} />
        ))}
      </Section>

      <Section id="libraries-available" help="libraries" title={`Available libraries${available.length ? ` (${available.length})` : ''}`}>
        {libs && !available.length && <p className="hint">{libs.length ? 'You are using every library you can see.' : 'No libraries yet. Mark a project as a library and publish it, and it shows up here for you and anyone you share it with.'}</p>}
        {available.map((l) => (
          <div key={l.id} className="lib-row">
            <div className="lib-row-text">
              <strong>
                {l.name} {l.brand && <span className="badge" title="A brand kit: what you take from it is locked, apart from the text it marks as yours to change">Brand kit</span>}
              </strong>
              <span className="muted">
                v{l.version} · {l.components.length} component{l.components.length === 1 ? '' : 's'}
                {l.owner?.name || l.owner?.username ? ` · ${l.owner.name || l.owner.username}` : ''}
              </span>
            </div>
            {l.brand && (
              <button
                className="btn small-btn"
                disabled={!!busy}
                title="Add the kit and place its header, footer and logo (whatever the kit marks for new projects) in the artboard you have open"
                onClick={() =>
                  void run('Adding the brand kit', async () => {
                    const open = project.artboards.find((a) => a.id === s.activeArtboardId);
                    const n = await startWithKit(l, open && !open.library ? open.id : undefined);
                    store().toast(n ? `Added the brand kit and placed ${n} item${n === 1 ? '' : 's'}` : 'Added the brand kit. It has nothing marked for new projects, so drag its components in');
                  })
                }
              >
                Add with starter items
              </button>
            )}
            <button className="btn small-btn" disabled={!!busy} onClick={() => void run('Adding the library', () => addLibraryToProject(l))}>
              Add
            </button>
          </div>
        ))}
      </Section>

      <BrandCheck project={project} />

      <StylesSection project={project} />
    </div>
  );
}

// ---------------------------------------------------------------- publishing

function PublishSection({ project, onChanged }: { project: Project; onChanged: () => void }) {
  const isLibrary = !!project.settings.library;
  const marked = project.artboards.filter((a) => a.publish).length;
  const [own, setOwn] = useState<LibraryInfo | null>(null);
  const [note, setNote] = useState('');
  const [users, setUsers] = useState('');
  const [everyone, setEveryone] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const l = await getOwnLibrary(project.id);
      setOwn(l);
      setEveryone(!!l?.shared?.everyone);
      setUsers((l?.shared?.users ?? []).join(', '));
    } catch {
      setOwn(null);
    }
  }, [project.id]);
  useEffect(() => {
    if (isLibrary) void load();
  }, [isLibrary, load]);
  // Whether this person looks after brand kits (the server decides; it checks again on the request)
  const [canBrand, setCanBrand] = useState(false);
  useEffect(() => {
    session()
      .then((who) => setCanBrand(!!(who.brand || who.power)))
      .catch(() => setCanBrand(false));
  }, []);

  if (!isLibrary) {
    return (
      <Section help="libraries" title="Publish this project">
        <p className="hint">Make this project a library to share its artboards, styles and assets as components other projects can use.</p>
        <button className="btn" onClick={() => store().update((d) => void ((d as Project).settings.library = true))}>
          Make this project a library
        </button>
      </Section>
    );
  }

  const publish = async () => {
    setBusy(true);
    try {
      if (!(await waitSaved())) throw new Error('The project could not be saved first, so it was not published');
      const r = await publishLibrary(project.id, note);
      store().toast(r.unchanged ? `Nothing changed since v${r.version}, so there is no new version` : `Published v${r.version} (${r.components} component${r.components === 1 ? '' : 's'})`);
      setNote('');
      await load();
      onChanged();
    } catch (err) {
      store().toast(errText(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  const saveShare = async () => {
    setBusy(true);
    try {
      const r = await shareLibrary(project.id, { everyone, users: users.split(/[\s,;]+/).filter(Boolean) });
      setEveryone(r.shared.everyone);
      setUsers(r.shared.users.join(', '));
      store().toast('Sharing saved');
      onChanged();
    } catch (err) {
      store().toast(errText(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  const stop = async () => {
    if (!(await confirmDialog({ title: 'Stop publishing', message: 'Projects that already use components keep their copies, but they will not see updates any more.', confirmLabel: 'Stop publishing', danger: true }))) return;
    try {
      await unpublishLibrary(project.id);
      setOwn(null);
      onChanged();
    } catch (err) {
      store().toast(errText(err), 'error');
    }
  };

  return (
    <Section help="libraries" title="Publish this project">
      <p className="hint">
        {own ? (
          <>
            Published as <strong>v{own.version}</strong> with {own.components.length} component{own.components.length === 1 ? '' : 's'}.
          </>
        ) : (
          'Not published yet.'
        )}{' '}
        {marked ? `${marked} artboard${marked === 1 ? ' is' : 's are'} marked "Publish to library".` : 'Mark artboards "Publish to library" in the artboard inspector to make them components.'}
      </p>
      <TextField label="Note" value={note} placeholder="What changed (optional)" onChange={setNote} />
      <Row>
        <button className="btn primary" disabled={busy || !marked || (!!own?.brand && !canBrand)} title={own?.brand && !canBrand ? 'This library is a brand kit, so only the people who look after brand kits can publish it' : undefined} onClick={() => void publish()}>
          {own ? 'Publish new version' : 'Publish'}
        </button>
        <button className="btn" onClick={() => store().update((d) => void ((d as Project).settings.library = false))} title="Stops this project being a library. A published version stays until you stop publishing">
          Not a library
        </button>
      </Row>
      {own && (canBrand || own.brand) && (
        <CheckField
          label="This is a brand kit"
          title="Projects that use this library get its items locked: they can't be edited or detached, apart from text you mark as editable. Colours, text styles and fonts become the kit's palette for the off-brand check. Only the people who look after brand kits can turn this on"
          value={!!own.brand}
          onChange={(v) => {
            if (!canBrand) return;
            setBusy(true);
            markBrandKit(project.id, v)
              .then(async () => {
                store().toast(v ? 'Marked as a brand kit. Projects pick up the lock the next time they open the Libraries tab' : 'No longer a brand kit');
                await load();
                onChanged();
              })
              .catch((err) => store().toast(errText(err), 'error'))
              .finally(() => setBusy(false));
          }}
        />
      )}
      {own && (
        <>
          <CheckField label="Everyone can use it" title="Anyone with a session on this server can add the library" value={everyone} onChange={setEveryone} />
          <TextField label="Share with" value={users} placeholder="usernames, separated by commas" commitOnBlur onChange={setUsers} />
          <Row>
            <button className="btn" disabled={busy} onClick={() => void saveShare()}>
              Save sharing
            </button>
            <button className="btn danger" onClick={() => void stop()}>
              Stop publishing
            </button>
          </Row>
          {own.history.length > 0 && (
            <div className="lib-history">
              {own.history.slice(0, 5).map((h) => (
                <div key={h.version} className="muted">
                  v{h.version} · {new Date(h.created).toLocaleString()}
                  {h.note ? ` · ${h.note}` : ''}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- the off-brand check

/** Colours and fonts this project uses that its brand kits don't have. Informational: it lists, it never blocks. */
function BrandCheck({ project }: { project: Project }) {
  const kits = (project.libraries ?? []).filter((l) => l.brand);
  const [report, setReport] = useState<OffBrandReport | null>(null);
  if (!kits.length) return null;
  const clean = report && !report.colors.length && !report.fonts.length;
  return (
    <Section help="brand-kits" title="Brand check">
      <p className="hint">Lists the colours and fonts in your own artboards that {kits.map((k) => k.name).join(', ')} {kits.length === 1 ? "doesn't" : "don't"} have. It is only a list: nothing is blocked.</p>
      <Row>
        <button className="btn small-btn" onClick={() => setReport(offBrand(project))}>
          {report ? 'Check again' : 'Check against the brand kit'}
        </button>
      </Row>
      {clean && <p className="hint">Everything you use is in the brand kit.</p>}
      {report && report.colors.length > 0 && (
        <div className="brand-check-list">
          <strong>Colours not in the kit</strong>
          {report.colors.map((c) => (
            <div key={c.value} className="style-row">
              <span className="lib-swatch" style={{ background: c.value }} />
              <span className="style-name">{c.value}</span>
              <span className="muted">
                {c.uses} use{c.uses === 1 ? '' : 's'} · {c.where.join(', ')}
              </span>
            </div>
          ))}
        </div>
      )}
      {report && report.fonts.length > 0 && (
        <div className="brand-check-list">
          <strong>Fonts not in the kit</strong>
          {report.fonts.map((f) => (
            <div key={f.value} className="style-row">
              <span className="style-name" style={{ fontFamily: f.value }}>
                {f.value}
              </span>
              <span className="muted">
                {f.uses} use{f.uses === 1 ? '' : 's'} · {f.where.join(', ')}
              </span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- a library in use

function UsedLibrary({
  id,
  name,
  info,
  project,
  activeArtboardId,
  run,
  onChanged,
}: {
  id: string;
  name: string;
  info?: LibraryInfo;
  project: Project;
  activeArtboardId: string;
  run: (label: string, fn: () => Promise<void>) => Promise<void>;
  onChanged: () => void;
}) {
  // Open: right after Add the person wants to drag a component, and the components are what this row is for
  const [open, setOpen] = useState(true);
  const [review, setReview] = useState<{ components: UpdateReview[]; styles: string[] } | null>(null);
  const updates = info ? changedComponents(project, id, info.components) : [];
  const styleChanges = info ? reviewStyleCount(project, info) : 0;
  const pending = updates.length + styleChanges;
  const copies = linkedArtboards(project, id).filter((a) => !a.library!.internal);
  const brand = isBrandKit(project, id);
  const override = useEditor((st) => st.brandOverride);

  const doReview = () =>
    run('Comparing with the library', async () => {
      setReview(await reviewUpdates(info!));
    });
  const update = (ids?: string[]) =>
    run('Updating', async () => {
      const n = await applyUpdates(info!, ids);
      store().toast(n ? `Updated ${n} component${n === 1 ? '' : 's'}` : 'Styles updated');
      setReview(null);
      onChanged();
    });

  return (
    <div className="lib-used">
      <div className="lib-row">
        <button className="twisty" onClick={() => setOpen(!open)} title={open ? 'Hide components' : 'Show components'}>
          {open ? '▾' : '▸'}
        </button>
        <div className="lib-row-text">
          <strong>
            {name} {brand && <span className="badge" title="A brand kit: its items are locked in this project">Brand kit</span>}
          </strong>
          <span className="muted">
            {info ? `v${info.version}` : 'not available to you'} · {copies.length} in use
          </span>
        </div>
        {pending > 0 && (
          <button className="badge lib-updates" onClick={() => void doReview()} title="Review what changed">
            Updates available
          </button>
        )}
      </div>

      {review && info && (
        <div className="lib-review">
          {review.components.map((u) => (
            <div key={u.componentId} className="lib-review-item">
              <div className="lib-review-head">
                <strong>{u.name}</strong>
                {u.status === 'removed' ? <span className="badge">removed from the library</span> : <span className="muted">v{u.fromVersion} to v{info.version}</span>}
              </div>
              {u.status === 'removed' ? (
                <div className="muted">The library no longer has it. Your copy stays; detach it to keep editing it, or delete it.</div>
              ) : (
                <>
                  <ul>
                    {(u.changes.length ? u.changes : ['Changed']).map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                  <button className="btn small-btn" onClick={() => void update([u.componentId])}>
                    Update this one
                  </button>
                </>
              )}
            </div>
          ))}
          {review.styles.length > 0 && (
            <div className="lib-review-item">
              <strong>Styles</strong>
              <ul>
                {review.styles.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          <Row>
            <button className="btn primary" onClick={() => void update()}>
              Update all
            </button>
            <button className="btn" onClick={() => setReview(null)}>
              Close
            </button>
          </Row>
          <p className="hint">Instances you placed, their inputs and your variables are kept.</p>
        </div>
      )}

      {open && (
        <div className="lib-body">
          {info?.components.length ? (
            <div className="lib-grid">
              {info.components.map((c) => {
                const copy = copies.find((a) => a.library!.componentId === c.id);
                return (
                  <div
                    key={c.id}
                    className="lib-card"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(COMPONENT_DRAG, JSON.stringify({ libraryId: id, componentId: c.id }));
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    title="Drag onto the canvas to place it"
                  >
                    <div className="lib-thumb" style={{ aspectRatio: `${c.width} / ${c.height}` }} />
                    <div className="lib-card-name">{c.name}</div>
                    <div className="muted">
                      {c.width} × {c.height}
                      {copy ? ' · in project' : ''}
                    </div>
                    <div className="lib-card-actions">
                      <button className="btn small-btn" onClick={() => void run('Placing', async () => void (await useComponent(info, c.id, { artboardId: activeArtboardId })))}>
                        Place
                      </button>
                      {!copy && (
                        <button className="btn small-btn" onClick={() => void run('Adding', async () => void (await useComponent(info, c.id)))} title="Copy the artboard in without placing an instance">
                          Add artboard
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            info && <p className="hint">This library has no components.</p>
          )}
          {info && (info.styles.colors.length > 0 || info.styles.texts.length > 0) && (
            <div className="lib-styles-line">
              {info.styles.colors.map((c) => (
                <span key={c.id} className="lib-swatch" style={{ background: c.color }} title={`${c.name} ${c.color}`} />
              ))}
              {info.styles.texts.length > 0 && <span className="muted">{info.styles.texts.length} text style{info.styles.texts.length === 1 ? '' : 's'}</span>}
            </div>
          )}
          {copies.length > 0 && (
            <div className="lib-copies">
              {copies.map((a) => (
                <Row key={a.id} className="lib-copy">
                  <button className="link-btn" onClick={() => store().set({ activeArtboardId: a.id, artboardSelected: true, selection: [] })}>
                    {a.name}
                  </button>
                  <span className="muted">v{a.library!.version}</span>
                  <button
                    className="btn small-btn"
                    disabled={a.library!.brand && !override}
                    title={a.library!.brand && !override ? 'Part of a brand kit, so it stays linked and locked' : 'Make a copy you can edit. It stops getting updates'}
                    onClick={async () => {
                      if (await confirmDialog({ title: 'Detach', message: `“${a.name}” becomes a normal artboard you can edit. It will not get library updates any more.`, confirmLabel: 'Detach' })) detach(a.id);
                    }}
                  >
                    Detach
                  </button>
                </Row>
              ))}
            </div>
          )}
          <button
            className="btn small-btn danger"
            disabled={brand && !override}
            title={brand && !override ? 'A brand kit stays in the project' : undefined}
            onClick={async () => {
              if (await confirmDialog({ title: 'Stop using this library', message: 'Its artboards in this project become normal artboards you can edit, and its styles become your own.', confirmLabel: 'Stop using', danger: true })) dropLibrary(id);
            }}
          >
            Stop using this library
          </button>
        </div>
      )}
    </div>
  );
}

/** How many styles differ from what the library has now (shown as part of "Updates available"). */
function reviewStyleCount(project: Project, info: LibraryInfo): number {
  const mine = project.styles;
  const colors = (mine?.colors ?? []).filter((s) => s.library?.libraryId === info.id);
  const texts = (mine?.texts ?? []).filter((s) => s.library?.libraryId === info.id);
  let n = 0;
  for (const c of info.styles.colors) {
    const had = colors.find((x) => x.library!.styleId === c.id);
    if (!had || had.color !== c.color || had.name !== c.name) n++;
  }
  for (const t of info.styles.texts) {
    const had = texts.find((x) => x.library!.styleId === t.id);
    if (!had || had.fontFamily !== t.fontFamily || had.fontSize !== t.fontSize || had.fontWeight !== t.fontWeight || had.color !== t.color || had.lineHeight !== t.lineHeight || had.letterSpacing !== t.letterSpacing) n++;
  }
  n += colors.filter((c) => !info.styles.colors.some((x) => x.id === c.library!.styleId)).length;
  n += texts.filter((t) => !info.styles.texts.some((x) => x.id === t.library!.styleId)).length;
  return n;
}

// ---------------------------------------------------------------- styles

function StylesSection({ project }: { project: Project }) {
  const colors = project.styles?.colors ?? [];
  const texts = project.styles?.texts ?? [];
  const libName = (libraryId?: string) => project.libraries?.find((l) => l.id === libraryId)?.name ?? 'library';

  /** The selected layers, in the active artboard, from a recipe's own draft. */
  const onSelection = (fn: (n: SceneNode) => boolean) => {
    const st = store();
    const { selection, activeArtboardId } = st.get();
    if (!selection.length) {
      st.toast('Select a layer first', 'error');
      return;
    }
    let touched = 0;
    st.update((d) => {
      const ab = (d as Project).artboards.find((a) => a.id === activeArtboardId);
      if (!ab) return;
      for (const id of selection) {
        const n = locate(ab, id)?.node;
        if (n && fn(n as SceneNode)) touched++;
      }
    });
    if (!touched && !st.get().toast) st.toast('That style does not fit the selected layer', 'error');
  };

  const newColor = async () => {
    const sel = store().selectedNodes()[0] as (SceneNode & { fill?: { type: string; color?: string } | null }) | undefined;
    const from = sel?.fill?.type === 'solid' ? sel.fill.color : undefined;
    const name = await promptDialog({ title: 'New colour style', label: 'Name', initial: 'Colour', confirmLabel: 'Create' });
    if (!name?.trim()) return;
    // Made from a layer's fill, the style is that layer's fill from now on, so editing the colour changes it (and anything else you apply it to)
    const sourceId = from ? sel?.id : undefined;
    const { activeArtboardId } = store().get();
    store().update((d) => {
      const style = addColorStyle(d as Project, name.trim(), from ?? '#4d7cff');
      if (!sourceId) return;
      const ab = (d as Project).artboards.find((a) => a.id === activeArtboardId);
      const n = ab && locate(ab, sourceId)?.node;
      if (n) applyColorStyle(n as SceneNode, 'fill', style);
    });
  };
  const newText = async () => {
    const sel = store().selectedNodes()[0] as (SceneNode & Partial<TextStyleDef> & { color?: string }) | undefined;
    if (!sel || sel.fontFamily === undefined) {
      store().toast('Select a text layer to take the style from', 'error');
      return;
    }
    const name = await promptDialog({ title: 'New text style', label: 'Name', initial: 'Text', confirmLabel: 'Create' });
    if (!name?.trim()) return;
    store().update((d) => void addTextStyle(d as Project, name.trim(), { fontFamily: sel.fontFamily!, fontSize: sel.fontSize ?? 16, fontWeight: sel.fontWeight ?? 400, fontStyle: sel.fontStyle ?? 'normal', lineHeight: sel.lineHeight ?? 1.3, letterSpacing: sel.letterSpacing ?? 0, color: sel.color }));
  };
  const rename = async (id: string, current: string) => {
    const name = await promptDialog({ title: 'Rename style', label: 'Name', initial: current, confirmLabel: 'Rename' });
    if (name?.trim()) store().update((d) => void editStyle(d as Project, id, { name: name.trim() }));
  };

  return (
    <Section help="libraries" title="Styles" actions={<StyleAdd onColor={() => void newColor()} onText={() => void newText()} />}>
      {!colors.length && !texts.length && <p className="hint">Named colours and text styles. Layers that follow a style change with it, and a library's styles update with the library.</p>}
      {colors.map((c: ColorStyle) => (
        <div key={c.id} className="style-row">
          {c.library ? (
            <span className="lib-swatch" style={{ background: c.color }} />
          ) : (
            <>
              <input type="color" className="style-color" value={/^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#000000'} onChange={(e) => store().update((d) => void editStyle(d as Project, c.id, { color: e.target.value }), { coalesce: `style-${c.id}` })} />
              <PaletteButton value={c.color} onPick={(v) => store().update((d) => void editStyle(d as Project, c.id, { color: v }))} />
            </>
          )}
          <span className="style-name" onDoubleClick={() => !c.library && void rename(c.id, c.name)} title={c.library ? `From ${libName(c.library.libraryId)}` : 'Double-click to rename'}>
            {c.name}
          </span>
          {c.library && <span className="badge">{libName(c.library.libraryId)}</span>}
          <button className="btn small-btn" title="Use as the selected layers' fill" onClick={() => onSelection((n) => applyColorStyle(n, 'fill', c))}>
            Fill
          </button>
          <button className="btn small-btn" title="Use as the selected layers' stroke colour" onClick={() => onSelection((n) => applyColorStyle(n, 'stroke', c))}>
            Stroke
          </button>
          <button className="btn small-btn" title="Use as the selected text layers' colour" onClick={() => onSelection((n) => applyColorStyle(n, 'color', c))}>
            Text
          </button>
          {!c.library && (
            <button className="btn small-btn" title="Delete the style. Layers keep their current look" onClick={() => store().update((d) => void deleteStyle(d as Project, c.id))}>
              ×
            </button>
          )}
        </div>
      ))}
      {texts.map((t: TextStyleDef) => (
        <div key={t.id} className="style-row">
          <span className="style-sample" style={{ fontFamily: t.fontFamily, fontWeight: t.fontWeight, fontStyle: t.fontStyle }}>
            Aa
          </span>
          <span className="style-name" onDoubleClick={() => !t.library && void rename(t.id, t.name)} title={`${t.fontFamily} ${t.fontSize}px ${t.fontWeight}${t.library ? ` · from ${libName(t.library.libraryId)}` : ''}`}>
            {t.name}
          </span>
          {t.library && <span className="badge">{libName(t.library.libraryId)}</span>}
          <button className="btn small-btn" onClick={() => onSelection((n) => applyTextStyle(n, t))}>
            Apply
          </button>
          {!t.library && (
            <button className="btn small-btn" title="Delete the style. Layers keep their current look" onClick={() => store().update((d) => void deleteStyle(d as Project, t.id))}>
              ×
            </button>
          )}
        </div>
      ))}
    </Section>
  );
}

function StyleAdd({ onColor, onText }: { onColor: () => void; onText: () => void }) {
  return (
    <>
      <button className="btn small-btn" title="New colour style (from the selected layer's fill)" onClick={onColor}>
        + Colour
      </button>
      <button className="btn small-btn" title="New text style (from the selected text layer)" onClick={onText}>
        + Text
      </button>
    </>
  );
}
