/** Verifies migration of Marine Planning secondary-port constants. */

const assert = require("node:assert/strict");
const test = require("node:test");
const { mergeSecondaryPortSeed } = require("../plugin/secondary-port-seed.cjs");

test("secondary-port seed enriches existing locations and adds positioned ports", () => {
	const base = { schema: "org.ajrm.marine.location-seed/v1", locations: [{
		id: "existing", name: "Existing", types: ["marina"],
		feature: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [-5, 56] } },
		properties: {},
	}] };
	const secondary = {
		schema: "org.ajrm.marine.secondary-port-seed/v1", standardPortId: "standard",
		standardReferenceLevels: { mhws: 4, mhwn: 2.9, mlwn: 1.8, mlws: 0.7 },
		locations: [
			{ id: "existing", name: "Existing", legacyId: "existing", hw: [1, 2, 3, 4], lw: [5, 6, 7, 8], heights: [0.1, 0.2, 0.3, 0.4] },
			{ id: "new", name: "New", legacyId: "new", coordinates: [-6, 55], hw: [0, 0, 0, 0], lw: [0, 0, 0, 0], heights: [0, 0, 0, 0] },
		],
	};
	const merged = mergeSecondaryPortSeed(base, secondary);
	assert.equal(merged.locations.length, 2);
	const existing = merged.locations.find(({ id }) => id === "existing");
	assert.deepEqual(existing.types, ["marina", "tidalSecondaryPort"]);
	assert.equal(existing.properties.tide.parentLocationRef, "/resources/locations/standard");
	assert.deepEqual(existing.properties.tide.secondaryPortCorrections.highWaterTimeOffsets[2], { referenceTimeMinutes: 720, offsetMinutes: 3 });
	assert.equal(existing.properties.tide.secondaryPortCorrections.parentReferenceLevels.mhwn, 2.9);
	assert.deepEqual(merged.locations.find(({ id }) => id === "new").feature.geometry.coordinates, [-6, 55]);
});
