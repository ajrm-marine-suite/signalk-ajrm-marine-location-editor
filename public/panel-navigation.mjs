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
