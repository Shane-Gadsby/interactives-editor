import type { Artboard, Project, SceneNode } from 'interactives-player';
import { Section, SelectField } from '../components/ui';
import { store } from '../store/store';
import { linkedPage, linkToPage, pageLinksOf, pagesToLinkTo } from '../lib/page-link';

/**
 * "Go to page": which page clicking this layer opens, chosen from a list (or by dragging the handle on the canvas onto a page).
 * It reads and writes the same On pointer click and Go to artboard nodes the Interactions graph shows, so it follows whatever is
 * edited there, and it never rewrites a click with an "Only if" or other work in it.
 */
export function PageLinkSection({ node, ab, project }: { node: SceneNode; ab: Artboard; project: Project }) {
	const links = pageLinksOf(ab, node.id);
	const to = linkedPage(ab, node.id) ?? '';
	const pages = pagesToLinkTo(project, ab);
	//A link to a page that has since gone, or to this very page, is shown as it is and can be cleared
	const known = pages.some((p) => p.id === to);
	const name = (id: string) => project.artboards.find((a) => a.id === id)?.name ?? 'a missing page';
	const choose = (v: string) => {
		store().update((d) => {
			const a = d.artboards.find((x) => x.id === ab.id);
			if (a) linkToPage(a, node.id, v || null);
		});
	};
	return (
		<Section help="links-cursors#go-to-a-page" title="Go to page" defaultOpen={!!to || node.type === 'button' || node.type === 'link'}>
			<SelectField
				label="Goes to"
				title="The page this layer opens when it is clicked. You can also drag the round handle on the selected layer onto a page on the canvas"
				value={to}
				options={[{ value: '', label: 'No page' }, ...(to && !known ? [{ value: to, label: name(to) }] : []), ...pages.map((p) => ({ value: p.id, label: p.name }))]}
				onChange={choose}
			/>
			<p className="hint">
				{to ? <>Clicking it goes to <b>{name(to)}</b>.{links.length > 1 ? ' More than one click here goes to a page: changing it changes them all.' : ''}</> : 'Pick a page, or drag the round handle on the canvas onto one. It is written as a click and a Go to artboard in Interactions.'}
			</p>
		</Section>
	);
}
