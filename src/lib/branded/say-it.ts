//An Announce node straight after a Set variable is what the Say it box on the Set variable does, so the starters carry the box
//instead of the extra node. The starters are written with Announce steps (an expression, the way the node takes it); this folds
//the plain ones into the variable change in the finished graph, and leaves anything it cannot say the same way alone.
import type { Artboard, LogicEdge, LogicNode } from 'interactives-player';

/** The top level pieces of an expression split at `+`, or null when something else is going on at the top level (a ternary, a comparison). */
function topLevelParts(src: string): string[] | null {
	const parts: string[] = [];
	let depth = 0;
	let quote = '';
	let from = 0;
	for (let i = 0; i < src.length; i++) {
		const c = src[i];
		if (quote) {
			if (c === '\\') return null;
			if (c === quote) quote = '';
			continue;
		}
		if (c === '"' || c === "'" || c === '`') quote = c;
		else if (c === '(' || c === '[') depth++;
		else if (c === ')' || c === ']') depth--;
		else if (c === '{' || c === '}') return null;
		else if (depth === 0) {
			if (c === '+') {
				parts.push(src.slice(from, i));
				from = i + 1;
			} else if ('?:|&=<>!%*/-'.includes(c)) return null;
		}
	}
	if (quote || depth !== 0) return null;
	parts.push(src.slice(from));
	return parts.map((x) => x.trim());
}

const literal = (p: string): string | null => (/^"[^"\\{}]*"$/.test(p) ? p.slice(1, -1) : /^'[^'\\{}]*'$/.test(p) ? p.slice(1, -1) : null);

/** `(q + 1)` as `q + 1`: one pair of brackets around the whole piece is only there for the sum. */
function unwrap(p: string): string {
	if (!p.startsWith('(') || !p.endsWith(')')) return p;
	let depth = 0;
	for (let i = 0; i < p.length; i++) {
		if (p[i] === '(') depth++;
		else if (p[i] === ')' && --depth === 0 && i < p.length - 1) return p;
	}
	return p.slice(1, -1).trim();
}

/**
 * An Announce expression as the Say it template that says the same words: `"Slide " + slide + " of " + slides.length` becomes
 * `Slide {slide} of {slides.length}`. null when it cannot be done the same way: it starts with a number or a value (the sum would be
 * done before the words), it uses `?` or a comparison outside brackets, or it holds a curly bracket or an escaped quote.
 */
export function announceToTemplate(expr: string): string | null {
	const src = String(expr ?? '').trim();
	if (!src) return null;
	const whole = literal(src);
	if (whole !== null) return whole || null;
	const parts = topLevelParts(src);
	//a ternary or comparison at the top level is one value: say whatever it works out to
	if (!parts) return /[{}\\]/.test(src) ? null : `{${src}}`;
	if (parts.some((p) => !p || (literal(p) === null && /[{}\\]/.test(p)))) return null;
	//only words first makes every + after it join text; a value first might be a sum
	if (parts.length > 1 && literal(parts[0]) === null) return null;
	let out = '';
	for (const p of parts) {
		const text = literal(p);
		out += text !== null ? text : `{${unwrap(p)}}`;
	}
	return out.trim() ? out : null;
}

const noOver = (v: unknown) => v === undefined || v === '' || v === 0 || v === '0';

/**
 * Fold every Announce that comes straight after a Set variable (and nothing else comes out of that Set variable) into the Set
 * variable's Say it. Returns how many were folded. The Announce's own follow-on wires move to the Set variable.
 */
export function foldAnnounces(ab: Pick<Artboard, 'logic'>): number {
	const { nodes, edges } = ab.logic;
	const noted = new Set((ab.logic.notes ?? []).map((n) => n.anchor?.layerId));
	const byId = new Map<string, LogicNode>(nodes.map((n) => [n.id, n]));
	const drop = new Set<string>();
	let folded = 0;
	for (const a of nodes) {
		if (a.kind !== 'action.announce' || a.kit || noted.has(a.id) || a.note) continue;
		if ((a.params.politeness ?? 'polite') !== 'polite' || typeof a.params.text !== 'string') continue;
		const into = edges.filter((e) => e.to === a.id);
		if (into.length !== 1 || into[0].fromPort !== 'out') continue;
		const set = byId.get(into[0].from);
		if (!set || set.kind !== 'action.setVariable' || set.kit || drop.has(set.id) || (set.params.say ?? '') !== '' || !noOver(set.params.over)) continue;
		if (edges.filter((e) => e.from === set.id).length !== 1) continue;
		const say = announceToTemplate(a.params.text);
		if (!say) continue;
		set.params.say = say;
		//what ran after the Announce now runs after the Set variable, and the Announce and its wire go
		for (const e of edges) if (e.from === a.id) e.from = set.id;
		drop.add(a.id);
		folded++;
	}
	if (drop.size) {
		ab.logic.nodes = nodes.filter((n) => !drop.has(n.id));
		ab.logic.edges = edges.filter((e: LogicEdge) => !drop.has(e.to) && !drop.has(e.from));
	}
	return folded;
}
