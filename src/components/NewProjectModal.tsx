import { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '../lib/analytics';
import { duplicateProject, exampleThumbUrl, listExamples, listTemplates, setProjectMeta, templateThumbUrl, type ExampleInfo, type ProjectMeta } from '../lib/db';
import { DEFAULT_FONT, prefs } from '../lib/prefs';
import { STARTERS } from '../lib/template-starters';
import type { TemplateInfo } from '../lib/templates';
import { noteIfStale } from '../lib/stale-build';
import { HelpLink } from '../help/Help';
import { Icons } from './icons';
import { IconButton } from './ui';
import { makeFromPick, StarterPicture, type Pick } from './TemplatesTab';

export type NewChoice = 'blank' | 'copy' | 'builtin' | 'example';

type Item = { kind: 'project'; p: ProjectMeta } | { kind: 'saved'; t: TemplateInfo } | { kind: 'builtin'; s: (typeof STARTERS)[number] } | { kind: 'example'; e: ExampleInfo };

const CHOICES: { key: NewChoice; label: string; hint: string }[] = [
  { key: 'blank', label: 'Blank project', hint: 'One empty artboard' },
  { key: 'copy', label: 'Copy a project or template', hint: 'One of mine, or shared with me' },
  { key: 'builtin', label: 'Built-in template', hint: 'Starters that come with Interactives' },
  { key: 'example', label: 'Copy an example', hint: 'Finished projects to change' },
];

const keyOf = (it: Item) => (it.kind === 'project' ? `p:${it.p.id}` : it.kind === 'saved' ? `t:${it.t.id}` : it.kind === 'builtin' ? `b:${it.s.key}` : `e:${it.e.key}`);
const titleOf = (it: Item) => (it.kind === 'project' ? it.p.name : it.kind === 'saved' ? it.t.name : it.kind === 'builtin' ? it.s.name : it.e.title);
/** What the new project is called until the person types their own. */
const defaultName = (it: Item | null) => (!it ? 'Untitled project' : it.kind === 'project' ? `Copy of ${it.p.name}`.slice(0, 200) : titleOf(it));

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

const matches = (q: string, ...fields: (string | undefined | null | string[])[]) => !q || fields.some((f) => (Array.isArray(f) ? f.join(' ') : f ?? '').toLowerCase().includes(q));

/** Arrow keys inside a list of options: left and right step, up and down go to the nearest option on the row above or below (a plain step when there is no layout to measure). */
function nextOption(options: HTMLElement[], at: number, key: string): HTMLElement | null {
  if (!options.length) return null;
  if (key === 'Home') return options[0];
  if (key === 'End') return options[options.length - 1];
  if (at < 0) return options[0];
  if (key === 'ArrowRight') return options[Math.min(at + 1, options.length - 1)];
  if (key === 'ArrowLeft') return options[Math.max(at - 1, 0)];
  const cur = options[at].getBoundingClientRect();
  const dir = key === 'ArrowDown' ? 1 : -1;
  const below = options.map((o) => ({ o, r: o.getBoundingClientRect() })).filter(({ r }) => dir * (r.top - cur.top) > 4);
  if (!below.length) return cur.height === 0 ? options[Math.max(0, Math.min(options.length - 1, at + dir))] : null;
  const row = Math.min(...below.map(({ r }) => dir * (r.top - cur.top)));
  return below.filter(({ r }) => dir * (r.top - cur.top) - row < 4).sort((a, b) => Math.abs(a.r.left - cur.left) - Math.abs(b.r.left - cur.left))[0].o;
}

function Picture({ it }: { it: Item }) {
  if (it.kind === 'builtin') return <StarterPicture starter={it.s} />;
  if (it.kind === 'example') return <img className="thumb-board thumb-img" src={exampleThumbUrl(it.e.key)} alt="" loading="lazy" onError={(ev) => ((ev.target as HTMLImageElement).style.visibility = 'hidden')} />;
  if (it.kind === 'saved') {
    const t = it.t;
    return t.thumb ? <img className="thumb-board thumb-img" src={templateThumbUrl(t.id, t.thumb)} alt="" loading="lazy" /> : <span className="thumb-board" style={{ background: t.preview?.background ?? 'var(--panel-2)', aspectRatio: t.preview ? `${t.preview.width} / ${t.preview.height}` : '3 / 2' }} />;
  }
  const p = it.p;
  return p.thumb ? <img className="thumb-board thumb-img" src={`api/projects/${p.id}/thumbnail?v=${p.thumb}`} alt="" loading="lazy" /> : <span className="thumb-board" style={{ background: p.preview?.background ?? 'var(--panel-2)', aspectRatio: p.preview ? `${p.preview.width} / ${p.preview.height}` : '3 / 2' }} />;
}

function describe(it: Item, me: string | undefined): { meta: string; text: string } {
  if (it.kind === 'project') {
    const p = it.p;
    const who = p.owner && p.owner.username !== me ? ` · by ${p.owner.name ?? p.owner.username}` : '';
    return { meta: `Project · ${p.artboards} artboard${p.artboards === 1 ? '' : 's'} · ${new Date(p.updated).toLocaleDateString()}${who}`, text: '' };
  }
  if (it.kind === 'saved') {
    const t = it.t;
    return { meta: `${t.mine ? 'My template' : `Shared by ${t.owner?.name ?? t.owner?.username ?? 'someone'}`} · v${t.version} · ${t.checklist.length} to change`, text: t.description };
  }
  if (it.kind === 'builtin') return { meta: it.s.tags.join(' · '), text: it.s.description };
  return { meta: [it.e.group, ...it.e.tags].join(' · '), text: it.e.description };
}

/**
 * "Start a new project": blank, a copy of one of my projects or templates, a built-in starter or a copy of an example, on one
 * screen. Every choice goes through the same functions the Templates tab and the card buttons use.
 */
export function NewProjectModal({ projects, me, folder: initialFolder, folders, startWith = 'blank', onBlank, onMade, onClose }: { projects: ProjectMeta[]; me?: string; folder: string | null; folders: string[]; startWith?: NewChoice; onBlank: (name: string, folder: string | null) => Promise<string>; onMade: (id: string) => void; onClose: () => void }) {
  const [choice, setChoice] = useState<NewChoice>(startWith);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(initialFolder);
  const [name, setName] = useState('Untitled project');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<TemplateInfo[] | null>(null);
  const [examples, setExamples] = useState<ExampleInfo[] | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    listTemplates().then(
      (l) => live && setSaved(l),
      () => live && setSaved([]),
    );
    listExamples().then(
      (l) => live && setExamples(l),
      () => live && setExamples([]),
    );
    return () => {
      live = false;
    };
  }, []);

  // Everything on offer for the current choice, filtered by the search box, in groups
  const q = query.trim().toLowerCase();
  const groups = useMemo<{ label: string; items: Item[] }[]>(() => {
    if (choice === 'copy') {
      const mineT = (saved ?? []).filter((t) => t.mine);
      const sharedT = (saved ?? []).filter((t) => !t.mine);
      return [
        { label: 'My projects', items: projects.filter((p) => matches(q, p.name, p.tags, p.folder)).map((p) => ({ kind: 'project' as const, p })) },
        { label: 'My templates', items: mineT.filter((t) => matches(q, t.name, t.description)).map((t) => ({ kind: 'saved' as const, t })) },
        { label: 'Shared templates', items: sharedT.filter((t) => matches(q, t.name, t.description, t.owner?.name, t.owner?.username)).map((t) => ({ kind: 'saved' as const, t })) },
      ].filter((g) => g.items.length);
    }
    if (choice === 'builtin') {
      const items = STARTERS.filter((s) => matches(q, s.name, s.description, s.tags)).map((s) => ({ kind: 'builtin' as const, s }));
      return items.length ? [{ label: 'Built-in templates', items }] : [];
    }
    if (choice === 'example') {
      const out = new Map<string, Item[]>();
      for (const e of examples ?? []) if (matches(q, e.title, e.description, e.tags, e.group)) out.set(e.group, [...(out.get(e.group) ?? []), { kind: 'example', e }]);
      return [...out.entries()].map(([label, items]) => ({ label, items }));
    }
    return [];
  }, [choice, q, projects, saved, examples]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const picked = useMemo(() => flat.find((it) => keyOf(it) === sel) ?? null, [flat, sel]);
  const loading = (choice === 'copy' && saved === null) || (choice === 'example' && examples === null);

  // The name follows the pick until the person types their own
  const auto = useRef('Untitled project');
  const select = (it: Item | null) => {
    const next = defaultName(it);
    const prev = auto.current;
    auto.current = next;
    setSel(it ? keyOf(it) : null);
    setName((cur) => (cur === prev || !cur.trim() ? next : cur));
  };
  const pickChoice = (c: NewChoice) => {
    if (c === choice) return;
    setChoice(c);
    setQuery('');
    setError(null);
    select(null);
  };

  const go = async () => {
    if (busy || (choice !== 'blank' && !picked)) return;
    setBusy(true);
    setError(null);
    const nm = name.trim() || defaultName(picked);
    try {
      let id: string;
      if (choice === 'blank' || !picked) id = await onBlank(nm, folder);
      else if (picked.kind === 'project') {
        id = await duplicateProject(picked.p.id, nm);
        track('project', 'duplicate', { thing: 'new-project' });
        // The copy lands in the folder chosen here, not the one the original is in
        await setProjectMeta(id, { folder }).catch(() => undefined);
      } else {
        const pick: Pick = picked.kind === 'saved' ? { kind: 'saved', t: picked.t } : picked.kind === 'builtin' ? { kind: 'builtin', s: picked.s } : { kind: 'example', e: picked.e };
        id = await makeFromPick(pick, { name: nm, folder });
      }
      track('feature', 'new-project', { thing: choice === 'copy' ? (picked?.kind === 'project' ? 'copy-project' : 'copy-template') : choice });
      onMade(id);
    } catch (e) {
      if (!noteIfStale(e)) setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  // Modal behaviour: Esc closes, Tab stays inside, the editor's own shortcuts never see a key, focus goes back where it was
  const live = useRef({ go, onClose, busy });
  live.current = { go, onClose, busy };
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (!box.current) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        if (!live.current.busy) live.current.onClose();
      } else if (e.key === 'Tab') {
        e.stopPropagation();
        const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        const at = document.activeElement as HTMLElement | null;
        if (!at || !box.current.contains(at)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && at === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && at === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (before && document.contains(before)) before.focus();
    };
  }, []);

  const onTabKey = (e: React.KeyboardEvent) => {
    const keys = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = CHOICES.findIndex((c) => c.key === choice);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? CHOICES.length - 1 : (i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + CHOICES.length) % CHOICES.length;
    pickChoice(CHOICES[n].key);
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>(`#np-tab-${CHOICES[n].key}`)?.focus());
  };

  const onListKey = (e: React.KeyboardEvent) => {
    const options = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role=option]') ?? []);
    if (e.key === 'Enter' && (e.target as HTMLElement).getAttribute('role') === 'option') {
      e.preventDefault();
      //Enter on one that isn't picked yet picks it, Enter on the pick makes the project
      const el = e.target as HTMLElement;
      if (el.getAttribute('aria-selected') === 'true') void go();
      else {
        const it = flat.find((x) => keyOf(x) === el.dataset.key);
        if (it) select(it);
      }
      return;
    }
    if (![' ', 'ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    const at = options.indexOf(e.target as HTMLElement);
    if (at < 0) return;
    e.preventDefault();
    const target = e.key === ' ' ? options[at] : nextOption(options, at, e.key);
    if (!target) return;
    target.focus();
    const it = flat.find((x) => keyOf(x) === target.dataset.key);
    if (it) select(it);
  };

  //Down from the search box lands on the pick (or the first one)
  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown') return;
    const options = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role=option]') ?? []);
    const target = options.find((o) => o.tabIndex === 0) ?? options[0];
    if (!target) return;
    e.preventDefault();
    target.focus();
  };

  const folderChoices = useMemo(() => [...new Set([...folders, ...(initialFolder ? [initialFolder] : [])])].sort((a, b) => a.localeCompare(b)), [folders, initialFolder]);
  const items = picked?.kind === 'saved' ? picked.t.checklist.map((i) => i.text) : picked?.kind === 'builtin' ? picked.s.build().checklist.map((i) => i.text) : [];
  const detail = picked ? describe(picked, me) : null;
  const searchLabel = choice === 'copy' ? 'Search my projects and templates' : choice === 'builtin' ? 'Search the built-in templates' : 'Search the examples';
  const count = flat.length;
  const font = prefs().defaultFont.trim() || DEFAULT_FONT;
  // Tab stop of a listbox: the picked option, else the first
  const tabStop = picked ? keyOf(picked) : flat[0] ? keyOf(flat[0]) : null;

  return (
    <div className="modal-backdrop np-backdrop" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal np-modal" role="dialog" aria-modal="true" aria-labelledby="np-title" ref={box}>
        <header>
          <strong id="np-title">Start a new project</strong>
          <HelpLink topic="projects" anchor="making-and-opening-projects" />
          <div className="spacer" />
          <IconButton icon={<Icons.close />} title="Close (Esc)" onClick={() => !busy && onClose()} />
        </header>
        <div className="np-body">
          <div className="np-nav" role="tablist" aria-label="How to start" aria-orientation="vertical" onKeyDown={onTabKey}>
            {CHOICES.map((c) => (
              <button key={c.key} id={`np-tab-${c.key}`} role="tab" type="button" aria-selected={choice === c.key} aria-controls="np-panel" tabIndex={choice === c.key ? 0 : -1} className={`np-tab${choice === c.key ? ' on' : ''}`} onClick={() => pickChoice(c.key)}>
                <span className="np-tab-label">{c.label}</span>
                <span className="np-tab-hint">{c.hint}</span>
              </button>
            ))}
          </div>
          <div className="np-panel" id="np-panel" role="tabpanel" aria-labelledby={`np-tab-${choice}`} ref={panel}>
            {choice === 'blank' ? (
              <div className="np-blank">
                <h3>Blank project</h3>
                <p>An empty project with one artboard called Home. It starts with the Light, Dark and High contrast themes and your default font ({font}).</p>
                <p className="muted small">Name it below and press Create project. To start from something that already works, use one of the other choices on the left.</p>
              </div>
            ) : (
              <>
                <input type="search" className="np-search" value={query} aria-label={searchLabel} placeholder={searchLabel} title="Show only the ones whose name, description or tags contain this text" onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey} />
                <div className="sr-only" role="status">
                  {loading ? 'Loading' : `${count} ${count === 1 ? 'choice' : 'choices'}`}
                </div>
                <div className="np-scroll" onKeyDown={onListKey}>
                  {loading && <p className="muted">Loading…</p>}
                  {!loading && count === 0 && (
                    <div className="np-empty">
                      <p>{q ? 'Nothing matches.' : choice === 'copy' ? 'You have no projects or templates yet.' : 'Nothing here.'}</p>
                      {q && (
                        <button type="button" className="btn" onClick={() => setQuery('')}>
                          Clear search
                        </button>
                      )}
                    </div>
                  )}
                  {groups.map((g, gi) => (
                    <section key={g.label} role="group" aria-labelledby={`np-g${gi}`} className="np-group">
                      <h4 id={`np-g${gi}`}>
                        {g.label} <span className="tag-n">{g.items.length}</span>
                      </h4>
                      <div className={`np-options${choice === 'copy' ? ' as-rows' : ''}`} role="listbox" aria-label={g.label}>
                        {g.items.map((it) => {
                          const k = keyOf(it);
                          const d = describe(it, me);
                          return (
                            <div key={k} role="option" data-key={k} aria-selected={k === sel} tabIndex={k === tabStop ? 0 : -1} className={`np-opt${k === sel ? ' on' : ''}`} onClick={() => select(it)} onDoubleClick={() => void go()}>
                              <div className="np-thumb">
                                <Picture it={it} />
                              </div>
                              <div className="np-opt-text">
                                <div className="np-opt-name">{titleOf(it)}</div>
                                <div className="np-opt-meta">{d.meta}</div>
                                {choice !== 'copy' && d.text && <div className="np-opt-desc">{d.text}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
                <div className="np-detail" aria-live="polite">
                  {!picked ? (
                    <span className="muted small">Pick one, then name it and press Create project.</span>
                  ) : (
                    <>
                      {detail?.text && <p className="small">{detail.text}</p>}
                      {picked.kind === 'project' && <p className="small muted">A full copy of the project and its pictures. Yours stays as it is.</p>}
                      {picked.kind === 'example' && <p className="small muted">The example stays as it is for everyone. You get your own copy to change.</p>}
                      {items.length > 0 && <p className="small muted">A checklist of {items.length} thing{items.length === 1 ? '' : 's'} to change ({items.slice(0, 2).join('; ')}
                        {items.length > 2 ? '…' : ''}) opens with your new project.</p>}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <footer className="np-foot">
          <label className="field np-name">
            <span>Name of your new project</span>
            <input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && (e.preventDefault(), void go())} />
          </label>
          <label className="field np-folder">
            <span>Folder</span>
            <select value={folder ?? ''} onChange={(e) => setFolder(e.target.value || null)}>
              <option value="">No folder</option>
              {folderChoices.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <div className="np-buttons">
            <button type="button" className="btn primary" disabled={busy || (choice !== 'blank' && !picked)} onClick={() => void go()} title={choice !== 'blank' && !picked ? 'Pick something to start from first' : 'Make the project and open it'}>
              {busy ? 'Making your project…' : 'Create project'}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={onClose}>
              Cancel
            </button>
          </div>
          {error && (
            <p className="error np-error" role="alert">
              {error}
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}
