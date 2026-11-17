import { PAGE_TRANSITIONS, TIMED_TRANSITIONS, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { Section, SelectField, SpeedField } from '../components/ui';
import { store } from '../store/store';
import { linkDuration, linkedPage, linkToPage, linkTransition, pageLinksOf, pagesToLinkTo, setLinkDuration, setLinkTransition } from '../lib/page-link';
import { SectionBlurb } from '../components/SectionBlurb';

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
	const how = (v: string) => {
		store().update((d) => {
			const a = d.artboards.find((x) => x.id === ab.id);
			if (a) setLinkTransition(a, node.id, v);
		});
	};
	const speed = (ms: number) => {
		store().update((d) => {
			const a = d.artboards.find((x) => x.id === ab.id);
			if (a) setLinkDuration(a, node.id, ms);
		});
	};
	const look = linkTransition(ab, node.id);
	return (
		<Section help="links-cursors#go-to-a-page" title="Go to page" defaultOpen={!!to || node.type === 'button' || node.type === 'link'}>
			<SelectField
				label="Goes to"
				title="The page this layer opens when it is clicked. You can also drag the round handle on the selected layer onto a page on the canvas"
				value={to}
				options={[{ value: '', label: 'No page' }, ...(to && !known ? [{ value: to, label: name(to) }] : []), ...pages.map((p) => ({ value: p.id, label: p.name }))]}
				onChange={choose}
			/>
			{links.length > 0 && (
				<SelectField
					label="How the page changes"
					title="The look of the change: a fade, a slide, a wipe, a push, an iris opening from this layer or a zoom into it. With Respect reduced motion on (Project settings), learners who prefer reduced motion get an instant change"
					value={look}
					options={PAGE_TRANSITIONS}
					onChange={how}
				/>
			)}
			{links.length > 0 && TIMED_TRANSITIONS.includes(look) && <SpeedField title="How long the page change takes" value={linkDuration(ab, node.id)} onChange={speed} />}
			<SectionBlurb
				text={to ? <>Clicking it goes to <b>{name(to)}</b>.{links.length > 1 ? ' Changing it changes every click here that goes to a page.' : ''}</> : 'Pick a page, or drag the round handle on the canvas onto one.'}
				name="Go to page"
				help={['links-cursors', 'go-to-a-page']}
			/>
		</Section>
	);
}
