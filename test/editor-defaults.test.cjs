/** Verifies deliberate new-Location defaults without changing saved records. */

const assert = require("node:assert/strict");
const test = require("node:test");

test("a new harbour or marina defaults from Point to an automatic-profile Circle", async () => {
	const { defaultsForTypeSelection } = await import("../public/editor-defaults.mjs");
	for (const type of ["harbour", "marina"]) {
		assert.deepEqual(defaultsForTypeSelection({ type, checked: true, geometryType: "Point" }), {
			geometryType: "Circle",
			automaticProfileArea: true,
		});
	}
});

test("harbour defaults preserve an area the user already selected", async () => {
	const { defaultsForTypeSelection } = await import("../public/editor-defaults.mjs");
	assert.deepEqual(defaultsForTypeSelection({ type: "harbour", checked: true, geometryType: "Polygon" }), {
		geometryType: "Polygon",
		automaticProfileArea: true,
	});
});

test("defaults do not reshape existing Locations or other classifications", async () => {
	const { defaultsForTypeSelection } = await import("../public/editor-defaults.mjs");
	assert.equal(defaultsForTypeSelection({ existingLocation: true, type: "marina", checked: true }), null);
	assert.equal(defaultsForTypeSelection({ type: "anchorage", checked: true }), null);
	assert.equal(defaultsForTypeSelection({ type: "harbour", checked: false }), null);
});
