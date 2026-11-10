//Say it: the Announce nodes that sat straight after a Set variable in the starters are now the Set variable's own Say it box.
import { describe, expect, it } from 'vitest';
import { evaluate, template, type Artboard } from 'interactives-player';
import { BRANDED_STARTERS } from '../src/lib/branded';
import { projectFromBrandedStarter } from '../src/lib/branded/project';
import { announceToTemplate, foldAnnounces } from '../src/lib/branded/say-it';
import { buildBehaviour, defaultAnswers, type RecipeCtx } from '../src/lib/recipes';
import { createProject } from 'interactives-player';

describe('announceToTemplate', () => {
	const scope = { vars: { slide: 3, slides: [1, 2, 3, 4], card: 2, cards: [1, 2], status: 'Done', on: true, n: 5 } };
	//the template says exactly what the expression said
	const same = (expr: string, say: string | null) => {
		expect(announceToTemplate(expr)).toBe(say);
		if (say !== null) expect(template(say, scope)).toBe(String(evaluate(expr, scope)));
	};

	it('turns words and values joined with + into one readable line', () => {
		same('"Slide " + slide + " of " + slides.length', 'Slide {slide} of {slides.length}');
		same('"Card " + card + " of " + cards.length', 'Card {card} of {cards.length}');
		same('"Question " + (slide + 1) + " of " + slides.length', 'Question {slide + 1} of {slides.length}');
		same('"Looping on."', 'Looping on.');
		same("'Done ' + n", 'Done {n}');
	});

	it('says a single value, or a ternary, as one slot', () => {
		same('status', '{status}');
		same('on ? "Showing the list" : "Showing the cloud"', '{on ? "Showing the list" : "Showing the cloud"}');
	});

	it('leaves alone what it cannot say the same way', () => {
		//a value first could be a sum, so the words would not join the way they do now
		expect(announceToTemplate('n + 1 + " items"')).toBeNull();
		expect(announceToTemplate('status + "!"')).toBeNull();
		expect(announceToTemplate('"a {b}"')).toBeNull();
		expect(announceToTemplate('"a \\"b\\""')).toBeNull();
		expect(announceToTemplate('')).toBeNull();
		expect(announceToTemplate('"x" + ')).toBeNull();
	});
});

/** A graph: an event, a Set variable and then the given nodes, in a row. */
function board(extra: { announce?: Record<string, unknown>; setParams?: Record<string, unknown>; fan?: boolean }): Pick<Artboard, 'logic'> {
	const nodes = [
		{ id: 'ev', kind: 'event.pointer', x: 0, y: 0, params: {} },
		{ id: 'set', kind: 'action.setVariable', x: 0, y: 0, params: { variable: 'v', op: 'add', value: '1', ...(extra.setParams ?? {}) } },
		{ id: 'say', kind: 'action.announce', x: 0, y: 0, params: { text: '"Slide " + slide', politeness: 'polite', ...(extra.announce ?? {}) } },
		{ id: 'next', kind: 'action.emit', x: 0, y: 0, params: { name: 'next' } },
	];
	const edges = [
		{ id: 'e1', from: 'ev', fromPort: 'out', to: 'set', toPort: 'in' },
		{ id: 'e2', from: 'set', fromPort: 'out', to: 'say', toPort: 'in' },
		{ id: 'e3', from: 'say', fromPort: 'out', to: 'next', toPort: 'in' },
		...(extra.fan ? [{ id: 'e4', from: 'set', fromPort: 'out', to: 'next', toPort: 'in' }] : []),
	];
	return { logic: { nodes, edges } } as never;
}

describe('foldAnnounces', () => {
	it('moves the words into the Set variable and joins what followed to it', () => {
		const ab = board({});
		expect(foldAnnounces(ab)).toBe(1);
		expect(ab.logic.nodes.map((n) => n.id)).toEqual(['ev', 'set', 'next']);
		expect(ab.logic.nodes[1].params.say).toBe('Slide {slide}');
		expect(ab.logic.edges.map((e) => `${e.from}>${e.to}`)).toEqual(['ev>set', 'set>next']);
	});

	it('keeps an urgent Announce, a Set variable that does other things, an easing one and one that already says something', () => {
		for (const extra of [{ announce: { politeness: 'assertive' } }, { fan: true }, { setParams: { over: '300' } }, { setParams: { say: 'Already' } }, { announce: { text: 'n + 1 + " x"' } }]) {
			const ab = board(extra);
			expect(foldAnnounces(ab)).toBe(0);
			expect(ab.logic.nodes).toHaveLength(4);
		}
	});
});

describe('the starters', () => {
	it('carry the Say it box instead of an Announce after a Set variable, with none left that could be folded', () => {
		let said = 0;
		for (const s of BRANDED_STARTERS) {
			const p = projectFromBrandedStarter(s);
			for (const ab of p.artboards) {
				said += ab.logic.nodes.filter((n) => n.kind === 'action.setVariable' && typeof n.params.say === 'string' && n.params.say !== '').length;
				expect(foldAnnounces(ab), s.key).toBe(0);
				//every wire still ends at a node that is there
				const ids = new Set(ab.logic.nodes.map((n) => n.id));
				expect(ab.logic.edges.every((e) => ids.has(e.from) && ids.has(e.to)), s.key).toBe(true);
			}
		}
		expect(said).toBeGreaterThan(90);
	});
});

describe('Say it on the Change a number recipes', () => {
	const project = createProject();
	const ab = project.artboards[0];
	const ctx: RecipeCtx = { project, ab, layerId: 'x' };

	it('writes the words when they are given and nothing when they are not', () => {
		const a = { ...defaultAnswers(RECIPE('counter'), ctx), amount: '1' };
		const none = buildBehaviour(ctx, 'counter', 'click', a);
		expect(none.nodes.find((n) => n.kind === 'action.setVariable')!.params.say).toBe('');
		const some = buildBehaviour(ctx, 'counter', 'click', { ...a, say: ' Score is {count} ' });
		expect(some.nodes.find((n) => n.kind === 'action.setVariable')!.params.say).toBe('Score is {count}');
		const next = buildBehaviour(ctx, 'item-next', 'click', { ...defaultAnswers(RECIPE('item-next'), ctx), say: 'Slide {slide}' });
		expect(next.nodes.find((n) => n.kind === 'action.setVariable')!.params.say).toBe('Slide {slide}');
		const flip = buildBehaviour(ctx, 'switch', 'click', { ...defaultAnswers(RECIPE('switch'), ctx), say: 'Switched' });
		expect(flip.nodes.find((n) => n.kind === 'action.setVariable')!.params.say).toBe('Switched');
	});
});

import { RECIPE_BY_ID } from '../src/lib/recipes';
function RECIPE(id: string) {
	return RECIPE_BY_ID[id];
}
