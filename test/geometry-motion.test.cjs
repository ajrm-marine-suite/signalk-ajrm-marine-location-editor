/**
 * Verifies zoom-sensitive location movement and bounded press acceleration.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

test("geometry movement becomes finer as the chart is zoomed in", async () => {
	const { geometryNudgeNm } = await import("../public/geometry-motion.mjs");
	const overview = geometryNudgeNm(12, 56);
	const harbour = geometryNudgeNm(16, 56);
	const close = geometryNudgeNm(20, 56);
	assert.ok(overview > harbour);
	assert.ok(harbour > close);
	assert.ok(close >= 0.0001);
});

test("held movement accelerates gradually and remains bounded", async () => {
	const { holdAcceleration } = await import("../public/geometry-motion.mjs");
	assert.equal(holdAcceleration(0), 1);
	assert.ok(holdAcceleration(5) > holdAcceleration(4));
	assert.equal(holdAcceleration(100), 32);
});
