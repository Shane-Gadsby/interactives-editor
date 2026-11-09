import { useState } from 'react';
import { DEFAULT_TRANSITION_MS, PAGE_TRANSITIONS, TIMED_TRANSITIONS, type Project } from 'interactives-player';
import { Row, Section, SelectField, SpeedField } from '../components/ui';
import { store } from '../store/store';
import { addPageNavigation, hasOwnNavigation, NAV_STYLES, navPages, removePageNav, PAGE_NAV_TAG, type NavResult, type NavStyle } from '../lib/page-nav';
import { SectionBlurb } from '../components/SectionBlurb';

const hasNav = (project: Project, ids: string[]) =>
	project.artboards.some((a) => ids.includes(a.id) && JSON.stringify(a.children).includes(`"${PAGE_NAV_TAG}"`));

/**
 * "Page navigation": pick a style and add Back, Next, the page number, dots or a progress bar along the bottom of the page (or of
 * every page) in one click. Everything it makes is ordinary layers and graph nodes (lib/page-nav.ts), so it can be restyled or
 * rewired afterwards, and adding again with another style swaps it.
 */
export function PageNavSection({ ids, project }: { ids: string[]; project: Project }) {
	const [style, setStyle] = useState<NavStyle>('back-next');
	const [look, setLook] = useState('fade');
	const [speed, setSpeed] = useState(DEFAULT_TRANSITION_MS);
	const [said, setSaid] = useState<NavResult | { removed: number } | null>(null);
	const everyone = navPages(project).map((a) => a.id);
	const targets = ids.filter((id) => everyone.includes(id));
	const run = (to: string[]) => {
		let res: NavResult = { added: [], skipped: [] };
		store().update((d) => {
			res = addPageNavigation(d as Project, to, style, look, speed);
		});
		setSaid(res);
	};
	const remove = () => {
		let n = 0;
		store().update((d) => {
			for (const a of d.artboards) if (targets.includes(a.id) && removePageNav(a as never)) n++;
		});
		setSaid({ removed: n });
	};
	if (!everyone.length) return null;
	const own = project.artboards.filter((a) => targets.includes(a.id) && hasOwnNavigation(a)).length;
	return (
		<Section help="page-navigation" title="Page navigation" defaultOpen={everyone.length > 1}>
			<SectionBlurb text="Back, Next and a page number along the bottom, in one click. They are ordinary layers you can change." name="page navigation" help={['page-navigation']} />
			<Row k="Navigation style" words={['next', 'back', 'previous', 'dots', 'progress bar', 'page number', 'buttons']}>
			<div role="radiogroup" aria-label="Navigation style" className="nav-styles">
				{NAV_STYLES.map((s) => (
					<button key={s.id} type="button" role="radio" aria-checked={style === s.id} className={`nav-style${style === s.id ? ' chosen' : ''}`} onClick={() => setStyle(s.id)} title={s.about}>
						<strong>{s.label}</strong>
						<span>{s.about}</span>
					</button>
				))}
			</div>
			</Row>
			<SelectField label="How the page changes" title="The look of the change when Back or Next is clicked. Learners who prefer reduced motion always get an instant change" value={look} options={PAGE_TRANSITIONS} onChange={setLook} />
			{TIMED_TRANSITIONS.includes(look) && <SpeedField title="How long the page change takes when Back or Next is clicked" value={speed} onChange={setSpeed} />}
			<Row k="Add navigation" words={['add', 'remove', 'all pages', 'page navigation', 'generate']} className="row-actions">
				<button type="button" className="btn primary" disabled={!targets.length} onClick={() => run(targets)} title="Add the chosen navigation along the bottom of the page. A page that already has it gets this style instead">
					{targets.length > 1 ? `Add to these ${targets.length} pages` : 'Add to this page'}
				</button>
				{everyone.length > targets.length && (
					<button type="button" className="btn" onClick={() => run(everyone)} title="Add it to every page of the project">
						Add to all {everyone.length} pages
					</button>
				)}
				{hasNav(project, targets) && (
					<button type="button" className="btn" onClick={remove} title="Take away the navigation this made on the page">
						Remove
					</button>
				)}
			</Row>
			{own > 0 && !said && <p className="hint">{own === 1 ? 'This page has' : `${own} of these pages have`} its own Next or Back button, so it is left as it is.</p>}
			{said && (
				<p className="hint" role="status">
					{'removed' in said
						? said.removed
							? `Removed it from ${said.removed} page${said.removed === 1 ? '' : 's'}.`
							: 'Nothing to remove.'
						: `${said.added.length ? `Added to ${said.added.length} page${said.added.length === 1 ? '' : 's'}.` : 'Nothing added.'}${said.skipped.length ? ` Left alone: ${said.skipped.map((s) => `${s.page} (${s.why})`).join(', ')}.` : ''}`}
				</p>
			)}
		</Section>
	);
}
