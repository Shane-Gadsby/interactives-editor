//Room for the graph. The bottom panel is a short strip (260px) because the timeline and the other tools fit in it, but the
//Interactions graph needs height: half of it is the node palette and a page with a dozen nodes is a thumbnail. So when the
//Interactions tab opens (from a layer's "+ On click", a chip, a recipe, the tab itself) and the bottom panel is still at its
//default height, it lifts to a comfortable one, and goes back when the person leaves the tab. Only ever when the panel is at its
//default: one the author sized on purpose is left alone. If they resize it while the graph is open, that height is remembered
//and used the next time (this browser).
import { store } from '../store/store';
import { BOTTOM_DEFAULT, getDock } from './dock';

export const DEFAULT_BOTTOM = BOTTOM_DEFAULT;
export const ROOM_HEIGHT = 440;
export const KEY = 'ix-interactions-room';

/** The height the graph gets, remembered from the last time the person set one while it was open. */
export function roomHeight(): number {
	try {
		const n = Number(localStorage.getItem(KEY));
		if (Number.isFinite(n) && n >= 140) return Math.min(n, 2000);
	} catch {
		/* storage unavailable: the usual height */
	}
	return ROOM_HEIGHT;
}

function remember(h: number): void {
	try {
		localStorage.setItem(KEY, String(Math.round(h)));
	} catch {
		/* storage unavailable: it lasts until the page reloads */
	}
}

//No more than half the window, as a workspace switch allows, so a short screen keeps its canvas
const cap = () => Math.max(140, Math.min(window.innerHeight - 200, Math.round(window.innerHeight * 0.5)));

/** Start watching the store. Returns the cleanup. */
export function installInteractionsRoom(): () => void {
	const s = store();
	let tab = s.get().bottomTab;
	//The height this module set when it lifted the panel (null: it has not, or the person has taken over)
	let lifted: number | null = null;
	let before = s.get().bottomHeight;
	return s.subscribe(() => {
		const st = s.get();
		const now = st.bottomTab;
		const h = st.bottomHeight;
		const moved = h !== before;
		before = h;
		if (now !== tab) {
			const was = tab;
			tab = now;
			if (now === 'logic') {
				const want = Math.min(roomHeight(), cap());
				if (h === DEFAULT_BOTTOM && want > h && getDock().zones.bottom.tabs.includes('logic')) {
					lifted = want;
					s.set({ bottomHeight: want });
				}
			} else if (was === 'logic' && lifted !== null) {
				if (h === lifted) s.set({ bottomHeight: DEFAULT_BOTTOM });
				lifted = null;
			}
		} else if (now === 'logic' && moved && h !== lifted) {
			//Resized with the graph open (every step of a drag): theirs now, and what the next time opens to
			remember(h);
			lifted = null;
		}
	});
}
