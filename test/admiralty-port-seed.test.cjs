/** Verifies the reviewed Admiralty import and generated tidal-area topology. */

const assert = require("node:assert/strict");
const test = require("node:test");
const ports = require("../defaults/admiralty-api-ports.json");
const areas = require("../defaults/tidal-port-areas.json");
const west = require("../defaults/west-scotland-locations.json");
const oban = require("../defaults/secondary-port-locations.json");
const ullapool = require("../defaults/secondary-port-locations-ullapool.json");
const stornoway = require("../defaults/secondary-port-locations-stornoway.json");
const { mergeSecondaryPortSeed } = require("../plugin/secondary-port-seed.cjs");

function axes(ring) {
	const result = [];
	for (let index = 0; index < ring.length - 1; index += 1) {
		const dx = ring[index + 1][0] - ring[index][0];
		const dy = ring[index + 1][1] - ring[index][1];
		const length = Math.hypot(dx, dy);
		if (length > 0) result.push([-dy / length, dx / length]);
	}
	return result;
}

function interval(ring, axis) {
	const values = ring.slice(0, -1).map(([x, y]) => x * axis[0] + y * axis[1]);
	return [Math.min(...values), Math.max(...values)];
}

function interiorsOverlap(left, right) {
	for (const axis of [...axes(left), ...axes(right)]) {
		const [aMin, aMax] = interval(left, axis);
		const [bMin, bMax] = interval(right, axis);
		// Generated coordinates are rounded to six decimal places, so allow a
		// sub-metre shared-boundary tolerance after serialization.
		if (Math.min(aMax, bMax) - Math.max(aMin, bMin) <= 1e-5) return false;
	}
	return true;
}

test("Admiralty workbook rows are linked only to verified live API stations", () => {
	assert.equal(ports.requestedCount, 64);
	assert.equal(ports.verifiedCount, 50);
	assert.equal(ports.unresolved.length, 14);
	assert.equal(ports.locations.length, 47);
	assert.equal(new Set(ports.locations.map((location) => location.properties.tide.stationId)).size, 47);
	const portEllen = ports.locations.find((location) => location.name.startsWith("Port Ellen"));
	assert.equal(portEllen.properties.tide.stationId, "0381");
	assert.equal(portEllen.properties.tide.predictionSource, "ukhoTidalEvents");
	assert.match(portEllen.name, /Admiralty API/);
});

test("every stored prediction port has one named non-overlapping tidal area", () => {
	const merged = [oban, ullapool, stornoway].reduce(mergeSecondaryPortSeed, west);
	const portIds = new Set([...merged.locations, ...ports.locations]
		.filter((location) => location.types?.some((type) => ["tidalStandardPort", "tidalSecondaryPort"].includes(type)))
		.map((location) => location.id));
	assert.equal(areas.locations.length, 100);
	assert.equal(areas.locations.length, portIds.size);
	assert.equal(new Set(areas.locations.map((location) => location.name)).size, areas.locations.length);
	for (const area of areas.locations) {
		assert.equal(area.name.endsWith(" tidal area"), true);
		assert.equal(area.types.includes("tidalRegion"), true);
		assert.match(area.properties.tideLocationRef, /^\/resources\/locations\/[0-9a-f-]+$/);
		assert.equal(portIds.has(area.properties.tideLocationRef.split("/").at(-1)), true);
	}
	for (let left = 0; left < areas.locations.length; left += 1) {
		for (let right = left + 1; right < areas.locations.length; right += 1) {
			const a = areas.locations[left].feature.geometry.coordinates[0];
			const b = areas.locations[right].feature.geometry.coordinates[0];
			assert.equal(interiorsOverlap(a, b), false, `${areas.locations[left].name} overlaps ${areas.locations[right].name}`);
		}
	}
});
