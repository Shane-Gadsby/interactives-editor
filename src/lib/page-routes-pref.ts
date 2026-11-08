//Whether the faint arrows between pages show on the canvas (right-click the canvas to switch them). A per-browser choice, on by default.
import { useSyncExternalStore } from 'react';

const KEY = 'ix-page-routes';
const subs = new Set<() => void>();
let on: boolean | null = null;

export function showRoutes(): boolean {
	if (on === null) {
		try {
			on = localStorage.getItem(KEY) !== 'off';
		} catch {
			on = true;
		}
	}
	return on;
}

export function setShowRoutes(v: boolean): void {
	on = v;
	try {
		localStorage.setItem(KEY, v ? 'on' : 'off');
	} catch {
		/* storage unavailable: it lasts until the page reloads */
	}
	subs.forEach((f) => f());
}

export const useShowRoutes = (): boolean =>
	useSyncExternalStore(
		(f) => (subs.add(f), () => subs.delete(f)),
		showRoutes,
		showRoutes,
	);
