/** Verifies migration of Marine Planning secondary-port constants. */

const assert = require("node:assert/strict");
const test = require("node:test");
const { isSupersededBundledCorrection, mergeSecondaryPortSeed } = require("../plugin/secondary-port-seed.cjs");

test("secondary-port seed enriches existing locations and adds positioned ports", () => {
	const base = { schema: "org.ajrm.marine.location-seed/v1", locations: [{
		id: "existing", name: "Existing", types: ["marina"],
		feature: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [-5, 56] } },
		properties: {},
	}] };
	const secondary = {
		schema: "org.ajrm.marine.secondary-port-seed/v1", standardPortId: "standard",
		locations: [
			{ id: "existing", name: "Existing", legacyId: "existing", hw: [1, 2], lw: [5, 6], heights: [0.1, 0.2, 0.3, 0.4] },
			{ id: "new", name: "New", legacyId: "new", coordinates: [-6, 55], hw: [0, 0, 0, 0], lw: [0, 0, 0, 0], heights: [0, 0, 0, 0] },
		],
	};
	const merged = mergeSecondaryPortSeed(base, secondary);
	assert.equal(merged.locations.length, 2);
	const existing = merged.locations.find(({ id }) => id === "existing");
	assert.deepEqual(existing.types, ["marina", "tidalSecondaryPort"]);
	assert.equal(existing.properties.tide.parentLocationRef, "/resources/locations/standard");
	assert.equal(existing.properties.tide.secondaryPortCorrections.contract, "ajrm-secondary-port-corrections-v4");
	assert.equal(existing.properties.tide.secondaryPortCorrections.timeOffsetPeriodMinutes, 720);
	assert.deepEqual(existing.properties.tide.secondaryPortCorrections.highWaterTimeOffsets[1], { referenceTimeMinutes: 360, offsetMinutes: 2 });
	assert.equal(existing.properties.tide.secondaryPortCorrections.parentReferenceLevels, undefined);
	assert.deepEqual(merged.locations.find(({ id }) => id === "new").feature.geometry.coordinates, [-6, 55]);
});

test("keeps an incomplete mean-range-only port visible but not prediction-capable", () => {
	const merged = mergeSecondaryPortSeed({ schema: "org.ajrm.marine.location-seed/v1", locations: [] }, {
		schema: "org.ajrm.marine.secondary-port-seed/v1", standardPortId: "standard",
		locations: [{
			id: "incomplete", name: "Incomplete", legacyId: "incomplete", coordinates: [-6, 55],
			hwReferenceTimesMinutes: [60, 420], lwReferenceTimesMinutes: [60, 480],
			hw: [-320, -230], lw: [-220, -340], meanRangeM: 0.5,
		}],
	});
	const tide = merged.locations[0].properties.tide;
	assert.equal(tide.secondaryPortCorrections, undefined);
	assert.equal(tide.secondaryPortSourceData.status, "incomplete");
	assert.equal(tide.secondaryPortSourceData.meanRangeM, 0.5);
	assert.deepEqual(tide.secondaryPortSourceData.missing, ["heightDifferencesM"]);
});

test("recognises only the exact superseded Port Ellen correction", () => {
	const old = {
		legacyId: "port-ellen",
		notes: "HW Oban -0530 at springs, -0050 at neaps. LW time not supplied.",
		highWaterTimeOffsets: [{ referenceTimeMinutes: 0, offsetMinutes: -330 }, { referenceTimeMinutes: 360, offsetMinutes: -50 }],
		lowWaterTimeOffsets: [{ referenceTimeMinutes: 0, offsetMinutes: 0 }, { referenceTimeMinutes: 360, offsetMinutes: 0 }],
		heightDifferencesM: { mhws: -3.1, mhwn: -2.1, mlwn: -1.3, mlws: -0.4 },
	};
	assert.equal(isSupersededBundledCorrection(old, { legacyId: "port-ellen" }), true);
	assert.equal(isSupersededBundledCorrection({ ...old, notes: "User edited" }, { legacyId: "port-ellen" }), false);
});
