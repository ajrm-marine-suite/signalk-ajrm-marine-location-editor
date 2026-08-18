/** Verifies flexible Reeds-style correction anchors, migration and application. */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
	applySecondaryPortCorrections,
	interpolateCircular,
	migrateSecondaryPortCorrections,
} = require("../plugin/secondary-port-corrections.cjs");

test("migrates the fixed v1 clock columns to explicit v2 correction points", () => {
	const result = migrateSecondaryPortCorrections({
		contract: "ajrm-secondary-port-corrections-v1",
		standardReferenceLevels: { mhws: 4, mhwn: 2.9, mlwn: 1.8, mlws: 0.7 },
		hwTimeOffsetsMinutes: { t0000: 1, t0600: 2, t1200: 3, t1800: 4 },
		lwTimeOffsetsMinutes: { t0000: 5, t0600: 6, t1200: 7, t1800: 8 },
		heightDifferencesM: { mhws: 0, mhwn: 0, mlwn: 0, mlws: 0 },
	});
	assert.equal(result.contract, "ajrm-secondary-port-corrections-v2");
	assert.deepEqual(result.highWaterTimeOffsets[2], { referenceTimeMinutes: 720, offsetMinutes: 3 });
	assert.equal(result.parentReferenceLevels.mhwn, 2.9);
	assert.equal(result.hwTimeOffsetsMinutes, undefined);
});

test("interpolates explicit time columns across midnight", () => {
	const points = [
		{ referenceTimeMinutes: 60, offsetMinutes: -55 },
		{ referenceTimeMinutes: 420, offsetMinutes: -25 },
		{ referenceTimeMinutes: 780, offsetMinutes: -55 },
		{ referenceTimeMinutes: 1140, offsetMinutes: -25 },
	];
	assert.equal(interpolateCircular(points, 60), -55);
	assert.equal(interpolateCircular(points, 240), -40);
	assert.equal(interpolateCircular(points, 1320), -40);
});

test("applies the stated Loch Melfort HW/LW time and height corrections", () => {
	const correction = {
		contract: "ajrm-secondary-port-corrections-v2",
		parentReferenceLevels: { mhws: 4, mhwn: 2.9, mlwn: 1.8, mlws: 0.7 },
		highWaterTimeOffsets: [
			{ referenceTimeMinutes: 60, offsetMinutes: -55 },
			{ referenceTimeMinutes: 420, offsetMinutes: -25 },
			{ referenceTimeMinutes: 780, offsetMinutes: -55 },
			{ referenceTimeMinutes: 1140, offsetMinutes: -25 },
		],
		lowWaterTimeOffsets: [
			{ referenceTimeMinutes: 60, offsetMinutes: -40 },
			{ referenceTimeMinutes: 480, offsetMinutes: -35 },
			{ referenceTimeMinutes: 780, offsetMinutes: -40 },
			{ referenceTimeMinutes: 1200, offsetMinutes: -35 },
		],
		heightDifferencesM: { mhws: -1.2, mhwn: -0.8, mlwn: -0.5, mlws: -0.1 },
	};
	const result = applySecondaryPortCorrections([
		{ at: "2026-08-18T01:00:00Z", type: "high", heightM: 4 },
		{ at: "2026-08-18T08:00:00Z", type: "low", heightM: 0.7 },
	], correction);
	assert.equal(result.events[0].at, "2026-08-18T00:05:00.000Z");
	assert.equal(result.events[0].heightM, 2.8);
	assert.equal(result.events[1].at, "2026-08-18T07:25:00.000Z");
	assert.ok(Math.abs(result.events[1].heightM - 0.6) < 1e-9);
	assert.deepEqual(result.referenceLevels, { mhws: 2.8, mhwn: 2.1, mlwn: 1.3, mlws: 0.6 });
});
