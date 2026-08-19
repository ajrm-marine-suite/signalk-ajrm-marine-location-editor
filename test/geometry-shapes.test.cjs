const assert = require("node:assert/strict");
const test = require("node:test");

test("rectangle dimensions produce four distinct corners around the centre", async () => {
	const { rectanglePoints } = await import("../public/geometry-shapes.mjs");
	const points = rectanglePoints({ lat: 56, lon: -5 }, 0.4, 0.2);
	assert.equal(points.length, 4);
	assert.equal(new Set(points.map(({ lat, lon }) => `${lat},${lon}`)).size, 4);
	assert.ok(points[0].lat > 56 && points[2].lat < 56);
	assert.ok(points[0].lon < -5 && points[1].lon > -5);
});

test("regular polygon point count is configurable and bounded", async () => {
	const { regularPolygonPoints } = await import("../public/geometry-shapes.mjs");
	assert.equal(regularPolygonPoints({ lat: 56, lon: -5 }, 0.2, 7).length, 7);
	assert.equal(regularPolygonPoints({ lat: 56, lon: -5 }, 0.2, 2).length, 3);
	assert.equal(regularPolygonPoints({ lat: 56, lon: -5 }, 0.2, 99).length, 32);
});
