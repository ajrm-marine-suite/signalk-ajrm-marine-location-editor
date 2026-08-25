/**
 * Tracks whether Location Editor replaced the selection drawer, so closing an
 * edit can return to the user's previous selection task instead of the map.
 */

export function createEditorNavigationState() {
	let returnToSelector = false;
	return {
		open({ selectorOpen = false } = {}) {
			returnToSelector = selectorOpen === true;
		},
		close() {
			const destination = returnToSelector ? "selector" : null;
			returnToSelector = false;
			return destination;
		},
		clear() {
			returnToSelector = false;
		},
	};
}

/** Tracks the drawer displaced while the floating geometry editor is open. */
export function createGeometryNavigationState() {
	let returnToEditor = false;
	return {
		open({ editorOpen = false } = {}) {
			returnToEditor = editorOpen === true;
		},
		close() {
			const destination = returnToEditor ? "editor" : null;
			returnToEditor = false;
			return destination;
		},
		clear() {
			returnToEditor = false;
		},
	};
}
