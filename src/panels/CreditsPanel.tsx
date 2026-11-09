import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { ATTRIBUTION_KINDS, ATTRIBUTION_KIND_LABELS, DEFAULT_CREDITS_HEADING, LICENCE_SUGGESTIONS, attributionLink, citationParts, formatCitation, isCitable, unattributedAssets, type Attribution, type AttributionKind, type Project } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { CheckField, IconButton, SelectField, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { track } from '../lib/analytics';
import { addAttribution, addForUncovered, linkAsset, moveAttribution, removeAttribution, setAttribution, focusEntryNext, peekFocusEntry, setCredits, subscribeFocusEntry, unlinkAsset } from '../lib/attributions';
import { SectionBlurb } from '../components/SectionBlurb';

const edit = (recipe: (p: Project) => void, coalesce?: string) => store().update((d) => recipe(d as Project), coalesce ? { coalesce } : {});

const KIND_OPTIONS = ATTRIBUTION_KINDS.map((k) => ({ value: k, label: ATTRIBUTION_KIND_LABELS[k] }));

/** The credits settings: whether learners get a Credits button and whether exported pages carry the list. Used here and in the project settings. */
export function CreditsSettingsFields() {
  const credits = useEditor((s) => s.project.settings.credits);
  const anyCitable = useEditor((s) => !!s.project.attributions?.some(isCitable));
  const button = !!credits?.button;
  return (
    <>
      <CheckField
        label="Show a Credits button to learners"
        title="Adds a small Credits button in the corner of the player. It opens the list below as readable citations, with links that open in a new tab. Your notes are never shown"
        value={button}
        onChange={(v) => (track('feature', 'credits-button', { thing: v ? 'on' : 'off' }), edit((p) => (setCredits(p, { button: v }), void 0)))}
      />
      <CheckField
        label="Keep the list in exported and shared pages"
        title={button ? 'The Credits button needs the list, so it always goes with the page while the button is on' : 'Pages you download or share carry the list (without your notes), for anyone who reads the page data. Off: the list stays in the editor, in the project file and in templates'}
        value={button || !!credits?.inExports}
        onChange={(v) => !button && edit((p) => (setCredits(p, { inExports: v }), void 0))}
      />
      {button && (
        <TextField
          label="Credits heading"
          title="The title of the list learners see"
          value={credits?.heading ?? ''}
          placeholder={DEFAULT_CREDITS_HEADING}
          onChange={(v) => edit((p) => (setCredits(p, { heading: v.trim() ? v : undefined }), void 0), 'credits-heading')}
        />
      )}
      {button && !anyCitable && <p className="hint">No entry has a title, a creator or a link yet, so learners get no Credits button until one does.</p>}
    </>
  );
}

function LicenceSuggest({ onPick }: { onPick: (v: string) => void }) {
  return <SelectField label="Suggestions" title="Common licences. The licence field takes any text" value="" options={[{ value: '', label: 'Pick…' }, ...LICENCE_SUGGESTIONS.map((l) => ({ value: l, label: l }))]} onChange={(v) => v && onPick(v)} />;
}

function EntryCard({ entry, index, count, project, focus }: { entry: Attribution; index: number; count: number; project: Project; focus: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = entry.id;
  const set = (patch: Parameters<typeof setAttribution>[2], coalesce?: string) => edit((p) => setAttribution(p, id, patch), coalesce ? `attr-${id}-${coalesce}` : undefined);
  const linked = (entry.assetIds ?? []).map((a) => project.assets.find((x) => x.id === a)).filter((a): a is NonNullable<typeof a> => !!a);
  const free = project.assets.filter((a) => !entry.assetIds?.includes(a.id));
  const parts = citationParts(entry);
  const shown = isCitable(entry);
  const badLink = !!entry.url?.trim() && !attributionLink(entry.url);
  useEffect(() => {
    if (!focus) return;
    ref.current?.scrollIntoView?.({ block: 'nearest' });
    ref.current?.querySelector<HTMLInputElement>('input[type=text], input:not([type])')?.focus();
    focusEntryNext(null);
  }, [focus]);
  return (
    <div className="cr-entry" ref={ref} data-entry={id}>
      <div className="cr-line">
        <SelectField label="Kind" title="What this credits: a picture, audio or video, text, data, software, something else, or a reference (a book, article or page the project draws on)" value={entry.kind} options={KIND_OPTIONS} onChange={(v: AttributionKind) => set({ kind: v })} />
        <TextField label="Title" title="The name of the work, or what it is (Sunset over the bay, Chapter 4)" value={entry.title} onChange={(v) => set({ title: v }, 'title')} />
        <div className="cr-actions">
          <IconButton icon={<Icons.chevronDown width={13} style={{ transform: 'rotate(180deg)' }} />} title="Move up" disabled={index === 0} onClick={() => edit((p) => moveAttribution(p, id, -1))} />
          <IconButton icon={<Icons.chevronDown width={13} />} title="Move down" disabled={index === count - 1} onClick={() => edit((p) => moveAttribution(p, id, 1))} />
          <IconButton icon={<Icons.trash width={13} />} title="Delete this entry" onClick={() => edit((p) => removeAttribution(p, id))} />
        </div>
      </div>
      <div className="cr-line">
        <TextField label="Creator" title="Who made it: a person, a studio, an agency" value={entry.creator ?? ''} onChange={(v) => set({ creator: v }, 'creator')} />
        <TextField label="Year" title="When it was made or published. Any text works: 2019, 2019-2021, n.d." value={entry.year ?? ''} onChange={(v) => set({ year: v }, 'year')} />
      </div>
      <div className="cr-line">
        <TextField label="Source link" title="Where it can be found. An http(s) address becomes a link learners can open in a new tab" value={entry.url ?? ''} placeholder="https://" onChange={(v) => set({ url: v }, 'url')} />
      </div>
      {badLink && <p className="hint cr-warn">That is not a web address, so learners will see it as plain text rather than a link.</p>}
      <div className="cr-line">
        <TextField label="Licence" title="The terms it is used under, in your own words: CC BY 4.0, Public domain, Used with permission" value={entry.licence ?? ''} onChange={(v) => set({ licence: v }, 'licence')} />
        <LicenceSuggest onPick={(v) => set({ licence: v })} />
      </div>
      <TextField label="Notes (only you see these)" title="Your own notes: who gave permission, when it expires, where the original file is. They never reach learners and are left out of exported and shared pages" value={entry.notes ?? ''} multiline rows={2} onChange={(v) => set({ notes: v }, 'notes')} />
      <div className="cr-assets">
        <span className="field-label">Files</span>
        {linked.map((a) => (
          <span key={a.id} className="cr-chip" title={a.name}>
            {a.name}
            <button className="link-btn" aria-label={`Unlink ${a.name}`} title="Unlink this file from the entry" onClick={() => edit((p) => unlinkAsset(p, id, a.id))}>
              ×
            </button>
          </span>
        ))}
        {!linked.length && <span className="muted">No files linked</span>}
        {free.length > 0 && (
          <SelectField
            title="Link a file from the Assets list to this entry. The Assets panel then shows it has an attribution"
            value=""
            options={[{ value: '', label: 'Link a file…' }, ...free.map((a) => ({ value: a.id, label: a.name }))]}
            onChange={(v) => v && edit((p) => linkAsset(p, id, v))}
          />
        )}
      </div>
      <p className={`cr-preview${shown ? '' : ' muted'}`} aria-label="How learners will see this entry">
        {shown ? (
          <>
            {parts.text} {parts.url && <span className="cr-url">{parts.url}</span>}
          </>
        ) : (
          'Learners will not see this entry until it has a title, a creator or a link.'
        )}
      </p>
    </div>
  );
}

/** The project's attributions and references: the list, what each is linked to, and the credits settings. */
export function CreditsPanel() {
  const project = useEditor((s) => s.project);
  const list = project.attributions ?? [];
  const missing = useMemo(() => unattributedAssets(project), [project.assets, project.attributions]);
  const focusId = useSyncExternalStore(subscribeFocusEntry, peekFocusEntry);
  const copy = async () => {
    const text = list.filter(isCitable).map(formatCitation).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      store().toast(text ? 'Copied the credits as text' : 'Nothing to copy yet: no entry has a title, a creator or a link');
    } catch {
      store().toast('The browser would not let the editor copy. Select the text in the entries instead', 'error');
    }
  };
  return (
    <div className="cr-panel">
      <div className="cr-toolbar">
        <button className="btn" data-track="credits-add" onClick={() => {
            let id = '';
            edit((p) => void (id = addAttribution(p)));
            focusEntryNext(id);
          }} title="Add an entry: a credit for something you used, or a reference">
          <Icons.plus width={14} /> Add entry
        </button>
        {missing.length > 0 && project.assets.length > 0 && (
          <button
            className="btn"
            data-track="credits-add-uncovered"
            title="Add one entry for each file in the Assets list that has none, named after the file. Fill in the creator and licence afterwards"
            onClick={() => {
              let n = 0;
              edit((p) => void (n = addForUncovered(p)));
              store().toast(`Added ${n} entr${n === 1 ? 'y' : 'ies'}`);
            }}
          >
            Add for files without one ({missing.length})
          </button>
        )}
        <button className="btn" onClick={copy} disabled={!list.some(isCitable)} title="Copy every entry as one line of text each, to paste into a document or a course page">
          Copy as text
        </button>
        <span className="muted cr-count">
          {list.length ? `${list.length} entr${list.length === 1 ? 'y' : 'ies'}` : 'No entries'}
          {project.assets.length ? `, ${project.assets.length - missing.length} of ${project.assets.length} files covered` : ''}
        </span>
      </div>
      <div className="cr-body">
        <div className="cr-settings">
          <CreditsSettingsFields />
        </div>
        {list.length === 0 ? (
          <SectionBlurb
            className="cr-empty"
            text="Nothing here yet, and nothing needs to be. Add an entry for each picture, sound or text you did not make yourself."
            name="attributions"
            help={['attributions', 'adding-entries']}
          />
        ) : (
          list.map((e, i) => <EntryCard key={e.id} entry={e} index={i} count={list.length} project={project} focus={focusId === e.id} />)
        )}
      </div>
    </div>
  );
}
