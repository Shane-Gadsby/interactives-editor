//Preview is a modal that sits above everything, the help drawer included, so help asked for while it is open goes to its own window
let previewOpen = false;

export const setPreviewOpen = (open: boolean) => {
	previewOpen = open;
};
export const isPreviewOpen = () => previewOpen;

//the things that are allowed to take focus away from Preview: what it opens itself (menus, confirm dialogs, tooltips)
const OPENED_FROM_PREVIEW = '.dialog-backdrop, .ctx-menu, .ix-tooltip, [role="dialog"], [role="menu"], [role="listbox"]';

const TABBABLE = 'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), iframe, [tabindex]:not([tabindex="-1"])';

/** Keep keyboard focus inside a modal: Tab and Shift+Tab wrap, and focus that lands outside it comes back. Returns the cleanup. */
export function trapFocus(root: HTMLElement): () => void {
	const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	if (!root.contains(document.activeElement)) root.focus({ preventScroll: true });
	const tabbables = () => [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => el.offsetParent !== null || el.tagName === 'IFRAME');
	const onKey = (e: KeyboardEvent) => {
		if (e.key !== 'Tab') return;
		if ((e.target as Element | null)?.closest?.(OPENED_FROM_PREVIEW) && !root.contains(e.target as Node)) return;
		const list = tabbables();
		if (!list.length) return e.preventDefault();
		const first = list[0];
		const last = list[list.length - 1];
		const at = document.activeElement;
		if (!root.contains(at) || at === root) {
			e.preventDefault();
			(e.shiftKey ? last : first).focus();
		} else if (e.shiftKey && at === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && at === last) {
			e.preventDefault();
			first.focus();
		}
	};
	const onFocusIn = (e: FocusEvent) => {
		const t = e.target as Element | null;
		if (!t || root.contains(t) || t.closest?.(OPENED_FROM_PREVIEW)) return;
		root.focus({ preventScroll: true });
	};
	document.addEventListener('keydown', onKey, true);
	document.addEventListener('focusin', onFocusIn, true);
	return () => {
		document.removeEventListener('keydown', onKey, true);
		document.removeEventListener('focusin', onFocusIn, true);
		before?.focus?.({ preventScroll: true });
	};
}
