//Which project the editor was just left from, so Home (the button or the browser's Back) opens Projects with it in view
let left: string | null = null;

export function rememberLeft(id: string) {
	left = id;
}

/** The project just left, or null when Home is being opened fresh. Read without clearing: a render can run twice (StrictMode), so the page clears it once it has mounted. */
export function peekLeft(): string | null {
	return left;
}

export function clearLeft() {
	left = null;
}
