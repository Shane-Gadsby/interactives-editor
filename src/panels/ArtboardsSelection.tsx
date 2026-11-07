import type { Project } from 'interactives-player';
import { store } from '../store/store';
import { Icons } from '../components/icons';
import { IconButton, Row, Section } from '../components/ui';
import { deleteArtboardsCommand, groupArtboardsCommand, selectionGroupInfo, tidyTheseCommand } from '../lib/artboard-commands';

/** What the inspector shows when several artboards are selected: what can be done to all of them at once. */
export function ArtboardsSelection({ ids, project }: { ids: string[]; project: Project }) {
  const st = store();
  const { inAGroup } = selectionGroupInfo(ids);
  const names = ids.map((id) => project.artboards.find((a) => a.id === id)?.name).filter(Boolean) as string[];
  const b = (icon: keyof typeof Icons, title: string, fn: () => void, disabled = false) => {
    const I = Icons[icon];
    return <IconButton key={title} icon={<I width={16} />} title={title} onClick={fn} disabled={disabled} />;
  };
  return (
    <Section title={`${ids.length} artboards`} help="artboards">
      <p className="hint" title={names.join(', ')}>
        {names.slice(0, 4).join(', ')}
        {names.length > 4 ? ` and ${names.length - 4} more` : ''}. Drag any of their names on the canvas to move them all.
      </p>
      <div className="align-bar">
        {b('alignLeft', 'Align left edges', () => st.alignArtboards(ids, 'left'))}
        {b('alignHCenter', 'Align horizontal centres', () => st.alignArtboards(ids, 'center'))}
        {b('alignRight', 'Align right edges', () => st.alignArtboards(ids, 'right'))}
        {b('alignTop', 'Align top edges', () => st.alignArtboards(ids, 'top'))}
        {b('alignVCenter', 'Align vertical centres', () => st.alignArtboards(ids, 'middle'))}
        {b('alignBottom', 'Align bottom edges', () => st.alignArtboards(ids, 'bottom'))}
        {b('distH', 'Distribute horizontally (3 or more)', () => st.distributeArtboards(ids, 'x'), ids.length < 3)}
        {b('distV', 'Distribute vertically (3 or more)', () => st.distributeArtboards(ids, 'y'), ids.length < 3)}
      </div>
      <Row>
        <button className="btn" title="Put these artboards in a named group: listed together in the Layers panel and framed on the canvas" onClick={() => void groupArtboardsCommand(ids)}>
          Group artboards…
        </button>
        <button className="btn" disabled={!inAGroup} title="Take these artboards out of their group" onClick={() => st.leaveArtboardGroups(ids)}>
          Ungroup
        </button>
      </Row>
      <Row>
        <button className="btn" title="Lay these artboards out in a grid among themselves" onClick={() => tidyTheseCommand(ids)}>
          Tidy up
        </button>
        <IconButton icon={<Icons.copy />} title="Duplicate these artboards" onClick={() => st.duplicateArtboards(ids)} />
        <IconButton icon={<Icons.trash />} title="Delete these artboards (asks first)" onClick={() => void deleteArtboardsCommand(ids)} />
      </Row>
    </Section>
  );
}
