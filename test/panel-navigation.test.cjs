/** Verifies that closing an editor restores the drawer it replaced. */

const assert = require("node:assert/strict");
const test = require("node:test");

test("an editor opened from Select Location returns to the selector once", async () => {
	const { createEditorNavigationState } = await import("../public/panel-navigation.mjs");
	const navigation = createEditorNavigationState();
	navigation.open({ selectorOpen: true });
	assert.equal(navigation.close(), "selector");
	assert.equal(navigation.close(), null);
});

test("a directly opened editor closes to the map", async () => {
	const { createEditorNavigationState } = await import("../public/panel-navigation.mjs");
	const navigation = createEditorNavigationState();
	navigation.open({ selectorOpen: false });
	assert.equal(navigation.close(), null);
	navigation.open({ selectorOpen: true });
	navigation.clear();
	assert.equal(navigation.close(), null);
});
