/**
 * Checks normalized tidal extremes, interpolation, trend and future events.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { calculateTide, normalizeTideEvents } = require("../plugin/tide-calculation.cjs");

const events = [
	{ DateTime: "2026-08-18T00:00:00Z", EventType: "LowWater", Height: 1 },
	{ DateTime: "2026-08-18T06:00:00Z", EventType: "HighWater", Height: 5 },
	{ DateTime: "2026-08-18T12:00:00Z", EventType: "LowWater", Height: 1.2 },
];

test("cosine estimate is halfway at the temporal midpoint and reports rising", () => {
	const result = calculateTide(events, "2026-08-18T03:00:00Z");
	assert.equal(result.valid, true);
	assert.equal(result.heightNowM, 3);
	assert.equal(result.trend, "rising");
	assert.equal(result.nextHighWater.at, "2026-08-18T06:00:00.000Z");
	assert.equal(result.interpolation, "cosine-between-extremes-v1");
});

test("invalid provider records are discarded without throwing", () => {
	assert.deepEqual(normalizeTideEvents([{ DateTime: "bad", EventType: "HighWater", Height: 3 }]), []);
});
