/** Verifies that unsaved geometry does not leak onto an inactive chart. */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const path = require("node:path");

test("geometry preview requires both a real edit and an open editor", async () => {
	const { shouldRenderGeometryPreview } = await import("../public/geometry-preview-state.mjs");
	assert.equal(shouldRenderGeometryPreview(), false);
	assert.equal(shouldRenderGeometryPreview({ dirty: true }), false);
	assert.equal(shouldRenderGeometryPreview({ dirty: true, editorOpen: true }), true);
	assert.equal(shouldRenderGeometryPreview({ dirty: true, geometryEditorOpen: true }), true);
	assert.equal(shouldRenderGeometryPreview({ dirty: false, editorOpen: true }), false);
});

test("resetting the Location Editor does not create a dirty map-centre point", () => {
	const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
	const resetEditor = app.match(/function resetEditor\(\) \{[\s\S]*?\n\}/)?.[0] || "";
	assert.match(resetEditor, /geometryPreviewDirty = false;/);
	assert.doesNotMatch(resetEditor, /geometryPreviewDirty = true;/);
	assert.match(app, /function syncPanels\(\) \{ toolbar\?\.update\(\); renderPreview\(\);/);
});
