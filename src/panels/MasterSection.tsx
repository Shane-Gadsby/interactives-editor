import { isMasterArtboard, masterLayerNames, masterOf, masterSlotNames, pagesOfMaster, type Artboard, type Project } from 'interactives-player';
import { store } from '../store/store';
import { CheckField, Row, Section, SelectField, TextField } from '../components/ui';

/**
 * The artboard's Page master settings. A page picks the artboard whose layers (logo, accent bar, footer) are drawn under its own,
 * leaves some of them out by name and fills the master's text slots. A master lists the pages that use it and which of its layers
 * go over the pages. Editing the master changes every page; its layers are read-only on a page.
 */
export function MasterSection({ ab, project }: { ab: Artboard; project: Project }) {
  const used = pagesOfMaster(project.artboards, ab);
  const isMaster = isMasterArtboard(project.artboards, ab);
  const master = masterOf(project.artboards, ab);
  if (ab.library) return null;

  if (isMaster) return <MasterOfPages ab={ab} project={project} used={used} />;

  if (!master) {
    // Anything that is not a page of its own with a master can be one
    const choices = project.artboards.filter((a) => a.id !== ab.id && !a.master && !a.library && a.isMaster);
    return (
      <Section help="page-master" title="Page master" defaultOpen={false}>
        <p className="hint">Share a logo, accent bar or footer between pages: put them on one artboard (the master) and every page draws it under its own layers. Change the master and every page follows.</p>
        <SelectField
          label="Master"
          title="The artboard whose layers are drawn under this page"
          value=""
          options={[{ value: '', label: choices.length ? 'None' : 'No masters yet' }, ...choices.map((a) => ({ value: a.id, label: a.name }))]}
          onChange={(v) => v && store().setMasterOf([ab.id], v)}
        />
        <Row>
          <button className="btn" title="Keep this artboard as a page master. Then choose it as the master of other pages" onClick={() => store().markAsMaster(ab.id, true)}>
            Make this a master
          </button>
        </Row>
      </Section>
    );
  }

  const names = masterLayerNames(master);
  const slots = masterSlotNames(master, project.variables);
  const hidden = new Set(ab.masterHide ?? []);
  const choices = project.artboards.filter((a) => a.id !== ab.id && !a.master && !a.library && (a.isMaster || a.id === master.id));
  return (
    <Section help="page-master" title="Page master">
      <SelectField
        label="Master"
        title="The artboard whose layers are drawn under this page"
        value={master.id}
        options={[{ value: '', label: 'None' }, ...choices.map((a) => ({ value: a.id, label: a.name }))]}
        onChange={(v) => store().setMasterOf([ab.id], v || null)}
      />
      <Row>
        <button className="btn" title="Select the master to change the layers every page shares" onClick={() => store().editMasterOf(ab.id)}>
          Edit master
        </button>
        <button className="btn" title="Copy the master's layers into this page as ordinary layers and stop using the master" onClick={() => store().detachMasterOf(ab.id)}>
          Detach
        </button>
      </Row>
      {slots.length > 0 && (
        <>
          <p className="hint">Text slots: a {'{name}'} in the master&rsquo;s text reads what you type here on this page.</p>
          {slots.map((name) => (
            <TextField key={name} label={name} title={`What {${name}} says on this page. A {variable} inside it is filled in as usual`} value={ab.masterSlots?.[name] ?? ''} placeholder={`{${name}}`} onChange={(v) => store().setMasterSlot(ab.id, name, v)} />
          ))}
        </>
      )}
      {names.length > 0 && (
        <>
          <p className="hint">Show these master layers on this page:</p>
          <ul className="master-list" aria-label="Master layers on this page">
            {names.map((n) => (
              <li key={n}>
                <CheckField label={n} title={`Draw “${n}” on this page. Untick to leave it off`} value={!hidden.has(n)} onChange={(on) => store().setMasterHidden(ab.id, n, !on)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

function MasterOfPages({ ab, project, used }: { ab: Artboard; project: Project; used: Artboard[] }) {
  const over = new Set(ab.masterOver ?? []);
  const candidates = project.artboards.filter((a) => a.id !== ab.id && !a.isMaster && !a.library && !a.master && !pagesOfMaster(project.artboards, a).length);
  return (
    <Section help="page-master" title="Page master">
      <p className="hint">
        This artboard is a page master. Its layers are drawn on {used.length || 'no'} page{used.length === 1 ? '' : 's'}, read-only, under each page&rsquo;s own layers unless you send them over.
      </p>
      {used.length > 0 && (
        <ul className="master-list" aria-label="Pages that use this master">
          {used.map((p) => (
            <li key={p.id}>
              <button className="variant-name" title={`Select ${p.name}`} onClick={() => store().set({ activeArtboardId: p.id, artboardSelected: true, selection: [], activeTimelineId: null })}>
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {candidates.length > 0 && (
        <SelectField
          label="Use for"
          title="Make a page draw this artboard as its master"
          value=""
          options={[{ value: '', label: 'Use as master for…' }, ...candidates.map((a) => ({ value: a.id, label: a.name }))]}
          onChange={(v) => v && store().setMasterOf([v], ab.id)}
        />
      )}
      {candidates.length > 1 && (
        <Row>
          <button className="btn" title="Every artboard that has no master of its own draws this one" onClick={() => store().setMasterOf(candidates.map((a) => a.id), ab.id)}>
            Use for all other pages
          </button>
        </Row>
      )}
      {ab.children.length > 0 && (
        <>
          <p className="hint">Draw over the pages (the rest goes under):</p>
          <ul className="master-list" aria-label="Master layers drawn over the pages">
            {ab.children.map((n) => (
              <li key={n.id}>
                <CheckField label={n.name} title={`Draw “${n.name}” over the pages' own layers instead of under them`} value={over.has(n.id)} onChange={(v) => store().setMasterOver(ab.id, n.id, v)} />
              </li>
            ))}
          </ul>
        </>
      )}
      {used.length === 0 && (
        <Row>
          <button className="btn" onClick={() => store().markAsMaster(ab.id, false)}>
            Not a page master
          </button>
        </Row>
      )}
      <p className="hint">Buttons, inputs, video, embeds and instances are not drawn from a master. Its timelines and interactions do not run.</p>
    </Section>
  );
}
