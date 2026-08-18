/** Verifies Reeds-style paired correction anchors, migration and application. */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
	applySecondaryPortCorrections,
	interpolateCircular,
	migrateSecondaryPortCorrections,
} = require("../plugin/secondary-port-corrections.cjs");
const { mergeSecondaryPortSeed } = require("../plugin/secondary-port-seed.cjs");

test("compacts duplicated v2 points to a Reeds-style 12-hour cycle", () => {
	const result = migrateSecondaryPortCorrections({
		contract: "ajrm-secondary-port-corrections-v2",
		parentReferenceLevels: { mhws: 4, mhwn: 2.9, mlwn: 1.8, mlws: 0.7 },
		highWaterTimeOffsets: [
			{ referenceTimeMinutes: 60, offsetMinutes: -55 }, { referenceTimeMinutes: 420, offsetMinutes: -25 },
			{ referenceTimeMinutes: 780, offsetMinutes: -55 }, { referenceTimeMinutes: 1140, offsetMinutes: -25 },
		],
		lowWaterTimeOffsets: [
			{ referenceTimeMinutes: 60, offsetMinutes: -40 }, { referenceTimeMinutes: 480, offsetMinutes: -35 },
			{ referenceTimeMinutes: 780, offsetMinutes: -40 }, { referenceTimeMinutes: 1200, offsetMinutes: -35 },
		],
	});
	assert.equal(result.contract, "ajrm-secondary-port-corrections-v4");
	assert.equal(result.parentReferenceLevels, undefined);
	assert.equal(result.timeOffsetPeriodMinutes, 720);
	assert.deepEqual(result.highWaterTimeOffsets, [
		{ referenceTimeMinutes: 60, offsetMinutes: -55 },
		{ referenceTimeMinutes: 420, offsetMinutes: -25 },
	]);
});

test("retains a genuinely non-repeating v2 record as a 24-hour legacy pattern", () => {
	const result = migrateSecondaryPortCorrections({
		contract: "ajrm-secondary-port-corrections-v2",
		highWaterTimeOffsets: [
			{ referenceTimeMinutes: 0, offsetMinutes: -40 }, { referenceTimeMinutes: 360, offsetMinutes: -10 },
			{ referenceTimeMinutes: 720, offsetMinutes: 0 }, { referenceTimeMinutes: 1080, offsetMinutes: -10 },
		],
		lowWaterTimeOffsets: [
			{ referenceTimeMinutes: 0, offsetMinutes: 50 }, { referenceTimeMinutes: 360, offsetMinutes: 110 },
			{ referenceTimeMinutes: 720, offsetMinutes: 70 }, { referenceTimeMinutes: 1080, offsetMinutes: 110 },
		],
	});
	assert.equal(result.timeOffsetPeriodMinutes, 1440);
	assert.equal(result.highWaterTimeOffsets.length, 4);
});

test("interpolates paired Reeds columns and repeats them twelve hours later", () => {
	const points = [
		{ referenceTimeMinutes: 60, offsetMinutes: -55 },
		{ referenceTimeMinutes: 420, offsetMinutes: -25 },
	];
	assert.equal(interpolateCircular(points, 60, 720), -55);
	assert.equal(interpolateCircular(points, 240, 720), -40);
	assert.equal(interpolateCircular(points, 780, 720), -55);
	assert.equal(interpolateCircular(points, 1320, 720), -40);
});

test("preserves a Reeds pair stated in the 1300-to-0100 order", () => {
	const result = migrateSecondaryPortCorrections({
		contract: "ajrm-secondary-port-corrections-v2",
		highWaterTimeOffsets: [
			{ referenceTimeMinutes: 780, offsetMinutes: -55 },
			{ referenceTimeMinutes: 60, offsetMinutes: -55 },
		],
		lowWaterTimeOffsets: [
			{ referenceTimeMinutes: 780, offsetMinutes: -40 },
			{ referenceTimeMinutes: 60, offsetMinutes: -40 },
		],
	});
	assert.equal(result.timeOffsetPeriodMinutes, 720);
	assert.equal(result.highWaterTimeOffsets[0].referenceTimeMinutes, 780);
	assert.equal(interpolateCircular(result.highWaterTimeOffsets, 60, 720), -55);
});

test("applies the stated Loch Melfort HW/LW time and height corrections", () => {
	const parentLevels = { mhws: 4, mhwn: 2.9, mlwn: 1.8, mlws: 0.7 };
	const correction = {
		contract: "ajrm-secondary-port-corrections-v4",
		timeOffsetPeriodMinutes: 720,
		highWaterTimeOffsets: [
			{ referenceTimeMinutes: 60, offsetMinutes: -55 },
			{ referenceTimeMinutes: 420, offsetMinutes: -25 },
		],
		lowWaterTimeOffsets: [
			{ referenceTimeMinutes: 60, offsetMinutes: -40 },
			{ referenceTimeMinutes: 480, offsetMinutes: -35 },
		],
		heightDifferencesM: { mhws: -1.2, mhwn: -0.8, mlwn: -0.5, mlws: -0.1 },
	};
	const result = applySecondaryPortCorrections([
		{ at: "2026-08-18T01:00:00Z", type: "high", heightM: 4 },
		{ at: "2026-08-18T08:00:00Z", type: "low", heightM: 0.7 },
	], correction, parentLevels);
	assert.equal(result.events[0].at, "2026-08-18T00:05:00.000Z");
	assert.equal(result.events[0].heightM, 2.8);
	assert.equal(result.events[1].at, "2026-08-18T07:25:00.000Z");
	assert.ok(Math.abs(result.events[1].heightM - 0.6) < 1e-9);
	assert.deepEqual(result.referenceLevels, { mhws: 2.8, mhwn: 2.1, mlwn: 1.3, mlws: 0.6 });
});

test("applies the corrected Port Ellen Reeds columns at their stated reference times", () => {
	const seed = require("../defaults/secondary-port-locations.json");
	const merged = mergeSecondaryPortSeed(
		{ schema: "org.ajrm.marine.location-seed/v1", locations: [] },
		{ ...seed, locations: seed.locations.filter(({ name }) => name === "Port Ellen") },
	);
	const correction = merged.locations.find(({ name }) => name === "Port Ellen")
		.properties.tide.secondaryPortCorrections;
	const parentLevels = { mhws: 4, mhwn: 2.9, mlwn: 1.8, mlws: 0.7 };
	const corrected = (event) => applySecondaryPortCorrections([event], correction, parentLevels);

	assert.equal(corrected({ at: "2026-08-18T01:00:00Z", type: "high", heightM: 4 }).events[0].at, "2026-08-17T19:30:00.000Z");
	assert.equal(corrected({ at: "2026-08-18T07:00:00Z", type: "high", heightM: 2.9 }).events[0].at, "2026-08-18T06:10:00.000Z");
	assert.equal(corrected({ at: "2026-08-18T01:00:00Z", type: "low", heightM: 1.8 }).events[0].at, "2026-08-18T00:15:00.000Z");
	assert.equal(corrected({ at: "2026-08-18T08:00:00Z", type: "low", heightM: 0.7 }).events[0].at, "2026-08-18T02:30:00.000Z");
	assert.deepEqual(corrected({ at: "2026-08-18T13:00:00Z", type: "high", heightM: 4 }).referenceLevels,
		{ mhws: 0.9, mhwn: 0.8, mlwn: 0.5, mlws: 0.3 });
});
