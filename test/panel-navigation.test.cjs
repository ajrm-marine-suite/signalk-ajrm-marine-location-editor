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

test("geometry editing restores the location editor it temporarily displaced", async () => {
	const { createGeometryNavigationState } = await import("../public/panel-navigation.mjs");
	const navigation = createGeometryNavigationState();
	navigation.open({ editorOpen: true });
	assert.equal(navigation.close(), "editor");
	assert.equal(navigation.close(), null);
});

test("geometry opened without the location editor closes back to the map", async () => {
	const { createGeometryNavigationState } = await import("../public/panel-navigation.mjs");
	const navigation = createGeometryNavigationState();
	navigation.open({ editorOpen: false });
	assert.equal(navigation.close(), null);
	navigation.open({ editorOpen: true });
	navigation.clear();
	assert.equal(navigation.close(), null);
});
