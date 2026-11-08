//Which project the editor was just left from, so Home (the button or the browser's Back) opens Projects with it in view
let left: string | null = null;

export function rememberLeft(id: string) {
	left = id;
}

/** Read once: the project just left, or null when Home is being opened fresh. */
export function takeLeft(): string | null {
	const id = left;
	left = null;
	return id;
}
